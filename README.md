# Project Istaroth (fka Class Clock)

**Project Istaroth** is the new name for the timetable and academic-task
countdown website formerly known as **Class Clock**.

The same project continues to provide the BSIT 2-1 weekly schedule, live
current/next class display, countdowns, class exceptions, academic tasks, and
opt-in browser notifications.

## Website and administration

- `index.html`: public timetable and task countdown.
- `admin.html`: schedule and task administration, using the existing backend.
- `download.html`: Android downloads and the original app showcase.
- `script.js` / `admin.js`: existing scheduling, notifications and operations.
- `style.css` / `admin.css`: responsive public/Admin site styling.

The public identity is **Project Istaroth (fka Class Clock)** in browser
titles, site branding, menus, notifications and footers.

## Android releases and existing 2.1.2 UpdateChecker

The latest Android build is **Project Istaroth v2.1.3**:
`downloads/Project-Istaroth.apk`. The earlier **Class Clock v2.1.2**
(`downloads/ClassClock.apk`) and archived 2.0
(`downloads/ClassClock-2.0.apk`) remain available from `download.html`.

**Important release invariant:** The already-installed Android 2.1.2
UpdateChecker downloads `index.html`, scans for the first APK link, and
compares its bytes with the installed APK. If the homepage has no discoverable
APK link, it falls back to `downloads/ClassClock.apk` (the old v2.1.2 file).
To let 2.1.2 detect Project Istaroth 2.1.3 without rebuilding the installed
app, the homepage `<head>` exposes a machine-readable
`<link rel="alternate" href="downloads/Project-Istaroth.apk">`.

**Whenever you publish a newer Android version**, update that one homepage
`href` to match the file marked `CURRENT` on `download.html`. Keep the
homepage's first APK extension inside this quoted `href`, rather than in
comments or other strings. `tests/legacy-update-checker.test.mjs` verifies
the exact file, legacy 240-character discovery window, size bounds and SHA-256
difference against the previous build.

**Detection is not installation:** v2.1.3 uses a different signing certificate
from v2.1.2. Android cannot install 2.1.3 as an in-place update over 2.1.2;
users must back up local-only data and uninstall the old build first. The
homepage update metadata does **not** change the older APK, its notification
wording, or its native installation behavior. A permanent signing key is
needed before reliable future in-place updates are possible.

## Compatibility

The website identity and updater-compatibility changes preserve
the existing GitHub repository slug (`jaxian5/class-clock`), deployed paths,
Supabase project URL, authentication, database tables, JavaScript element IDs,
notification tags, and `classClock*` browser preference keys.

Do not rename the browser preference keys without a separate migration,
because doing so would silently reset existing users' notification and task
preferences.

The independent Blue Noelle Class Clock integration is also unaffected by
this repository's branding update.

## Checks

Run `node --test tests/*.test.mjs` from the repository root to verify the
identity, latest-release homepage discovery, actual APK byte comparison,
JavaScript syntax, and archived download assets.
