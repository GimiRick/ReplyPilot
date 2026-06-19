# ReplyPilot

<p align="center">
  <!-- PACKAGE INFO -->
  <a href="https://www.npmjs.com/package/gimirick-replypilot"><img src="https://img.shields.io/npm/v/gimirick-replypilot?logo=npm&logoColor=white" alt="npm version"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/repo%20version-0.1.0-blue?logo=git&logoColor=white" alt="repo version"></a>
  <a href="https://www.npmjs.com/package/gimirick-replypilot"><img src="https://img.shields.io/npm/dm/gimirick-replypilot?logo=npm&logoColor=white" alt="npm downloads"></a>
  <a href="https://www.npmjs.com/package/gimirick-replypilot"><img src="https://img.shields.io/npm/dw/gimirick-replypilot" alt="npm downloads/week"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-CC%20BY--NC--ND%204.0-lightgrey?logo=creativecommons&logoColor=white" alt="license"></a>
  <a href="https://semver.org"><img src="https://img.shields.io/badge/semver-2.0.0-blue" alt="semver"></a>
  <br>
  <!-- CI / QUALITY -->
  <a href="https://github.com/GimiRick/ReplyPilot/actions/workflows/ci.yml"><img src="https://github.com/GimiRick/ReplyPilot/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://github.com/GimiRick/ReplyPilot/actions/workflows/codeql.yml"><img src="https://github.com/GimiRick/ReplyPilot/actions/workflows/codeql.yml/badge.svg?branch=main" alt="CodeQL"></a>
  <a href="tests/"><img src="https://img.shields.io/badge/tests-76%20vitest-brightgreen?logo=vitest&logoColor=white" alt="tests"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/coverage-93.88%25%20v8-brightgreen" alt="coverage"></a>
  <a href="SECURITY.md"><img src="https://img.shields.io/badge/security-policy-brightgreen?logo=github&logoColor=white" alt="security"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/dependencies-9%20direct-brightgreen" alt="dependencies"></a>
  <br>
  <!-- REPO METRICS -->
<a href="https://github.com/GimiRick/ReplyPilot/stargazers"><img src="https://img.shields.io/github/stars/GimiRick/ReplyPilot?logo=github&logoColor=white" alt="stars"></a>
  <a href="https://github.com/GimiRick/ReplyPilot/forks"><img src="https://img.shields.io/github/forks/GimiRick/ReplyPilot?logo=github&logoColor=white" alt="forks"></a>
  <a href="https://github.com/GimiRick/ReplyPilot/graphs/contributors"><img src="https://img.shields.io/github/contributors/GimiRick/ReplyPilot?logo=github&logoColor=white" alt="contributors"></a>
  <a href="https://github.com/GimiRick/ReplyPilot/issues"><img src="https://img.shields.io/github/issues/GimiRick/ReplyPilot?logo=github&logoColor=white" alt="issues"></a>
  <a href="https://github.com/GimiRick/ReplyPilot/pulls"><img src="https://img.shields.io/github/issues-pr/GimiRick/ReplyPilot?logo=github&logoColor=white" alt="pull requests"></a>
  <a href="https://github.com/GimiRick/ReplyPilot/commits/main"><img src="https://img.shields.io/github/last-commit/GimiRick/ReplyPilot?logo=github&logoColor=white" alt="last commit"></a>
  <br>
  <!-- PROJECT METADATA -->
  <a href="package.json"><img src="https://img.shields.io/badge/node-%3E%3D22.13.0-brightgreen?logo=node.js&logoColor=white" alt="node"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/platform-windows%20%7C%20macos%20%7C%20linux-lightgrey" alt="platform"></a>
  <a href="dist/"><img src="https://img.shields.io/badge/bundle%20size-~60%20kB-brightgreen" alt="bundle size"></a>
  <a href="src/"><img src="https://img.shields.io/badge/total%20lines-~1.3k-blue" alt="total lines"></a>
  <a href="https://github.com/GimiRick/ReplyPilot/commits/main"><img src="https://img.shields.io/github/commit-activity/m/GimiRick/ReplyPilot?logo=github&logoColor=white" alt="commit activity"></a>
  <a href="https://github.com/GimiRick/ReplyPilot"><img src="https://img.shields.io/github/repo-size/GimiRick/ReplyPilot?logo=github&logoColor=white" alt="repo size"></a>
  <a href="https://github.com/GimiRick/ReplyPilot/graphs/contributors"><img src="https://img.shields.io/badge/maintained-yes-brightgreen" alt="maintained"></a>
</p>

ReplyPilot is a TypeScript CLI for automating WhatsApp replies with LM Studio, Ollama, or any OpenAI-compatible chat completions endpoint.

It listens for new direct WhatsApp messages, fetches recent chat history, asks your configured model to reply in your tone, and sends the response back through WhatsApp Web.

---

## Installation & Usage

### 1. NPM Global Install

```bash
npm i -g gimirick-replypilot
```

`replypilot` becomes a system-wide command.

