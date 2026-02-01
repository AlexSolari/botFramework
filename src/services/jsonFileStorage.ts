import { existsSync, mkdirSync, readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { Sema as Semaphore } from 'async-sema';
import { IStorageClient } from '../types/storage';
import { IActionState } from '../types/actionState';
import { IActionWithState, ActionKey } from '../types/action';
import { getOrSetIfNotExists } from '../helpers/mapUtils';

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
        this.storagePath = path ?? 'storage';

        if (!existsSync(`${this.storagePath}/${this.botName}/`)) {
            mkdirSync(`${this.storagePath}/${this.botName}/`, {
                recursive: true
            });
        }

        for (const action of actions) {
            this.filePaths.set(
                action.key,
                buildPath(this.storagePath, this.botName, action.key)
            );
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
            const data = JSON.parse(fileContent) as Record<
                number,
                TActionState
            >;

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

        await writeFile(targetPath, JSON.stringify(data), { flag: 'w+' });
    }
}

export class JsonFileStorage implements IStorageClient {
    private readonly locks = new Map<ActionKey, Semaphore>();

    private readonly data: CachedDataSource;

    constructor(
        botName: string,
        actions: IActionWithState<IActionState>[],
        path?: string
    ) {
        this.data = new CachedDataSource(botName, actions, path ?? 'storage');

        for (const action of actions) {
            this.locks.set(action.key, new Semaphore(1));
        }
    }

    private async lock<TType>(key: ActionKey, action: () => Promise<TType>) {
        const lock = getOrSetIfNotExists(this.locks, key, new Semaphore(1));

        await lock.acquire();

        try {
            return await action();
        } finally {
            lock.release();
        }
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
        const value = this.data.load<TActionState>(action);

        return value[chatId] ?? action.stateConstructor();
    }

    async saveActionExecutionResult<TActionState extends IActionState>(
        action: IActionWithState<TActionState>,
        chatId: number,
        state: TActionState
    ) {
        await this.lock(action.key, async () => {
            const data = this.data.load(action);

            data[chatId] = state;

            await this.data.save(data, action);
        });
    }

    async close(): Promise<void> {
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
            const state = data[chatId];

            await update(state);

            data[chatId] = state;

            await this.data.save(data, action);
        });
    }
}
