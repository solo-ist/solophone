# Sideloaded tools — LP3 (LP3-SERIAL-REDACTED)

Installed 2026-09-12 on LightOS `572-release-lp3` (Android 14 / API 34) via
`adb install -r`. Every APK's signing cert was checked with
`apksigner verify --print-certs` before install; checksums verified where
published. TOFU = trust-on-first-use — no published fingerprint, so the cert
recorded here is the baseline; if it ever changes on an update, stop.

| Tool | Version | Package | Source | Cert SHA-256 | Integrity |
|---|---|---|---|---|---|
| Obtainium | 1.6.15 | `dev.imranr.obtainium` | github.com/ImranR98/Obtainium | `b353601f6a1d5fd6603ae2f50be80cf301367b86b6ab8b1f66243da96cd57362` | checksum ✅ |
| Molly Light | 1.7 | `im.mollylight.app` | github.com/jabberbox/molly-light | `a10ce031ca47c84a78998757f9afec57174c0d17061e7efd286a10596bdb9cc7` | TOFU |
| Composer | 1.0.2 | `com.zacksimpson.composer` | github.com/zacksimpson/composer-tool | `c36238493aa1055c58ca19a350e68c22e53793226887d0bee290611bf1fd12c3` | TOFU |
| Roll (LightCamera) | 3.7.159 | `com.gios.lightcamera` | github.com/gi-os/LightCamera | `d11cf9eecbfd5b482946e317f1dbf785a594234e313d7aa92042be3616b66dc3` | TOFU |
| BrightNews | 3.6.0 | `com.lightrss.reader` | github.com/gi-os/BrightNews | `c6902aa1870b4ffa2fd0cd627643dc8ddee7cc0fdbd1752febb3d911092d8ec5` | checksum ✅ + matches published pin ✅ |
| Review (own build, 2026-09-13) | 0.4.1 | `com.soloist.review` | local: `~/Code/readwise-review` (light-sdk scaffold) | lightsdk-dev key (checked into light-sdk) | built + installed from source |

**Review** is a personal Readwise Daily Review tool (Kotlin/Compose on the
light-sdk; Ktor → `readwise.io/api/v2/review/`). ⚠️ The installed APK has the
Readwise API token baked in via `READWISE_TOKEN` at build time (sourced from
1Password: `op://<vault>/<item>/<field>`) — never share or
publish this APK. Rebuild + reinstall:
`cd ~/Code/readwise-review && READWISE_TOKEN=$(op read "op://<vault>/<item>/<field>") JAVA_HOME=$(/usr/libexec/java_home) GITHUB_ACTOR=<gh user> GITHUB_TOKEN=$(gh auth token) ./gradlew :tool:assembleDebug && adb install -r tool/build/outputs/apk/debug/tool-debug.apk`

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

- `https://github.com/jabberbox/molly-light`
- `https://github.com/zacksimpson/composer-tool`
- `https://github.com/gi-os/LightCamera`
- `https://github.com/gi-os/BrightNews` — APK regex filter `LightRSS-.*\.apk`, prereleases off

## Known quirks / levers

- Sideloaded tools sit at the bottom of the toolbox; can't be reordered,
  renamed, or hidden (v572 limitation).
- Since v568, LightOS force-foregrounds itself on screen-off. If Molly Light
  notifications misbehave: `adb shell settings put system light_force_focus_level 1`
  (alerts only; `2` never auto-foregrounds; `0` default).
- Never install microG/GMS (destabilizes the phone; Molly doesn't need it).
  Don't battery-hibernate Molly.
- Permission refused by UI? `adb shell pm grant <pkg> <permission>` (e.g.
  `android.permission.CAMERA` for `com.gios.lightcamera`).
- Turn USB debugging off without the keyboard dance:
  `adb shell settings put global adb_enabled 0` (re-enabling later needs the
  keyboard route again).

## Status to re-check (October 2026)

- Official **Tool Manager** (ADB-free local install over Wi-Fi): built and
  merged in light-sdk (2026-09-09) but "not yet rolled out to LightOS
  production builds" — may obsolete the keyboard dance entirely.
- **Tool Library** (Light-vetted community tools in the dashboard): due
  October; `npm run light:op -- tools` still shows only the 14 first-party
  tools as of 2026-09-12 — when community entries appear there, cloud install
  becomes possible.
