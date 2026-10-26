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

## Legacy Android app

The existing binary APKs in `downloads/` are **legacy Class Clock builds**.
This website rebrand does *not* rebuild, re-sign, or rename their internal
Android application labels or package identifiers. Their filenames and
download links are intentionally retained:

- `downloads/ClassClock.apk` (2.1.2)
- `downloads/ClassClock-2.0.apk` (2.0)

Until a new Android build is published, those APKs can still appear as
**Class Clock** when installed. Please distinguish the newly branded website
from those earlier mobile releases.

## Compatibility

This change is **presentation and copy only**. It intentionally preserves
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
identity across pages, JavaScript syntax, and retained legacy download assets.
