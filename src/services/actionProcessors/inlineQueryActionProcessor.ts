import { ChatInfo } from '../../dtos/chatInfo';
import { IncomingInlineQuery } from '../../dtos/incomingQuery';
import {
    InlineQueryAction,
    InlineQueryActionInternal
} from '../../entities/actions/inlineQueryAction';
import { InlineQueryContextInternal } from '../../entities/context/inlineQueryContext';
import { createTrace } from '../../helpers/traceFactory';
import {
    INLINE_QUERY_FAKE_CHAT_ID,
    INLINE_QUERY_RESULTS_LIMIT
} from '../../helpers/constants';
import { BotEventType } from '../../types/events';
import { BotResponse, BotResponseTypes } from '../../types/response';
import { InlineQueryResponse } from '../../dtos/responses/inlineQueryResponse';
import { UpdatePoller } from '../telegram/updatePoller';
import { TelegramApiService } from '../telegramApi';
import { BaseActionProcessor } from './baseProcessor';
import { InlineQuery } from '../../types/botApi.generated';

export class InlineQueryActionProcessor extends BaseActionProcessor {
    private inlineQueries!: InlineQueryActionInternal[];
    /** Fake chat info, since inline queries are chat-less */
    private readonly fakeChatInfo = new ChatInfo(
        INLINE_QUERY_FAKE_CHAT_ID,
        'Inline Query',
        []
    );

    initialize(
        api: TelegramApiService,
        telegram: UpdatePoller,
        inlineQueries: InlineQueryAction[]
    ) {
        this.initializeDependencies(api);
        this.inlineQueries = inlineQueries as InlineQueryActionInternal[];

        const queriesInProcessing = new Map<number, IncomingInlineQuery>();

        if (this.inlineQueries.length > 0) {
            const processQuery = async (inlineQuery: InlineQuery) => {
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

                    try {
                        queryBeingProcessed.abortController.abort();
                    } catch {
                        this.eventEmitter.emit(
                            BotEventType.inlineProcessingAborted,
                            {
                                abortedQuery: queryBeingProcessed,
                                traceId: query.traceId
                            }
                        );
                    }
                    queriesInProcessing.delete(query.userId);
                }

                this.eventEmitter.emit(BotEventType.inlineProcessingStarted, {
                    botName: this.botName,
                    traceId: query.traceId
                });

                queriesInProcessing.set(query.userId, query);

                const actionPromises = this.inlineQueries.map(
                    async (inlineQueryAction) => {
                        const ctx = new InlineQueryContextInternal(
                            this.storage,
                            this.scheduler,
                            this.eventEmitter,
                            this.api.client,
                            inlineQueryAction,
                            query,
                            this.fakeChatInfo,
                            this.botName
                        );

                        const { proxy, revoke } = Proxy.revocable(ctx, {});

                        try {
                            return await this.runAction(
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
                                        this.eventEmitter.emit(
                                            BotEventType.error,
                                            {
                                                error,
                                                traceId: query.traceId
                                            }
                                        );
                                    }
                                }
                            );
                        } finally {
                            revoke();
                        }
                    }
                );

                try {
                    const responses = (
                        await Promise.allSettled(actionPromises)
                    ).flatMap((result) =>
                        result.status == 'fulfilled' ? result.value : []
                    );
                    const answer = this.mergeInlineAnswers(responses);

                    if (answer) {
                        this.api.enqueueBatchedResponses([answer]);
                        this.api.flushResponses();
                    }
                } finally {
                    // A newer query from the same user may have replaced this one
                    if (queriesInProcessing.get(query.userId) == query) {
                        queriesInProcessing.delete(query.userId);
                    }
                    this.eventEmitter.emit(
                        BotEventType.inlineProcessingFinished,
                        {
                            botName: this.botName,
                            traceId: query.traceId
                        }
                    );
                }
            };

            telegram.on('inline_query', (inlineQuery) =>
                this.track(processQuery(inlineQuery))
            );
        }
    }

    private mergeInlineAnswers(responses: BotResponse[]) {
        const answers = responses.filter(
            (response): response is InlineQueryResponse =>
                response.kind == BotResponseTypes.inlineQuery
        );
        if (answers.length == 0) return undefined;

        const [first] = answers;
        const results = answers.flatMap((answer) => answer.queryResults);

        if (results.length > INLINE_QUERY_RESULTS_LIMIT) {
            this.eventEmitter.emit(BotEventType.error, {
                error: new Error(
                    `Inline query produced ${results.length} results, but Telegram accepts at most ${INLINE_QUERY_RESULTS_LIMIT}. Only the first ${INLINE_QUERY_RESULTS_LIMIT} were sent.`
                ),
                traceId: first.traceId
            });
        }

        return new InlineQueryResponse(
            results.slice(0, INLINE_QUERY_RESULTS_LIMIT),
            first.queryId,
            first.traceId,
            first.action
        );
    }
}
