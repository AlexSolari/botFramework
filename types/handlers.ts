import { ChatContext } from '../entities/context/chatContext';
import { MessageContext } from '../entities/context/messageContext';
import { IActionState } from './actionState';
import { CachedValueAccessor } from './cachedValueAccessor';

export type CommandHandler<TActionState extends IActionState> = (
    /** Context of action executed in chat, in response to a message. */
    ctx: MessageContext<TActionState>,
    /** State of an action being executed. */
    state: TActionState
) => Promise<void>;

export type ScheduledHandler<TActionState extends IActionState> = (
    /** Context of action executed in chat. */
    ctx: ChatContext,
    /** Function that will attempt to get value from cache. If there is no value found, corresponding cached state factory will be called. */
    getCached: CachedValueAccessor,
    /** State of an action being executed. */
    state: TActionState
) => Promise<void>;
