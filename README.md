# chz-telegram-bot

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/AlexSolari/botFramework)

## Overview

botFramework is a TypeScript library that provides a structured approach to building Telegram bots. It offers a comprehensive set of features for managing bot lifecycles, message processing, scheduled tasks, and state persistence.

## Features

- **Type-Safe Command Building**: Fully TypeScript-supported command builders
- **Stateful Actions**: Built-in per-chat state management for command and scheduled actions
- **Flexible Triggering**: Support for exact matches, regex patterns, and message types
- **Scheduled Tasks**: Daily time-of-day actions, checked on a configurable period
- **Access Control**: Built-in user and chat-based permissions
- **Cooldown Management**: Configurable cooldown periods for commands
- **Cached Values**: Process-wide caching system for optimizing resource usage
- **Custom State Types**: Extensible state system for complex bot logic
- **Observability**: Typed event emitter that reports lifecycle and execution events with trace IDs, so you can plug in your own logging
- **Persistent Storage**: JSON-based file storage with automatic state management
- **Inline Query Support**: Handle inline queries with type-safe builders
- **Response Queue**: Managed response processing queue for reliable message delivery
- **Rich Media Support**: Built-in support for text, images, videos, reactions, and inline results

## Installation

```bash
# Using npm
npm install chz-telegram-bot

# Using yarn
yarn add chz-telegram-bot

# Using bun
bun add chz-telegram-bot
```

## Quick Start

### 1. Create a new bot project

```
mkdir my-telegram-bot
cd my-telegram-bot
npm init -y
npm install chz-telegram-bot
```

### 2. Create a token file

Create a file named `token.txt` in your project and paste your Telegram Bot token obtained from BotFather.

### 3. Create a basic bot

Create an `index.ts` file with the following content:

```typescript
import { readFile } from 'node:fs/promises';
import {
    botOrchestrator,
    CommandActionBuilder,
    MessageType,
    Seconds
} from 'chz-telegram-bot';

// Define your command actions
const commands = [
    new CommandActionBuilder('HelloWorld')
        .on('/hello')
        .do((ctx) => {
            ctx.reply.withText('Hello, world!');
        })
        .build(),

    new CommandActionBuilder('Welcome')
        .on(MessageType.NewChatMember)
        .do((ctx) => {
            ctx.reply.withText('Welcome to the group!');
        })
        .build()
];

async function main() {
    try {
        // Start the bot
        const bot = await botOrchestrator.startBot({
            name: 'MyFirstBot',
            tokenProvider: async () =>
                (await readFile('./token.txt', 'utf-8')).trim(),
            actions: {
                commands,
                scheduled: [], // Add scheduled actions if needed
                inlineQueries: [],
                messageFilter: (message) => {
                    // Optional: ignore messages from bots or other unwanted sources
                    return !message.from?.is_bot;
                }
            },
            chats: {
                MyChat: -1001234567890 // Replace with your chat ID
            },
            scheduledPeriod: (60 * 5) as Seconds,
            // Optional settings
            storagePath: './data'
        });

        // Add logging
        bot.eventEmitter.onEach(
            (e: string, timestamp: number, data: unknown) => {
                console.log(
                    `${new Date(timestamp).toISOString()} - ${e} - ${JSON.stringify(data)}`
                );
            }
        );

        // Proper cleanup on shutdown
        const cleanup = async (signal: string) => {
            console.log(`Received ${signal}, cleaning up...`);
            await botOrchestrator.stopBots();
            process.exit(0);
        };

        process.on('SIGINT', () => cleanup('SIGINT'));
        process.on('SIGTERM', () => cleanup('SIGTERM'));

        console.log('Bot started successfully!');
        return bot;
    } catch (error) {
        console.error('Failed to start bot:', error);
        process.exit(1);
    }
}

main().catch(console.error);
```

### 4. Run your bot

```
bun index.ts
```

The library itself does not depend on Bun-specific APIs; any TypeScript runner (or compiled JavaScript on Node.js) works. The bot receives updates via Telegram `getUpdates` long polling.

## Core Concepts

### Command Actions

Command actions are triggered by user messages that match specific patterns:

```typescript
import { CommandActionBuilder } from 'chz-telegram-bot';

const myCommand = new CommandActionBuilder('StartCommand')
    .on('/start')
    .do((ctx) => {
        ctx.reply.withText('Welcome to my bot!');
    })
    .build();
```

A string trigger matches the whole message exactly, a `RegExp` triggers on a match, and an array can mix both. Builders also offer access control and tuning:

| Method                    | Description                                                                |
| ------------------------- | -------------------------------------------------------------------------- |
| `from(ids)`               | Only these user ids can trigger the action (empty = everyone)              |
| `in(chatIds)`             | Only run in these chats (empty = all chats)                                |
| `notIn(chatIds)`          | Ignore these chats                                                         |
| `when(condition)`         | Extra condition, checked last (after the trigger, access and cooldown checks) |
| `withCooldown({...})`     | Cooldown in seconds with an optional message                               |
| `withRatelimit(n)`        | Max simultaneous executions per chat (0 = unlimited)                       |
| `withHelp(factory)`       | Text shown by the built-in `/help` command (active once any command provides help text) |
| `withConfiguration(...)`  | Use runtime-changeable providers instead of static values                  |
| `disabled()`              | Marks the action as disabled                                               |

