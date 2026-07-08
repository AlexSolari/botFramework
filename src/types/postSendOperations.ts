import {
    ReplyContext,
    ReplyContextInternal
} from '../entities/context/replyContext';
import { IAction } from './action';
import { IActionState } from './actionState';
import { CommandTrigger } from './commandTrigger';
import { Milliseconds } from './timeValues';

export interface IPostSendOperationController {
    /**
     * Captures replies based on the specified trigger and handler.
     * @param trigger Array of command triggers that will activate the handler.
     * @param handler Callback function that will be called when a trigger is matched.
     * @param abortController Optional abort controller to manually abort capturing.
     */
    captureReplies: <TParentActionState extends IActionState>(
        trigger: CommandTrigger[],
        handler: (
            replyContext: ReplyContext<TParentActionState>
        ) => Promise<void>,
        abortController?: AbortController
    ) => void;

    /**
     * Pins the message associated with this response.
     */
    pin: () => void;

    /**
     * Deletes the message associated with this response after the specified timeout.
     * @param timeout Time in milliseconds after which the message will be deleted.
     */
    deleteAfter: (timeout: number) => void;
}

export type PostSendOperation = DeleteAfterTimeout | ReplyCapture | Pin;

export type Pin = {
    kind: 'pin';
};

export type DeleteAfterTimeout = {
    kind: 'deleteAfterTimeout';

    timeout: Milliseconds;
};

export type ReplyCapture = {
    kind: 'captureReplies';

    trigger: CommandTrigger[];
    handler: (
        replyContext: ReplyContextInternal<IActionState>
    ) => Promise<void>;
    abortController: AbortController;
    action: IAction;
};
