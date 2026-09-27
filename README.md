# SoloPhone

An opinionated loadout for the **Light Phone III**: what's on my phone, how
it's arranged, and why. The aim is to keep the phone quiet while making the
few things it's missing work properly. Everything here was set up and checked
on a real device, and [docs/setup.md](docs/setup.md) reproduces it step by
step.

> **Unofficial.** Not affiliated with or endorsed by Light. Most of this
> works at the Android layer beneath LightOS, which Light doesn't document
> and can change in any update. Heavy tinkering may void your warranty.

## Opinions

These decide what's in and what's out.

- **The toolbox is for tools.** Plain Android apps are hidden from it and
  live in Menu instead, with the ones you use most also on a hardware button.
- **No Google, and no pretending otherwise.** This phone can't run Google
  Play Services or microG; the bootloader is locked. So push only arrives
  where an app keeps its own connection or speaks UnifiedPush. Everything
  else is silent, on purpose or not, and gets picked accordingly.
- **Build it when it's missing, as a plain app if the SDK can't.** A
  light-sdk tool is preferred, since it can go to Light's Tool Library. But
  a tool can't launch other apps, buzz with the screen off, or act on a
  push, so anything needing those is an ordinary Android app carrying the
  toolbox marker.
- **Every APK is checked before it's trusted.** Every signing certificate is
  recorded, and a change on update means stop. Own builds use a private key
  per app, and a release gate refuses anything unpinned, debuggable, or
  backing up data. Anything signed with light-sdk's public dev key is
  treated as unauthenticated.
- **Nothing phones home that doesn't have to.** Own tools ask for the
  minimum permissions. Menu, Notifications and Routine have no internet
  access at all.

## The loadout

### Toolbox and navigation

| | What | Why |
|---|---|---|
| Toolbox | Light's tools, plus Menu, Routine and Review | `LIGHTOS_SHOW_EXTERNAL_TOOLS=0` hides every plain app; marker-carrying tools stay |
| [Menu](https://github.com/solo-ist/lp3-menu) | Every plain app: 21 entries across 4 pages | A second toolbox, drawn to match LightOS, for everything the real one hides |
| Buttons | Most-used apps and the Notifications tool, via Controls | One press away, without a toolbox slot |
| Focus | `light_force_focus_level 2` | Stops LightOS stealing the foreground, so sockets and installers survive screen-off |
| Rotation | Locked to portrait | A rotation rebuilds the screen and loses whatever you were typing |

### Own tools

| Tool | What it does |
|---|---|
| [Notifications](https://github.com/solo-ist/lp3-notifications) | One quiet screen for everything currently notifying: open, dismiss, hide. Stores nothing. |
| [Routine](https://github.com/solo-ist/lp3-routine) | Step-by-step routine timer (replaces Routinery), with a buzz that works with the screen off. |
| [Menu](https://github.com/solo-ist/lp3-menu) | A second toolbox, drawn to match LightOS. |
| Review | Readwise daily review in LightOS's design language (light-sdk; private repo). |

### Messaging

| | How |
|---|---|
| Signal | Official app. Without Google it keeps its own connection, so messages still arrive. Its signer matches the fingerprint Signal publishes. |
| iMessage | Bridged into Light's own **Chats**: Messages on a Mac → `mautrix-imessage` → Beeper → Matrix. Works both ways, with contact names. |
| SMS | Native, over the phone's own SIM. |

### Apps

| | Notes |
|---|---|
| Controls | Button shortcuts, lock-screen notifications, and the banner that makes other apps' notifications visible. Needs adb grants. |
| Home Assistant (minimal) | The de-Googled build, which pushes over its own WebSocket, so it genuinely notifies. |
| Claude, Slack, Spotify, Todoist, Sonos, 1Password, Bluesky, StoryGraph | Work, but can't receive Google push, so they're silent. 1Password is the autofill provider. |
| Roll, News, Mailbox, Composer, QR, Web Tools, Light Keyboard, Light Remote | Community tools from gi-os and others. |
| Calendar | Already syncing through Light's built-in DAVx5. Nothing to install. |

Updates come through **Obtainium** for anything on GitHub, **Aurora** for
Play-only apps, and **BrightMarket** for community tools.

### Known risks

- **Chats, Passes and Wi-Fi are signed with light-sdk's public dev key**, so
  anyone could sign an update Android would accept. It matters most for
  Chats, which holds the Matrix session behind iMessage. See *Signing and
  trust* in the field notes.

### Ruled out

microG and Google Play Services (locked bootloader), Endel (Play licensing),
Verses (public dev key), LightChat, Molly Light (replaced by Signal), and
BlueBubbles (needs Google push). The reasons are in the field notes.

## Docs

- **[docs/setup.md](docs/setup.md)**: reproduce the loadout, in order, with
  a check after each step.
- **[docs/field-notes.md](docs/field-notes.md)**: the evidence. What was
  tried, what the phone showed, and the dead ends, dated.
- **[cloud/](cloud/)**: an unofficial client for the Light Phone cloud API
  (notes sync, developer mode), with [its own findings](cloud/FINDINGS.md).