For each incoming message, the framework first checks every command's triggers. Only commands whose triggers match get a context, so their providers, state and conditions are never evaluated for other messages. For a matching command, the checks then run in this order: rate limit, active flag and chat/user restrictions, cooldown, `when` condition. Commands triggered by `MessageType.Any` or `MessageType.Text` match every message, so keep their providers and conditions cheap.

By default (`withRatelimit(0)`), a command can run several times at once in the same chat, because each incoming message is processed independently. The cooldown starts only after the handler finishes, so messages that arrive close together can all pass the cooldown check and run the handler. Each execution also works on its own copy of the state, and the one that finishes last overwrites the others' changes. Use `withRatelimit(1)` when a command must run one at a time per chat, for example when it relies on its cooldown or updates its state.

Message types can also trigger commands:

```typescript
import { CommandActionBuilder, MessageType } from 'chz-telegram-bot';

const myCommand = new CommandActionBuilder('WelcomeMessage')
    .on(MessageType.NewChatMember)
    .do((ctx) => {
        ctx.reply.withText('Welcome to my group chat!');
    })
    .build();
```

### Scheduled Actions

Scheduled actions run without user interaction, at most once per day per chat:

```typescript
import { ScheduledActionBuilder } from 'chz-telegram-bot';

const dailyNotification = new ScheduledActionBuilder('GM')
    .in([-1001234567890]) // Required: chat ids to run in
    .runAt(9) // Run at or after 9:00 (server local time)
    .do((ctx) => {
        ctx.send.text('Good morning!');
    })
    .build();
```

How scheduling works:

- Actions only run in chats that are both listed in the `chats` option of `startBot` and in the action's `.in([...])` whitelist. **Without `.in(...)` a scheduled action never runs.**
- `scheduledPeriod` controls how often the bot checks for due actions. The first check happens at the top of the next hour, then repeats every period.
- `runAt(hour)` (0-23, server local time, default `0`) means "run at the first check at or after this hour, if the action hasn't already run today". With the default 1 hour period it fires shortly after the hour; with a longer period it can fire later.
- The scheduled handler also receives a cache accessor and the state: `.do((ctx, getCached, state) => ...)`. Values are registered with `.withSharedCache(key, factory, invalidationHours)`; they are shared process-wide and refreshed after the timeout (20 hours by default).

### Replies and message sending

Depending on the type of action, you will have access to the following interaction options:

| Method               | Action type | Description                                                     |
| -------------------- | ----------- | --------------------------------------------------------------- |
| `send.text`          | Both        | Send text to chat as a standalone message                       |
| `send.image`         | Both        | Send image to chat as a standalone message from `./content`     |
| `send.video`         | Both        | Send video/gif to chat as a standalone message from `./content` |
| `pinMessage`         | Both        | Pins a message by its ID                                        |
| `unpinMessage`       | Both        | Unpins a message by its ID                                      |
| `wait`               | Both        | Delays next replies from this action by given amount of ms      |
| `reply.withText`     | Command     | Replies with text to a message that triggered an action         |
| `reply.withImage`    | Command     | Replies with image to a message that triggered an action        |
| `reply.withVideo`    | Command     | Replies with video/gif to a message that triggered an action    |
| `reply.withReaction` | Command     | Sets an emoji reaction to a message that triggered an action    |
| `reply.andQuote.*`   | Command     | `withText`, `withImage`, `withVideo` that also quote the trigger text (or a given quote) |

`send.*` and `reply.with*` (except `withReaction`) return a controller with post-send operations: `pin()`, `deleteAfter(ms)` and `captureReplies(triggers, handler)` (handle replies to the sent message; triggers work like command triggers, including message types such as `MessageType.Any`). Text messages accept `disableWebPreview` and an inline `keyboard` as options.

Keep in mind that reply sending is deferred until action execution finishes and is queued in the order it was added. Telegram rate limits still apply between queued sends, so the framework inserts spacing between responses rather than promising strict real-time ordering.

Media files used by `send.image` and `send.video` are resolved from the `./content` directory, so `ctx.send.image('welcome')` loads `./content/welcome.png` and `ctx.send.video('demo')` loads `./content/demo.mp4`.

Example:

```typescript
ctx.send.text('Message 1');
ctx.wait(5000 as Milliseconds);
ctx.send.text('Message 2');
```

This will result in `Message 1` being sent, followed by `Message 2` after a 5 second delay.

#### Capture lifetime

Reply captures have no expiry. A capture stays in memory, and every later message in the chat is checked against it, until it is stopped, so stop captures once they are no longer needed:

