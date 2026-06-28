# ReplyPilot

[![npm version](https://img.shields.io/npm/v/gimirick-replypilot?logo=npm&logoColor=white)](https://www.npmjs.com/package/gimirick-replypilot)
[![repo version](https://img.shields.io/badge/repo%20version-0.1.7-blue?logo=git&logoColor=white)](package.json)
[![npm downloads](https://img.shields.io/npm/dm/gimirick-replypilot?logo=npm&logoColor=white)](https://www.npmjs.com/package/gimirick-replypilot)
[![npm downloads/week](https://img.shields.io/npm/dw/gimirick-replypilot)](https://www.npmjs.com/package/gimirick-replypilot)
[![dependencies](https://img.shields.io/badge/dependencies-9%20direct-brightgreen)](package.json)
[![license](https://img.shields.io/badge/license-CC%20BY--NC--ND%204.0-lightgrey?logo=creativecommons&logoColor=white)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22.13.0-brightgreen?logo=node.js&logoColor=white)](package.json)
[![CI](https://github.com/GimiRick/ReplyPilot/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/GimiRick/ReplyPilot/actions/workflows/ci.yml)
[![tests](https://img.shields.io/badge/tests-192%20vitest-brightgreen?logo=vitest&logoColor=white)](tests/)
[![coverage](https://img.shields.io/badge/coverage-96.3%25%20v8-brightgreen)](package.json)

ReplyPilot is a TypeScript CLI for automating WhatsApp replies with LM Studio, Ollama, or any OpenAI-compatible chat completions endpoint.

It listens for new direct WhatsApp messages, fetches recent chat history, asks your configured model to reply in your tone, and sends the response back through WhatsApp Web.

---

## npm

Install globally (CLI use):

```bash
npm i -g gimirick-replypilot
```

Uninstall:

```bash
npm uninstall -g gimirick-replypilot
```

Install locally (programmatic use):

```bash
npm i gimirick-replypilot
```

Uninstall:

```bash
npm uninstall gimirick-replypilot
```

[npm package](https://www.npmjs.com/package/gimirick-replypilot)

### Troubleshooting

```bash
npm cache clean --force
```

Clears the npm cache if you encounter integrity or checksum errors during install.

---

## Dependencies

ReplyPilot requires these runtime packages (auto-installed by `npm install`):

| Package | Purpose |
| --- | --- |
| `whatsapp-web.js` | WhatsApp Web client library |
| `openai` | OpenAI-compatible LLM provider client |
| `commander` | CLI command parsing |
| `@inquirer/prompts` | Interactive setup wizard |
| `conf` | Persistent config storage |
| `zod` | Config schema validation |
| `p-queue` | Message queue with concurrency control |
| `pino` | Structured logging |
| `qrcode-terminal` | QR code display in terminal |

Plus development tooling (TypeScript, Vitest, ESLint, Prettier, tsup, tsx) installed automatically as devDependencies.

External requirements:

- A **local or remote OpenAI-compatible chat completions API** (LM Studio, Ollama, OpenAI, etc.).
- **ffmpeg** on `PATH` (required only when voice note processing is enabled).

---

## Installation & Usage

### 1. NPM Global Install

> [!WARNING]
> **Linux Users (Ubuntu/Debian, etc.)**: Do not use `sudo npm i -g gimirick-replypilot`. Installing with `sudo` downloads the internal browser to the `root` directory, causing the app to crash for normal users. Use a Node version manager (like NVM) to install without `sudo`, or use the **NPM Local Install (npx)** method below instead.

Install from [npm](https://www.npmjs.com/package/gimirick-replypilot):

```bash
npm i -g gimirick-replypilot
```

`replypilot` becomes a system-wide command.

```bash
# Setup wizard (creates a named config, default name: "default")
replypilot setup

# Start automation (connects WhatsApp + begins listening)
replypilot start

# Display installed version
replypilot version

# Health check (Node version, config validity, provider reachability)
replypilot doctor

# View current config (API key redacted)
replypilot config show

# Reset config (prompts confirmation)
replypilot config reset

# Switch to a different named config
replypilot switch

# Remove WhatsApp session data (prompts confirmation)
replypilot logout

# Clear WhatsApp web client cache (prompts confirmation)
replypilot cache
```

Programmatic API (any `.js` / `.mjs` file):

```ts
import { startAutomation, loadConfig, type AppConfig } from 'gimirick-replypilot';

await startAutomation();
await startAutomation({ safety: { dryRun: true } });
const config: AppConfig = loadConfig();
```

---

### 2. NPM Local Install

> [!TIP]
> **Recommended for Linux**: Using `npx` safely bypasses global permission issues on Linux and guarantees the internal browser downloads to the correct user directory.

Install from [npm](https://www.npmjs.com/package/gimirick-replypilot):

```bash
npm i gimirick-replypilot
```

All features via `npx`:

```bash
npx replypilot setup
npx replypilot start
npx replypilot version
npx replypilot doctor
npx replypilot config show
npx replypilot config reset
npx replypilot switch
npx replypilot logout
npx replypilot cache
```

Programmatic API in your project:

```ts
import { startAutomation, loadConfig, runDoctor } from 'gimirick-replypilot';
import { ReplyAutomation, OpenAiCompatibleProvider } from 'gimirick-replypilot';
import { runSetupWizard, createConfigStore } from 'gimirick-replypilot';
import { MissingConfigError, ReplyPilotError } from 'gimirick-replypilot';

await startAutomation();
```

---

### 3. Git Clone (Source / Development)

```bash
git clone https://github.com/GimiRick/ReplyPilot.git
cd ReplyPilot
npm install
```

#### Built binary (production-like)

```bash
npm run build
node dist/cli.js setup
node dist/cli.js start
node dist/cli.js version
node dist/cli.js doctor
node dist/cli.js config show
node dist/cli.js config reset
node dist/cli.js switch
node dist/cli.js logout
node dist/cli.js cache
```

Or via npm scripts:

```bash
npm start          # node dist/cli.js start
```

#### Development mode (tsx — no build needed)

```bash
npm run dev                    # tsx src/cli.ts start
tsx src/cli.ts setup
tsx src/cli.ts version
tsx src/cli.ts doctor
tsx src/cli.ts config show
tsx src/cli.ts config reset
tsx src/cli.ts switch
tsx src/cli.ts logout
tsx src/cli.ts cache
```

#### Tests & quality

```bash
npm test                  # vitest run
npm run test:watch        # vitest (watch)
npm run test:coverage     # vitest run --coverage
npm run typecheck         # tsc --noEmit
npm run lint              # eslint .
npm run format            # prettier --write .
npm run build             # tsup (ESM + .d.ts)
npm run pack:dry-run      # inspect npm tarball
```

---

## Provider Setup

The setup wizard also configures optional voice note handling — transcription via Whisper Cloud API, a local whisper.cpp server, or native audio passthrough to a multimodal LLM. See [Voice Note Processing](#voice-note-processing-detail) for details.

During setup you may optionally set a **rate limit** for LLM API calls (default: 36 calls/minute when enabled). This caps how often the LLM is invoked globally, preventing provider overload. Disabled by default.

You can also configure a **wait time before sending messages** (default: 10 seconds when enabled). Same-chat messages arriving within this window are batched into a single LLM call. Set to 0 for immediate processing. Disabled by default.

### LM Studio

1. Open LM Studio, load a chat model, start the local OpenAI-compatible server.
2. Run `replypilot setup`, select **LM Studio**.
3. Defaults: Base URL `http://localhost:1234/v1`, API key `lm-studio`.

### Ollama

1. Install and start Ollama. Pull a model:

   ```bash
   ollama pull llama3.1
   ```

2. Run `replypilot setup`, select **Ollama**.
3. Defaults: Base URL `http://localhost:11434/v1`, API key `ollama`.

### Custom OpenAI-Compatible Provider

Works with ChatGPT, Gemini, or any OpenAI-compatible API. To switch providers, either re-run setup and enter a new config name, or use the switch command if you already have multiple configs saved:

```bash
replypilot setup           # create a new config, enter a name like "chatgpt"
replypilot switch           # or switch between existing configs
```

During setup enter the base URL, API key, and model name for your provider.

| Provider | Base URL                                                   | Example model             |
| -------- | ---------------------------------------------------------- | ------------------------- |
| ChatGPT  | `https://api.openai.com/v1`                                | `gpt-5.5`                 |
| Gemini   | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-3.5-flash`        |
| Groq     | `https://api.groq.com/openai/v1`                           | `llama-4-scout-17b-16e-instruct` |

---

## Multi-Config Profiles

You can create and manage multiple named configurations. Each config stores its own LLM provider settings, model, voice note preferences, and WhatsApp session — so switching profiles also switches which WhatsApp account is connected.

### Creating configs

Run `replypilot setup` as many times as you want. Each time, you'll be asked for a config name:

```
? Configuration name (default)
```

Enter a name like `work`, `personal`, `chatgpt`, or press Enter for the default. Each named config gets its own WhatsApp login session, so you don't need to re-authenticate when switching.

### Switching configs

```bash
replypilot switch
```

Shows a list of your saved configs. Select one to make it active. The next `replypilot start` uses the active config.

### Viewing current config

```bash
replypilot config show
```

Prints the active config's name at the top along with the full config (API keys redacted).

### Resetting

```bash
replypilot config reset
```

Deletes the **active** config (after confirmation). If other configs exist, the next one becomes active automatically.

---

## WhatsApp Login

```bash
replypilot start
```

Scan the terminal QR code from WhatsApp on your phone (Linked Devices). Keep the terminal process running while active.

```bash
replypilot logout     # Reset WhatsApp session
replypilot cache      # Clear .wwebjs_cache
```

---

## Safety Defaults

- Direct contact messages are processed.
- Messages sent by you are ignored.
- Group auto-replies are disabled by default.
- Status and broadcast auto-replies are disabled by default.
- Voice notes are ignored by default (`ignore` mode).
- Dry-run can be enabled during setup to log replies without sending them.

---

## Feature Availability

| Feature                    | Global              | Local (npx)         | Git Clone (built)      | Git Clone (tsx)       |
| -------------------------- | ------------------- | ------------------- | ---------------------- | --------------------- |
| `setup`                    | ✓                   | ✓                   | ✓                      | ✓                     |
| `start`                    | ✓                   | ✓                   | ✓ `npm start`          | ✓ `npm run dev`       |
| `version`                  | ✓                   | ✓                   | ✓                      | ✓                     |
| `doctor`                   | ✓                   | ✓                   | ✓                      | ✓                     |
| `config show / reset`      | ✓                   | ✓                   | ✓                      | ✓                     |
| `switch`                   | ✓                   | ✓                   | ✓                      | ✓                     |
| `logout`                   | ✓                   | ✓                   | ✓                      | ✓                     |
| `cache`                    | ✓                   | ✓                   | ✓                      | ✓                     |
| Programmatic API           | ✓ `import from pkg` | ✓ `import from pkg` | ✓ `import from ./dist` | ✓ `import from ./src` |
| TypeScript types           | ✓ auto              | ✓ auto              | ✓ from `dist/`         | ✓ from `src/`         |
| Multi-config profiles      | ✓                   | ✓                   | ✓                      | ✓                     |
| Run tests                  | —                   | —                   | —                      | ✓ `npm test`          |
| Hot-reload                 | —                   | —                   | —                      | ✓ `tsx --watch`       |

---

## Programmatic API (Full Reference)

```ts
// Core automation
import { startAutomation, ReplyAutomation, processIncomingMessageBatch } from 'gimirick-replypilot';
import { type AutomationResult, type ReplyAutomationOptions } from 'gimirick-replypilot';
import { type RuntimeIncomingMessage } from 'gimirick-replypilot';

// LLM provider
import {
  OpenAiCompatibleProvider,
  type OpenAiCompatibleProviderOptions,
} from 'gimirick-replypilot';
import {
  type LlmProvider,
  type GenerateReplyInput,
  type GenerateReplyResult,
} from 'gimirick-replypilot';
import { type ChatContextMessage, type PromptMessage } from 'gimirick-replypilot';
import {
  buildReplyPrompt,
  cleanGeneratedReply,
  formatChatContext,
  trimContextMessages,
} from 'gimirick-replypilot';

// Config
import {
  loadConfig,
  saveConfig,
  deleteConfig,
  tryLoadConfig,
  hasConfig,
  listConfigNames,
  getActiveConfigName,
  setActiveConfigName,
  validateConfigName,
} from 'gimirick-replypilot';
import { createConfigStore, getConfigFilePath, getWhatsAppSessionDir } from 'gimirick-replypilot';
import { removeWhatsAppSessionData, type ReplyPilotConfigStore } from 'gimirick-replypilot';
import { runSetupWizard, promptForConfig, createConfigFromSetupAnswers } from 'gimirick-replypilot';
import { type PromptAdapter, type SetupAnswers } from 'gimirick-replypilot';
import { parseAppConfig, mergeAppConfig, redactConfig } from 'gimirick-replypilot';
import { type AppConfig, type PartialAppConfig, type LlmProviderName } from 'gimirick-replypilot';
import { CONFIG_VERSION, DEFAULT_APP_CONFIG, PROVIDER_DEFAULTS } from 'gimirick-replypilot';
import { appConfigSchema, providerSchema, logLevelSchema } from 'gimirick-replypilot';

// Doctor / health
import { runDoctor, formatDoctorReport, checkProviderReachability } from 'gimirick-replypilot';
import { isSupportedNodeVersion, type DoctorReport, type DoctorCheck } from 'gimirick-replypilot';

// WhatsApp
import { fetchChatContext, normalizeChatMessage, normalizeChatMessages } from 'gimirick-replypilot';
import { type WhatsAppRawChat, type WhatsAppRawMessage } from 'gimirick-replypilot';
import { DuplicateMessageGuard, getIgnoreReason, shouldProcessMessage } from 'gimirick-replypilot';
import { type FilterableWhatsAppMessage, type IgnoreReason } from 'gimirick-replypilot';

// Audio (voice note transcription)
import { oggToMp3 } from 'gimirick-replypilot';
import { transcribeCloud, transcribeLocal } from 'gimirick-replypilot';

// Queue, Logger & Metrics
import { MessageQueue, type MessageQueueOptions } from 'gimirick-replypilot';
import { createLogger, type Logger } from 'gimirick-replypilot';
import { MetricsCollector, type MetricsSnapshot } from 'gimirick-replypilot';
import { HealthServer, type HealthInfo, type HealthServerOptions } from 'gimirick-replypilot';

// Errors
import { ReplyPilotError, MissingConfigError, ConfigValidationError } from 'gimirick-replypilot';
import { ProviderResponseError, ProviderTimeoutError } from 'gimirick-replypilot';
import { ConfigNotFoundError } from 'gimirick-replypilot';
```

---

## System Architecture

### High-Level Layers

```text
┌───────────────────────────────────────────────────────────────────┐
│                        CLI (Commander)                            │
│ setup   start   doctor   config show   config reset   switch      │
│ logout   cache   version                                           │
└────────────────────────┬──────────────────────────────────────────┘
                         │
┌────────────────────────▼──────────────────────────────────────────┐
│                     Config Layer (conf + Zod)                     │
│          ┌─────────────┐  ┌──────────┐  ┌─────────────┐           │
│          │ schema.ts   │  │ store.ts │  │ setup.ts    │           │
│          │ (Zod parse) │  │ (Conf)   │  │ (wizard)    │           │
│          └─────────────┘  └──────────┘  └─────────────┘           │
└──────────────────────────┬────────────────────────────────────────┘
                           │
┌──────────────────────────▼────────────────────────────────────────┐
│                     Runtime Orchestration                         │
│    ┌────────────────┐  ┌──────────────┐  ┌────────────────┐       │
│    │ ReplyAutomation│  │ MessageQueue │  │ Logger (pino)  │       │
│    │ (message flow) │  │ (p-queue)    │  │                │       │
│    ├────────────────┤  ├──────────────┤  ├────────────────┤       │
│    │ Metrics        │  │ HealthServer │  │                │       │
│    │ Collector      │  │ (/health,    │  │                │       │
│    │ (counters)     │  │  /metrics)   │  │                │       │
│    └────────────────┘  └──────────────┘  └────────────────┘       │
└────────────┼──────────────────────────────────────────────────────┘
             │
       ┌─────┴─────────────────────────────────┐
       ▼                                       ▼
┌──────────────┐                   ┌───────────────────────────────────┐
│   WhatsApp   │                   │         LLM Provider Layer        │
│     Layer    │                   │  ┌────────────────────────────┐   │
│   ┌──────┐   │                   │  │ OpenAiCompatibleProvider   │   │
│   │client│   │                   │  │  ┌──────────┐  ┌───────┐   │   │
│   │.ts   │───┼───┐               │  │  │ prompt.ts│  │openai │   │   │
│   ├──────┤   │   │               │  │  │ (build,  │  │-compa │   │   │
│   │filter│   │   │               │  │  │  clean)  │  │tible. │   │   │
│   │s.ts  │   │   │               │  │  └──────────┘  │ts     │   │   │
│   ├──────┤   │   │               │  │                │(OPenAI│   │   │
│   │contex│   │   ▼               │  │                │ SDK + │   │   │
│   │t.ts  │   │ ┌──────────┐      │  │                │ retry)│   │   │
│   └──────┘   │ │  Audio   │      │  └────────────────┴───────┘   │   │
│              │ │  Layer   │      │  LlmProvider (interface)      │   │
│              │ │┌────────┐│      └───────────────────────────────┘───┘
│              │ ││convert ││
│              │ ││.ts     ││
│              │ │├────────┤│
│              │ ││transcri││
│              │ ││ber.ts  ││
│              │ │└────────┘│
│              │ └──────────┘
└──────────────┘
```

The WhatsApp layer transcribes voice notes (via the Audio layer) or passes raw audio
to the LLM before the message enters the main pipeline.

### Message Processing Pipeline

Each incoming WhatsApp message flows through these stages:

```text
WhatsApp Web ──> Client.on('message')
                       │
                       ▼
                ╔═══════════════════╗
                ║  toRuntimeMessage ║   raw Message + Chat → RuntimeIncomingMessage
                ╚═══════╤═══════════╝
                        │
                  ┌─────┴─────┐
                  │           │
                  ▼           ▼
          ╔══════════════╗  ╔═══════════════════╗
          ║ image/sticker║  ║   voice note?     ║
          ║ → download   ║  ║ (message.type===' ║
          ║ → imageData  ║  ║       ptt')       ║
          ╚══════════════╝  ╚═══╤═══╤═══╤═══╤═══╝
                                │   │   │   │   │
                  mode: ignore  │   │   │   │   │
                  ──────────────┘   │   │   │   │
                  mode: whisper_cloud   │   │   │
                  → oggToMp3()      │   │   │   │
                  → transcribeCloud()───┘   │   │
                  mode: whisper_local       │   │
                  → oggToMp3()      │       │   │
                  → transcribeLocal()───────┘   │
                  mode: native_audio│           │
                  → oggToMp3()      │           │
                  → audioData       ────────────┘
                        │
                        ▼
           body = voiceBody ?? (message text or media label)
           audioData passed through if native_audio
                        │
                        ▼
                 ╔═══════════════════╗
                 ║     Filtering     ║
                 ╚═══════╤═══════════╝
                         │
                 ┌───────┴───────┐
                 │               │
                 ▼               ▼
         getIgnoreReason()    duplicateGuard
         {self, empty,        {seen IDs}
          group, broadcast,
          voice_note_ignored}
                │               │
                └───────┬───────┘
                   [ignored] │ [pass]
                             ▼
                     ┌──────────────┐
                     │  MessageQueue     per-chat sequential, global-parallel
                     └──────┬─────────┘
                            ▼
                     ┌──────────────┐
                     │ fetchContext     chat history via whatsapp-web.js
                     └──────┬─────────┘
                            ▼
                     ┌──────────────┐
                     │ buildReplyPrompt   owner style + context + incoming
                     │ (may include       + optional image/audio content parts
                     │  input_audio part  → UserContentPart[])
                     └──────┬─────────┘
                            ▼
                     ┌──────────────┐
                     │ llmProvider.generateReply()
                     │  - withTimeout / retryTransient
                     │  - ProviderTimeoutError if no response
                     │  - cleanGeneratedReply
                     └──────┬─────────┘
                            ▼
                     ┌──────────────┐
                     │  dryRun? ──yes──> log only (status: 'dry-run')
                     │  no
                     ▼
               chat.sendMessage(reply)  ──> WhatsApp Web
```

### Voice Note Processing Detail

Three modes are available, configured during `replypilot setup`:

| Mode | Audio Flow | LLM Receives |
| --- | --- | --- |
| `whisper_cloud` | OGG→MP3 → `POST /v1/audio/transcriptions` → transcription text | Transcribed text as message body |
| `whisper_local` | OGG→MP3 → `POST /inference` (whisper.cpp) → transcription text | Transcribed text as message body |
| `native_audio` | OGG→MP3 → attached as `{type:"input_audio", input_audio:{data,format:"mp3"}}` | Raw audio content part (multimodal model required) |
| `ignore` | Skipped entirely | Message labeled `[voice note]` |

Whisper models available for cloud mode: `whisper-1` (default), `gpt-4o-mini-transcribe`, `gpt-4o-transcribe`, or a custom model name.

OGG-to-MP3 conversion is handled by `src/audio/convert.ts` via `ffmpeg` with a 120-second timeout. Conversion failures are caught and logged; the voice note is replaced with `[voice note]` text.

### Concurrency & Batching

- **Global limit**: max 2 concurrent LLM requests (`globalConcurrency: 2`).
- **Rate limit**: optionally configurable during `replypilot setup` — caps LLM calls per minute. When set, a rolling window (60s) prevents exceeding the configured ceiling.
- **Per-chat serial**: messages in the same chat process one at a time (`perChatConcurrency: 1`).
- **Message batching**: same-chat messages arriving within `automation.debounceMs` (default 10s, configurable via `replypilot setup`) are coalesced into a single LLM call. Bodies are joined with newlines; messages are sorted by timestamp before combining. Set to 0 for immediate processing (no batching).
- **Chat queues** are created lazily (one `PQueue` per `chatId`).
- **Duplicate guard** tracks up to 5,000 seen message IDs, pruning oldest entries when full.

### Startup Sequence

```text
replypilot start
       │
       ├── loadConfig()              read active named config, Zod-validate
       ├── (uses config name as WhatsApp session ID)
       ├── new OpenAiCompatibleProvider()   init OpenAI SDK client
       ├── new ReplyAutomation()        wire config, provider, queue, logger
       ├── new WhatsAppClientAdapter()  init whatsapp-web.js (LocalAuth)
       │       ├── register QR handler
       │       ├── register ready handler
       │       └── register disconnect handler
       ├── whatsapp.onMessage(handler)  register pipeline entry point
       ├── if healthServerPort given:
       │       └── new HealthServer({port, host: '127.0.0.1', metrics})
       │           └── serve GET /health + /metrics
       ├── whatsapp.start()
       │       ├── client.on('message')  attach raw message listener
       │       └── client.initialize()   Puppeteer + QR scan
       └── [waiting for messages]
```

### Component Responsibilities

| Layer | File | Role |
| --- | --- | --- |
| **CLI** | `cli.ts` | Commander program, 10 commands, dependency injection for testability |
| **Config** | `schema.ts` | Zod schema, `AppConfig` type, defaults, `parseAppConfig` validation |
| **Config** | `store.ts` | Persistent JSON store via `conf`, multi-config profiles, session dir management |
| **Config** | `setup.ts` | Interactive `@inquirer/prompts` wizard (named configs, 3 providers + voice note flow) |
| **Runtime** | `automation.ts` | `ReplyAutomation` orchestrator (message batching), `processIncomingMessageBatch`, `startAutomation` |
| **Runtime** | `queue.ts` | `MessageQueue` wrapping `p-queue` with chat-scoped sub-queues and optional global rate limiting (`maxCallsPerMinute`) |
| **Runtime** | `logger.ts` | Pino logger with API key redaction |
| **Runtime** | `errors.ts` | Typed error hierarchy (`MissingConfigError`, `ProviderTimeoutError`, etc.) |
| **Runtime** | `metrics.ts` | `MetricsCollector` — in-memory counters for messages, LLM calls, latency, and processing time |
| **Runtime** | `health-server.ts` | `HealthServer` — optional HTTP endpoint (`:port/health`, `:port/metrics`) using Node.js built-in `http` |
| **LLM** | `provider.ts` | `LlmProvider` interface, `ChatContextMessage` / `GenerateReplyInput` types |
| **LLM** | `openai-compatible.ts` | OpenAI SDK adapter, transient-error retry with timeout race |
| **LLM** | `prompt.ts` | Prompt construction (`buildReplyPrompt`), output cleanup (`cleanGeneratedReply`), `UserContentPart` (text/image/audio) |
| **WhatsApp** | `client.ts` | `WhatsAppClientAdapter`, lifecycle events, raw message → `RuntimeIncomingMessage` (includes voice note processing) |
| **WhatsApp** | `context.ts` | Chat history fetch (`fetchChatContext`), message normalization, media type labels |
| **WhatsApp** | `filters.ts` | `getIgnoreReason`, `DuplicateMessageGuard` with FIFO pruning |
| **Audio** | `convert.ts` | OGG-to-MP3 conversion via `ffmpeg` subprocess with timeout |
| **Audio** | `transcriber.ts` | Cloud (`transcribeCloud`) and local (`transcribeLocal`) Whisper transcription |
| **Doctor** | `doctor.ts` | `runDoctor` health checks (Node, config, provider reachability, ffmpeg availability) |

---

## About

Part of the GimiRick toolchain. Founded by Mohammad Faiz.

## License

CC BY-NC-ND 4.0 — Attribution-NonCommercial-NoDerivatives 4.0 International.
See the [LICENSE](LICENSE) file for the full legal text.

## Disclaimer

ReplyPilot uses `whatsapp-web.js`, an unofficial WhatsApp Web automation library. You are responsible for following WhatsApp rules and local laws. Avoid spam, bulk messaging, and impersonation without consent. This tool is intended for personal automation and controlled use.
