# Setup

How to put the loadout on a Light Phone III, in order. Each step says what to
run and how to check it took. The reasons, and the dead ends, are in
[field-notes.md](field-notes.md).

Verified on a TLP301 running LightOS `582-release-lp3`, September 2026.

## 1. Get adb access

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

## 2. Toolbox and navigation

The toolbox keeps only tools, and everything else is a button or a Menu
entry away.

```sh
# Hide every plain Android app from the toolbox. Tools that carry the SDK
# marker stay: Light's own, plus Menu, Routine and Review.
adb shell settings put system LIGHTOS_SHOW_EXTERNAL_TOOLS 0

# Stop LightOS pulling itself to the front on screen-off, so apps holding a
# socket (Signal, Home Assistant) and the Aurora installer keep working.
adb shell settings put system light_force_focus_level 2

# Portrait only: a rotation rebuilds the activity and loses what you typed.
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 0
```

- **Toolbox:** Light's first-party tools, plus the marker-carrying Chats,
  Passes, Wi-Fi, News, Weather, Rideshare, Review, Menu and Routine.
- **Menu** (own build): Controls, Settings and Web Tools. Add or remove
  entries from Menu itself (long-press a row).
- **Full apps** — Claude, Slack, Spotify, Signal, Todoist and the rest —
  open from **hardware button shortcuts configured in Controls**, as does
  the Notifications tool. None of them has a toolbox slot.

Check:

```sh
adb shell settings get system LIGHTOS_SHOW_EXTERNAL_TOOLS    # 0
adb shell cmd package query-receivers -a com.thelightphone.sdk.ACTION_SDK_MARKER \
  | grep -oE 'packageName=[a-z0-9_.]+' | sort -u              # what the toolbox keeps
```

## 3. Controls (BrightControl)

Controls provides the button shortcuts, the lock-screen notifications and the
banner that makes a plain app's notification visible. It needs several grants
LightOS has no screen for.

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

## 4. Apps

### Where apps come from

| Source | For | Trust |
|---|---|---|
| **Obtainium** | Anything with GitHub releases | The project's own signing key; checksums where published |
| **BrightMarket** | gi-os community tools | TOFU: record the cert, stop if it changes |
| **Aurora Store** | Play-only apps | Play App Signing keys, so TOFU only; see field notes |
| **Own builds** | Menu, Notifications, Routine, Review | Private key per app, pinned by a release gate |

Check every APK's signer before installing:
`apksigner verify --print-certs <apk>`. Record the SHA-256 below. If it ever
changes on an update, stop.

### Installed (2026-09-27)

Certificates were read from the installed APKs. TOFU means no independently
published fingerprint exists, so the value here is the baseline.