- From the reply handler, call `stopCapture()`.
- From anywhere else, pass your own `AbortController` to `captureReplies` and call `abort()` on it. One controller can be shared by several captures to stop them all at once; `stopCapture()` aborts the capture's controller, so it stops every capture that shares it.
- To give a capture a time limit, abort its controller from a timer.

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 10 * 60 * 1000); // stop after 10 minutes

ctx.reply
    .withText('Guess the number! Reply to this message.')
    .captureReplies(
        [/\d+/],
        async (replyCtx) => {
            if (replyCtx.messageInfo.text == secret) {
                replyCtx.reply.withText('Correct!');
                replyCtx.stopCapture();
            }
        },
        controller
    );
```

Each stopped capture emits a `commandActionCaptureAborted` event.

## Configuration Options

When starting a bot, you can provide the following configuration:

| Option            | Type                                                                                                                   | Required                    | Description                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `name`            | `string`                                                                                                               | Yes                         | Bot name used in logging                                                                                               |
| `tokenProvider`   | `() => Promise<string>`                                                                                                | Yes                         | Function that returns the Telegram Bot token (e.g., read from a file or secret manager)                                |
| `actions`         | `{ commands: CommandAction[], scheduled: ScheduledAction[], inlineQueries: InlineQueryAction[], messageFilter?: ... }` | Yes (can be empty)          | Collection of actions grouped under `actions` — `commands`, `scheduled`, `inlineQueries`, and optional `messageFilter` |
| `chats`           | `Record<string, number>`                                                                                               | Yes                         | Object containing chat name-id pairs. Used for logging and scheduled execution.                                        |
| `storagePath`     | `string`                                                                                                               | No (defaults to `./storage`) | Custom storage path for default JsonFileStorage client; ignored if `services.storageClient` is provided               |
| `scheduledPeriod` | `Seconds`                                                                                                              | No (will default to 1 hour) | Period between scheduled action executions                                                                             |
| `services`        |                                                                                                                        | No                          | Custom services to be used instead of default ones                                                                     |

Services object should have following structure:
| Option | Type | Required | Description |
|------------------|--------------------------|----------|---------------------------------------------------------------|
| `storageClient` | `IStorageClient` | No (will default to `JsonFileStorage`) | Persistence state provider |
| `scheduler` | `IScheduler` | No (will default to `NodeTimeoutScheduler`) | Scheduler used to schedule actions |
| `eventEmitter` | `TypedEventEmitter<Record<string, unknown>>` | No | Emits framework lifecycle and execution events |

## Advanced Usage

### Custom State Management

The framework allows you to create custom state for your actions:

```typescript
import {
    ActionStateBase,
    CommandActionBuilderWithState
} from 'chz-telegram-bot';

class MyCustomState extends ActionStateBase {
    counter: number = 0;
}

const counterCommand = new CommandActionBuilderWithState<MyCustomState>(
    'Counter',
    () => new MyCustomState()
)
    .on('/count')
    .do(async (ctx, state) => {
        state.counter++;
        ctx.reply.withText(`Count: ${state.counter}`);
    })
    .build();
```

State is mutable and all changes to it will be saved after execution of action is finished. If the same command can run concurrently in one chat, the last execution to finish overwrites the others' changes; use `withRatelimit(1)` to prevent that (see [Command Actions](#command-actions)).

### Inline Queries

The framework provides support for handling inline queries with type-safe builders:

```typescript
import { InlineQueryActionBuilder } from 'chz-telegram-bot';

const searchCommand = new InlineQueryActionBuilder('Search')
    .on(/search/i)
    .do((ctx) => {
        const query = ctx.queryText;
        // Process the query and return inline results
        ctx.showInlineQueryResult({
            id: '1',
            type: 'article',
            title: `Search results for: ${query}`,
            description: 'Click to send',
            input_message_content: {
                message_text: `Search result for: ${query}`
            }
        });
    })
    .build();
```

You can also use the builder’s built-in `withConfiguration` and `disabled()` helpers to toggle the action at runtime.

### Response Queue

The framework includes a response processing queue that batches deferred actions and sends them after the handler completes:

```typescript
ctx.send.text('First message');
ctx.send.image('image');
ctx.reply.withReaction('👍');
```

Responses are queued in the order they were added, and the framework applies spacing to respect Telegram rate limiting. This is best-effort handling rather than a strict real-time guarantee for every send.

## Stopping the Bot

To properly terminate your bot and clean up resources:

```typescript
import { botOrchestrator } from 'chz-telegram-bot';

// Call when your application is shutting down
await botOrchestrator.stopBots();
```

`stopBots()` shuts each bot down in this order:

1. Stops receiving updates and running scheduled actions.
2. Waits for messages, inline queries and scheduled actions that are already being processed.
3. Sends the responses that are due. Responses still waiting on `ctx.wait()` are dropped, and messages with a pending `deleteAfter()` are left in the chat.
4. Closes the storage. Any later attempt to save state is rejected.

A handler that never finishes keeps `stopBots()` waiting too.
