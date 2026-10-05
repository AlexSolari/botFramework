# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file was reconstructed from the git history and `package.json` version bumps. The repository has no git tags, so dates are the dates of the commit that bumped the version, and patch releases are grouped by minor version. While the major version is `0`, minor releases may contain breaking changes.

## [0.8.2] - 2026-10-05

### Fixed

- `commandActionCaptureAborted` events now report the parent message ID of the capture that was aborted. Previously, when one abort signal cancelled several reply captures, every event carried the same parent message ID.

## [0.8.1] - 2026-10-02

### Changed

- Command processing checks each command's triggers before creating its context. Commands that don't match a message are skipped entirely: no context is created, no state is loaded, no providers are called, and a rate-limited command no longer makes non-matching messages wait for its running execution. Bots with many commands process each message faster.
- Reply captures are only executed for messages that reply to their parent message and match their triggers, so the cost of processing a message no longer grows with the number of active captures in the chat.
- Commands and reply captures share one trigger matching implementation.

### Fixed

- `MessageType.Any` now works as a `captureReplies()` trigger. Previously such captures never fired.

## [0.8.0] - 2026-09-30

### Changed

- **Breaking:** Replaced the `telegraf` dependency with a handrolled Telegram Bot API client and `getUpdates` long-polling update poller (#4). Telegraf types are no longer used anywhere in the public API.
- **Breaking:** Contexts expose `telegramApiClient` (a `BotApiClient`) instead of Telegraf's client.
- Bot API types are generated from the official Bot API specification (`bun run generate:types`) and exported as the `BotApi` namespace.

### Removed

- `telegraf` runtime dependency (the only remaining runtime dependency is `async-sema`).

## [0.7.x] - 2026-01-28 to 2026-09-01

Latest: 0.7.36.

### Added

- `messageFilter` option to ignore unwanted incoming messages (0.7.33).
- Post-send operations on sent messages: `pin()`, `deleteAfter(ms)` and `captureReplies()` (0.7.31).
- Pinning of messages and `MessageSendingOptions.pin` (0.7.22).
- Error emission when inline query processing is aborted (0.7.30).
- `usertag` on `UserInfo` (0.7.28).
- Custom event support in `TypedEventEmitter` (0.7.9).
- Process-wide shared cache for `ScheduledAction` (0.7.36).

### Changed

- **Breaking:** `tokenProvider` replaces a plain token in `startBot` (0.7.11).
- **Breaking:** `eventEmitter` and `traceId` on contexts moved into an `observability` object (0.7.14).
- Storage API refactored to reduce cache misses and separate concerns; JSON storage uses synchronous reads (0.7.0).
- Actions are processed in parallel instead of sequentially, and contexts are no longer reused (0.7.4).
- Contexts are proxied and revoked once flushed, preventing calls after execution (0.7.3).
- Inline query processing is event-driven (0.7.20).
- State loaded from storage is merged with the default state, so newly added state fields get their defaults (0.7.29).
- Scheduled processing is aligned to the hour using one-time tasks (0.7.35).
- Custom cooldowns are tracked per chat (0.7.35).
- Removed `moment` dependency in favor of native `Date` (0.7.28).
- Added an extensive test suite (0.7.0 onward).

### Fixed

- Directory creation and state handling bugs in `JsonFileStorage` (0.7.16, 0.7.17).
- Multiple reply captures were not aborted by a single abort controller (0.7.8).
- One-time tasks are removed from the scheduler after execution (0.7.32).
- Recoverable reply errors (invalid quote, missing reply target) are handled and retried without the reply (0.7.35).
- Chat history snapshot no longer shares a mutable array (0.7.36).
- Polling is stopped before storage is locked on shutdown (0.7.36).

## [0.6.x] - 2026-01-20 to 2026-01-24

### Added

- `updateStateOf` on contexts to mutate the state of another action (0.6.10).

### Changed

- **Breaking:** Logging replaced by a typed event emitter (`bot.eventEmitter`) emitting lifecycle and execution events (#3, 0.6.7).
- Scheduled actions run immediately after the bot starts (0.6.9).

## [0.5.x] - 2025-08-15 to 2025-11-05

### Added

- Inline keyboard support for text messages (0.5.1).
- Timestamp on chat history messages (0.5.3).

### Changed

- Migrated back to Telegraf from `node-telegram-bot-api` for performance reasons (0.5.0).

## [0.4.0] - 2025-08-06

### Changed

- Migrated from Telegraf to `node-telegram-bot-api` (#2).

## [0.3.x] - 2025-06-19 to 2025-08-04

### Added

- Reply capturing (`captureReplies`), including captures on replies to captures (0.3.0, 0.3.23).
- Aborting inline query processing when a newer query arrives (0.3.0).
- Property providers for runtime-configurable action settings, and configuration factories (#1, 0.3.26, 0.3.29).
- "Ratelimiting" (max simultaneous executions) for commands (0.3.12).
- Custom cooldown and cooldown message (0.3.13).
- Chat history of the last 100 messages (0.3.15).
- Bot name and action key available on contexts (0.3.24, 0.3.27).
- Video messages, the `Any` message type and caption checking (0.3.5, 0.3.3, 0.3.7).
- State passed to command conditions (0.3.1).
- Scoped logger (0.3.2).

### Changed

- Improved quoting API and builder API (0.3.6, 0.3.19).
- Improved default storage implementation (0.3.9).
- Simplified chat history DTO (0.3.30).

### Fixed

- Async handling in action processors (0.3.10).
- Repetitive cooldown message (0.3.14).
- Whitelist condition (0.3.20).

## [0.2.1] - 2025-06-18

### Changed

- Reworked reply API and added quoting.

## [0.1.x] - 2025-05-16 to 2025-06-15

### Added

- Inline query actions (0.1.8).
- Built-in `/help` command and per-bot help command handler (0.1.15, 0.1.16).
- Forward message type and raw update object on messages (0.1.19).
- Message type checks before processing.
- First `README.md` (0.1.0).

### Changed

- Delay response is non-blocking (0.1.2).

### Fixed

- Case sensitivity in command triggers (0.1.17).

## [0.0.x] - 2025-03-14 to 2025-05-15

Initial development releases (0.0.16 through 0.0.54).

### Added

- Command and scheduled actions with per-chat JSON-persisted state.
- Configurable scheduled timing and state updates for scheduled actions.
- Action-specific locks instead of a global one.
- Non-text message triggers (`MessageType`).
- Caching for scheduled actions.
- Delay option for responses and reworked message sending.
- Tracing and verbose logging.

[0.8.0]: https://github.com/AlexSolari/botFramework/compare/c876f15...c668bb9
