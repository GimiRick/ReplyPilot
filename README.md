# ReplyPilot

ReplyPilot is a TypeScript CLI for automating WhatsApp replies with LM Studio, Ollama, or any OpenAI-compatible chat completions endpoint.

It listens for new direct WhatsApp messages, fetches recent chat history, asks your configured model to reply in your tone, and sends the response back through WhatsApp Web.

## Git Clone Users

```bash
git clone <repo-url>
cd ReplyPilot
npm install
npm run build
npm start
```

Development mode:

```bash
npm run dev
```

## npm Global Users

```bash
npm i -g gimirick-replypilot-whatsapp
replypilot setup
replypilot start
```

## npm Local Package Users

```bash
npm i gimirick-replypilot-whatsapp
npx replypilot setup
npx replypilot start
```

## npx Users

```bash
npx --package gimirick-replypilot-whatsapp replypilot setup
npx --package gimirick-replypilot-whatsapp replypilot start
```

## CLI Commands

```bash
replypilot setup
replypilot start
replypilot doctor
replypilot config show
replypilot config reset
replypilot logout
```

`start` automatically launches setup first when no saved config exists. `config show` redacts secrets before printing.

## Provider Setup

### LM Studio

1. Open LM Studio.
2. Load a chat model.
3. Start the local OpenAI-compatible server.
4. Use these defaults in `replypilot setup`:
   - Base URL: `http://localhost:1234/v1`
   - API key: `lm-studio`
   - Model name: the model loaded in LM Studio

### Ollama

1. Install and start Ollama.
2. Pull a model, for example:

```bash
ollama pull llama3.1
```

3. Use these defaults in `replypilot setup`:
   - Base URL: `http://localhost:11434/v1`
   - API key: `ollama`
   - Model name: `llama3.1`, `qwen2.5`, or another locally available model

### Custom OpenAI-Compatible Provider

Choose the custom provider option and enter:

- Base URL ending in `/v1`
- API key
- Model name
- Human-readable model label

## WhatsApp Login

Run:

```bash
replypilot start
```

ReplyPilot shows a QR code in the terminal. Open WhatsApp on your phone, go to linked devices, and scan the QR code. Keep the terminal process running while ReplyPilot is active.

To reset the WhatsApp session:

```bash
replypilot logout
```

## Safety Defaults

- Direct contact messages are processed.
- Messages sent by you are ignored.
- Group auto-replies are disabled by default.
- Status and broadcast auto-replies are disabled by default.
- Dry-run can be enabled during setup to log replies without sending them.

## Programmatic API

```ts
import {
  loadConfig,
  saveConfig,
  startAutomation,
  type AppConfig,
  type GenerateReplyInput,
  type GenerateReplyResult,
  type LlmProvider,
} from 'gimirick-replypilot-whatsapp';

await startAutomation();
```

## Quality Commands

```bash
npm run typecheck
npm run lint
npm run test:coverage
npm run build
npm run pack:dry-run
```

## Disclaimer

ReplyPilot uses `whatsapp-web.js`, an unofficial WhatsApp Web automation library. You are responsible for following WhatsApp rules and local laws. Avoid spam, bulk messaging, and impersonation without consent. This tool is intended for personal automation and controlled use.
