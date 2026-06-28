# ReplyPilot Manual Smoke Test

Use this checklist before publishing or before trusting a new environment.

1. Start LM Studio or Ollama locally.
2. Confirm the OpenAI-compatible endpoint is reachable.
   - LM Studio default: `http://localhost:1234/v1`
   - Ollama default: `http://localhost:11434/v1`
3. Run `replypilot setup`.
4. Select the provider and model.
5. Set context message count to `30`.
6. Optionally configure a rate limit for LLM API calls (or skip for no limit).
7. Optionally configure a wait time before sending messages (or skip for immediate send).
8. Start the tool with `replypilot start`.
9. Scan the terminal QR code from WhatsApp on your phone using linked devices.
10. Send a message from another WhatsApp account.
11. Confirm recent chat context is fetched.
12. Confirm the generated reply is sent.
13. Enable dry-run in config and confirm no WhatsApp message is sent.
14. Run `replypilot logout`.
15. Run `replypilot cache` to clear the WhatsApp web client cache.
