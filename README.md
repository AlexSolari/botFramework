
# chz-bot-Framework

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/AlexSolari/botFramework)
## Overview

botFramework is a TypeScript library that provides a structured approach to building Telegram bots. It handles the complexities of bot lifecycle management, message processing, scheduled tasks, and state persistence.

## Installation

```
npm install chz-bot-framework  
# or  
bun install chz-bot-framework
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

Create a file named  `token.txt`  in your project and paste your Telegram Bot token obtained from BotFather.

### 3. Create a basic bot

Create an  `index.ts`  file with the following content:

```typescript
import { startBot, stopBots, CommandActionBuilder, Seconds } from 'chz-telegram-bot';  
  
// Define your command actions  
const commands = [  
  new CommandActionBuilder('HelloWorld')  
    .on('/hello')  
    .do(async (ctx) => {  
      ctx.replyWithText('Hello, world!');  
    })  
    .build()  
];  
  
// Define scheduled actions (if needed)  
const scheduled = [];  
  
async function main() {  
  // Start the bot  
  startBot({
    name:  'MyFirstBot',
    tokenFilePath:  './token.txt',
    commands:  commands,
    scheduled:  scheduled,
    chats: {
        MyChat:  -1001234567890 // Replace with your actual chat ID,
    },
    scheduledPeriod: (60  *  5) as  Seconds
  });
  
  // Set up graceful shutdown  
  process.on('SIGINT', () => stopBots('SIGINT'));  
  process.on('SIGTERM', () => stopBots('SIGTERM'));  
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
  .do(async (ctx) => {  
    ctx.replyWithText('Welcome to my bot!');  
  })  
  .build();
```
Message types are also can trigger commands:
```typescript
import { CommandActionBuilder, MessageType } from 'chz-telegram-bot';  
  
const myCommand = new CommandActionBuilder('WelcomeMessage')  
  .on(MessageType.NewChatMember)  
  .do(async (ctx) => {  
    ctx.replyWithText('Welcome to my group chat!');  
  })  
  .build();
```

### Scheduled Actions

Scheduled actions run periodically without user interaction:

```typescript
import { ScheduledActionBuilder, Hours } from 'chz-telegram-bot';  
  
const dailyNotification = new ScheduledActionBuilder('GM')  
  .runAt(9 as Hours) // Run at 9 AM  
  .do(async (ctx) => {  
    ctx.sendTextToChat('Good morning!');  
  })  
  .build();
```

### Replies and message sending
Depending on a type of action, you will have access to following interaction options:

| Method | Action type | Description
|----------|----------------|-------
|`sendTextToChat`|Both|Send text to chat as a standalone message
|`sendImageToChat`|Both|Send image to chat as a standalone message
|`sendVideoToChat`|Both|Send video/gif to chat as a standalone message
|`unpinMessage`|Both|Unpins message by its ID
|`delayNextResponse`|Both|Delays next reply action my given amount of ms
|`replyWithText`|Command|Replies with text to a message that triggered an action
|`replyWithImage`|Command|Replies with image to a message that triggered an action
|`replyWithVideo`|Command|Replies with video/gif to a message that triggered an action
|`react`|Command|Sets an emoji reaction to a message that triggered an action


Keep in mind that reply sending is deferred until action execution finished and will be done in order of calling in action handler. 
Ex:
```typescript
ctx.sendTextToChat('Message 1')
ctx.delayNextResponse(5000 as Millisecond)
ctx.sendTextToChat('Message 2')
```
This will result in `Message 1` text being send, followed by `Message 2` after 5 second delay.

## Configuration Options

When starting a bot, you can provide the following configuration:

| Option           | Type                     | Required | Description                                                   |
|------------------|--------------------------|----------|---------------------------------------------------------------|
| `name`           | `string`             | Yes      | Bot name used in logging                                      |
| `tokenFilePath`  | `string`                  | Yes      | Path to file containing Telegram Bot token                    |
| `commands`       | `CommandAction[]  `        | Yes (can be empty)     | Collection of command actions                                 |
| `scheduled`      | `ScheduledAction[]`        | Yes   (can be empty)    | Collection of scheduled actions                               |
| `chats`          | `Record<string, number>`   | Yes      | Object containing chat name-id pairs. Used for logging and execution of scheduled action.                              |
| `storagePath`    | `string`                   | No       | Custom storage path for default JsonFileStorage client               |
| `scheduledPeriod`| `Seconds`                  | No (will default to 1 hour)       | Period between scheduled action executions                    |
| `services`  |            | No       | Custom services to be used instead of default ones           |

Services object should have following structure:
| Option           | Type                     | Required | Description                                                   |
|------------------|--------------------------|----------|---------------------------------------------------------------|
| `storageClient`           | `IStorageClient`  | No (will default to `JsonFileStorage`)      | Persistance state provide                                      |
| `logger`  | `ILogger`                   | No (will default to `JsonLogger`)      | Logger service                    |
| `scheduler`       | `IScheduler`          | No (will default to `NodeTimeoutScheduler`)     | Scheduler used to scheduled action|


## Advanced Usage

### Custom State Management

The framework allows you to create custom state for your actions:

```typescript
import { ActionStateBase } from 'chz-telegram-bot';  
  
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
    ctx.replyWithText(`Count: ${state.counter}`);  
  })  
  .build();
```
State is mutable and all changes to it will be saved after execution of action is finished.

## Stopping the Bot

To properly terminate your bot and clean up resources:

```typescript
import { stopBots } from 'chz-telegram-bot';  
  
// Call when your application is shutting down  
await stopBots('SHUTDOWN');
```
