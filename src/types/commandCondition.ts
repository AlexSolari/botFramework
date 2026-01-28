import { MessageContext } from '../entities/context/messageContext';
import { IActionState } from './actionState';

export type CommandCondition<TActionState extends IActionState> = (
    /** Context of action executed in chat, in response to a message. */
    ctx: MessageContext<TActionState>,
    /** State of an action being executed. */
    state: TActionState
) => boolean;
