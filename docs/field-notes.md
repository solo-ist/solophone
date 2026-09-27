# Field notes

The evidence behind the loadout: what was tried on the phone, what it showed,
and what was ruled out. Dated, because LightOS changes. For how to set the
phone up, see [setup.md](setup.md). These notes are why it's set up that way.

Verified on a Light Phone III (TLP301, Android 14 / API 34) running LightOS
`582-release-lp3`, September 2026, unless an entry says otherwise.

## The toolbox

- **Full Android apps self-register in the toolbox.** Verified 2026-09-19 by
  paging the toolbox: Market, Controls, Roll, News, Composer, Verses, Obtainium
  and Molly Light all appear, and none is a light-sdk tool. LightOS enumerates
  ordinary `MAIN`/`LAUNCHER` activities (with `LIGHTOS_SHOW_EXTERNAL_TOOLS=1`,
  in the `system` namespace) by a mechanism that is **not** in the public SDK
  source — the emulator lists only marker-carrying tools. Installing an app is
  enough to get an entry; no shim is needed.
- **On 582 sideloaded entries are interleaved with first-party tools**, not
  segregated to the bottom as the v572 note claimed — verified 2026-09-19, when
  Slack, Claude, Aurora Store and Endel landed on page 3 between Light Keyboard
  and Mailbox. Six per page.
- **`LIGHTOS_SHOW_EXTERNAL_TOOLS` (namespace `system`) is the toolbox filter,
  and it sorts by SDK marker, not by "sideloaded".** Set it to `0` and every
  *plain* Android app drops out of the toolbox while light-sdk tools stay.
  Verified 2026-09-19: at `0` the toolbox kept Directions, Directory, Timer,
  Weather, Chats, Passes, News and Review, and dropped Slack, Claude, Aurora,
  Market, Mailbox, Roll, Controls, 1Password, Sonos, Spotify, Todoist,
  Composer, Obtainium, Molly Light, Home Assistant, Bluesky and Apple TV.
  It is global — there is no per-app hide list anywhere in `settings`.
- **A plain app can pose as a tool by declaring the SDK marker**, and then
  survives that filter while keeping the abilities a real SDK tool is denied.
  LightOS enumerates tools by querying broadcast receivers for
  `com.thelightphone.sdk.ACTION_SDK_MARKER` and reading their `SDK_VERSION`
  metadata, so an empty receiver is enough:

  ```xml
  <receiver android:name=".SdkMarkerReceiver"
            android:enabled="true" android:exported="true">
      <intent-filter>
          <action android:name="com.thelightphone.sdk.ACTION_SDK_MARKER" />
      </intent-filter>
      <meta-data android:name="com.thelightphone.sdk.SDK_VERSION"
                 android:value="0.1.1" />
  </receiver>
  ```

  Proven with Menu on 2026-09-19: with the filter at `0` it stayed in the
  toolbox alongside News and Review, and still launched other apps. Entirely
  undocumented — the public SDK's emulator lists only marker-carrying tools,
  and nothing describes this as a supported extension point. Expect it to
  break.
