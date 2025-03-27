import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { Sema as Semaphore } from 'async-sema';
import { IStorageClient } from '../types/storage';
import { ActionStateBase } from '../entities/states/actionStateBase';
import { ActionExecutionResult } from '../entities/actionExecutionResult';
import { IActionState } from '../types/actionState';
import { IActionWithState, ActionKey } from '../types/actionWithState';

export class JsonFileStorage implements IStorageClient {
    private locks = new Map<ActionKey, Semaphore>();
    private cache: Map<string, Record<number, IActionState>>;
    private storagePath: string;
    private botName: string;

    constructor(botName: string, actions: IActionWithState[], path?: string) {
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
        }
    }

    private async lock<TType>(key: ActionKey, action: () => Promise<TType>) {
        const lock = this.locks.get(key);

        if (!lock) {
            throw new Error(`Lock for action ${key} not found`);
        }

        await lock.acquire();

        try {
            return await action();
        } finally {
            lock.release();
        }
    }

    private async loadInternal<TActionState extends IActionState>(
        key: ActionKey
    ) {
        if (!this.cache.has(key)) {
            const targetPath = this.buidPathFromKey(key);
            if (!existsSync(targetPath)) {
                return {};
            }

            const fileContent = await readFile(targetPath, 'utf8');

            if (fileContent) {
                const data = JSON.parse(fileContent);

                this.cache.set(key, data);
            }
        }

        return (this.cache.get(key) ?? {}) as Record<number, TActionState>;
    }

    private async save(data: Record<number, ActionStateBase>, key: ActionKey) {
        this.cache.delete(key);

        const targetPath = this.buidPathFromKey(key);
        const folderName = dirname(targetPath);

        if (!existsSync(folderName)) {
            await mkdir(folderName, { recursive: true });
        }

        await writeFile(targetPath, JSON.stringify(data), { flag: 'w+' });
    }

    private buidPathFromKey(key: ActionKey) {
        return `${this.storagePath}/${this.botName}/${key.replaceAll(
            ':',
            '/'
        )}.json`;
    }

    async load<TActionState extends IActionState>(key: ActionKey) {
        return await this.lock(key, async () => {
            return this.loadInternal<TActionState>(key);
        });
    }

    async saveMetadata(actions: IActionWithState[], botName: string) {
        const targetPath = this.buidPathFromKey(
            `Metadata-${botName}` as ActionKey
        );

        await writeFile(targetPath, JSON.stringify(actions), {
            flag: 'w+'
        });
    }

    async getActionState<TActionState extends IActionState>(
        action: IActionWithState,
        chatId: number
    ) {
        return await this.lock(action.key, async () => {
            const data = await this.loadInternal(action.key);

            return Object.assign(
                action.stateConstructor(),
                data[chatId]
            ) as TActionState;
        });
    }

    async saveActionExecutionResult(
        action: IActionWithState,
        chatId: number,
        transactionResult: ActionExecutionResult
    ) {
        await this.lock(action.key, async () => {
            const data = await this.loadInternal(action.key);

            if (transactionResult.shouldUpdate) {
                data[chatId] = transactionResult.data;
                await this.save(data, action.key);
            }
        });
    }

    async close(): Promise<void> {
        for (const lock of this.locks.values()) {
            await lock.acquire();
        }
    }

    async updateStateFor<TActionState extends IActionState>(
        action: IActionWithState,
        chatId: number,
        update: (state: TActionState) => Promise<void>
    ) {
        await this.lock(action.key, async () => {
            const data = await this.loadInternal(action.key);
            const state = Object.assign(
                action.stateConstructor(),
                data[chatId]
            ) as TActionState;

            await update(state);

            await this.save(data, action.key);
        });
    }
}
