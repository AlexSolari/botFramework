import TelegramBot from 'node-telegram-bot-api';
import { IncomingInlineQuery } from '../../dtos/incomingQuery';
import { InlineQueryAction } from '../../entities/actions/inlineQueryAction';
import { InlineQueryContextInternal } from '../../entities/context/inlineQueryContext';
import { createTrace } from '../../helpers/traceFactory';
import { Milliseconds } from '../../types/timeValues';
import { TraceId } from '../../types/trace';
import { TelegramApiService } from '../telegramApi';
import { BaseActionProcessor } from './baseProcessor';

export class InlineQueryActionProcessor extends BaseActionProcessor {
    private inlineQueries!: InlineQueryAction[];

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
            telegram.on('inline_query', (inlineQuery) => {
                const query = new IncomingInlineQuery(
                    inlineQuery.id,
                    inlineQuery.query,
                    inlineQuery.from.id,
                    createTrace('InlineQuery', this.botName, inlineQuery.id)
                );

                const logger = this.logger.createScope(
                    this.botName,
                    query.traceId,
                    'Query'
                );

                logger.logWithTraceId(
                    `${inlineQuery.from.username ?? 'Unknown'} (${
                        inlineQuery.from.id
                    }): Query for ${inlineQuery.query}`
                );

                const queryBeingProcessed = queriesInProcessing.get(
                    query.userId
                );
                if (queryBeingProcessed) {
                    logger.logWithTraceId(
                        `Aborting query ${queryBeingProcessed.queryId} (${queryBeingProcessed.query}): new query recieved from ${query.userId}`
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
                async () => {
                    const ctx = new InlineQueryContextInternal(
                        this.storage,
                        this.scheduler
                    );

                    const queriesToProcess = [...pendingInlineQueries];
                    pendingInlineQueries = [];

                    for (const inlineQuery of queriesToProcess) {
                        queriesInProcessing.set(
                            inlineQuery.userId,
                            inlineQuery
                        );

                        for (const inlineQueryAction of this.inlineQueries) {
                            this.initializeInlineQueryContext(
                                ctx,
                                inlineQuery.query,
                                inlineQuery.queryId,
                                inlineQueryAction,
                                inlineQuery.abortController.signal,
                                inlineQuery.traceId
                            );

                            await this.executeAction(
                                inlineQueryAction,
                                ctx,
                                (error, ctx) => {
                                    if (error.name == 'AbortError') {
                                        ctx.logger.logWithTraceId(
                                            `Aborting query ${inlineQuery.queryId} (${inlineQuery.query}) successful.`
                                        );
                                    } else {
                                        ctx.logger.errorWithTraceId(error, ctx);
                                    }
                                }
                            );
                        }

                        queriesInProcessing.delete(inlineQuery.userId);
                    }

                    this.api.flushResponses();
                },
                period,
                false,
                this.botName
            );
        }
    }

    private initializeInlineQueryContext(
        ctx: InlineQueryContextInternal,
        queryText: string,
        queryId: string,
        action: InlineQueryAction,
        abortSignal: AbortSignal,
        traceId: TraceId
    ) {
        ctx.queryText = queryText;
        ctx.queryId = queryId;
        ctx.botName = this.botName;
        ctx.action = action;
        ctx.traceId = traceId;
        ctx.abortSignal = abortSignal;

        ctx.isInitialized = true;
        ctx.queryResults = [];
        ctx.matchResults = [];

        ctx.logger = this.logger.createScope(this.botName, traceId, 'Unknown');
    }
}
