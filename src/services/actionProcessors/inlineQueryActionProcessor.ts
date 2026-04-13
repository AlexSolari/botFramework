import { ChatInfo } from '../../dtos/chatInfo';
import { IncomingInlineQuery } from '../../dtos/incomingQuery';
import { InlineQueryAction } from '../../entities/actions/inlineQueryAction';
import { InlineQueryContextInternal } from '../../entities/context/inlineQueryContext';
import { createTrace } from '../../helpers/traceFactory';
import { BotEventType } from '../../types/events';
import { TelegramBot } from '../../types/externalAliases';
import { TelegramApiService } from '../telegramApi';
import { BaseActionProcessor } from './baseProcessor';

export class InlineQueryActionProcessor extends BaseActionProcessor {
    private inlineQueries!: InlineQueryAction[];
    /** Fake chat info, since inline queries are chat-less */
    private readonly fakeChatInfo = new ChatInfo(
        Math.random(),
        'Inline Query',
        []
    );

    initialize(
        api: TelegramApiService,
        telegram: TelegramBot,
        inlineQueries: InlineQueryAction[]
    ) {
        this.initializeDependencies(api);
        this.inlineQueries = inlineQueries;

        const queriesInProcessing = new Map<number, IncomingInlineQuery>();

        if (this.inlineQueries.length > 0) {
            telegram.on('inline_query', async ({ inlineQuery }) => {
                const query = new IncomingInlineQuery(
                    inlineQuery.id,
                    inlineQuery.query,
                    inlineQuery.from.id,
                    createTrace('InlineQuery', this.botName, inlineQuery.id)
                );

                this.eventEmitter.emit(BotEventType.inlineQueryRecieved, {
                    query,
                    traceId: query.traceId
                });

                const queryBeingProcessed = queriesInProcessing.get(
                    query.userId
                );
                if (queryBeingProcessed) {
                    this.eventEmitter.emit(
                        BotEventType.inlineProcessingAborting,
                        {
                            newQuery: query,
                            abortedQuery: queryBeingProcessed,
                            traceId: query.traceId
                        }
                    );

                    queryBeingProcessed.abortController.abort();
                    queriesInProcessing.delete(query.userId);
                }

                this.eventEmitter.emit(BotEventType.inlineProcessingStarted, {
                    botName: this.botName,
                    traceId: query.traceId
                });

                queriesInProcessing.set(query.userId, query);

                const actionPromises = this.inlineQueries.map(
                    (inlineQueryAction) => {
                        const ctx = new InlineQueryContextInternal(
                            this.storage,
                            this.scheduler,
                            this.eventEmitter,
                            inlineQueryAction,
                            query,
                            this.fakeChatInfo,
                            this.botName
                        );

                        const { proxy, revoke } = Proxy.revocable(ctx, {});

                        return this.executeAction(
                            inlineQueryAction,
                            proxy,
                            (error, _) => {
                                if (error.name == 'AbortError') {
                                    this.eventEmitter.emit(
                                        BotEventType.inlineProcessingAborted,
                                        {
                                            abortedQuery: query,
                                            traceId: query.traceId
                                        }
                                    );
                                } else {
                                    this.eventEmitter.emit(BotEventType.error, {
                                        error,
                                        traceId: query.traceId
                                    });
                                }
                            }
                        ).finally(() => {
                            revoke();
                            this.api.flushResponses();
                        });
                    }
                );

                try {
                    await Promise.allSettled(actionPromises);
                } catch (error) {
                    this.eventEmitter.emit(BotEventType.error, {
                        error:
                            error instanceof Error
                                ? error
                                : new Error('Unknown error'),
                        traceId: query.traceId
                    });
                } finally {
                    queriesInProcessing.delete(query.userId);
                    this.eventEmitter.emit(
                        BotEventType.inlineProcessingFinished,
                        {
                            botName: this.botName,
                            traceId: query.traceId
                        }
                    );
                }
            });
        }
    }
}
