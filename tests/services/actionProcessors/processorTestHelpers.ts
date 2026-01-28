import { mock, type Mock } from 'bun:test';
import { IScheduler } from '../../../src/types/scheduler';
import { IStorageClient } from '../../../src/types/storage';
import { ActionKey, IAction } from '../../../src/types/action';
import { BotResponse } from '../../../src/types/response';
import { ChatInfo } from '../../../src/dtos/chatInfo';
import { TextMessage } from '../../../src/dtos/responses/textMessage';
import { TraceId } from '../../../src/types/trace';
import { Milliseconds } from '../../../src/types/timeValues';
import { TelegramApiService } from '../../../src/services/telegramApi';

// Re-export Mock type for use in tests
export type { Mock } from 'bun:test';

// Type-safe mock accessor - returns the mock function with proper typing
export function getMockFn<T extends (...args: never[]) => unknown>(
    fn: T
): Mock<T> {
    return fn as unknown as Mock<T>;
}

export function createMockStorage(): IStorageClient {
    return {
        load: mock(() => ({})) as IStorageClient['load'],
        close: mock(() => Promise.resolve()),
        getActionState: mock(() => ({
            lastExecutedDate: 0,
            pinnedMessages: []
        })) as IStorageClient['getActionState'],
        saveActionExecutionResult: mock(() => Promise.resolve()),
        updateStateFor: mock(() => Promise.resolve())
    };
}

// Extended scheduler type that exposes mock call tracking
export interface MockScheduler extends IScheduler {
    createTaskCallCount: () => number;
    createOnetimeTaskCallCount: () => number;
}

export function createMockScheduler(): MockScheduler {
    // Using arrow functions assigned to variables to avoid unbound-method ESLint errors
    const createTaskMock = mock(
        (
            _name: string,
            action: () => void,
            _interval: Milliseconds,
            executeRightAway: boolean,
            _ownerName: string
        ): void => {
            if (executeRightAway) {
                setImmediate(() => {
                    action();
                });
            }
        }
    );

    const createOnetimeTaskMock = mock(
        (
            _name: string,
            action: () => void,
            delay: Milliseconds,
            _ownerName: string
        ): void => {
            setTimeout(() => {
                action();
            }, delay as number);
        }
    );

    const stopAll = mock(() => {
        /* no-op */
    });

    return {
        createTask: createTaskMock,
        createOnetimeTask: createOnetimeTaskMock,
        stopAll,
        createTaskCallCount: () => createTaskMock.mock.calls.length,
        createOnetimeTaskCallCount: () =>
            createOnetimeTaskMock.mock.calls.length
    };
}

// Extended action type that exposes mock call tracking
export interface MockAction extends IAction {
    getExecCallCount: () => number;
    getExecLastArgs: () => unknown[] | undefined;
}

export function createMockAction(
    key: string,
    execResult: BotResponse[] = []
): MockAction {
    const execMock = mock(() => Promise.resolve(execResult));
    return {
        key: key as ActionKey,
        exec: execMock,
        getExecCallCount: () => execMock.mock.calls.length,
        getExecLastArgs: () => execMock.mock.calls.at(-1)
    };
}

// Extended telegram api type that exposes mock call tracking
export interface MockTelegramApi extends TelegramApiService {
    getEnqueueCallCount: () => number;
    getEnqueueLastArgs: () => BotResponse[] | undefined;
}

export function createMockTelegramApi(): MockTelegramApi {
    const enqueueMock = mock((_responses: BotResponse[]) => {
        /* no-op */
    });
    const flushMock = mock(() => {
        /* no-op */
    });
    return {
        enqueueBatchedResponses: enqueueMock,
        flushResponses: flushMock,
        getEnqueueCallCount: () => enqueueMock.mock.calls.length,
        getEnqueueLastArgs: () => enqueueMock.mock.calls.at(-1)?.[0]
    } as unknown as MockTelegramApi;
}

export function createMockChatInfo(): ChatInfo {
    return new ChatInfo(12345, 'Test Chat', []);
}

export function createMockTraceId(): TraceId {
    return 'trace-123' as TraceId;
}

export function createMockTextResponse(
    chatInfo: ChatInfo,
    traceId: TraceId,
    action: IAction
): TextMessage {
    return new TextMessage(
        'Hello',
        chatInfo,
        traceId,
        action,
        undefined,
        undefined
    );
}
