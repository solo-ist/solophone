# SoloPhone

An unofficial TypeScript client for the **Light Phone cloud API**, plus field
notes from sideloading and building tools for the Light Phone III.

Zero runtime dependencies — Node 18+ `fetch` and nothing else — so the client
lifts cleanly into other projects (it was written as groundwork for a
[Prose](https://github.com/solo-ist/prose) sync provider).

> **Unofficial.** Not affiliated with or endorsed by Light. The cloud API is
> undocumented and could change at any time. Use at your own risk, be gentle
> with Light's servers, and know that heavy Android-layer tinkering can void
> your warranty.

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

## Field notes

- **[FINDINGS.md](FINDINGS.md)** — the cloud API as actually observed: auth
  flow, notes CRUD via presigned S3 URLs, quirks (suffix-less UTC timestamps,
  device-tool discovery), and gotchas.
- **[SIDELOADS.md](SIDELOADS.md)** — sideloading a Light Phone III end to end:
  developer mode, the Android-layer entry route, adb setup, APK verification
  (checksums + cert pinning/TOFU), and known LightOS quirks and levers.

## Ecosystem

This repo is the hub for LP3 work under [solo-ist](https://github.com/solo-ist).
Tools built on Light's [light-sdk](https://github.com/lightphone/light-sdk)
each live in their own repo (the scaffold expects to be the repo root, and
Light's Tool Library builds each tool from a standalone public commit):

| Repo | What |
|---|---|
| **solophone** (this repo) | Cloud API client, device management, field notes |
| [readwise-review](https://github.com/solo-ist/readwise-review) | Readwise Daily Review tool for LightOS — highlights, streaks, recovery |
| *(future)* prose tool | On-phone capture companion to [prose#897](https://github.com/solo-ist/prose/issues/897) |

New tools follow the same pattern: clone `lightphone/light-sdk`, build in
`tool/`, keep `lightphone` as the `upstream` remote, publish under solo-ist.

## Credits

API shapes were learned from [garado/light](https://github.com/garado/light)
(GPL-3.0), used **strictly as documentation** — no code was reused; this
client is an independent MIT-licensed implementation talking to Light's HTTPS
API directly. Thanks also to the LP3 community around
[awesome-light](https://github.com/garado/awesome-light) and the
[light-sdk](https://github.com/lightphone/light-sdk) team for opening the
platform.

## License

[MIT](LICENSE)
