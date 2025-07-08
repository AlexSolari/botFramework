import { resolve } from 'path';
import { ImageMessage } from '../../dtos/responses/imageMessage';
import { TextMessage } from '../../dtos/responses/textMessage';
import { VideoMessage } from '../../dtos/responses/videoMessage';
import { UnpinResponse } from '../../dtos/responses/unpin';
import {
    MessageSendingOptions,
    TextMessageSendingOptions
} from '../../types/messageSendingOptions';
import { IActionWithState } from '../../types/action';
import { IActionState } from '../../types/actionState';
import { IReplyResponse } from '../../types/response';
import { Milliseconds } from '../../types/timeValues';
import { DelayResponse } from '../../dtos/responses/delay';
import { ICaptureController } from '../../types/capture';
import { CommandTrigger } from '../../types/commandTrigger';
import { ReplyContext } from './replyContext';
import { BaseContext } from './baseContext';
import { ScheduledAction } from '../actions/scheduledAction';

/**
 * Context of action executed in chat.
 */
export class ChatContext<
    TActionState extends IActionState,
    TAction extends IActionWithState<TActionState> = ScheduledAction<TActionState>
> extends BaseContext<TAction> {
    protected createCaptureController(
        response: IReplyResponse
    ): ICaptureController {
        return {
            captureReplies: (
                trigger: CommandTrigger[],
                handler: (
                    replyContext: ReplyContext<TActionState>
                ) => Promise<void>,
                abortController: AbortController
            ) => {
                response.captures.push({
                    trigger,
                    handler,
                    abortController,
                    action: this.action
                });
            }
        };
    }

    /**
     * Collection of actions that send something to chat as a standalone message.
     */
    send = {
        /**
         * Sends text message to chat after action execution is finished.
         * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
         * @param text Message contents.
         * @param options Message sending option.
         */
        text: (text: string, options?: TextMessageSendingOptions) => {
            const response = new TextMessage(
                text,
                this.chatInfo,
                this.traceId,
                this.action,
                undefined,
                options
            );

            this.responses.push(response);

            return this.createCaptureController(response);
        },

        /**
         * Sends image message to chat after action execution is finished.
         * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
         * @param name Message contents.
         * @param options Message sending option.
         */
        image: (name: string, options?: MessageSendingOptions) => {
            const response = new ImageMessage(
                { source: resolve(`./content/${name}.png`) },
                this.chatInfo,
                this.traceId,
                this.action,
                undefined,
                options
            );

            this.responses.push(response);

            return this.createCaptureController(response);
        },

        /**
         * Sends video/gif message to chat after action execution is finished.
         * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
         * @param name Message contents.
         * @param options Message sending option.
         */
        video: (name: string, options?: MessageSendingOptions) => {
            const response = new VideoMessage(
                { source: resolve(`./content/${name}.mp4`) },
                this.chatInfo,
                this.traceId,
                this.action,
                undefined,
                options
            );

            this.responses.push(response);

            return this.createCaptureController(response);
        }
    };

    /**
     * Unpins message after action execution is finished.
     * If multiple responses are sent, they will be sent in the order they were added, with delay of at least 35ms as per Telegram rate-limit.
     * @param messageId Message id.
     */
    unpinMessage(messageId: number) {
        this.responses.push(
            new UnpinResponse(
                messageId,
                this.chatInfo,
                this.traceId,
                this.action
            )
        );
    }

    /**
     * Delays next responses by specified amount of time.
     * @param delay Delay in milliseconds.
     */
    wait(delay: Milliseconds) {
        this.responses.push(
            new DelayResponse(delay, this.chatInfo, this.traceId, this.action)
        );
    }
}