| App | Package | Version | From | Cert SHA-256 |
|---|---|---|---|---|
| Obtainium | `dev.imranr.obtainium` | 1.6.17 | GitHub | `b353601f6a1d5fd6603ae2f50be80cf301367b86b6ab8b1f66243da96cd57362` (checksum ✅) |
| Aurora Store | `com.aurora.store` | 4.8.4 | F-Droid | `5c83c7672b929955dc0a1db89a5e6ae4389e2eae7ec939956041694e5815f532` (`CN=FDroid`) |
| BrightMarket | `com.gios.brightmarket` | 1.31.62 | GitHub | `c15078bcb72a89c67efb54d1a9fc1b00cc88da578891f8e96233a7d279550df6` |
| Controls | `com.gios.lightcontrol` | 4.36.298 | BrightMarket | `a38858d990bb61057ef53d1f8aa3c5854d01f68585b34f115793b06298b593e8` |
| Light Remote | `com.gios.lightremote` | 1.29.45 | BrightMarket | `88fa9df840f139a9079aaf8ab8a54f64022a9da276bacac99227a464c0b1eeda` |
| Light Keyboard | `app.lightphonekeyboard` | 1.1.29 | BrightMarket | `7844d8cc52fc12b5a2b5879b028605d90391a0a06cc4d87ef92a59350226d203` |
| Web Tools | `com.gios.webtools` | 3.6.25 | BrightMarket | `d61e641f56a3454b9d04203c185ac6f662e675440a66b004e5e9e4676db01b12` |
| QR | `com.gios.lightqr` | 1.0.5 | BrightMarket | `8e8dee395ca68f83870fa5fc9e62d723ff7e960f2c94f93427e6c62513236420` |
| Mailbox | `com.gios.brightmailbox` | 2.66.72 | BrightMarket | `ab866f2a03fcd4d8e88d2da1bb3e295d080ac28f46ae6c5bb8c9b9d9cc9e23c9` |
| Roll | `com.gios.lightcamera` | 3.13.171 | Obtainium | `d11cf9eecbfd5b482946e317f1dbf785a594234e313d7aa92042be3616b66dc3` |
| News | `com.lightrss.reader` | 3.6.0 | Obtainium | `c6902aa1870b4ffa2fd0cd627643dc8ddee7cc0fdbd1752febb3d911092d8ec5` (published pin ✅) |
| Composer | `com.zacksimpson.composer` | 1.0.2 | Obtainium | `c36238493aa1055c58ca19a350e68c22e53793226887d0bee290611bf1fd12c3` |
| Chats | `com.lightphone.chats` | 0.19.0 | BrightMarket | ⚠️ `b9c33e29b0ccad2bff11acab55f65a3c517ef4bc92cd9c77785366fa353d5f28` **public dev key** |
| Passes | `com.lightphone.passes` | 0.6.0 | BrightMarket | ⚠️ `b9c33e29b0ccad2bff11acab55f65a3c517ef4bc92cd9c77785366fa353d5f28` **public dev key** |
| Wi-Fi | `com.lightphone.wifi` | 0.1.0 | BrightMarket | ⚠️ `b9c33e29b0ccad2bff11acab55f65a3c517ef4bc92cd9c77785366fa353d5f28` **public dev key** |
| Signal | `org.thoughtcrime.securesms` | 8.28.4 | Aurora | `4be4f6cd5be844083e900279dc822af65a547fecc26aba7ff1f5203a45518cd8`; legacy `29f34e5f27f211b424bc5bf9d67162c0eafba2da35af35c16416fc446276ba26` matches signal.org ✅ |
| Home Assistant (minimal) | `io.homeassistant.companion.android.minimal` | 2026.6.5 | GitHub | `11194ba809b42ddf0e1a7dec6842a59c7ff1119c5482e95febffd5c6014daa5a` |
| Bluesky | `xyz.blueskyweb.app` | 1.132.0 | GitHub | `40058ec68a355521d08df24998cf99a71491335c65d75885039e80c025aaddff` |
| Claude | `com.anthropic.claude` | 1.260923.20 | Aurora | `305a1e8a432e5ec0c612b2465359c3b88e3c95d6253599ac6088562b818b64a0` |
| Slack | `com.Slack` | 26.09.40.0 | Aurora | `33533619756e8701a82e7887565b152dc348188711ebb5c48d073b2c942f7e41` |
| Spotify | `com.spotify.music` | 9.1.84.2231 | Aurora | `6505b181933344f93893d586e399b94616183f04349cb572a9e81a3335e28ffd` |
| Todoist | `com.todoist` | v12290 | Aurora | `7c89a7eb186f7b96f02f45fb067679fa54efebbbe67f34a0e7ca851e355b3a44` |
| Sonos | `com.sonos.acr2` | 89.00.51 | Aurora | `7c34eb3cfbda05faf56e8890a2abbac14b3036e6e4358849b98e8819b6b7b329` |
| 1Password | `com.onepassword.android` | 8.12.36 | Aurora | `b35b68d5ce8450557c6a55fd64b51feac110cb36d6a3521c5948db3a380a34a9` |
| StoryGraph | `com.thestorygraph.thestorygraph` | 1.30 | Aurora | `e8dad264ba813d0cb7fcd929bc702ded0cea7634c8b6e986936d39f46a23ca6d` |
| Menu | `ist.solo.menu` | 0.1.0 | own build | `a47333715c2265c3b61b452e257a664e6f537679ce67766f342898cf258aceb0` (`CN=soloist menu`) |
| Notifications | `ist.solo.notifications` | 0.4.2 | own build | `c68450264672e37d999839c9733b146b0389cb257b2380582e621cf9080e4adf` (`CN=soloist notifications`) |
| Routine | `ist.solo.routine` | 0.4.1 | own build | `0922901f33568120e64e44b5266b1f121f45793122d1c4b7abea9cbdcfba1fdd` (`CN=soloist routine`) |
| Review | `com.soloist.review` | 0.6.2 | own build | `83ac3b733db804765d4a888788d0a47d362e9682488712836b3ca449133c2da7` (`CN=soloist review`) |

