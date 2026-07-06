# Court Shuffle — Android smoke checklist (Phase 4)

Run on the emulator (`courtshuffle` AVD) or a physical device before every
Play upload. Build: `npm run build:local && npx cap sync android`, then
`cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew assembleDebug`.

## Core flow
- [ ] App launches to home showing "Court Shuffle" (English, no Japanese anywhere)
- [ ] Roster → add 5 players (no PIN prompt appears)
- [ ] Start session → 2 courts → select 5 players → draw numbers → start round
- [ ] Round view: courts render; tapping a team does NOT mark a winner
- [ ] Next round → previous round → history page all navigate
- [ ] Lock the phone 5 minutes → reopen → session resumes where it was
- [ ] Kill the app (swipe away) → relaunch → ongoing session still resumes
- [ ] End session → home shows no live badge → past sessions lists it
- [ ] Past session detail: winner column absent; delete works (confirm dialog)

## Android specifics
- [ ] Hardware back on every inner screen goes back one step (never exits)
- [ ] Hardware back on home minimizes the app (does not kill it)
- [ ] Settings → Export JSON → share sheet / download produces a valid file
- [ ] Settings → Delete all data → asks twice → roster is empty afterwards
- [ ] Relaunch after wipe: fresh state, no crash
- [ ] App icon shows navy circle + gold C (adaptive icon not clipped)
- [ ] Rotate device: layout stays usable

## Data durability (origin freeze)
- [ ] Install an updated build OVER the previous one (adb install -r):
      roster + past sessions survive. (Origin change would wipe them —
      androidScheme/hostname in capacitor.config.ts are frozen.)

## Sign-off
Date / build / device / result — record here per run.

### 2026-07-06 · debug build (versionName 1.0.0) · Pixel 7 AVD (Android 16 / API 36, emulator)
Automated adb smoke by Claude. PASS with one fix shipped:
- ✅ English home, generic brand, no Japanese anywhere
- ✅ Roster: 5 players added, no PIN prompt, no per-member export button
- ✅ New session → number draw → R1/R2 generated; fair rotation observed
  (R1 rested #2, R2 rested #1)
- ✅ Winner taps inert (no ✓, session data unchanged)
- ✅ Hardware back: round → number-map (history back); home → minimized
  (launcher became top activity, app kept alive)
- ✅ force-stop → relaunch: live session badge + full R2 state resumed
  (IndexedDB persistence)
- ✅ End session (EN confirm dialog) → past sessions lists "5 players · 2R"
- 🐛→✅ Export JSON: blob download silently discarded by WebView ("Backup
  saved" with no file). FIXED: native path now writes to app cache and opens
  the share sheet (Filesystem + Share plugins); verified — share sheet shows
  "court-shuffle-backup-2026-07-06.json".
- ✅ install-over-update (adb install -r new build): roster Active(5) and
  past sessions survived — frozen WebView origin holds
- ⏭ Not yet run on emulator: rotate, wipe-all on device (unit-tested).
  Run once on a physical device before the Play upload.

