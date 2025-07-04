import { Telegraf } from 'telegraf';
import { IncomingInlineQuery } from '../../dtos/incomingQuery';
import { InlineQueryAction } from '../../entities/actions/inlineQueryAction';
import { InlineQueryContext } from '../../entities/context/inlineQueryContext';
import { createTrace } from '../../helpers/traceFactory';
import { ILogger } from '../../types/logger';
import { IScheduler } from '../../types/scheduler';
import { IStorageClient } from '../../types/storage';
import { Milliseconds } from '../../types/timeValues';
import { TraceId } from '../../types/trace';
import { TelegramApiService } from '../telegramApi';
import { BaseActionProcessor } from './baseProcessor';

export class InlineQueryActionProcessor extends BaseActionProcessor {
    private inlineQueries!: InlineQueryAction[];

    constructor(
        botName: string,
        storage: IStorageClient,
        scheduler: IScheduler,
        logger: ILogger
    ) {
        super(botName, storage, scheduler, logger);
    }

    initialize(
        api: TelegramApiService,
        telegraf: Telegraf,
        inlineQueries: InlineQueryAction[],
        period: Milliseconds
    ) {
        this.initializeDependencies(api, telegraf);
        this.inlineQueries = inlineQueries;

        let pendingInlineQueries: IncomingInlineQuery[] = [];

        const queriesInProcessing = new Map<number, IncomingInlineQuery>();

        if (this.inlineQueries.length > 0) {
            this.telegraf.on('inline_query', async (ctx) => {
                const query = new IncomingInlineQuery(
                    ctx.inlineQuery.id,
                    ctx.inlineQuery.query,
                    ctx.inlineQuery.from.id,
                    createTrace('InlineQuery', this.botName, ctx.inlineQuery.id)
                );

                const logger = this.logger.createScope(
                    this.botName,
                    query.traceId,
                    'Query'
                );

                logger.logWithTraceId(
                    `${ctx.inlineQuery.from.username} (${ctx.inlineQuery.from.id}): Query for ${ctx.inlineQuery.query}`
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
                    const ctx = new InlineQueryContext(
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

                            this.executeAction(
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
        ctx: InlineQueryContext,
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
