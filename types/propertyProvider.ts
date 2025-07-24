import { MessageContext } from '../entities/context/messageContext';
import { IActionState } from './actionState';

export type PropertyProvider<T> = (ctx: MessageContext<IActionState>) => T;