Also present but not sideloaded: DAVx5 (`at.bitfire.davdroid` 2.5.1-ose-light)
is a Light-customized system app (step 7). Weather and Rideshare are Light's
own builds, signed `CN=Light` (`1814fa7c54f21fb766871767e1c2cd5379dd63155627fa26a15e88039cc08144`).

⚠️ **Chats, Passes and Wi-Fi are signed with light-sdk's public dev key.**
Anyone can sign an "update" for them. See *Signing and trust* in the field
notes before deciding whether to keep them.

### Obtainium

Obtainium is the source of truth for updates; BrightMarket is discovery-only.
Sources configured and resolving as of 2026-09-19 (Molly Light's has since
been dropped along with the app):

- `https://github.com/ImranR98/Obtainium` — so it self-updates
- `https://github.com/zacksimpson/composer-tool`
- `https://github.com/gi-os/Roll` — **was `gi-os/LightCamera`, renamed**
- `https://github.com/gi-os/BrightNews` — APK regex filter `LightRSS-.*\.apk`, prereleases off
- `https://github.com/gi-os/BrightMarket`
- `https://github.com/gi-os/BrightMailbox`
- `https://github.com/gi-os/BrightControl` — **was `gi-os/LightControl`, renamed**
- `https://github.com/bluesky-social/social-app`
- `https://github.com/home-assistant/android` — APK regex filter
  `app-minimal-release\.apk`. **The filter is load-bearing**: that release also
  ships `app-full-release.apk`, which is the FCM build and is useless here.

Both gi-os renames 301-redirect, which the GitHub API follows but which are
worth correcting at the source. Resolve one with:
`curl -sL https://api.github.com/repos/<owner>/<old> | grep full_name`.

#### Adding sources without tapping

Obtainium registers the `obtainium://` scheme, so sources can be added over
adb instead of by hand. Fire the deep link, then tap Continue on the
"Import app" dialog:

```sh
URL=$(python3 -c '
import json, urllib.parse
app = {"id":"com.gios.lightcamera","url":"https://github.com/gi-os/Roll",
       "author":"gi-os","name":"Roll"}
print("obtainium://app/" + urllib.parse.quote(json.dumps(app), safe=""))
')
adb shell am start -a android.intent.action.VIEW -d "$URL"
```

Per-source options go in an `additionalSettings` key whose value is a JSON
**string** — that's how BrightNews's filter is set:
`{"apkFilterRegEx": "LightRSS-.*\\.apk", "invertAPKFilter": false, "includePrereleases": false}`.

Three things Obtainium structurally **cannot** track, so don't expect full
coverage: apps distributed only as Play App Bundles (it can't install split
APKs — those need `adb install-multiple` by hand), the locally built Review
tool (no public release), and anything BrightMarket installed that has no
GitHub release feed. In practice that means the eight Play-sourced apps above
are Aurora's problem, not Obtainium's.

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

### Per-app grants

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

## 5. Own tools

