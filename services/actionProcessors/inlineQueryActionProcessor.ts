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

export class InlineQueryActionProcessor {
    private readonly storage: IStorageClient;
    private readonly scheduler: IScheduler;
    private readonly logger: ILogger;

    private readonly botName: string;

    private api!: TelegramApiService;
    private telegraf!: Telegraf;
    private inlineQueries!: InlineQueryAction[];

    constructor(
        botName: string,
        storage: IStorageClient,
        scheduler: IScheduler,
        logger: ILogger
    ) {
        this.storage = storage;
        this.scheduler = scheduler;
        this.logger = logger;

        this.botName = botName;
    }

    initialize(
        api: TelegramApiService,
        telegraf: Telegraf,
        inlineQueries: InlineQueryAction[],
        period: Milliseconds
    ) {
        this.api = api;
        this.telegraf = telegraf;
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

                this.logger.logWithTraceId(
                    this.botName,
                    query.traceId,
                    'Query',
                    `${ctx.inlineQuery.from.username} (${ctx.inlineQuery.from.id}): Query for ${ctx.inlineQuery.query}`
                );

                const queryBeingProcessed = queriesInProcessing.get(
                    query.userId
                );
                if (queryBeingProcessed) {
                    this.logger.logWithTraceId(
                        this.botName,
                        query.traceId,
                        'Query',
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
                        this.logger,
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

                            try {
                                const responses = await inlineQueryAction.exec(
                                    ctx
                                );
                                this.api.enqueueBatchedResponses(responses);
                                ctx.isInitialized = false;
                            } catch (err) {
                                const error = err as Error;

                                if (error.name == 'AbortError') {
                                    this.logger.logWithTraceId(
                                        this.botName,
                                        inlineQuery.traceId,
                                        'Query',
                                        `Aborting query ${inlineQuery.queryId} (${inlineQuery.query}) successful.`
                                    );
                                } else {
                                    this.logger.errorWithTraceId(
                                        ctx.botName,
                                        ctx.traceId,
                                        'Unknown',
                                        error,
                                        ctx
                                    );
                                }
                            }
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
    }
}
