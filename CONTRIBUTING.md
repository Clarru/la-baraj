# Contributing to La Baraj

Thanks for helping improve La Baraj. Contributions are proposed through GitHub pull requests; the project owner reviews and merges them. Please open an issue for substantial changes before investing in them, so the approach and scope can be discussed.

## Getting started

1. Fork the repository on GitHub and create a branch in your fork.
2. Install Node.js 24 and run `npm ci`.
3. Make a focused change, preserving third-party notices and documenting the source and license of any new assets.
4. Run the relevant checks below. Open a pull request against `main` and explain the change, its tests, and any limitations.

```sh
npm test
npm run test:protocol
npm run server:check
npm run build
```

The frontend can be started with `npm run dev`. With no `VITE_ROOM_SERVER_URL` configured, the game opens in offline mode; it does not connect to the shared multiplayer world. The address in `.env.example` is a placeholder and is not a working server.

For multiplayer changes, use a separate Worker and separate storage that you control, and configure the exact local browser origin in that Worker’s `ALLOWED_ORIGINS`. Point `VITE_ROOM_SERVER_URL` at your test Worker using a local `.env` file. Do not send test traffic or mutations to the production world. Values prefixed with `VITE_` are included in the frontend and are public: never put passwords, tokens, or other secrets in them.

The local single-port and worktree coordination rules in `AGENTS.md` apply to the shared project workspace; outside contributors can use their own local setup.

## Pull requests

Keep changes small enough to review and include meaningful tests for behavior changes. The automated checks cover the frontend and the multiplayer protocol. Passing checks do not merge a pull request: the project owner makes the final decision. Contributions must be yours to submit and include all applicable third-party notices and permissions.

For security vulnerabilities, please follow [SECURITY.md](SECURITY.md) instead of opening a public issue or pull request with exploit details.