```bash
# Setup wizard (required before first start)
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

# Remove WhatsApp session data (prompts confirmation)
replypilot logout
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
npx replypilot logout
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
node dist/cli.js logout
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
tsx src/cli.ts logout
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

Works with ChatGPT, Gemini, or any OpenAI-compatible API. To switch providers:

```bash
replypilot config reset    # clear current config
replypilot setup           # re-run setup, select Custom
```

During setup enter the base URL, API key, and model name for your provider.

| Provider | Base URL | Example model |
| -------- | -------- | --------------- |
| ChatGPT | `https://api.openai.com/v1` | `gpt-4o` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-2.0-flash` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |

---

## WhatsApp Login

```bash
replypilot start
```

Scan the terminal QR code from WhatsApp on your phone (Linked Devices). Keep the terminal process running while active.

```bash
replypilot logout     # Reset WhatsApp session
```

---

## Safety Defaults

- Direct contact messages are processed.
- Messages sent by you are ignored.
- Group auto-replies are disabled by default.
- Status and broadcast auto-replies are disabled by default.
- Dry-run can be enabled during setup to log replies without sending them.

---

## Feature Availability

| Feature | Global | Local (npx) | Git Clone (built) | Git Clone (tsx) |
| ------- | ------ | ----------- | ----------------- | ----------------- |
| `setup` | ✓ | ✓ | ✓ | ✓ |
| `start` | ✓ | ✓ | ✓ `npm start` | ✓ `npm run dev` |
| `version` | ✓ | ✓ | ✓ | ✓ |
| `doctor` | ✓ | ✓ | ✓ | ✓ |
| `config show / reset` | ✓ | ✓ | ✓ | ✓ |
| `logout` | ✓ | ✓ | ✓ | ✓ |
| Programmatic API | ✓ `import from pkg` | ✓ `import from pkg` | ✓ `import from ./dist` | ✓ `import from ./src` |
| TypeScript types | ✓ auto | ✓ auto | ✓ from `dist/` | ✓ from `src/` |
| Run tests | — | — | — | ✓ `npm test` |
| Hot-reload | — | — | — | ✓ `tsx --watch` |

---

## Programmatic API (Full Reference)

```ts
// Core automation
import { startAutomation, ReplyAutomation, processIncomingMessage } from 'gimirick-replypilot';
import { type AutomationResult, type ReplyAutomationOptions } from 'gimirick-replypilot';
import { type RuntimeIncomingMessage } from 'gimirick-replypilot';

// LLM provider
import { OpenAiCompatibleProvider, type OpenAiCompatibleProviderOptions } from 'gimirick-replypilot';
import { type LlmProvider, type GenerateReplyInput, type GenerateReplyResult } from 'gimirick-replypilot';
import { type ChatContextMessage, type PromptMessage } from 'gimirick-replypilot';
import { buildReplyPrompt, cleanGeneratedReply, formatChatContext, trimContextMessages } from 'gimirick-replypilot';

// Config
import { loadConfig, saveConfig, deleteConfig, tryLoadConfig, hasConfig } from 'gimirick-replypilot';
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

// Queue & Logger
import { MessageQueue, type MessageQueueOptions } from 'gimirick-replypilot';
import { createLogger, type Logger } from 'gimirick-replypilot';

// Errors
import { ReplyPilotError, MissingConfigError, ConfigValidationError } from 'gimirick-replypilot';
import { ProviderResponseError, ProviderTimeoutError } from 'gimirick-replypilot';
```

---

## System Architecture

### High-Level Layers

```text
┌───────────────────────────────────────────────────────────────┐
│                        CLI (Commander)                        │
│ setup   start   doctor   config show   config reset   logout  │
└───────────────────────┬───────────────────────────────────────┘
                        │
┌───────────────────────▼────────────────────────────────────────┐
│                     Config Layer (conf + Zod)                  │
│          ┌─────────────┐  ┌──────────┐  ┌─────────────┐        │
│          │ schema.ts   │  │ store.ts │  │ setup.ts    │        │
│          │ (Zod parse) │  │ (Conf)   │  │ (wizard)    │        │
│          └─────────────┘  └──────────┘  └─────────────┘        │
└─────────────────────────┬──────────────────────────────────────┘
                          │
┌─────────────────────────▼──────────────────────────────────────┐
│                     Runtime Orchestration                      │
│    ┌────────────────┐  ┌──────────────┐  ┌────────────────┐    │
│    │ ReplyAutomation│  │ MessageQueue │  │ Logger (pino)  │    │
│    │ (message flow) │  │ (p-queue)    │  │                │    │
│    └───────┬────────┘  └──────────────┘  └────────────────┘    │
└────────────┼───────────────────────────────────────────────────┘
             │
       ┌─────┴─────┐
       ▼           ▼
┌──────────────┐ ┌──────────────────────────────────────────────┐
│   WhatsApp   │ │            LLM Provider Layer                │
│     Layer    │ │  ┌────────────────────────────────────────┐  │
│   ┌──────┐   │ │  │ OpenAiCompatibleProvider               │  │
│   │client│   │ │  │  ┌──────────┐  ┌───────────┐           │  │
│   │.ts   │   │ │  │  │ prompt.ts│  │openai-    │           │  │
│   ├──────┤   │ │  │  │ (build,  │  │compatible │           │  │
│   │filter│   │ │  │  │  clean)  │  │.ts        │           │  │
│   │s.ts  │   │ │  │  └──────────┘  │ (OpenAI   │           │  │
│   ├──────┤   │ │  │                │  SDK +    │           │  │
│   │contex│   │ │  │                │  retry/   │           │  │
│   │t.ts  │   │ │  │                │  timeout) │           │  │
│   └──────┘   │ │  └────────────────┴───────────┘           │  │
│              │ │  LlmProvider (interface)                  │  │
└──────────────┘ └───────────────────────────────────────────┘──┘
```

