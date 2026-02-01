import { ChatInfo } from '../../dtos/chatInfo';
import { IncomingInlineQuery } from '../../dtos/incomingQuery';
import { InlineQueryAction } from '../../entities/actions/inlineQueryAction';
import { InlineQueryContextInternal } from '../../entities/context/inlineQueryContext';
import { createTrace } from '../../helpers/traceFactory';
import { BotEventType } from '../../types/events';
import { TelegramBot } from '../../types/externalAliases';
import { Milliseconds } from '../../types/timeValues';
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
        inlineQueries: InlineQueryAction[],
        period: Milliseconds
    ) {
        this.initializeDependencies(api);
        this.inlineQueries = inlineQueries;

        let pendingInlineQueries: IncomingInlineQuery[] = [];

        const queriesInProcessing = new Map<number, IncomingInlineQuery>();

        if (this.inlineQueries.length > 0) {
            telegram.on('inline_query', ({ inlineQuery }) => {
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

                pendingInlineQueries = pendingInlineQueries.filter(
                    (q) => q.userId != query.userId
                );

                pendingInlineQueries.push(query);
            });

            this.scheduler.createTask(
                'InlineQueryProcessing',
                () => {
                    const queriesToProcess = [...pendingInlineQueries];
                    pendingInlineQueries = [];
                    const promises = [];

                    for (const inlineQuery of queriesToProcess) {
                        this.eventEmitter.emit(
                            BotEventType.inlineProcessingStarted,
                            {
                                botName: this.botName,
                                traceId: inlineQuery.traceId
                            }
                        );

                        queriesInProcessing.set(
                            inlineQuery.userId,
                            inlineQuery
                        );

                        const actionPromises = this.inlineQueries.map(
                            (inlineQueryAction) => {
                                const ctx = new InlineQueryContextInternal(
                                    this.storage,
                                    this.scheduler,
                                    this.eventEmitter,
                                    inlineQueryAction,
                                    inlineQuery,
                                    this.fakeChatInfo,
                                    this.botName
                                );

                                const { proxy, revoke } = Proxy.revocable(
                                    ctx,
                                    {}
                                );

                                const executePromise = this.executeAction(
                                    inlineQueryAction,
                                    proxy,
                                    (error, _) => {
                                        if (error.name == 'AbortError') {
                                            this.eventEmitter.emit(
                                                BotEventType.inlineProcessingAborted,
                                                {
                                                    abortedQuery: inlineQuery,
                                                    traceId: inlineQuery.traceId
                                                }
                                            );
                                        } else {
                                            this.eventEmitter.emit(
                                                BotEventType.error,
                                                {
                                                    error,
                                                    traceId: inlineQuery.traceId
                                                }
                                            );
                                        }
                                    }
                                );

                                return executePromise.finally(() => {
                                    revoke();
                                    this.api.flushResponses();
                                });
                            }
                        );

                        const queryPromise = Promise.allSettled(
                            actionPromises
                        ).then(() => {
                            queriesInProcessing.delete(inlineQuery.userId);
                            this.eventEmitter.emit(
                                BotEventType.inlineProcessingFinished,
                                {
                                    botName: this.botName,
                                    traceId: inlineQuery.traceId
                                }
                            );
                        });

                        promises.push(queryPromise);
                    }

                    void Promise.allSettled(promises);
                },
                period,
                false,
                this.botName
            );
        }
    }
}
