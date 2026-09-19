# Sideloaded tools — Light Phone III

First installed 2026-09-12; re-verified against the live device 2026-09-19 on
LightOS `582-release-lp3` (Android 14 / API 34, model TLP301). Installed via
`adb install -r`. Every APK's signing cert was checked with
`apksigner verify --print-certs` before install; checksums verified where
published. TOFU = trust-on-first-use — no published fingerprint, so the cert
recorded here is the baseline; if it ever changes on an update, stop.

| Tool | Version | Package | Source | Cert SHA-256 | Integrity |
|---|---|---|---|---|---|
| Obtainium | 1.6.17 | `dev.imranr.obtainium` | github.com/ImranR98/Obtainium | `b353601f6a1d5fd6603ae2f50be80cf301367b86b6ab8b1f66243da96cd57362` | checksum ✅ |
| Molly Light | 1.7 | `im.mollylight.app` | github.com/jabberbox/molly-light | `a10ce031ca47c84a78998757f9afec57174c0d17061e7efd286a10596bdb9cc7` | TOFU |
| Composer | 1.0.2 | `com.zacksimpson.composer` | github.com/zacksimpson/composer-tool | `c36238493aa1055c58ca19a350e68c22e53793226887d0bee290611bf1fd12c3` | TOFU |
| Roll (LightCamera) | 3.7.159 | `com.gios.lightcamera` | github.com/gi-os/LightCamera | `d11cf9eecbfd5b482946e317f1dbf785a594234e313d7aa92042be3616b66dc3` | TOFU |
| BrightNews | 3.6.0 | `com.lightrss.reader` | github.com/gi-os/BrightNews | `c6902aa1870b4ffa2fd0cd627643dc8ddee7cc0fdbd1752febb3d911092d8ec5` | checksum ✅ + matches published pin ✅ |
| BrightMarket | 1.31.62 | `com.gios.brightmarket` | github.com/gi-os/BrightMarket | `c15078bcb72a89c67efb54d1a9fc1b00cc88da578891f8e96233a7d279550df6` | TOFU (`CN=BrightMarket, OU=gi-os`) |
| BrightMailbox | 2.30.34 | `com.gios.brightmailbox` | gi-os (via BrightMarket) | `ab866f2a03fcd4d8e88d2da1bb3e295d080ac28f46ae6c5bb8c9b9d9cc9e23c9` | TOFU (`CN=BrightMailbox, OU=gi-os`) |
| BrightControl ("Controls") | 4.34.293 | `com.gios.lightcontrol` | gi-os (via BrightMarket) | `a38858d990bb61057ef53d1f8aa3c5854d01f68585b34f115793b06298b593e8` | TOFU (`CN=LightControl, OU=gi-os`) |
| Verses | 1.0.1 | `com.zacksimpson.verses` | zacksimpson (via BrightMarket) | `b9c33e29b0ccad2bff11acab55f65a3c517ef4bc92cd9c77785366fa353d5f28` | ⚠️ **public lightsdk-dev key** — see below |
| Review (own build) | 0.6.2 | `com.soloist.review` | local: `~/Code/readwise-review` (light-sdk scaffold) | `83ac3b733db804765d4a888788d0a47d362e9682488712836b3ca449133c2da7` (`CN=soloist review`) | built + installed from source |

Also present but **not sideloaded**: `at.bitfire.davdroid` 2.5.1-**ose-light**
is a Light-customized *system* app at `/product/app/DAVx5`, installer
`com.lightos`. See the Calendar section.

⚠️ **Verses is signed with `CN=LightSDK Dev`** — the keystore checked into
light-sdk (`b9c33e29…5f28`, `storePassword = "android"`). That key is public,
so anyone can forge an installable update for that package. Nothing to be done
about it from here beyond knowing: don't treat a Verses update as
authenticated, and never reuse that key for anything of your own.

**Review** is a personal Readwise Daily Review tool (Kotlin/Compose on the
light-sdk; Ktor → `readwise.io/api/v2/review/`). Since 0.6.0 the Readwise token
is **provisioned on-device** — scan it as a QR code from the local-only page in
`~/Code/solo.ist/qr/index.html`, or type it with the LightOS keyboard. It is
encrypted at rest under an Android Keystore key (AES/GCM, `token.bin` in
`filesDir`) and is no longer baked into the APK at build time. Signing uses the
private `soloist` keystore kept outside every repo, password read from
1Password at build time. Rebuild + reinstall:

