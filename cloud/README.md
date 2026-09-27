# SoloPhone cloud

An unofficial TypeScript client for the **Light Phone cloud API**. It syncs
the phone's Notes tool with local markdown, toggles developer mode, and lists
the tool catalog. It's part of the [SoloPhone](../README.md) loadout, and was
written as groundwork for a [Prose](https://github.com/solo-ist/prose) sync
provider.

Zero runtime dependencies (Node 18+ `fetch` and nothing else), so the client
lifts cleanly into other projects.

> **Unofficial.** Not affiliated with or endorsed by Light. The cloud API is
> undocumented and could change at any time. Be gentle with Light's servers.

Run everything from this directory:

```sh
cd cloud
npm install
```

## What the CLI does

```
npm run light -- login          # authenticate + discover your device & notes tool
npm run light -- list           # list notes on the phone
npm run light -- pull           # pull all text notes to ./notes/*.md (incremental)
npm run light -- push-test      # round-trip proof: create a test note on the phone
npm run light -- dev-mode on    # toggle LightOS Developer Mode from the terminal
npm run light -- tools          # list the cloud tool catalog for your device
```

Notes land as markdown with frontmatter (`title`, `source: lightphone`,
`note_id`, timestamps), keyed by note id (titles aren't unique), with sync
state in `notes/.lightphone/sync-state.json`.

## Credentials

Copy `.env.example` to `.env`. Plaintext works, but the intended pattern is
**1Password secret references** resolved at runtime so credentials never touch
disk or your shell history:

```sh
# .env
LIGHT_EMAIL=op://<vault>/<item>/username
LIGHT_PASSWORD=op://<vault>/<item>/password

npm run light:op -- login   # wraps the CLI in `op run`
```

Sessions cache to `.token.json` (gitignored, mode 600). Tokens are good for
~30 days; the client re-authenticates once on any 401.

## How the API behaves

[FINDINGS.md](FINDINGS.md) covers the cloud API as actually observed: the
auth flow, notes CRUD via presigned S3 URLs, quirks such as suffix-less UTC
timestamps and device-tool discovery, and gotchas.
