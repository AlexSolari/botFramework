import { ChatContext } from '../entities/context/chatContext';
import { InlineQueryContext } from '../entities/context/inlineQueryContext';
import { MessageContext } from '../entities/context/messageContext';
import { IActionState } from './actionState';

export type CommandActionPropertyProvider<T> = (
    ctx: MessageContext<IActionState>
) => T;

export type InlineActionPropertyProvider<T> = (ctx: InlineQueryContext) => T;

export type ScheduledActionPropertyProvider<T> = (
    ctx: ChatContext<IActionState>
) => T;
