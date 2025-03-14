import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { Sema as Semaphore } from 'async-sema';
import { IStorageClient } from '../types/storage';
import { ActionStateBase } from '../entities/states/actionStateBase';
import { ActionExecutionResult } from '../entities/actionExecutionResult';
import { IActionState } from '../types/actionState';
import { IActionWithState } from '../types/actionWithState';

export class JsonFileStorage implements IStorageClient {
    semaphore = new Semaphore(1);
    private cache: Map<string, Record<number, IActionState>>;
    private storagePath: string;
    private botName: string;

    constructor(botName: string, path?: string) {
        this.cache = new Map<string, Record<number, IActionState>>();
        this.botName = botName;
        this.storagePath = path ?? 'storage';

        if (!existsSync(`${this.storagePath}/${this.botName}/`)) {
            mkdirSync(`${this.storagePath}/${this.botName}/`, {
                recursive: true
            });
        }
    }

    private async lock<TType>(action: () => Promise<TType>) {
        await this.semaphore.acquire();

        try {
            return await action();
        } finally {
            this.semaphore.release();
        }
    }

    private async loadInternal<TActionState extends IActionState>(key: string) {
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

    private async save(data: Record<number, ActionStateBase>, key: string) {
        this.cache.delete(key);

        const targetPath = this.buidPathFromKey(key);
        const folderName = dirname(targetPath);

        if (!existsSync(folderName)) {
            await mkdir(folderName, { recursive: true });
        }

        await writeFile(targetPath, JSON.stringify(data), { flag: 'w+' });
    }

    private buidPathFromKey(key: string) {
        return `${this.storagePath}/${this.botName}/${key.replaceAll(
            ':',
            '/'
        )}.json`;
    }

    async load<TActionState extends IActionState>(key: string) {
        return await this.lock(async () => {
            return this.loadInternal<TActionState>(key);
        });
    }

    async saveMetadata(actions: IActionWithState[], botName: string) {
        return await this.lock(async () => {
            const targetPath = this.buidPathFromKey(`Metadata-${botName}`);

            await writeFile(targetPath, JSON.stringify(actions), {
                flag: 'w+'
            });
        });
    }

    async getActionState<TActionState extends IActionState>(
        entity: IActionWithState,
        chatId: number
    ) {
        return await this.lock(async () => {
            const data = await this.loadInternal(entity.key);

            return Object.assign(
                entity.stateConstructor(),
                data[chatId]
            ) as TActionState;
        });
    }

    async saveActionExecutionResult(
        action: IActionWithState,
        chatId: number,
        transactionResult: ActionExecutionResult
    ) {
        await this.lock(async () => {
            const data = await this.loadInternal(action.key);

            if (transactionResult.shouldUpdate) {
                data[chatId] = transactionResult.data;
                await this.save(data, action.key);
            }
        });
    }

    async close(): Promise<void> {
        await this.semaphore.acquire();
    }

    async updateStateFor<TActionState extends IActionState>(
        sourceActionKey: string,
        chatId: number,
        update: (state: TActionState) => Promise<void>
    ) {
        await this.lock(async () => {
            const data = await this.loadInternal(sourceActionKey);
            const state = Object.assign(
                new ActionStateBase(),
                data[chatId]
            ) as TActionState;

            await update(state);

            await this.save(data, sourceActionKey);
        });
    }
}