Each lives in its own repo, signs with its own private key kept outside every
repo (`~/.android-keys/`, password in 1Password), and installs only through
its `scripts/release.sh`. That script builds a `git archive` of HEAD, verifies
a read-only copy (pinned signer, not debuggable, backups and device transfer
excluded) and installs exactly that file.

| Tool | Repo | Release |
|---|---|---|
| Menu | [solo-ist/lp3-menu](https://github.com/solo-ist/lp3-menu) | `MENU_SIGNING_PASSWORD=$(op read "op://Private/Menu signing key/password") ./scripts/release.sh` |
| Notifications | [solo-ist/lp3-notifications](https://github.com/solo-ist/lp3-notifications) | `NOTIFICATIONS_SIGNING_PASSWORD=$(op read "op://Private/Notifications signing key/password") ./scripts/release.sh` |
| Routine | [solo-ist/lp3-routine](https://github.com/solo-ist/lp3-routine) | `ROUTINE_SIGNING_PASSWORD=$(op read "op://Project/Routine signing key/password") ./scripts/release.sh` |
| Review | [solo-ist/readwise-review](https://github.com/solo-ist/readwise-review) (private) | see that repo's README |

Notifications also needs notification access, which LightOS has no screen for:

```sh
adb shell cmd notification allow_listener \
  ist.solo.notifications/ist.solo.notifications.Listener
```

Use `allow_listener`, not `settings put`: the latter replaces the whole list
and would revoke Controls' listener.

## 6. Messaging

**Signal** is the official app from Aurora. With no GMS it keeps its own
connection open instead of using FCM, and it's on the Doze whitelist so
that connection survives. Check its signer against the fingerprint
Signal publishes at signal.org/android/apk (see the table above).

**iMessage** arrives in **Chats** through a self-hosted `mautrix-imessage`
bridge into Beeper. It runs on a Mac signed in to Messages. Why each step is
needed is in *iMessage into Chats* in the field notes.

1. `bbctl run --type imessage --param imessage_platform=mac sh-imessage`
   (not `imessagego`; it can't register on current macOS).
2. Wrap the binary in an app bundle, so macOS privacy grants attach to it:

   ```sh
   APP="$HOME/Applications/iMessage Bridge.app"
   BIN="$HOME/Library/Application Support/bbctl/prod/binaries"
   mkdir -p "$APP/Contents/MacOS"
   cp "$BIN/mautrix-imessage" "$BIN/libolm.3.dylib" "$APP/Contents/MacOS/"
   # Info.plist: CFBundleExecutable=mautrix-imessage,
   #   CFBundleIdentifier=ist.solo.imessagebridge, LSBackgroundOnly=true,
   #   NSContactsUsageDescription=<any sentence>   ← set this before step 3
   codesign --force -s - "$APP"
   ```

3. Grant **Full Disk Access** to iMessage Bridge. Any later edit to the
   bundle invalidates the grant, so add every plist key first.
   `"$APP/Contents/MacOS/mautrix-imessage" --check-permissions` exits 0 when
   it took.
4. Run it from a LaunchAgent (`ist.solo.imessage-bridge`) with
   `WorkingDirectory` = `~/Library/Application Support/bbctl/prod/sh-imessage`.
5. Once the first sync has created the rooms, fill in the service each DM
   actually uses, or sending fails. Stop the agent and back up the database
   first:

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

   Then `launchctl kickstart -k gui/$(id -u)/ist.solo.imessage-bridge`.

Run it on an always-on Mac: a laptop stops bridging when the lid closes.

## 7. Calendar

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

## 8. Check the whole phone

```sh
adb shell settings get system LIGHTOS_SHOW_EXTERNAL_TOOLS           # 0
adb shell settings get system light_force_focus_level               # 2
adb shell settings get system accelerometer_rotation                # 0
adb shell settings get secure enabled_notification_listeners        # Notifications + Controls
adb shell settings get secure enabled_accessibility_services        # Controls' ControlService only
adb shell settings get secure autofill_service                      # 1Password
adb shell pm list packages -3                                       # matches the table in step 4
```
