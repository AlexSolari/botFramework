# chz-telegram-bot

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/AlexSolari/botFramework)

## Overview

botFramework is a TypeScript library that provides a structured approach to building Telegram bots. It offers a comprehensive set of features for managing bot lifecycles, message processing, scheduled tasks, and state persistence.

## Features

- **Type-Safe Command Building**: Fully TypeScript-supported command builders
- **Stateful Actions**: Built-in state management for commands, scheduled actions, and inline queries
- **Flexible Triggering**: Support for exact matches, regex patterns, and message types
- **Scheduled Tasks**: Time-based actions with customizable execution schedules
- **Access Control**: Built-in user and chat-based permissions
- **Cooldown Management**: Configurable cooldown periods for commands
- **Cached Values**: Process-wide caching system for optimizing resource usage
- **Custom State Types**: Extensible state system for complex bot logic
- **Comprehensive Logging**: Built-in logging system with trace IDs
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

Scheduled actions run periodically without user interaction:

```typescript
import { ScheduledActionBuilder } from 'chz-telegram-bot';

const dailyNotification = new ScheduledActionBuilder('GM')
    .runAt(9) // Run at 9 AM
    .do((ctx) => {
        ctx.send.text('Good morning!');
    })
    .build();
```

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

Keep in mind that reply sending is deferred until action execution finishes and is queued in the order it was added. Telegram rate limits still apply between queued sends, so the framework inserts spacing between responses rather than promising strict real-time ordering.

Media files used by `send.image` and `send.video` are resolved from the `./content` directory, so `ctx.send.image('welcome')` loads `./content/welcome.png` and `ctx.send.video('demo')` loads `./content/demo.mp4`.

Example:

```typescript
ctx.send.text('Message 1');
ctx.wait(5000 as Milliseconds);
ctx.send.text('Message 2');
```

This will result in `Message 1` being sent, followed by `Message 2` after a 5 second delay.

## Configuration Options

When starting a bot, you can provide the following configuration:

| Option            | Type                                                                                                                   | Required                    | Description                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `name`            | `string`                                                                                                               | Yes                         | Bot name used in logging                                                                                               |
| `tokenProvider`   | `() => Promise<string>`                                                                                                | Yes                         | Function that returns the Telegram Bot token (e.g., read from a file or secret manager)                                |
| `actions`         | `{ commands: CommandAction[], scheduled: ScheduledAction[], inlineQueries: InlineQueryAction[], messageFilter?: ... }` | Yes (can be empty)          | Collection of actions grouped under `actions` — `commands`, `scheduled`, `inlineQueries`, and optional `messageFilter` |
| `chats`           | `Record<string, number>`                                                                                               | Yes                         | Object containing chat name-id pairs. Used for logging and scheduled execution.                                        |
| `storagePath`     | `string`                                                                                                               | No                          | Custom storage path for default JsonFileStorage client                                                                 |
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

State is mutable and all changes to it will be saved after execution of action is finished.

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