- The toolbox is **text labels only, no icons** (light-sdk#174); the label is
  `getApplicationLabel()`, fixed at build time.
- **Per-app hiding from the toolbox is not achievable.** Tested 2026-09-19,
  three dead ends:
  1. Disabling just the launcher *component* of another package is refused
     even for adb shell —
     `SecurityException: Shell cannot change component state for ComponentInfo{…}`.
     Android only lets the shell disable whole packages.
  2. `pm disable-user <pkg>` does remove it from the toolbox, but the app then
     cannot be launched at all (`Activity class … does not exist`), so nothing
     else can launch it either. Hiding and launching are mutually exclusive.
  3. An unprivileged app could never drive it regardless:
     `CHANGE_COMPONENT_ENABLED_STATE` is `signature|privileged`.

  The workable substitute is the global filter plus the SDK marker above: set
  `LIGHTOS_SHOW_EXTERNAL_TOOLS=0` for a clean first-party toolbox, and let a
  marker-carrying launcher app (Menu) hold the rest. The cost is that it's
  all-or-nothing — every plain app disappears, so anything you still want
  reachable has to be in Menu or on a Controls button shortcut.
- **light-sdk tools cannot launch other apps**, so a toolbox "passthrough"
  shim built on the SDK is impossible: the Gradle plugin fails the build on
  `android.content.Intent` / `startActivity(` / `getSystemService(` /
  reflection (`LightSdkPlugin.kt:92-141`), `SealedLightContext.androidContext`
  is `internal` to `:sdk:client`, the manifest is generated with `<queries>`
  hardcoded to the SDK marker, `QUERY_ALL_PACKAGES` is not among the eleven
  allowed permissions, and `LightServiceMethod` has no launch verb —
  `OpenDialer` is the only handoff (light-sdk#191). A **plain** Android app
  with `<queries>` + `getLaunchIntentForPackage()` does work — verified with a
  throwaway stub on 2026-09-19 that appeared in the toolbox and launched its
  target — but since apps list themselves anyway (see quirks), a shim is only
  worth building to give something a *different label*.

## No Google, and what that costs

- **microG/GMS is not installable on this device — it's a hardware policy, not
  a preference.** Don't re-litigate it as a judgment call. microG impersonates
  `com.google.android.gms` and apps check for Google's signature on that
  package, so it needs **signature spoofing** — a framework-level patch.
  LineageOS/CalyxOS/e ship it; a stock ROM needs root plus patching, and real
  GMS additionally needs to live in `/system/priv-app` as a privileged app.
  Both routes need root, and root needs an unlocked bootloader. On this phone
  (verified 2026-09-19):

  ```
  ro.boot.verifiedbootstate = green      ro.boot.flash.locked = 1
  ro.boot.vbmeta.device_state = locked   sys.oem_unlock_allowed = 0
  ro.debuggable = 0                      ro.secure = 1
  no su binary; no FAKE_PACKAGE_SIGNATURE permission on this ROM
  ```

  `sys.oem_unlock_allowed = 0` is the one that closes it: Light has not exposed
  an OEM-unlock toggle, so there is no path to root, therefore none to
  signature spoofing, therefore none to microG.

  What that permanently costs: **FCM push and every "Continue with Google"
  button.** microG implements GCM and the auth API, so it would have fixed
  both. It would *not* have fixed Play Integrity attestation (see Endel), which
  Google designed to be unforgeable.
- **Push without GMS is possible, but only via UnifiedPush.** LightOS ships a
  distributor at `com.lightos/com.thelightphone.sdk.server.LightPushDistributor`
  — the only one on the device — and Molly Light uses it. FCM-only apps get
  nothing. A light-sdk tool can receive push through
  `ToolEntryPoint.onPushNotification(data: ByteArray)`.

**None of the Play-sourced apps will ever notify.** They are all FCM-only and
there is no GMS; see the UnifiedPush note under quirks. `POST_NOTIFICATIONS` is
granted to each anyway, because locally scheduled notifications (Todoist
reminders, alarms) don't go through FCM.

The pattern generalizes: **before installing anything from Play, check whether
it publishes a de-Googled build.** F-Droid, GitHub releases and "minimal" /
"foss" flavors are worth hunting for — they're the difference between an app
that notifies and one that doesn't.

**Home Assistant is the exception worth copying.** Take the **minimal** flavor
— built for de-Googled devices — from GitHub or F-Droid, never the Play/full
build. It carries zero GMS references, produces no `GooglePlayServicesUtil`
warnings at all, and is signed by the project's own key rather than a Play
re-signing key — which matters not because the DN reads `O=Home Assistant`
(a self-chosen string) but because the same key can be checked against both
the GitHub release and F-Droid, giving an independent point of comparison
Aurora's Play-signed APKs don't have. It
does push over a **persistent WebSocket to your own HA server** (24 websocket
refs in the APK, zero UnifiedPush), so notifications genuinely work here. Two
caveats: it needs Local Push enabled server-side, and a persistent socket has
to survive LightOS force-foregrounding on screen-off — same class of problem
as Molly, so it's Doze-whitelisted and wants `light_force_focus_level 2`.

**Claude is fine and needs no Google.** Its login screen has an
"Enter your email" field directly under the Google button — email plus a
verification code. Only Bluesky, Spotify, Claude and 1Password have been
verified past their sign-in walls; Slack, Todoist and Sonos are installed and
launching but unproven beyond that.

## Signing and trust

⚠️ **Check the signing key before trusting a community tool.** Verses shipped
signed with `CN=LightSDK Dev` — the keystore checked into light-sdk
(`b9c33e29…5f28`, `storePassword = "android"`). That key is public, so anyone
could forge an installable update for it. It was removed on that basis
(see Removed). Never reuse that key for anything of your own, and treat any
tool signed with it as unauthenticated.

**2026-09-27: three more apps turned out to be signed with that same public
key.** Chats (`com.lightphone.chats` 0.19.0), Passes (`com.lightphone.passes`
0.6.0) and Wi-Fi (`com.lightphone.wifi` 0.1.0) all arrived through
BrightMarket and carry `CN=LightSDK Dev` (`b9c33e29…5f28`). Light's own
production tools on the same phone are signed differently: Weather and
Rideshare carry `CN=Light, O=Light` (`1814fa7c…8144`). Anyone holding the
public key can build an APK Android will accept as an update to any of the
three. That matters most for Chats, which holds the Matrix/Beeper session
and so the bridged iMessage history. Unresolved: whether Light itself ships
these builds dev-signed, or BrightMarket rebuilt them.

⚠️ These certs are **Play App Signing** keys, not the vendors' own — 1Password's
DN, for instance, reads `CN=Android, O=Google Inc.`. They still work as a TOFU
baseline for detecting a change.

**A certificate's DN proves nothing on its own.** Any name — `CN=LightControl`,
`O=Home Assistant` — is chosen by whoever generated the key; a descriptive
organization field is not evidence of who built the app. What these
fingerprints are good for is *continuity*: if the signer changes on an update,
stop. Actual trust comes from where the APK was fetched and whether the
fingerprint matches one established independently (a published pin, or the same
key seen across F-Droid and the project's own releases) — not from the string
inside the certificate.

## Plain apps vs. light-sdk tools: the Routine spike


`~/Code/lp3-routine` is a step-by-step routine timer that replaces Routinery.
It was specced as a light-sdk tool with push reminders. Reading the SDK
source killed that design:

- `onPushNotification(ByteArray)` runs on `Dispatchers.IO` with no context,
  so it can't vibrate, notify, or even open its own Room/DataStore. Both
  need a `SealedLightContext`, which only screens and `LightWork` jobs get.
- `LightHapticFeedback` needs an Android `Context` that tools can't reach.
- `android.app.*` (AlarmManager, NotificationManager) is a blocked import.

So it is a plain app with the toolbox marker, like Menu. The spike, on
LightOS `582-release-lp3` on 2026-09-26, was run with a debug build
(`ist.solo.routine.debug`):

| Check | Result |
|---|---|
| `USE_EXACT_ALARM` | **Granted at install** for a sideload. `dumpsys alarm` shows `exactAllowReason=policy_permission`. |
| Step-end buzz, screen off | 3 × 20 s steps buzzed at :11.42, :31.40, :51.40, ~100 ms after each deadline. `Usage=ALARM`, `displayId=-1`, so it came from the receiver, not the UI. There was no double buzz. |
| Process SIGKILLed mid-step (`run-as … kill -9`), screen dozing | The alarm cold-started the app and buzzed on the deadline (12:11:00.28). Reopening 34 s later showed the next step at **0:26**, which is exact. |
| Haptics preference | LightOS's toggle is plain `Settings.System haptic_feedback_enabled` (=1). |
| `light_force_focus_level` | `2` on this phone. None of the above was affected by it. |
| Notification from a plain app, screen off | Posted fine (`importance=4`, `category=reminder`). The system vibrated it (`Usage=NOTIFICATION`), and **BrightControl woke the screen with a banner** 1.5 s later (`WAKE_REASON_APPLICATION, details=BrightControl:banner`). LightOS itself shows no shade, so Controls is the visible surface. |
| Cold start to interactive | 457 ms (`ActivityTaskManager: Displayed`). |

Two gotchas:

- **`force-stop` cancels alarms, and `am kill` or `kill -9` doesn't.** If
  LightOS ever force-stops apps, an in-progress run would lose its alarm.
  The timer itself is still right on reopen, because it's anchored, not
  ticking. Nothing seen so far suggests LightOS force-stops apps.
- **Long-press plays two haptics** unless the view's own feedback is off.
  `dumpsys vibrator_manager` showed our 40 ms tick `cancelled_superseded`
  by the framework's `HEAVY_CLICK`. Call `setHapticFeedbackEnabled(false)`
  on any view you buzz for yourself.

Three more findings from building it:

- **An alarm vibration outranks a tap.** While a `USAGE_ALARM` vibration
  plays, Android drops a `USAGE_TOUCH` one (`ignored_for_higher_importance`),
  so a button's tap tick doesn't cut a long buzz short. Call
  `Vibrator.cancel()` explicitly.
- **The LightOS keyboard (`app.lightphonekeyboard/.LightImeService`) works in
  plain apps, but hides a bottom bar.** It paints a black strip above its
  keys that isn't part of its reported inset. Its touch region starts at
  y 538, but it draws from about 470, so under `adjustResize` a bottom
  button bar ends up drawn over. Put form actions at the top. Its ↵ key
  sends `IME_ACTION_DONE`.
- **Focus falls back to a list when the keyboard closes**, and Android's
  default focus highlight paints a grey box over it. Set
  `android:defaultFocusHighlightEnabled=false` in the theme. Set
  `colorAccent` to white too, or the text cursor is teal.

Phase 2 reminders are therefore local exact alarms plus a notification. That
means no sender, no Light push relay, and no `INTERNET` permission.

## iMessage into Chats


Working **both directions** as of 2026-09-26. The path is **Messages.app on a
Mac → `chat.db` → mautrix-imessage → Beeper hungryserv → Matrix →
`com.lightphone.chats`**, and every hop was verified on-device. Receiving
worked as soon as TCC was solved; sending needed a database patch — see
*Sending was broken* below.

### Chats is a real Matrix client

The finding that generalises: **Light's Chats renders arbitrary Matrix rooms
and decrypts megolm.** It is not limited to the two rooms a fresh Beeper
account ships with.

- A room created through the raw client API appeared in the list within 60
  seconds, with a working conversation view and composer.
- Idle, it long-polls `/sync` on a 30 s timeout returning **176 B** — an empty
  response carrying just `next_batch`. When events arrive it switches to
  chunked responses in 157–272 ms. Watch it with
  `adb logcat -d | grep MatrixRepository`.
- "Note to self" is `m.megolm.v1.aes-sha2` and renders in full on the phone,
  so E2EE works.

So **any** network Beeper can bridge should reach this phone. iMessage is
just the first instance.

Two corollaries worth writing down, because both cost hours:

An empty Beeper account looks exactly like a broken one. `bbctl whoami`
listing only `hungryserv` means **zero bridges** — hungryserv is Beeper's own
homeserver process, not a connector. Chats was syncing perfectly against
nothing.

An encrypted event in a room with **no `m.room.encryption` state** shows as
`[Encrypted message]`. That is correct behaviour against a malformed room —
no megolm session was ever established — and not evidence that the client
lacks E2EE. Don't conclude from a hand-built test room.

### imessagego is a dead end on current macOS

`bbctl` offers two iMessage types. **`imessagego`** (binary
`beeper-imessage`) registers a *new device* against Apple's IDS, so it needs
validation data from `mac-registration-provider` — which supports Apple
Silicon only on 12.7.1, 13.3.1, 13.5–13.6.4 and 14.0–14.3, and prints
"unsupported" and exits on anything newer. Both halves are archived:
`beeper/imessage` 2025-04, `beeper/mac-registration-provider` 2026-04. On
macOS 26 this cannot work, and the "registration code" it prompts for is
unobtainable.

Use **`imessage`** instead — `mautrix-imessage`, still maintained, which
puppets a Mac already signed into iMessage. No registration code, no device
registration, nothing for Apple to revoke.

```sh
bbctl run --type imessage --param imessage_platform=mac sh-imessage
```

`platform` options are `mac`, `mac-nosip`, `ios`, `android`, `bluebubbles`;
`mac` needs no BlueBubbles server.

### The TCC trap

`mautrix-imessage` must read `~/Library/Messages/chat.db`, which needs **Full
Disk Access**. Two traps, in order:

1. **macOS attributes file access to the *responsible process*** — the app at
   the head of the chain, not the binary doing the reading. Launched from a
   terminal, TCC checks **that terminal**, so granting FDA to
   `mautrix-imessage` does nothing. Granting it to the terminal works but
   hands FDA to every command ever run there.
2. **TCC's FDA list is unreliable for loose Unix executables.** Adding the
   bare ad-hoc-signed binary did not take effect even under `launchd`, where
   the binary *is* its own responsible process.

The fix is a minimal `.app` wrapper plus a LaunchAgent, which settles
attribution and persistence together:

```sh
APP="$HOME/Applications/iMessage Bridge.app"
BIN="$HOME/Library/Application Support/bbctl/prod/binaries"
mkdir -p "$APP/Contents/MacOS"
cp "$BIN/mautrix-imessage" "$BIN/libolm.3.dylib" "$APP/Contents/MacOS/"
# Info.plist: CFBundleExecutable=mautrix-imessage,
#             CFBundleIdentifier=ist.solo.imessagebridge, LSBackgroundOnly=true
codesign --force -s - "$APP"
```

`libolm.3.dylib` must sit beside the executable — the binary's rpath includes
`@executable_path`, and without it the copy dies with
`Library not loaded: @rpath/libolm.3.dylib`.

Then grant FDA to **iMessage Bridge** in System Settings → Privacy & Security,
and verify rather than guess:

```sh
"$APP/Contents/MacOS/mautrix-imessage" --check-permissions   # exit 43 = denied, 0 = good
```

Run it from a LaunchAgent (`ist.solo.imessage-bridge`) with `WorkingDirectory`
set to `~/Library/Application Support/bbctl/prod/sh-imessage` — the config's
SQLite URI is relative (`file:mautrix-imessage.db`). `launchctl print
gui/$(id -u)/ist.solo.imessage-bridge` showing `last exit code = 0` is the
proof FDA actually took, since a terminal run will still fail.

### Sending was broken until `last_seen_handle` was filled in

Receiving worked from the first sync; every outbound message from the LP3
failed. Two errors, always in this order:

```
Can't get chat id "any;-;+1732…"      (-1728)
Can't make any into type constant.    (-1700)
```

This build merges each DM's iMessage, SMS and RCS chats into a single portal
whose GUID carries the pseudo-service `any` — all 36 rooms are `any;-;…`, and
the 39 `iMessage;-;…` and 39 `SMS;-;…` portals beside them have no room at all.
To send, the Mac connector is meant to read `portal.last_seen_handle` for the
*real* service. It logs which source it used — `(portal guid)` or
`(last seen handle)` — and that field is the tell.

The column was empty on all 36 rooms, so the connector fell back to the `any`
GUID, which neither AppleScript path can use:

```applescript
set theService to 1st service whose service type = %s   -- %s = any → -1700
on error number -2753                                   -- only -2753 is caught
```

A migration-ordering bug rather than anything configurable:

```sql
ALTER TABLE portal ADD COLUMN last_seen_handle TEXT NOT NULL DEFAULT '';
UPDATE portal SET last_seen_handle=guid WHERE guid LIKE '%;-;%';
```

On a fresh install that `UPDATE` runs before any portal exists, so it matches
nothing — and the insert path never sets the column. There is no config knob
for it; `disable_sms_portals` and `force_uniform_dm_senders` are both unrelated
(the latter rewrites the *sender* in a DM, not the chat).

The real service per chat is recoverable, because `message.sender_guid` does
carry it. Stop the agent, back up the database, then:

```sql
UPDATE portal
SET last_seen_handle = (
  SELECT m.sender_guid FROM message m
  WHERE m.portal_guid = portal.guid AND m.sender_guid <> ''
  ORDER BY m.timestamp DESC LIMIT 1
)
WHERE mxid IS NOT NULL AND mxid <> ''
  AND guid LIKE 'any;%'
  AND EXISTS (SELECT 1 FROM message m2
              WHERE m2.portal_guid = portal.guid AND m2.sender_guid <> '');
```

then `launchctl kickstart -k gui/$(id -u)/ist.solo.imessage-bridge`. Portal
GUIDs and mxids are untouched, so nothing changes on the phone — no new rooms,
no orphans, no re-backfill. The bridge reads the values on startup and does not
overwrite them.

**What actually delivers is the buddy fallback, not the chat id.** Even with a
correct GUID the first attempt still fails `-1728` (`Can't get chat id
"SMS;-;+1732…"`); the retry then succeeds because `service type = SMS` is a
valid AppleScript constant where `any` was not. So this fix depends on the
service name being one Messages knows — which makes the five `RCS` rooms
suspect, since `RCS` is probably not a valid `service type`. Untested; if they
fail with `-1700`, point those five at `SMS` with the same UPDATE shape.

Worth knowing before investing in this: **only 12 of the 36 bridged threads are
actually iMessage.** 19 are SMS and 5 are RCS, and the LP3 receives both
natively over its own SIM — so those 24 arrive twice. The 12 iMessage threads
are the only ones that need a bridge at all.

### Loose ends

- **Contacts needs a purpose string, not just a grant.** With `contacts_mode:
  mac` the bridge uses Contacts.framework, which macOS refuses outright unless
  the bundle declares `NSContactsUsageDescription` — the request is denied with
  no prompt, the log says `Failed to get contact access: Access Denied`, and the
  app never appears under Privacy & Security → Contacts (that pane has no `+`,
  so an app must ask before it can be toggled). Add the key, re-sign, restart;
  the log then says `Contact access is allowed` and displaynames are PUT to
  Matrix on the next sync. 22 of 39 handles resolved; the rest are shortcodes
  (`67587`), businesses, and SMS-relay artifacts suffixed `(smsfp_of)` /
  `(smsft_or)` whose base numbers aren't in the address book either — nothing to
  recover there.
- **Editing the bundle breaks Full Disk Access.** An ad-hoc signature's
  designated requirement is pinned to its cdhash, so *any* change to the bundle
  — adding one `Info.plist` key included — invalidates the FDA grant. The bridge
  then crash-loops on `unable to open database file: operation not permitted`
  with `last exit code = 14`, every 15 s per `ThrottleInterval`. Fix is to
  toggle the entry off/on (or remove with `−` and re-add with `+`) in Privacy &
  Security → Full Disk Access. Set every plist key you need *before* granting
  FDA — especially when standing this up on the Studio, so it's one grant.
- **Attachments.** `no such file` under `~/Library/Messages/Attachments/…` is
  iCloud offloading, not permissions — the bytes were never downloaded.
- **Sleep.** A LaunchAgent survives logout and terminal exit, but not sleep.
  On a laptop, bridging stops with the lid. The Studio is the real home for
  this — same recipe, plus Messages.app signed in there.
- **`bbctl` needs a real TTY.** Its prompts emit `ESC[6n` (cursor-position
  query; the parser regex `\x1b\[(\d+);(\d+)R$` is in the binary) and block
  until a terminal answers. Piped, or under a bare pty, it hangs or reads EOF
  and exits 0 having done nothing — which looks exactly like "not logged in".
  `expect` replying `ESC[50;120R` drives it fine. It also reuses a running
  Beeper Desktop session, so no email code is needed.
- **A waiting `bbctl` prompt is not a shell.** A stray
  `bbctl run --type imessagego` left at "Enter iMessage registration code"
  swallowed a pasted shell command as the token and regenerated `config.yaml`
  around it, silently. If typed commands seem to vanish, check for a `bbctl`
  process sitting on a tty.

## Other quirks

- Since v568, LightOS force-foregrounds itself on screen-off. If Molly Light
  notifications misbehave: `adb shell settings put system light_force_focus_level 1`
  (alerts only; `2` never auto-foregrounds; `0` default). Test any
  background-audio app with the screen off before trusting it.
- Permission refused by UI? `adb shell pm grant <pkg> <permission>` (e.g.
  `android.permission.CAMERA` for `com.gios.lightcamera`). If it silently
  reverts, the app came from a non-Play source — clear the Android 13+
  restriction first with
  `adb shell appops set <pkg> ACCESS_RESTRICTED_SETTINGS allow`.
- **Rotating the phone resets whatever you were typing.** A rotation is a
  configuration change, so the activity is destroyed and rebuilt; apps that
  don't save instance state lose the input — Aurora Store's login screen does
  exactly this, which is easy to hit mid-password. The LP3 has no reason to
  auto-rotate, so lock it: `adb shell settings put system accelerometer_rotation 0`
  and `adb shell settings put system user_rotation 0` (0 = portrait).
- Turn USB debugging off without the keyboard dance:
  `adb shell settings put global adb_enabled 0` (re-enabling later needs the
  keyboard route again).
- Don't battery-hibernate Molly. (Molly Light has since been replaced
  by Signal; see Removed.)

## Removed


- **Endel** (`com.endel.endel` 3.135.887) — installed then uninstalled
  2026-09-19. It **hard-fails on Play licensing**:
  `com.pairip.licensecheck.LicenseActivity` takes over from `RootActivity` at
  launch and shows an empty dialog with only CLOSE. The app never reaches a
  login screen, so no credential workaround applies — PairIP wants a Play
  integrity attestation and there is no GMS to answer it (microG couldn't forge
  one either; see quirks). **Use the web player at `app.endel.io` in Chromium**
  — verified rendering on-device, and one Endel subscription covers all
  platforms. Untested: whether its audio survives screen-off.

  Note the failure mode, because it invalidates a lazy smoke test: a PairIP
  dialog *is* the app's own package, so "is `<pkg>` the foreground activity?"
  reports success while the app is dead. Check for a usable screen, not a
  foregrounded package.

- **Verses** (`com.zacksimpson.verses` 1.0.1) — uninstalled 2026-09-19 because
  it ships signed with the public `lightsdk-dev` key (`b9c33e29…5f28`), so any
  party could publish a forged update for it.

- **LightChat** (`com.gios.lightchat` 2.38.81) — uninstalled 2026-09-19 with
  `adb uninstall com.gios.lightchat`. It was a user app in `/data/app`
  (`flags=0x0`) installed by BrightMarket, so a clean uninstall worked with no
  `pm disable-user` fallback needed. BrightMarket may re-offer it and an OTA
  could re-provision it — re-check after LightOS updates.

- **Molly Light** (`im.mollylight.app`) — replaced by the official Signal
  app (`org.thoughtcrime.securesms`), installed through Aurora. Its signer is
  Signal's own key, not a Play re-signing key, and the legacy signer's
  SHA-256 matches the fingerprint signal.org publishes
  (`29:F3:4E:5F:…:76:BA:26`), an independent check the other Play-sourced
  apps don't have.

## Evaluated and rejected

- **iMessage bridges — BlueBubbles, 2026-09-19.** Dead end on LightOS. The
  Android client receives push via Firebase Cloud Messaging, which requires
  GMS/microG — neither of which is *installable* on this device at all
  (locked bootloader, `sys.oem_unlock_allowed = 0`; see quirks). So this is
  permanent, not a house-rule preference: notifications cannot arrive. The only GMS-free path is BlueBubbles' Foreground
  Service socket, which needs a non-rotating server URL — meaning DDNS plus
  port forwarding, regressing the no-ports-forwarded posture. Independently:
  the macOS server half is stagnant (last release v1.9.9, May 2025) while
  the client ships monthly, and the setup docs instruct
  `allow read, write: if true` on Firestore — publishing the tunnel URL and
  letting anyone repoint clients at a MITM server that harvests the server
  password (upstream issue #783, open since March 2026). Applies to any
  FCM-based bridge, not just BlueBubbles.

  **Superseded 2026-09-26** — the actual goal, iMessage on the LP3, was
  met without FCM at all: `mautrix-imessage` into Beeper, read in the
  first-party Chats tool over Matrix. See *iMessage → Chats* above. The
  reasoning here still stands for any bridge whose Android client needs
  FCM push.

## History

- **2026-09-20: Menu took every plain app.** The first configuration after
  turning the external-tools filter off put all 18 plain apps in Menu:

  The flag was `0`; Menu
  held all 18 plain apps across 4 pages, ordered by use: Molly, Claude,
  Slack, Spotify, Home, 1Password / Todoist, Bluesky, Sonos, Apple TV, Roll,
  Controls / Obtainium, Market, Mailbox, Aurora, Composer, QR. The toolbox was
  down to three pages — Phone, Settings, Alarm, Album, Calculator, Calendar /
  Directions, Directory, Timer, Weather, Chats, Passes / News, Review, Menu.

  Menu signs with its own private identity —
  `~/.android-keys/soloist-menu.jks`, alias `soloist-menu`, 4096-bit RSA,
  password generated by and held in 1Password at
  `op://Private/Menu signing key/password`, same pattern as Review. It is the
  only route to those 18 apps, so a forgeable key would have taken the whole
  shelf; `scripts/verify-release.sh` refuses a signer mismatch, a debuggable
  build, or backups enabled.

  To undo: `adb shell settings put system LIGHTOS_SHOW_EXTERNAL_TOOLS 1`.
  Menu's list is ordinary app data, so it survives the flag either way, and
  the entries can be edited in-app rather than over adb. On a debug build
  `adb shell run-as ist.solo.menu cat shared_prefs/menu.xml` reads it
  directly — that's how the 18 were written without 18 dialogs.

  The arrangement has held since. As of 2026-09-27 Menu holds 21 entries
  (Signal replaced Molly; StoryGraph, Remote, QR and Web Tools joined; Apple
  TV left), and the most-used apps are also on Controls button shortcuts.
  See setup.md.

## Status to re-check (October 2026)


- Official **Tool Manager** (ADB-free local install over Wi-Fi): merged in
  light-sdk 2026-09-09. **Not active on 582** as of 2026-09-19 — only port 5555
  (adb-over-TCP) is listening, nothing on 54449, though `LightSdkService` is
  running with live tool connections, so it may start on demand from LightOS
  settings. Would obsolete the keyboard dance. Note
  `readwise-review/docs/light-sdk-disclosure.md`: `uploadTool` disables TLS
  verification and its HMAC doesn't cover the APK bytes — LAN-trusted only.
- **Tool Library** (Light-vetted community tools in the dashboard): due
  October; `npm run light:op -- tools` still shows only the 14 first-party
  tools as of 2026-09-12 — when community entries appear there, cloud install
  becomes possible.
