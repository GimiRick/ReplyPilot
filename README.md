# ReplyPilot

[![npm version](https://img.shields.io/npm/v/gimirick-replypilot?logo=npm&logoColor=white)](https://www.npmjs.com/package/gimirick-replypilot)
[![repo version](https://img.shields.io/badge/repo%20version-0.2.8-blue?logo=git&logoColor=white)](package.json)
[![npm downloads](https://img.shields.io/npm/dm/gimirick-replypilot?logo=npm&logoColor=white)](https://www.npmjs.com/package/gimirick-replypilot)
[![npm downloads/week](https://img.shields.io/npm/dw/gimirick-replypilot)](https://www.npmjs.com/package/gimirick-replypilot)
[![npm downloads/total](https://img.shields.io/npm/dt/gimirick-replypilot)](https://www.npmjs.com/package/gimirick-replypilot)
[![dependencies](https://img.shields.io/badge/dependencies-9%20direct-brightgreen)](package.json)
[![license](https://img.shields.io/badge/license-CC%20BY--NC--ND%204.0-lightgrey?logo=creativecommons&logoColor=white)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22.13.0-brightgreen?logo=node.js&logoColor=white)](package.json)
[![CI](https://github.com/GimiRick/ReplyPilot/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/GimiRick/ReplyPilot/actions/workflows/ci.yml)
[![tests](https://img.shields.io/badge/tests-309%20vitest-brightgreen?logo=vitest&logoColor=white)](tests/)
[![coverage](https://img.shields.io/badge/coverage-97%25%20v8-brightgreen)](package.json)

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

| Package             | Purpose                                |
| ------------------- | -------------------------------------- |
| `whatsapp-web.js`   | WhatsApp Web client library            |
| `openai`            | OpenAI-compatible LLM provider client  |
| `commander`         | CLI command parsing                    |
| `@inquirer/prompts` | Interactive setup wizard               |
| `conf`              | Persistent config storage              |
| `zod`               | Config schema validation               |
| `p-queue`           | Message queue with concurrency control |
| `pino`              | Structured logging                     |
| `qrcode-terminal`   | QR code display in terminal            |

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
# Setup wizard (creates a named config ——> AI settings only)
replypilot setup

# Authenticate a WhatsApp account (scans QR code)
replypilot login

# Switch between authenticated WhatsApp accounts
replypilot account switch

# Start automation (connects active WhatsApp + active config)
replypilot start

# Display installed version
replypilot version

# Health check (Node version, config, provider reachability, ffmpeg)
replypilot doctor

# View current config (API key redacted)
replypilot config show

# Reset config (prompts confirmation)
replypilot config reset

# Switch to a different named config
replypilot config switch

# Remove all WhatsApp session data (prompts confirmation)
replypilot logout

# Clear WhatsApp web client cache (prompts confirmation)
replypilot cache

# Clear everything: npm cache, all configs, all WhatsApp accounts, and web cache
replypilot clear
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
npx replypilot login
npx replypilot account switch
npx replypilot start
npx replypilot version
npx replypilot doctor
npx replypilot config show
npx replypilot config reset
npx replypilot config switch
npx replypilot logout
npx replypilot cache
npx replypilot clear
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
node dist/cli.js login
node dist/cli.js account switch
node dist/cli.js start
node dist/cli.js version
node dist/cli.js doctor
node dist/cli.js config show
node dist/cli.js config reset
node dist/cli.js config switch
node dist/cli.js logout
node dist/cli.js cache
node dist/cli.js clear
```

Or via npm scripts:

```bash
npm start          # node dist/cli.js start
```

#### Development mode (tsx ——> no build needed)

```bash
npm run dev                    # tsx src/cli.ts start
tsx src/cli.ts setup
tsx src/cli.ts login
tsx src/cli.ts account switch
tsx src/cli.ts version
tsx src/cli.ts doctor
tsx src/cli.ts config show
tsx src/cli.ts config reset
tsx src/cli.ts config switch
tsx src/cli.ts logout
tsx src/cli.ts cache
tsx src/cli.ts clear
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

The setup wizard also configures optional voice note handling, transcription via Whisper Cloud API, a local whisper.cpp server, or native audio passthrough to a multimodal LLM. See [Voice Note Processing](#voice-note-processing-detail) for details.

During setup you may optionally set a **rate limit** for LLM API calls (default: 36 calls/minute when enabled). This caps how often the LLM is invoked globally, preventing provider overload. Disabled by default.

You can also configure a **wait time before sending messages** (default: 10 seconds when enabled). Same-chat messages arriving within this window are batched into a single LLM call. Set to 0 for immediate processing. Disabled by default.

Optionally add **fallback API keys** during setup. If the primary key fails (rate limited, out of balance, server error, etc.), ReplyPilot automatically rotates to the next key and retries, keeping your replies flowing with no interruption.

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
3. Choose between **Ollama Cloud** and **Ollama Local**:
   - **Ollama Cloud** — defaults to `https://ollama.com/v1` with model `gemma4:31b-cloud`.
   - **Ollama Local** — defaults to `http://localhost:11434/v1` with API key `ollama`.

### Custom OpenAI-Compatible Provider

Works with ChatGPT, Gemini, or any OpenAI-compatible API. To switch providers, either re-run setup and enter a new config name, or use the switch command if you already have multiple configs saved:

```bash
replypilot setup           # create a new config, enter a name like "chatgpt"
replypilot config switch           # or switch between existing configs
```

During setup enter the base URL, API key, and model name for your provider.

| Provider | Base URL                                                   | Example model                    |
| -------- | ---------------------------------------------------------- | -------------------------------- |
| ChatGPT  | `https://api.openai.com/v1`                                | `gpt-5.5`                        |
| Gemini   | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-3.5-flash`               |
| Groq     | `https://api.groq.com/openai/v1`                           | `llama-4-scout-17b-16e-instruct` |

### Fallback API Keys

During setup, after entering your primary API key, ReplyPilot asks if you'd like to add **fallback API keys**. These are backup keys for the same provider useful for rate limits, expired credits, or any other failure.

```text
? Do you want to add a fallback API key? (y/N)
? Fallback API key (enter key)
? Do you want to add another fallback API key? (y/N)
```

If a request with the current key fails, ReplyPilot first retries the request with exponential backoff (1s, 2s, 4s — up to the configured max retries). Transient errors like HTTP 429 (rate limited), 503, 408, 504, and network errors (ECONNRESET, ETIMEDOUT) are retried automatically. If all retries fail, ReplyPilot rotates to the next fallback key and retries. If all keys fail, the error is reported. Fallback keys are optional, you can press enter (defaults to `n`) to skip.

---

## Multi-Config Profiles

You can create and manage multiple named configurations. Each config stores its own LLM provider settings, model, voice note preferences, and automation behavior **independently** of which WhatsApp account is active.

Configs and WhatsApp accounts are fully decoupled. You can use the same WhatsApp account with different AI configurations, or the same AI config with different WhatsApp accounts.

### Creating configs

Run `replypilot setup` as many times as you want. Each time, you'll be asked for a config name:

```text
? Configuration name (default)
```

Enter a name like `work`, `personal`, `chatgpt`, or press Enter for the default.

### Switching configs

```bash
replypilot config switch
```

Shows a list of your saved configs. Select one to make it active. This only changes which AI settings are used, your WhatsApp account stays the same.

### Viewing current config

```bash
replypilot config show
```

Prints the active config's name at the top along with the full config (API keys redacted).

### Resetting

```bash
replypilot config reset
```

Displays a selection of your saved configs. Pick one to delete, or choose `Reset all configurations` to delete everything. With only one config, you get a direct confirm prompt. If the active config is deleted, the next one becomes active automatically.

---

## WhatsApp Account Management

WhatsApp accounts are managed separately from configs. You log into each account once, give it a name, and then select which one to use.

### Logging into a new account

```bash
replypilot login
```

You'll be prompted for an account name (e.g., `work-phone`, `personal`). Names must be unique if you try to reuse a name, you'll be asked to enter a different one.

```text
? WhatsApp account name: work-phone
```

A QR code appears in the terminal. Scan it from WhatsApp on your phone (Linked Devices → Link a device). Once scanned, the account is saved and set as active.

You can repeat this for multiple phone numbers. Each gets its own name and its own saved session, no need to re-scan QR codes later.

### Switching accounts

```bash
replypilot account switch
```

Shows all authenticated accounts. Select one to make it active. This only changes which WhatsApp account is used, your AI config stays the same.

### Logging out

```bash
replypilot logout
```

Displays a selection of your authenticated accounts. Pick one to remove its session, or choose `Logout all accounts` to remove everything. With only one account, you get a direct confirm prompt. You'll need to run `replypilot login` again before you can use any account.

### Clearing cache

```bash
replypilot cache
```

Clears the WhatsApp web client cache (`.wwebjs_cache`) from the current directory.

### Complete cleanup

```bash
replypilot clear
```

Wipes everything: runs `npm cache clean --force`, deletes all saved configurations, removes all WhatsApp accounts, and clears the WhatsApp web client cache. You'll be prompted to confirm before anything is deleted.

---

## Getting Started (Step by Step)

1. **Create an AI config**: `replypilot setup` — pick your provider, model, and style prompt.
2. **Log into WhatsApp**: `replypilot login` — give it a name and scan the QR code.
3. **Start**: `replypilot start` — the tool connects the active WhatsApp account using the active config.
4. **First-time calibration**: The first time you run the tool, it needs about **10 minutes to calibrate**. During this period, it downloads browser data, initializes the WhatsApp session, and syncs your chats. After 10 minutes it will start working normally. From the second time onward, it works instantly.

To use a different account or a different AI setup later, just use `replypilot account switch` or `replypilot config switch` — they're independent.

---

## Safety Defaults

- Direct contact messages are processed.
- Messages sent by you are ignored.
- Group auto-replies are disabled by default.
- Broadcast list auto-replies are disabled by default.
- Archived chat auto-replies are disabled by default.
- WhatsApp status broadcasts are always ignored.
- Voice notes are ignored by default (`ignore` mode).
- Dry-run can be enabled during setup to log replies without sending them.

### Archived Chat Handling

Archived chats are ignored by default. When a message arrives from an archived chat, the following pipeline runs to block the reply:

```text
message.getChat() → chat.archived === true
         ↓
toFilterableMessage() → filterable.archived = true
         ↓
client.ts:123 getIgnoreReason() → 'archived' → skipMediaProcessing = true
         ↓
toLightweightRuntimeMessage() → runtimeMessage.archived = true
         ↓
messageHandler(runtimeMessage) → automation.handleIncomingMessage()
         ↓
automation.ts:92 getIgnoreReason(message, config)
         ↓
filters.ts:42 message.archived && !config.whatsapp.allowArchived
         ↓  true && true  =  true
         ↓
returns 'archived' → message IGNORED → LLM does NOT reply
```

If you want the LLM to interact with archived chats, enable it during `replypilot setup`:

```text
? Auto-reply in archived chats? (y/N)
```

Or add `"allowArchived": true` to your config's `whatsapp` section.

---

## Advanced Configuration

These settings are not exposed in the setup wizard, but can be added directly to your config file (`replypilot config show` to view the current config).

### Login Delay

```json
{
  "whatsapp": {
    "loginDelayMs": 500
  }
}
```

Controls how long (in milliseconds) the app waits after WhatsApp confirms it's ready before completing the login process. This delay ensures the session data is saved to disk.

- **Default:** `500` (0.5 seconds)
- **Range:** `0` – `30,000`
- **Increase** (e.g., `2000`) if you keep getting QR code prompts on every login (slow I/O).
- **Decrease** (e.g., `0`) to log in faster, at the risk of the session not persisting.

### Shutdown Timeout

```json
{
  "automation": {
    "shutdownTimeoutMs": 15000
  }
}
```

Controls how long (in milliseconds) the app waits for a graceful shutdown before force-exiting. When you press Ctrl+C, the app completes all pending messages, then stops WhatsApp and the AI provider. If this takes longer than the timeout, it force-closes.

- **Default:** `15000` (15 seconds)
- **Range:** `1,000` – `120,000`
- **Increase** (e.g., `30000`) if you have slow connections that need more time to shut down.
- **Decrease** (e.g., `5000`) to make the app exit faster when stuck.

---

## Feature Availability

| Feature               | Global              | Local (npx)         | Git Clone (built)      | Git Clone (tsx)       |
| --------------------- | ------------------- | ------------------- | ---------------------- | --------------------- |
| `setup`               | ✓                   | ✓                   | ✓                      | ✓                     |
| `login`               | ✓                   | ✓                   | ✓                      | ✓                     |
| `account switch`      | ✓                   | ✓                   | ✓                      | ✓                     |
| `start`               | ✓                   | ✓                   | ✓ `npm start`          | ✓ `npm run dev`       |
| `version`             | ✓                   | ✓                   | ✓                      | ✓                     |
| `doctor`              | ✓                   | ✓                   | ✓                      | ✓                     |
| `config show / reset` | ✓                   | ✓                   | ✓                      | ✓                     |
| `config switch`       | ✓                   | ✓                   | ✓                      | ✓                     |
| `logout`              | ✓                   | ✓                   | ✓                      | ✓                     |
| `cache`               | ✓                   | ✓                   | ✓                      | ✓                     |
| `clear`               | ✓                   | ✓                   | ✓                      | ✓                     |
| Multi-WA accounts     | ✓                   | ✓                   | ✓                      | ✓                     |
| Programmatic API      | ✓ `import from pkg` | ✓ `import from pkg` | ✓ `import from ./dist` | ✓ `import from ./src` |
| TypeScript types      | ✓ auto              | ✓ auto              | ✓ from `dist/`         | ✓ from `src/`         |
| Multi-config profiles | ✓                   | ✓                   | ✓                      | ✓                     |
| Run tests             | —                   | —                   | —                      | ✓ `npm test`          |
| Hot-reload            | —                   | —                   | —                      | ✓ `tsx --watch`       |

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
import {
  removeWhatsAppSessionData,
  removeWhatsAppSessionAccount,
  clearActiveWhatsAppAccount,
  type ReplyPilotConfigStore,
} from 'gimirick-replypilot';
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
import { loginWhatsAppAccount } from 'gimirick-replypilot';
import { fetchChatContext, normalizeChatMessage, normalizeChatMessages } from 'gimirick-replypilot';
import { type WhatsAppRawChat, type WhatsAppRawMessage } from 'gimirick-replypilot';
import { DuplicateMessageGuard, getIgnoreReason, shouldProcessMessage } from 'gimirick-replypilot';
import { type FilterableWhatsAppMessage, type IgnoreReason } from 'gimirick-replypilot';

// WhatsApp account management
import {
  getActiveWhatsAppAccount,
  setActiveWhatsAppAccount,
  listWhatsAppAccounts,
  removeWhatsAppSessionAccount,
  clearActiveWhatsAppAccount,
} from 'gimirick-replypilot';

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
│ setup   login   account switch   start   doctor   config show     │
│ config reset   config switch   logout   cache   clear   version   │
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
          ╔════════════════╗  ╔═══════════════════╗
          ║ image/sticker  ║  ║   voice note?     ║
          ║ → download     ║  ║ (message.type===' ║
          ║   (retry 3×)   ║  ║       ptt')       ║
          ║ → imageData    ║  ║   (retry 3×)      ║
          ╚════════════════╝  ╚═══╤═══╤═══╤═══╤═══╝
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
           status_broadcast,
           archived,
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
                      │    * retries transient errors (429, 503, 408, 504, network failures)
                      │    * exponential backoff: 1s, 2s, 4s...
                      │  - key rotation on persistent failure
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

Four modes are available, configured during `replypilot setup`:

| Mode            | Audio Flow                                                                    | LLM Receives                                       |
| --------------- | ----------------------------------------------------------------------------- | -------------------------------------------------- |
| `whisper_cloud` | OGG→MP3 → `POST /v1/audio/transcriptions` → transcription text                | Transcribed text as message body                   |
| `whisper_local` | OGG→MP3 → `POST /inference` (whisper.cpp) → transcription text                | Transcribed text as message body                   |
| `native_audio`  | OGG→MP3 → attached as `{type:"input_audio", input_audio:{data,format:"mp3"}}` | Raw audio content part (multimodal model required) |
| `ignore`        | Skipped entirely                                                              | Message labeled `[voice note]`                     |

Whisper models available for cloud mode: `whisper-1` (default), `gpt-4o-mini-transcribe`, `gpt-4o-transcribe`, or a custom model name.

Media download from WhatsApp Web is retried up to 3 times with a 1-second delay between attempts, handling transient Puppeteer CDP serialization errors that can occur when decryption keys are not yet available. This applies to both image/sticker downloads and voice note downloads. If all retries fail, processing continues without the media.

OGG-to-MP3 conversion is handled by `src/audio/convert.ts` via `ffmpeg` with a 120-second timeout. Conversion failures are caught and logged; the voice note is replaced with `[voice note]` text.

### Concurrency & Batching

- **Global limit**: max 1 concurrent LLM request (`globalConcurrency: 1`).
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
       ├── getActiveWhatsAppAccount() read active WA account (falls back to config sessionName)
       ├── new OpenAiCompatibleProvider()   init OpenAI SDK client(s)
       │   └── fallbackApiKeys[]           rotate on request failure
       ├── new ReplyAutomation()        wire config, provider, queue, logger
       ├── new WhatsAppClientAdapter(   init whatsapp-web.js (LocalAuth)
       │     activeAccount)             using active WA account as clientId
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

| Layer        | File                   | Role                                                                                                                                                              |
| ------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CLI**      | `cli.ts`               | Commander program, 12 commands, dependency injection for testability                                                                                              |
| **Config**   | `schema.ts`            | Zod schema, `AppConfig` type, defaults, `parseAppConfig` validation                                                                                               |
| **Config**   | `store.ts`             | Persistent JSON store via `conf`, multi-config profiles, multi-WA account tracking, session dir management                                                        |
| **Config**   | `setup.ts`             | Interactive `@inquirer/prompts` wizard (named configs, 3 providers + voice note flow)                                                                             |
| **Runtime**  | `automation.ts`        | `ReplyAutomation` orchestrator (message batching), `processIncomingMessageBatch`, `startAutomation`                                                               |
| **Runtime**  | `queue.ts`             | `MessageQueue` wrapping `p-queue` with chat-scoped sub-queues and optional global rate limiting (`maxCallsPerMinute`)                                             |
| **Runtime**  | `logger.ts`            | Pino logger with API key redaction                                                                                                                                |
| **Runtime**  | `errors.ts`            | Typed error hierarchy (`MissingConfigError`, `ProviderTimeoutError`, etc.)                                                                                        |
| **Runtime**  | `metrics.ts`           | `MetricsCollector` — in-memory counters for messages, LLM calls, latency, and processing time                                                                     |
| **Runtime**  | `health-server.ts`     | `HealthServer` — optional HTTP endpoint (`:port/health`, `:port/metrics`) using Node.js built-in `http`                                                           |
| **LLM**      | `provider.ts`          | `LlmProvider` interface, `ChatContextMessage` / `GenerateReplyInput` types                                                                                        |
| **LLM**      | `openai-compatible.ts` | OpenAI SDK adapter, per-key client creation, key rotation on failure, transient-error retry with timeout race                                                     |
| **LLM**      | `prompt.ts`            | Prompt construction (`buildReplyPrompt`), output cleanup (`cleanGeneratedReply`), `UserContentPart` (text/image/audio)                                            |
| **WhatsApp** | `client.ts`            | `WhatsAppClientAdapter`, `loginWhatsAppAccount` (standalone auth flow), lifecycle events, raw message → `RuntimeIncomingMessage` (includes voice note processing) |
| **WhatsApp** | `context.ts`           | Chat history fetch (`fetchChatContext`), message normalization, media type labels                                                                                 |
| **WhatsApp** | `filters.ts`           | `getIgnoreReason` (self, empty, group, broadcast, archived, voice_note, status_broadcast), `DuplicateMessageGuard` with FIFO pruning                              |
| **Audio**    | `convert.ts`           | OGG-to-MP3 conversion via `ffmpeg` subprocess with timeout                                                                                                        |
| **Audio**    | `transcriber.ts`       | Cloud (`transcribeCloud`) and local (`transcribeLocal`) Whisper transcription                                                                                     |
| **Doctor**   | `doctor.ts`            | `runDoctor` health checks (Node, config, provider reachability, ffmpeg availability)                                                                              |

---

## About

Part of the GimiRick toolchain. Founded by Mohammad Faiz.

## License

CC BY-NC-ND 4.0 — Attribution-NonCommercial-NoDerivatives 4.0 International.
See the [LICENSE](LICENSE) file for the full legal text.

## Disclaimer

ReplyPilot uses `whatsapp-web.js`, an unofficial WhatsApp Web automation library. You are responsible for following WhatsApp rules and local laws. Avoid spam, bulk messaging, and impersonation without consent. This tool is intended for personal automation and controlled use.
