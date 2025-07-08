import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { Sema as Semaphore } from 'async-sema';
import { IStorageClient } from '../types/storage';
import { IActionState } from '../types/actionState';
import { IActionWithState, ActionKey } from '../types/action';

function buildPath(storagePath: string, botName: string, actionKey: string) {
    return `${storagePath}/${botName}/${actionKey.replaceAll(':', '/')}.json`;
}

export class JsonFileStorage implements IStorageClient {
    private readonly filePaths = new Map<ActionKey, string>();
    private readonly locks = new Map<ActionKey, Semaphore>();
    private readonly cache: Map<string, Record<number, IActionState>>;
    private readonly storagePath: string;
    private readonly botName: string;

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
            this.locks.set(action.key, new Semaphore(1));
            this.filePaths.set(
                action.key,
                buildPath(this.storagePath, this.botName, action.key)
            );
        }
    }

    private async lock<TType>(key: ActionKey, action: () => Promise<TType>) {
        if (!this.locks.has(key)) this.locks.set(key, new Semaphore(1));

        const lock = this.locks.get(key)!;

        await lock.acquire();

        try {
            return await action();
        } finally {
            lock.release();
        }
    }

    private tryGetFromCache<TActionState extends IActionState>(key: ActionKey) {
        return this.cache.get(key) as Record<number, TActionState> | undefined;
    }

    private async loadFromFile<TActionState extends IActionState>(
        key: ActionKey
    ) {
        if (!this.filePaths.has(key))
            this.filePaths.set(
                key,
                buildPath(this.storagePath, this.botName, key)
            );
        const targetPath = this.filePaths.get(key)!;

        const fileContent = await readFile(targetPath, {
            encoding: 'utf-8',
            flag: 'a+'
        });

        if (fileContent) {
            const data = JSON.parse(fileContent);

            this.cache.set(key, data);
        }

        return (this.cache.get(key) ?? {}) as Record<number, TActionState>;
    }

    private async updateCacheAndSaveToFile<TActionState extends IActionState>(
        data: Record<number, TActionState>,
        key: ActionKey
    ) {
        this.cache.set(key, data);

        if (!this.filePaths.has(key))
            this.filePaths.set(
                key,
                buildPath(this.storagePath, this.botName, key)
            );
        const targetPath = this.filePaths.get(key)!;

        await writeFile(targetPath, JSON.stringify(data), { flag: 'w+' });
    }

    async load<TActionState extends IActionState>(key: ActionKey) {
        return (
            this.tryGetFromCache<TActionState>(key) ??
            (await this.lock(key, async () => {
                return await this.loadFromFile<TActionState>(key);
            }))
        );
    }

    async saveMetadata(actions: IActionWithState<IActionState>[]) {
        const targetPath = `${this.storagePath}/${this.botName}/Metadata-${this.botName}.json`;

        await writeFile(targetPath, JSON.stringify(actions), {
            flag: 'w+'
        });
    }

    async getActionState<TActionState extends IActionState>(
        action: IActionWithState<TActionState>,
        chatId: number
    ) {
        const value =
            this.tryGetFromCache<TActionState>(action.key) ??
            (await this.lock(action.key, async () => {
                return await this.loadFromFile<TActionState>(action.key);
            }));

        return Object.assign(action.stateConstructor(), value[chatId]);
    }

    async saveActionExecutionResult<TActionState extends IActionState>(
        action: IActionWithState<TActionState>,
        chatId: number,
        state: TActionState
    ) {
        return await this.lock(action.key, async () => {
            const data =
                this.tryGetFromCache<TActionState>(action.key) ??
                (await this.loadFromFile<TActionState>(action.key));

            data[chatId] = state;

            await this.updateCacheAndSaveToFile(data, action.key);
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
        update: (state: TActionState) => Promise<void>
    ) {
        await this.lock(action.key, async () => {
            const data =
                this.tryGetFromCache<TActionState>(action.key) ??
                (await this.loadFromFile<TActionState>(action.key));

            const state = Object.assign(
                action.stateConstructor(),
                data[chatId]
            );

            await update(state);

            await this.updateCacheAndSaveToFile(data, action.key);
        });
    }
}
