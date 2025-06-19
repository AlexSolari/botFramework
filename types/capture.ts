import { ReplyContext } from '../entities/context/replyContext';
import { IActionState } from './actionState';
import { CommandTrigger } from './commandTrigger';
import { IActionWithState } from './action';

export interface ICaptureController {
    captureReplies: <TParentActionState extends IActionState>(
        trigger: CommandTrigger[],
        handler: (
            replyContext: ReplyContext<TParentActionState>
        ) => Promise<void>,
        abortController: AbortController
    ) => void;
}

export interface IReplyCapture {
    trigger: CommandTrigger[];
    handler: (replyContext: ReplyContext<IActionState>) => Promise<void>;
    abortController: AbortController;
    action: IActionWithState<IActionState>;
}
