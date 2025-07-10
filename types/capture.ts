import { ReplyContextInternal } from '../entities/context/replyContext';
import { IActionState } from './actionState';
import { CommandTrigger } from './commandTrigger';
import { IActionWithState } from './action';

export interface ICaptureController {
    captureReplies: <TParentActionState extends IActionState>(
        /**
         * Defines action trigger.
         * If `string` or `string[]` is provided, will be triggered only on exact message match.
         * If `RegExp` or `RegExp[]` is provided, will be triggered on successful match.
         */
        trigger: CommandTrigger[],
        /** Callback that will be called on trigger */
        handler: (
            replyContext: ReplyContextInternal<TParentActionState>
        ) => Promise<void>,
        /** Abort controller to abort capturing manually */
        abortController: AbortController
    ) => void;
}

export interface IReplyCapture {
    trigger: CommandTrigger[];
    handler: (
        replyContext: ReplyContextInternal<IActionState>
    ) => Promise<void>;
    abortController: AbortController;
    action: IActionWithState<IActionState>;
}