```sh
cd ~/Code/readwise-review
REVIEW_SIGNING_PASSWORD=$(op read "op://<vault>/Review signing key/password") \
JAVA_HOME=$(/usr/libexec/java_home) \
GITHUB_ACTOR=<gh user> GITHUB_TOKEN=$(gh auth token) \
  ./gradlew :tool:assembleRelease
tool/scripts/verify-release.sh
adb install -r tool/build/outputs/apk/release/tool-release.apk
```

## Android-layer entry (as it actually worked on this phone, v572)

1. Dashboard Developer Mode was already ON (`npm run light:op -- dev-mode show`
   to check; `dev-mode on|off` toggles it via the cloud API). Reboot the phone
   after changing it.
2. LightOS Settings → Developer → External Tools → **Any tools**.
3. Plug in a plain USB-C keyboard → **Ctrl+B** (Mac keyboard; Win+B otherwise)
   opens Chromium → **Alt+Tab** opens the app switcher → open an app's App
   Info → tap the Settings app's icon → "open" → Android Settings.
4. About phone → Build number ×7 → System → Developer options → USB debugging.
5. `adb devices` on the Mac; accept the Allow prompt (always allow).

adb lives at `~/Library/Android/sdk/platform-tools/adb`; apksigner at
`~/Library/Android/sdk/build-tools/34.0.0/apksigner`. macOS: use
`shasum -a 256 -c`, not `sha256sum` (Obtainium's `.sha256` is a bare hash —
compare manually).

## Obtainium repo list (add on-phone)

Obtainium is the source of truth for updates; BrightMarket is discovery-only.

- `https://github.com/ImranR98/Obtainium` — so it self-updates
- `https://github.com/jabberbox/molly-light`
- `https://github.com/zacksimpson/composer-tool`
- `https://github.com/gi-os/LightCamera`
- `https://github.com/gi-os/BrightNews` — APK regex filter `LightRSS-.*\.apk`, prereleases off
- `https://github.com/gi-os/BrightMarket`

Three things Obtainium structurally **cannot** track, so don't expect full
coverage: apps distributed only as Play App Bundles (it can't install split
APKs — those need `adb install-multiple` by hand), the locally built Review
tool (no public release), and anything BrightMarket installed that has no
GitHub release feed.

## Full Android apps (2026-09-19)

Play-only apps, installed via **Aurora Store** 4.8.4 (`com.aurora.store`, from
F-Droid, `CN=FDroid, O=fdroid.org`, cert
`5c83c7672b929955dc0a1db89a5e6ae4389e2eae7ec939956041694e5815f532`) signed in
with a real Google account. Bluesky came straight from GitHub instead.

| App | Package | Version | Splits | Cert SHA-256 (TOFU) |
|---|---|---|---|---|
| Bluesky | `xyz.blueskyweb.app` | 1.132.0 | 1 | `40058ec68a355521d08df24998cf99a71491335c65d75885039e80c025aaddff` |
| Spotify | `com.spotify.music` | 9.1.82.2161 | 4 | `6505b181933344f93893d586e399b94616183f04349cb572a9e81a3335e28ffd` |
| Todoist | `com.todoist` | v12282 | 3 | `7c89a7eb186f7b96f02f45fb067679fa54efebbbe67f34a0e7ca851e355b3a44` |
| Slack | `com.Slack` | 26.09.30.0 | 3 | `33533619756e8701a82e7887565b152dc348188711ebb5c48d073b2c942f7e41` |
| Claude | `com.anthropic.claude` | 1.260916.19 | 4 | `305a1e8a432e5ec0c612b2465359c3b88e3c95d6253599ac6088562b818b64a0` |
| Endel | `com.endel.endel` | 3.135.887 | 24 | `9289c30cee30ca40278504d5d375c93ace705ebf57a444a9e30a3132d3345d19` |
| Sonos | `com.sonos.acr2` | 89.00.51 | 3 | `7c34eb3cfbda05faf56e8890a2abbac14b3036e6e4358849b98e8819b6b7b329` |
| 1Password | `com.onepassword.android` | 8.12.36 | 4 | `b35b68d5ce8450557c6a55fd64b51feac110cb36d6a3521c5948db3a380a34a9` |

⚠️ These certs are **Play App Signing** keys, not the vendors' own — 1Password's
DN, for instance, reads `CN=Android, O=Google Inc.`. They still work as a TOFU
baseline for detecting a change, but the DN does not identify the vendor the
way the gi-os certs above do.

