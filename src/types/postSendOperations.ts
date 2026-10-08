import {
    ReplyContext,
    ReplyContextInternal
} from '../entities/context/replyContext';
import { PersistentReplyCapture } from '../entities/persistentReplyCapture';
import { PersistentReplyCaptureActionInternal } from '../entities/actions/persistentReplyCaptureAction';
import { IAction } from './action';
import { IActionState } from './actionState';
import { CommandTrigger } from './commandTrigger';
import { Milliseconds } from './timeValues';

export type ReplyCaptureOptions<TParentActionState extends IActionState> = {
    /** Array of command triggers that will activate the handler. */
    trigger: CommandTrigger[];
    /** Callback function that will be called when a trigger is matched. */
    handler: (replyContext: ReplyContext<TParentActionState>) => Promise<void>;
    /** Optional abort controller to manually abort capturing. Abort it from a timer to give the capture a time limit. */
    abortController?: AbortController;
};

export type PersistentReplyCaptureOptions<TData extends object> = {
    /** Capture definition created with `PersistentReplyCaptureBuilder` and registered in `persistentCaptures`. */
    persistent: PersistentReplyCapture<TData>;
    /** JSON-serializable data passed to the handler. */
    data: TData;
};

export type ContinueReplyCaptureOptions = {
    /** Adds this message to the persistent capture whose handler is running. */
    continueCapture: true;
};

export interface IPostSendOperationController {
    /**
     * Captures replies to this message.
     *
     * With `{ trigger, handler, abortController? }` the capture is kept in memory and lost on restart.
     * It stays active until it is stopped with `stopCapture()` from the reply handler or by aborting its abort controller.
     *
     * With `{ persistent, data }` the capture is saved to storage and restored after a restart.
     * It stays active until the handler calls `stopCapture()`, the capture expires or all of its messages are deleted by the bot.
     *
     * With `{ continueCapture: true }`, used in a persistent capture handler, replies to this message are handled by that capture too.
     */
    captureReplies<TParentActionState extends IActionState>(
        options: ReplyCaptureOptions<TParentActionState>
    ): void;
    captureReplies<TData extends object>(
        options: PersistentReplyCaptureOptions<TData>
    ): void;
    captureReplies(options: ContinueReplyCaptureOptions): void;

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

export type PostSendOperation =
    | DeleteAfterTimeout
    | ReplyCapture
    | PersistentReplyCaptureOperation
    | ContinuePersistentReplyCaptureOperation
    | Pin;

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

export type PersistentReplyCaptureOperation = {
    kind: 'capturePersistentReplies';

    definition: PersistentReplyCapture<object>;
    data: object;
};

export type ContinuePersistentReplyCaptureOperation = {
    kind: 'continuePersistentReplies';

    capture: PersistentReplyCaptureActionInternal<object>;
};
