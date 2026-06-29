# ReplyPilot Manual Smoke Test

Use this checklist before publishing or before trusting a new environment.

## Setup + Config

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
9. Complete the wizard.

## WA Account Login

1. Run `replypilot login`.
2. Enter a name like `my-phone` when prompted.
3. Confirm a QR code appears in the terminal.
4. Scan the QR code from WhatsApp on your phone using linked devices.
5. Confirm `WhatsApp account "my-phone" authenticated and saved.` appears.
6. Confirm `Account "my-phone" is now active.` appears.

## Start + Automation

1. Start the tool with `replypilot start`.
2. Send a message from another WhatsApp account.
3. Confirm recent chat context is fetched.
4. Confirm the generated reply is sent.
5. Stop the tool (Ctrl+C).

## Account Switching

1. Run `replypilot login` again and create a second account named `second-phone` (scan with another phone number).
2. Run `replypilot account switch`.
3. Confirm both `my-phone` and `second-phone` appear, with `second-phone` marked as active.
4. Select `my-phone`. Confirm `Switched to WhatsApp account: my-phone`.
5. Run `replypilot start` — confirm it uses `my-phone`.

## Config Independence from Accounts

1. Run `replypilot switch` — confirm switching configs does not change the active WhatsApp account.
2. Run `replypilot account switch` — confirm switching accounts does not change the active config.

## Dry-Run + Logout

1. Enable dry-run in config and confirm no WhatsApp message is sent on next `start`.
2. Run `replypilot logout`.
3. Confirm a selection list appears with `my-phone`, `second-phone`, and `Logout all accounts`.
4. Select `my-phone`. Confirm `WhatsApp account "my-phone" logged out.` appears.
5. Run `replypilot logout` again and select `Logout all accounts`. Confirm all accounts removed.
6. Run `replypilot cache` to clear the WhatsApp web client cache.

## Fallback API Keys

1. Run `replypilot setup`.
2. After entering the primary API key, confirm "Do you want to add a fallback API key?" appears.
3. Answer `y` and enter a second API key.
4. Confirm "Do you want to add another fallback API key?" appears.
5. Answer `n` and complete setup.
6. Run `replypilot config show` — confirm fallback keys are shown as `[redacted]`.
7. Run `replypilot doctor` — confirm provider reachability check passes with the primary key.

## Multi-Config Profiles

1. Run `replypilot setup` and create a config named `work`.
2. Run `replypilot setup` again and create a second config named `personal`.
3. Run `replypilot config show` — confirm it shows `Active config: personal` (the last created one).
4. Run `replypilot switch` — select `work`. Confirm `Switched to configuration: work`.
5. Run `replypilot config show` — confirm it shows `Active config: work`.
6. Run `replypilot config reset` — confirm a selection list appears with `work`, `personal`, and `Reset all configurations`.
7. Select `work`. Confirm `Configuration "work" reset.` appears.
8. Confirm the active config falls back to `personal`.
9. Run `replypilot config reset` again and select `Reset all configurations`. Confirm all configs removed, then run `replypilot setup` to recreate them.
