# ReplyPilot Manual Smoke Test

Use this checklist before publishing or before trusting a new environment.

## Single Config

1. Start LM Studio or Ollama locally.
2. Confirm the OpenAI-compatible endpoint is reachable.
   - LM Studio default: `http://localhost:1234/v1`
   - Ollama default: `http://localhost:11434/v1`
3. Run `replypilot setup`.
4. Accept the default config name (press Enter).
5. Select the provider and model.
6. Set context message count to `30`.
7. Optionally configure a rate limit for LLM API calls (or skip for no limit).
8. Optionally configure a wait time before sending messages (or skip for immediate send).
9. Start the tool with `replypilot start`.
10. Scan the terminal QR code from WhatsApp on your phone using linked devices.
11. Send a message from another WhatsApp account.
12. Confirm recent chat context is fetched.
13. Confirm the generated reply is sent.
14. Enable dry-run in config and confirm no WhatsApp message is sent.
15. Run `replypilot logout`.
16. Run `replypilot cache` to clear the WhatsApp web client cache.

## Multi-Config Profiles

1. Run `replypilot setup` and create a config named `work`.
2. Run `replypilot setup` again and create a second config named `personal`.
3. Run `replypilot config show` — confirm it shows `Active config: personal` (the last created one).
4. Run `replypilot switch` — select `work`. Confirm `Switched to configuration: work`.
5. Run `replypilot config show` — confirm it shows `Active config: work`.
6. Run `replypilot config reset` — confirm the reset prompt mentions `"work"`.
7. Confirm the active config falls back to `personal`.
