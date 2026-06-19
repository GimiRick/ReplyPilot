# Publishing ReplyPilot

Before publishing, verify npm package availability again:

```bash
npm view gimirick-replypilot-whatsapp
```

Run the release checks:

```bash
npm ci
npm run typecheck
npm run lint
npm run test:coverage
npm run build
npm run pack:dry-run
npm audit --audit-level=moderate
```

Inspect the dry-run package output and confirm it includes only `dist`, `README.md`, `LICENSE`, and `docs`.
