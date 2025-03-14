import { ChatContext } from '../entities/context/chatContext';
import { MessageContext } from '../entities/context/messageContext';
import { IActionState } from './actionState';
import { CachedValueAccessor } from './cachedValueAccessor';

export type CommandHandler<TActionState extends IActionState> = (
    ctx: MessageContext<TActionState>,
    state: TActionState
) => Promise<void>;

export type ScheduledHandler<TActionState extends IActionState> = (
    ctx: ChatContext,
    getCached: CachedValueAccessor,
    state: TActionState
) => Promise<void>;
