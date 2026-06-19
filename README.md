# ReplyPilot

[![License: CC BY-NC-ND 4.0](https://img.shields.io/badge/License-CC_BY--NC--ND_4.0-lightgrey.svg)](LICENSE)

ReplyPilot is a TypeScript CLI for automating WhatsApp replies with LM Studio, Ollama, or any OpenAI-compatible chat completions endpoint.

It listens for new direct WhatsApp messages, fetches recent chat history, asks your configured model to reply in your tone, and sends the response back through WhatsApp Web.

---

## Installation & Usage

### 1. NPM Global Install

```bash
npm i -g gimirick-replypilot-whatsapp
```

`replypilot` becomes a system-wide command.

```bash
# Setup wizard (required before first start)
replypilot setup

# Start automation (connects WhatsApp + begins listening)
replypilot start

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
import { startAutomation, loadConfig, type AppConfig } from 'gimirick-replypilot-whatsapp';

await startAutomation();
await startAutomation({ safety: { dryRun: true } });
const config: AppConfig = loadConfig();
```

---

### 2. NPM Local Install

```bash
npm i gimirick-replypilot-whatsapp
```

All features via `npx`:

```bash
npx replypilot setup
npx replypilot start
npx replypilot doctor
npx replypilot config show
npx replypilot config reset
npx replypilot logout
```

Programmatic API in your project:

```ts
import { startAutomation, loadConfig, runDoctor } from 'gimirick-replypilot-whatsapp';
import { ReplyAutomation, OpenAiCompatibleProvider } from 'gimirick-replypilot-whatsapp';
import { runSetupWizard, createConfigStore } from 'gimirick-replypilot-whatsapp';
import { MissingConfigError, ReplyPilotError } from 'gimirick-replypilot-whatsapp';

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
|----------|----------|---------------|
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
|---------|--------|-------------|-------------------|-----------------|
| `setup` | ✓ | ✓ | ✓ | ✓ |
| `start` | ✓ | ✓ | ✓ `npm start` | ✓ `npm run dev` |
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
import { startAutomation, ReplyAutomation, processIncomingMessage } from 'gimirick-replypilot-whatsapp';
import { type AutomationResult, type ReplyAutomationOptions } from 'gimirick-replypilot-whatsapp';
import { type RuntimeIncomingMessage } from 'gimirick-replypilot-whatsapp';

// LLM provider
import { OpenAiCompatibleProvider, type OpenAiCompatibleProviderOptions } from 'gimirick-replypilot-whatsapp';
import { type LlmProvider, type GenerateReplyInput, type GenerateReplyResult } from 'gimirick-replypilot-whatsapp';
import { type ChatContextMessage, type PromptMessage } from 'gimirick-replypilot-whatsapp';
import { buildReplyPrompt, cleanGeneratedReply, formatChatContext, trimContextMessages } from 'gimirick-replypilot-whatsapp';

// Config
import { loadConfig, saveConfig, deleteConfig, tryLoadConfig, hasConfig } from 'gimirick-replypilot-whatsapp';
import { createConfigStore, getConfigFilePath, getWhatsAppSessionDir } from 'gimirick-replypilot-whatsapp';
import { removeWhatsAppSessionData, type ReplyPilotConfigStore } from 'gimirick-replypilot-whatsapp';
import { runSetupWizard, promptForConfig, createConfigFromSetupAnswers } from 'gimirick-replypilot-whatsapp';
import { type PromptAdapter, type SetupAnswers } from 'gimirick-replypilot-whatsapp';
import { parseAppConfig, mergeAppConfig, redactConfig } from 'gimirick-replypilot-whatsapp';
import { type AppConfig, type PartialAppConfig, type LlmProviderName } from 'gimirick-replypilot-whatsapp';
import { CONFIG_VERSION, DEFAULT_APP_CONFIG, PROVIDER_DEFAULTS } from 'gimirick-replypilot-whatsapp';
import { appConfigSchema, providerSchema, logLevelSchema } from 'gimirick-replypilot-whatsapp';

// Doctor / health
import { runDoctor, formatDoctorReport, checkProviderReachability } from 'gimirick-replypilot-whatsapp';
import { isSupportedNodeVersion, type DoctorReport, type DoctorCheck } from 'gimirick-replypilot-whatsapp';

// WhatsApp
import { fetchChatContext, normalizeChatMessage, normalizeChatMessages } from 'gimirick-replypilot-whatsapp';
import { type WhatsAppRawChat, type WhatsAppRawMessage } from 'gimirick-replypilot-whatsapp';
import { DuplicateMessageGuard, getIgnoreReason, shouldProcessMessage } from 'gimirick-replypilot-whatsapp';
import { type FilterableWhatsAppMessage, type IgnoreReason } from 'gimirick-replypilot-whatsapp';

// Queue & Logger
import { MessageQueue, type MessageQueueOptions } from 'gimirick-replypilot-whatsapp';
import { createLogger, type Logger } from 'gimirick-replypilot-whatsapp';

// Errors
import { ReplyPilotError, MissingConfigError, ConfigValidationError } from 'gimirick-replypilot-whatsapp';
import { ProviderResponseError, ProviderTimeoutError } from 'gimirick-replypilot-whatsapp';
```

---

## About

Part of the GimiRick toolchain. Founded by Mohammad Faiz.

## License

CC BY-NC-ND 4.0 — Attribution-NonCommercial-NoDerivatives 4.0 International.
See the [LICENSE](LICENSE) file for the full legal text.

## Disclaimer

ReplyPilot uses `whatsapp-web.js`, an unofficial WhatsApp Web automation library. You are responsible for following WhatsApp rules and local laws. Avoid spam, bulk messaging, and impersonation without consent. This tool is intended for personal automation and controlled use.
