# Contributing to the AgentBus cockpit

The cockpit is the web UI for [AgentBus](https://github.com/StaysUp/agentbus). It is a client of
AgentBus's HTTP API and holds no state of its own.

## Build and run it

You need Node.js 20.19 or later in the 20 line, or 22.12 or later, and a running AgentBus
(`agentbus up`) of the same version.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173` and connect with the token from the data folder `agentbus up` printed.
The [README](README.md) covers the details, including `-origin`.

## Test and build

```sh
npm test
npm run build
```

CI runs both on every pull request. `npm run build` type-checks with `tsc` first.

## House rules

- One change per pull request. Keep it small.
- A fix comes with a test that fails before the fix and passes after it.
- A change you can see comes with a screenshot, in light and dark.
- The UI reads only AgentBus's public API (`/api/v0/`). If it needs something the API lacks, say so
  in the pull request or open an issue on AgentBus.
- The pull request says what you changed, why, what you ran to check it, and which coding agents
  you used and what you checked yourself. The pull request template asks for each.
