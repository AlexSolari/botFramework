import { MessageContext } from '../entities/context/messageContext';
import { IActionState } from './actionState';

export type CommandCondition<TActionState extends IActionState> = (
    ctx: MessageContext<TActionState>
) => boolean;
