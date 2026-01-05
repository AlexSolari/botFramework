import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { Sema as Semaphore } from 'async-sema';
import { IStorageClient } from '../types/storage';
import { IActionState } from '../types/actionState';
import { IActionWithState, ActionKey } from '../types/action';
import { getOrSetIfNotExists } from '../helpers/mapUtils';
import { BotEventType, TypedEventEmitter } from '../types/events';

function buildPath(storagePath: string, botName: string, actionKey: string) {
    return `${storagePath}/${botName}/${actionKey.replaceAll(':', '/')}.json`;
}

export class JsonFileStorage implements IStorageClient {
    private readonly eventEmitter: TypedEventEmitter;
    private readonly filePaths = new Map<ActionKey, string>();
    private readonly locks = new Map<ActionKey, Semaphore>();
    private readonly cache: Map<string, Record<number, IActionState>>;
    private readonly storagePath: string;
    private readonly botName: string;

    constructor(
        botName: string,
        actions: IActionWithState<IActionState>[],
        eventEmitter: TypedEventEmitter,
        path?: string
    ) {
        this.eventEmitter = eventEmitter;
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

    private backfillEmptyActionStates<TActionState extends IActionState>(
        action: IActionWithState<TActionState>,
        data: Record<number, TActionState | undefined>
    ): data is Record<number, TActionState> {
        for (const [stringKey, value] of Object.entries(data)) {
            if (value) continue;

            data[Number.parseInt(stringKey)] = action.stateConstructor();
        }

        return true;
    }

    private async lock<TType>(key: ActionKey, action: () => Promise<TType>) {
        const lock = getOrSetIfNotExists(this.locks, key, new Semaphore(1));

        this.eventEmitter.emit(BotEventType.storageLockAcquiring, key);
        await lock.acquire();
        this.eventEmitter.emit(BotEventType.storageLockAcquired, key);

        try {
            return await action();
        } finally {
            lock.release();
            this.eventEmitter.emit(BotEventType.storageLockReleased, key);
        }
    }

    private tryGetFromCache<TActionState extends IActionState>(key: ActionKey) {
        return this.cache.get(key) as Record<number, TActionState> | undefined;
    }

    private async loadFromFile<TActionState extends IActionState>(
        key: ActionKey
    ) {
        const targetPath = getOrSetIfNotExists(
            this.filePaths,
            key,
            buildPath(this.storagePath, this.botName, key)
        );

        const fileContent = await readFile(targetPath, {
            encoding: 'utf-8',
            flag: 'a+'
        });

        if (fileContent) {
            const data = JSON.parse(fileContent) as Record<
                number,
                TActionState
            >;

            this.cache.set(key, data);
        }

        return (this.cache.get(key) ?? {}) as Record<
            number,
            TActionState | undefined
        >;
    }

    private async updateCacheAndSaveToFile<TActionState extends IActionState>(
        data: Record<number, TActionState>,
        key: ActionKey
    ) {
        this.eventEmitter.emit(BotEventType.storageStateSaving, {
            data,
            key
        });
        this.cache.set(key, data);

        const targetPath = getOrSetIfNotExists(
            this.filePaths,
            key,
            buildPath(this.storagePath, this.botName, key)
        );

        await writeFile(targetPath, JSON.stringify(data), { flag: 'w+' });
        this.eventEmitter.emit(BotEventType.storageStateSaved, {
            data,
            key
        });
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
        this.eventEmitter.emit(BotEventType.storageStateLoading, {
            action,
            chatId
        });
        const value =
            this.tryGetFromCache<TActionState>(action.key) ??
            (await this.lock(action.key, async () => {
                return await this.loadFromFile<TActionState>(action.key);
            }));

        const result = Object.assign(action.stateConstructor(), value[chatId]);

        this.eventEmitter.emit(BotEventType.storageStateLoaded, {
            action,
            chatId,
            state: result
        });
        return result;
    }

    async saveActionExecutionResult<TActionState extends IActionState>(
        action: IActionWithState<TActionState>,
        chatId: number,
        state: TActionState
    ) {
        await this.lock(action.key, async () => {
            const data =
                this.tryGetFromCache<TActionState>(action.key) ??
                (await this.loadFromFile<TActionState>(action.key));

            data[chatId] = state;

            if (this.backfillEmptyActionStates(action, data))
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
        update: (state: TActionState) => Promise<void> | void
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

            if (this.backfillEmptyActionStates(action, data))
                await this.updateCacheAndSaveToFile(data, action.key);
        });
    }
}
