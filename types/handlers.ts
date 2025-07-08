import { ChatContext } from '../entities/context/chatContext';
import { InlineQueryContext } from '../entities/context/inlineQueryContext';
import { MessageContext } from '../entities/context/messageContext';
import { IActionState } from './actionState';
import { CachedValueAccessor } from './cachedValueAccessor';

export type InlineQueryHandler = (
    /** Context of inline query executed in chat, in response to a message. */
    ctx: InlineQueryContext
) => Promise<void>;

export type CommandHandler<TActionState extends IActionState> = (
    /** Context of action executed in chat, in response to a message. */
    ctx: MessageContext<TActionState>,
    /** State of an action being executed. */
    state: TActionState
) => Promise<void> | void;

export type ScheduledHandler<TActionState extends IActionState> = (
    /** Context of action executed in chat. */
    ctx: ChatContext<TActionState>,
    /** Function that will attempt to get value from cache. If there is no value found, corresponding cached state factory will be called. */
    getCached: CachedValueAccessor,
    /** State of an action being executed. */
    state: TActionState
) => Promise<void>;
