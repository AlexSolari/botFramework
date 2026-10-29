import { existsSync, mkdirSync, readFileSync } from 'fs';
import { open, rename } from 'fs/promises';
import { dirname } from 'path';
import { Sema as Semaphore } from 'async-sema';
import { IStorageClient } from '../types/storage';
import { IActionState } from '../types/actionState';
import { IActionWithState, ActionKey } from '../types/action';
import {
    getOrCreateIfNotExists,
    getOrSetIfNotExists
} from '../helpers/mapUtils';
import { DEFAULT_STORAGE_DIRECTORY } from '../helpers/constants';

function buildPath(storagePath: string, botName: string, actionKey: string) {
    return `${storagePath}/${botName}/${actionKey.replaceAll(':', '/')}.json`;
}

class CachedDataSource {
    private readonly cache: Map<string, Record<number, IActionState>>;
    private readonly filePaths = new Map<ActionKey, string>();
    private readonly botName: string;
    private readonly storagePath: string;

    constructor(
        botName: string,
        actions: IActionWithState<IActionState>[],
        path?: string
    ) {
        this.cache = new Map<string, Record<number, IActionState>>();
        this.botName = botName;
        this.storagePath = path ?? DEFAULT_STORAGE_DIRECTORY;

        if (!existsSync(`${this.storagePath}/${this.botName}/`)) {
            mkdirSync(`${this.storagePath}/${this.botName}/`, {
                recursive: true
            });
        }

        const keysByPath = new Map<string, ActionKey>();
        for (const action of actions) {
            const filePath = buildPath(
                this.storagePath,
                this.botName,
                action.key
            );

            const caseInsensitivePath = filePath.toLowerCase();
            const otherKey = keysByPath.get(caseInsensitivePath);
            if (otherKey !== undefined && otherKey != action.key) {
                throw new Error(
                    `Actions ${otherKey} and ${action.key} differ only in case, so they would share the storage file ${filePath} on Windows and macOS. Rename one of them.`
                );
            }
            keysByPath.set(caseInsensitivePath, action.key);
        }

        for (const action of actions) {
            const filePath = buildPath(
                this.storagePath,
                this.botName,
                action.key
            );
            this.filePaths.set(action.key, filePath);

            const dir = dirname(filePath);
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }

            this.loadFromFile(action.key);
        }
    }

    private tryGetFromCache<TActionState extends IActionState>(key: ActionKey) {
        const cachedValue = this.cache.get(key) as
            | Record<number, TActionState>
            | undefined;

        return cachedValue;
    }

    private loadFromFile<TActionState extends IActionState>(key: ActionKey) {
        const targetPath = getOrSetIfNotExists(
            this.filePaths,
            key,
            buildPath(this.storagePath, this.botName, key)
        );

        const fileContent = readFileSync(targetPath, {
            encoding: 'utf-8',
            flag: 'a+'
        });

        if (fileContent) {
            let data: Record<number, TActionState>;
            try {
                data = JSON.parse(fileContent) as Record<number, TActionState>;
            } catch (error) {
                throw new Error(
                    `Storage file ${targetPath} contains invalid JSON. Fix or delete it to reset the state of action ${key}.`,
                    { cause: error }
                );
            }

            this.cache.set(key, data);
        } else {
            this.cache.set(key, {});
        }

        return this.cache.get(key) as Record<number, TActionState>;
    }

    public load<TActionState extends IActionState>(
        action: IActionWithState<TActionState>
    ) {
        return (
            this.tryGetFromCache<TActionState>(action.key) ??
            this.loadFromFile<TActionState>(action.key)
        );
    }

    public async save<TActionState extends IActionState>(
        data: Record<number, TActionState>,
        action: IActionWithState<TActionState>
    ) {
        this.cache.set(action.key, data);

        const targetPath = getOrSetIfNotExists(
            this.filePaths,
            action.key,
            buildPath(this.storagePath, this.botName, action.key)
        );

        const tempPath = `${targetPath}.tmp`;
        const file = await open(tempPath, 'w');
        try {
            await file.writeFile(JSON.stringify(data));
            await file.sync();
        } finally {
            await file.close();
        }

        await rename(tempPath, targetPath);
    }
}

export class JsonFileStorage implements IStorageClient {
    private readonly data: CachedDataSource;

    private readonly locks = new Map<ActionKey, Semaphore>();
    private readonly semaphoreFactory = () => new Semaphore(1);
    private closing?: Promise<void>;

    constructor(
        botName: string,
        actions: IActionWithState<IActionState>[],
        path?: string
    ) {
        this.data = new CachedDataSource(
            botName,
            actions,
            path ?? DEFAULT_STORAGE_DIRECTORY
        );

        for (const action of actions) {
            this.locks.set(action.key, new Semaphore(1));
        }
    }

    private async lock<TType>(key: ActionKey, action: () => Promise<TType>) {
        if (this.closing) {
            throw new Error(
                `Storage is closed, the state of action ${key} was not saved.`
            );
        }

        const lock = getOrCreateIfNotExists(
            this.locks,
            key,
            this.semaphoreFactory
        );

        await lock.acquire();

        try {
            return await action();
        } finally {
            lock.release();
        }
    }

    private stateFor<TActionState extends IActionState>(
        action: IActionWithState<TActionState>,
        data: Record<number, TActionState>,
        chatId: number
    ) {
        return structuredClone({
            ...action.stateConstructor(),
            ...data[chatId]
        });
    }

    load<TActionState extends IActionState>(
        action: IActionWithState<TActionState>
    ) {
        return this.data.load<TActionState>(action);
    }

    getActionState<TActionState extends IActionState>(
        action: IActionWithState<TActionState>,
        chatId: number
    ) {
        return this.stateFor(action, this.data.load(action), chatId);
    }

    async saveActionExecutionResult<TActionState extends IActionState>(
        action: IActionWithState<TActionState>,
        chatId: number,
        state: TActionState
    ) {
        await this.lock(action.key, async () => {
            const data = this.data.load(action);

            data[chatId] = structuredClone(state);

            await this.data.save(data, action);
        });
    }

    close(): Promise<void> {
        this.closing ??= this.acquireAllLocks();

        return this.closing;
    }

    private async acquireAllLocks() {
        for (const lock of this.locks.values()) {
            await lock.acquire();
        }
    }

    async updateStateFor<TActionState extends IActionState>(
        action: IActionWithState<TActionState>,
        chatId: number,
        update: (state: TActionState) => Promise<void> | void
    ) {
        await this.lock(action.key, async () => {
            const data = this.data.load(action);
            const state = this.stateFor(action, data, chatId);

            await update(state);

            data[chatId] = state;

            await this.data.save(data, action);
        });
    }
}