### Message Processing Pipeline

Each incoming WhatsApp message flows through these stages:

```text
WhatsApp Web ──> Client.on('message')
                       │
                       ▼
                ┌───────────────┐
                │  getIgnoreReason()     filters: self, empty, group, broadcast
                └───────┬───────┘
                   [ignored] │ [pass]
                             ▼
                     ┌──────────────┐
                     │ duplicateGuard    checks seen message IDs
                     └──────┬─────────┘
                   [ignored] │ [new]
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
                     └──────┬─────────┘
                            ▼
                     ┌──────────────┐
                     │ llmProvider.generateReply()
                     │  - withTimeout / retryTransient
                     │  - cleanGeneratedReply
                     └──────┬─────────┘
                            ▼
                     ┌──────────────┐
                     │  dryRun? ──yes──> log only (status: 'dry-run')
                     │  no
                     ▼
               chat.sendMessage(reply)  ──> WhatsApp Web
```

### Concurrency Model

- **Global limit**: max 2 concurrent LLM requests (`globalConcurrency: 2`).
- **Per-chat serial**: messages in the same chat process one at a time (`perChatConcurrency: 1`).
- **Chat queues** are created lazily (one `PQueue` per `chatId`).
- **Duplicate guard** tracks up to 5,000 seen message IDs, pruning oldest entries when full.

### Startup Sequence

```text
replypilot start
       │
       ├── loadConfig()              read + Zod-validate saved config
       ├── new OpenAiCompatibleProvider()   init OpenAI SDK client
       ├── new ReplyAutomation()        wire config, provider, queue, logger
       ├── new WhatsAppClientAdapter()  init whatsapp-web.js (LocalAuth)
       │       ├── register QR handler
       │       ├── register ready handler
       │       └── register disconnect handler
       ├── whatsapp.onMessage(handler)  register pipeline entry point
       ├── whatsapp.start()
       │       ├── client.on('message')  attach raw message listener
       │       └── client.initialize()   Puppeteer + QR scan
       └── [waiting for messages]
```

### Component Responsibilities

| Layer | File | Role |
| ----- | ---- | ---- |
| **CLI** | `cli.ts` | Commander program, 6 commands, dependency injection for testability |
| **Config** | `schema.ts` | Zod schema, `AppConfig` type, defaults, `parseAppConfig` validation |
| **Config** | `store.ts` | Persistent JSON store via `conf`, session dir management |
| **Config** | `setup.ts` | Interactive `@inquirer/prompts` wizard, 3 provider presets |
| **Runtime** | `automation.ts` | `ReplyAutomation` orchestrator, `processIncomingMessage`, `startAutomation` entry point |
| **Runtime** | `queue.ts` | `MessageQueue` wrapping `p-queue` with chat-scoped sub-queues |
| **Runtime** | `logger.ts` | Pino logger with API key redaction |
| **LLM** | `provider.ts` | `LlmProvider` interface, `ChatContextMessage` / `GenerateReplyInput` types |
| **LLM** | `openai-compatible.ts` | OpenAI SDK adapter, transient-error retry with timeout race |
| **LLM** | `prompt.ts` | Prompt construction (`buildReplyPrompt`), output cleanup (`cleanGeneratedReply`) |
| **WhatsApp** | `client.ts` | `WhatsAppClientAdapter` wrapping `whatsapp-web.js`, lifecycle events, message-to-Runtime mapping |
| **WhatsApp** | `context.ts` | Chat history fetch (`fetchChatContext`), message normalization |
| **WhatsApp** | `filters.ts` | `getIgnoreReason`, `DuplicateMessageGuard` with LRU-style pruning |
| **Doctor** | `doctor.ts` | `runDoctor` health checks (Node, config, provider reachability) |

---

## About

Part of the GimiRick toolchain. Founded by Mohammad Faiz.

## License

CC BY-NC-ND 4.0 — Attribution-NonCommercial-NoDerivatives 4.0 International.
See the [LICENSE](LICENSE) file for the full legal text.

## Disclaimer

ReplyPilot uses `whatsapp-web.js`, an unofficial WhatsApp Web automation library. You are responsible for following WhatsApp rules and local laws. Avoid spam, bulk messaging, and impersonation without consent. This tool is intended for personal automation and controlled use.
