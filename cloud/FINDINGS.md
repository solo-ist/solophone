# Findings — Light Phone 3 ↔ Prose sync spike

Spike run 2026-09-12 against a real LP3 (LightOS `572-release-lp3`) on a
two-device account (lp3 + lp2). Everything in the plan worked; the unofficial
cloud API is viable for a Prose sync provider.

## What was proven

| Step | Result |
|---|---|
| Login (`POST /api/authorizations`) | ✅ token 130 chars, `max_age` = 30 days (expiry confirmed 30 days out) |
| Device + notes-tool discovery | ✅ `/api/devices` + `/api/tools?device_id` cross-reference resolves the notes `device_tool_id` exactly as documented |
| List notes | ✅ 4 text notes |
| Pull → markdown files | ✅ frontmatter files, incremental re-pull skips unchanged notes via `updated_at` |
| Create (POST + presigned S3 PUT) | ✅ first try — `Uint8Array` body with **no** `Content-Type` header is the correct S3 recipe |
| Update content (fresh presigned PUT URL) | ✅ |
| Round-trip (pull back the updated note) | ✅ content identical, `updated_at` bumped |
| Delete | ✅ test note removed from account, account back to its original 4 notes |
| On-device propagation | ✅ appeared in the LP3 Notes tool within ~3 minutes of creation |
| Phone-side edit → desktop | ✅ an edit made on the phone came back via `pull` (bumped `updated_at`, only the changed note re-downloaded) |

## Quirks observed vs. the documented shapes

- **Timestamps have no timezone suffix** (`2025-06-03T11:00:06`). They are
  UTC — a `04:53:39.9Z` client write came back as `04:53:40`. Parse as UTC
  explicitly; `new Date('2026-09-12T04:53:40')` in JS assumes *local* time.
- **Cloud consistency is effectively immediate** (create/update visible in the
  next list/pull within a second). Only device propagation lags.
- **`sims` linkage didn't materialize**: both devices reported "no sim found"
  even though the LP3 has service, so phone-number device selection is
  unreliable — select by device id (or by `device_type` = `lp3`/`lp2`, which
  the API does return and would make a nicer UX than a UUID).
- A 1Password-vault `device_id` (from the phone's own settings) is **not** the
  API's device UUID — discovery via `/api/devices` is the only reliable source.
- The `login` → probe → reuse-session flow works; a cached token survived
  across runs. Community reports of early 401s (garado/light issue #42) didn't
  reproduce in this session but the retry-once-through-relogin path is cheap
  insurance and should be kept.

## Credential handling pattern (keep for Prose docs)

`.env` holds only 1Password secret references (`op://<vault>/<item>/...`);
`npm run light:op` wraps the CLI in `op run --env-file=.env --`, which injects
real values into the child process and masks them in output. Plaintext never
touched disk, shell history, or the AI session. `.token.json` (bearer token,
mode 600, gitignored) is the only secret-adjacent artifact on disk.

## Prose integration map

The spike's `src/api.ts` + `src/notes.ts` are dependency-free (Node 18 fetch)
and were written to lift into Prose's main process as
`prose/src/main/lightphone/{client,sync}.ts`, cloned structurally from the
reMarkable provider (`prose/src/main/remarkable/`):

- **Secrets**: bearer token in `credentialStore` under `lightphone-token`
  (swap this spike's `.token.json`). Decide whether to also store email/password
  for silent re-login (reMarkable stores a long-lived device token; Light's
  30-day token means either storing credentials in Keychain or a "reconnect"
  prompt roughly monthly).
- **Settings**: `settings.lightphone` block (`enabled`, `email`, `deviceId`,
  `syncDirectory`, `lastSyncedAt`) mirroring `settings.remarkable`;
  extend `stripSecretsForDisk()` + `settings:load` in `src/main/ipc.ts`.
- **IPC**: new `lightphone:*` namespace in `src/main/ipc.ts` (lazy-import the
  sync module, `AbortController` for cancel, `event.sender.send('lightphone:sync:progress', …)`),
  matching entries in `src/preload/index.ts`, types in
  `src/renderer/types/index.ts`, **and no-op stubs in
  `src/renderer/lib/browserApi.ts`** (web build breaks otherwise).
- **UI**: `LightPhoneIntegration.tsx` cloned from `RemarkableIntegration.tsx`,
  mounted in `SettingsDialog.tsx`'s Integrations tab; sync hook cloned from
  `useRemarkableSync.ts`.
- **Flags/guards**: feature flag default-off (`featureFlags.ts`), force-off for
  MAS builds like reMarkable, HTTP stays in the main process (renderer CSP
  needs no change).
- **File format**: this spike's frontmatter (`title`, `source: lightphone`,
  `note_id`, `note_type`, `note_updated_at`) drops into Prose's convention;
  sync state at `<syncDir>/.lightphone/sync-state.json` keyed by note id
  (titles are not unique — never key on title).

## Risks / caveats

- **Unofficial API**, reverse-engineered by [garado/light](https://github.com/garado/light)
  (GPL-3.0 — used strictly as documentation here, no code reused; its
  `light_api/openapi-spec.json` is the drift canary worth re-checking when
  something breaks).
- Light's in-development official Tool Manager reportedly has a different
  endpoint surface (garado/light issue #63) — a plausible future break, and
  also a possible future *official* path.
- Notes are plain text on the phone; markdown renders as literal syntax on
  device. Fine for capture-and-sync; a Prose→phone push should probably
  strip/soften markdown.
- Be polite to Light's servers: sequential content fetches with spacing
  (250 ms here), no parallel hammering.