Seven of the eight are usable. **Endel is not — it hard-fails on Play
licensing.** `com.pairip.licensecheck.LicenseActivity` takes over from
`RootActivity` at launch and shows an empty dialog with only CLOSE; the app
never reaches a login screen, so no credential workaround applies. PairIP wants
a Play integrity attestation and there is no GMS to answer it (and microG
couldn't forge one either — see quirks). **Use the web player at
`app.endel.io` in Chromium instead** — verified rendering on-device
2026-09-19, and one Endel subscription covers all platforms. Untested: whether
its audio survives screen-off.

Note the failure mode, because it invalidates a lazy smoke test: a PairIP
license dialog *is* the app's own package, so "is `<pkg>` the foreground
activity?" reports success while the app is dead. Check for a usable screen,
not a foregrounded package.

**Claude is fine and needs no Google.** Its login screen has an
"Enter your email" field directly under the Google button — email plus a
verification code. Only Bluesky, Spotify, Claude and 1Password have been
verified past their sign-in walls; Slack, Todoist and Sonos are installed and
launching but unproven beyond that.

**None of them will ever notify.** They are all FCM-only and there is no GMS;
see the UnifiedPush note under quirks. `POST_NOTIFICATIONS` is granted to each
anyway, because locally scheduled notifications (Todoist reminders, alarms)
don't go through FCM.

Sonos additionally needs location, or speaker discovery fails with
`SecurityException: UID … has no location permission` on `startScan`:

```sh
for p in ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION NEARBY_WIFI_DEVICES; do
  adb shell pm grant com.sonos.acr2 android.permission.$p
done
```

1Password is wired up as the system autofill provider:

```sh
adb shell settings put secure autofill_service \
  com.onepassword.android/com.onepassword.android.autofill.services.AutofillService
```

### Installing from Aurora over adb

Aurora's installs can't be driven blind. Android 14 blocks it from raising the
confirm dialog whenever it isn't visibly foregrounded:

```
Background activity launch blocked [callingPackage: com.aurora.store …
  intent: act=android.content.pm.action.CONFIRM_INSTALL] result code=102
```

So the download completes and the install silently never happens. What works:

1. `adb shell settings put system light_force_focus_level 2` (stop LightOS
   stealing focus) and `adb shell svc power stayon usb` (stop the screen
   sleeping mid-download).
2. `adb shell am start -a android.intent.action.VIEW -d "market://details?id=<pkg>"`,
   then tap **Open** on Aurora's `DeepLinkConfirmActivity`.
3. Tap Aurora's own Install button — at `input tap 800 648` in its Compose
   layout. Aurora's UI exposes no text to `uiautomator`, so it's coordinates or
   a screenshot; the system dialog underneath *is* readable by `uiautomator`.
4. Poll until `com.android.packageinstaller` is foreground, then tap **INSTALL**
   on the system dialog. Tapping via `adb input` is fine — only *raising* the
   dialog is restricted.

**Never `pm clear com.aurora.store` to clear a stuck install.** It wipes the
Google session too. Abandon the specific session instead:
`adb shell pm install-abandon <sessionId>` (ids from `dumpsys package installer`).

## Controls (BrightControl) — adb setup

LightOS ships no Settings screens for what this app needs, so each grant is
made once over adb. The app's own Setup screen lists four grants and shows the
exact command for each — **read those rows before improvising**; see the
gotchas for why that matters.

```sh
P=com.gios.lightcontrol

# 0. REQUIRED FIRST — Android 13+ blocks accessibility for apps installed from
#    a non-Play source. BrightMarket installed this one, so without clearing
#    the restriction the accessibility setting silently reverts to null.
adb shell appops set $P ACCESS_RESTRICTED_SETTINGS allow

# 1. the key service — EXACTLY this one component, nothing appended
adb shell settings put secure enabled_accessibility_services \
  com.gios.lightcontrol/com.gios.lightcontrol.keys.ControlService
adb shell settings put secure accessibility_enabled 1

# 2. prot=signature|privileged|development|installer|role — `development`
#    is what lets adb grant it
adb shell pm grant $P android.permission.WRITE_SECURE_SETTINGS

# 3. appops, not permissions — `pm grant` FAILS on these
#    (WRITE_SETTINGS is prot=signature|appop|pre23|preinstalled|role)
adb shell appops set $P WRITE_SETTINGS allow
adb shell appops set $P SYSTEM_ALERT_WINDOW allow

# 4. runtime perms; fine location must precede background location
for p in POST_NOTIFICATIONS READ_PHONE_STATE READ_CONTACTS READ_CALL_LOG \
         ANSWER_PHONE_CALLS BLUETOOTH_SCAN BLUETOOTH_CONNECT RECORD_AUDIO \
         READ_MEDIA_IMAGES ACCESS_COARSE_LOCATION ACCESS_FINE_LOCATION; do
  adb shell pm grant $P android.permission.$p
done
adb shell pm grant $P android.permission.ACCESS_BACKGROUND_LOCATION

# 5. lock-screen notifications + survive Doze
adb shell cmd notification allow_listener \
  $P/com.gios.lightcontrol.lock.LockNotifications
adb shell dumpsys deviceidle whitelist +$P
```

Three gotchas, each of which cost real time:

- **Never `am force-stop` this app after granting.** Force-stopping clears
  `enabled_accessibility_services` outright and you start over. To make the app
  re-read its grant state, press Back until the activity finishes and relaunch
  — the status rows are computed on activity *creation*, so bringing an
  existing instance to front shows a stale snapshot.
- **The accessibility value must be exactly the single component above.**
  Appending `:…keys.KeyboardService` leaves both services genuinely bound in
  `dumpsys accessibility`, but the app's own check still reports OFF.
  `KeyboardService` ("Keyboard replace") is an opt-in feature to enable inside
  the app, not part of this grant.
- **Do not enable `.adb.AdbPairReader`.** It is a third accessibility service
  whose only purpose is scraping the wireless-debugging pairing dialog so the
  phone can self-grant `WRITE_SECURE_SETTINGS` (Shizuku-style). Over USB adb it
  is unnecessary, and it is the most invasive of the three.

Verify — all four rows in the app's Setup screen should read ON:

```sh
adb shell dumpsys package $P | sed -n '/runtime permissions/,/^$/p'
adb shell dumpsys accessibility | sed -n '/Bound services/,/Enabled services/p'
adb shell appops get $P WRITE_SETTINGS
adb shell settings get secure enabled_notification_listeners
```

## Calendar / DAVx5

Calendar sync already works and is **not** something to build.
`at.bitfire.davdroid` `2.5.1-ose-light` ships as a *system* app at
`/product/app/DAVx5` (installer `com.lightos`) and syncs
`com.android.calendar` every 15 minutes — `PERIODIC SUCCESS`, ~1390 syncs as of
2026-09-19. Contacts address books sync on the same account.

The configured account is **Light's own Nextcloud**, not Google:
`https://production-nextcloud25.lightphonecloud.com/remote.php/dav/calendars/<uuid>/personal/`,
display name "Personal". Any other calendar is therefore a *second* account.

Because DAVx5 here is a system app it **cannot be updated from F-Droid** —
signature mismatch, and no root. 2.5.1 predates DAVx5's Google OAuth support,
so a Google calendar needs one of:

1. Light Dashboard → connect the Google account and let Light mirror it into
   the Nextcloud the existing account already syncs. Almost certainly the
   intended path.
2. A second DAVx5 account with a **Google app password** (needs 2FA on, and
   Workspace admin must permit app passwords).
3. **ICSx5** (`at.bitfire.icsdroid`, F-Droid — a different package, so no
   signature conflict) subscribed to a private iCal URL. Read-only, always works.

Verify:

```sh
adb shell content query --uri content://com.android.calendar/calendars \
  --projection _id:account_name:account_type:calendar_displayName:visible
```

## Known quirks / levers

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
  and Mailbox. Six per page. Whether they can be reordered, renamed, or hidden
  is still unverified.
- The toolbox is **text labels only, no icons** (light-sdk#174); the label is
  `getApplicationLabel()`, fixed at build time.
- Since v568, LightOS force-foregrounds itself on screen-off. If Molly Light
  notifications misbehave: `adb shell settings put system light_force_focus_level 1`
  (alerts only; `2` never auto-foregrounds; `0` default). Test any
  background-audio app with the screen off before trusting it.
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
- Don't battery-hibernate Molly.
- **Push without GMS is possible, but only via UnifiedPush.** LightOS ships a
  distributor at `com.lightos/com.thelightphone.sdk.server.LightPushDistributor`
  — the only one on the device — and Molly Light uses it. FCM-only apps get
  nothing. A light-sdk tool can receive push through
  `ToolEntryPoint.onPushNotification(data: ByteArray)`.
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

## Removed

- **LightChat** (`com.gios.lightchat` 2.38.81) — uninstalled 2026-09-19 with
  `adb uninstall com.gios.lightchat`. It was a user app in `/data/app`
  (`flags=0x0`) installed by BrightMarket, so a clean uninstall worked with no
  `pm disable-user` fallback needed. BrightMarket may re-offer it and an OTA
  could re-provision it — re-check after LightOS updates.

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
