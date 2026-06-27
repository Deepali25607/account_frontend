# LedgerFlow — Android App

The Android app is a [Capacitor](https://capacitorjs.com/) wrapper around the web
frontend. Building produces a single **signed `.apk`** file you host for download;
users tap it to install (no Play Store needed).

## How this APK is configured

This build is a **thin shell that loads the live production site** rather than a
bundled copy of the web assets:

- `capacitor.config.json` sets `server.url = https://account-frontend-lilac.vercel.app`
- That deployed site already authenticates against the backend on Render
  (`https://account-backend-liud.onrender.com`)

**Implications:**

- ✅ The installed app **is** your production app — fully functional out of the box.
- ✅ **Auto-updates:** every Vercel deploy is reflected instantly in the app, with
  **no APK rebuild or redistribution** needed for web/UI changes.
- ⚠️ The app needs internet to load (no offline shell).
- ⚠️ First launch may take a few seconds if Render's free tier has cold-started.
- 🔁 You only rebuild the APK for **native** changes (app icon, splash, version,
  plugins, or switching backend/site URLs).

## Distribute to users (direct download)

1. Host **`LedgerFlow-1.0.0.apk`** (repo root) somewhere public — your website,
   GitHub Releases, an S3/Cloud bucket, or any file host — and share the link.
   A "Download for Android" button on the web app can link straight to it.
2. Users open the link → download → tap the file. Android prompts to allow
   "install unknown apps" the first time → they enable it → **Install**.
3. The app is **signed with a stable release key**, so future updates install
   cleanly over the top. For a new native release, bump `versionCode` /
   `versionName` in [`android/app/build.gradle`](android/app/build.gradle).

## Rebuild the APK

Prerequisites (already set up on this machine): JDK 21 (`JAVA_HOME`), Android SDK
at `C:\Users\Ravi\AppData\Local\Android\Sdk` (see `android/local.properties`), and
the release keystore `android/app/ledgerflow-release.keystore`.

From the `frontend/` folder:

```bash
npm run android:apk
```

Runs `vite build` → `cap sync android` → `gradlew assembleRelease`. Output:

```
frontend/android/app/build/outputs/apk/release/app-release.apk
```

## Switching to a bundled (offline-capable) app instead

If you'd rather ship the web assets *inside* the APK (works without loading the
remote site each launch):

1. Remove the `server.url` and `cleartext` lines from `capacitor.config.json`
   (keep `androidScheme: "https"`).
2. Ensure [`.env`](.env) has `VITE_API_URL=https://account-backend-liud.onrender.com`
   (already set) — this is baked into the bundle and is the backend the app calls.
3. `npm run android:apk`.

Trade-off: bundled apps work offline-to-shell but require an APK rebuild +
redistribution for **every** web/UI change.

## Keystore — keep it safe 🔑

`android/app/ledgerflow-release.keystore` signs the app (credentials in
`keystore.properties`). **Back it up.** Losing it means you can't ship updates
under the same app identity. The defaults use the password `ledgerflow123` —
change it in `keystore.properties` before a serious public release and store the
secret securely.
