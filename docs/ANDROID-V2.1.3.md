# Android 2.1.3: Project Istaroth (fka Class Clock)

**Release branch:** `release/project-istaroth-android-2.1.3`
**Source:** the checked-in official Android 2.1.2 build, `downloads/ClassClock.apk`

## Release changes

- New signed Android binary: **`downloads/Project-Istaroth.apk`**.
- Android display label: **Project Istaroth (fka Class Clock)**.
- Android version name `2.1.3`, version code `35` (previously `2.1.2`, code `34`).
- Updated embedded splash screen, HTML title, web app labels, and matching visible notification/native literal strings.
- Retained original package ID `app.pup.classclock`, notification/AlarmReceiver logic, bundled clock assets, Supabase configuration, storage keys, and scheduling functionality.
- Download page shows **v2.1.3 CURRENT** and **v2.1.2 previous** in the original card layout. The **Earlier Downloads** dialog holds only v2.0.
- Existing 2.1.2/2.0 APKs are retained, unmodified.

## Verification from GitHub Actions

Successful rebuild workflow: [GitHub Actions #40272132396](https://github.com/jaxian5/class-clock/actions/runs/40272132396).

Rebuilt metadata from Android SDK `aapt dump badging`:

| Field | Expected / observed |
| --- | --- |
| Package | `app.pup.classclock` (unchanged) |
| Version name | `2.1.3` |
| Version code | `35` |
| Application label | `Project Istaroth (fka Class Clock)` |
| Build output | `downloads/Project-Istaroth.apk` |
| APK SHA-256 | `9d9510128dd8e671e6e7091d237b6f943e5249f58b207e2d866ac1e593396324` |
| New signer certificate SHA-256 | `8f85c93b00d1f4a207ee3e88668ad70578ac9d58072328dc9fc6f6a7ead21ae1` |

The binary passed APK alignment, `apksigner verify`, Android build metadata checks, ZIP contents verification, and browser page-level regression checks. It has **not** been installed on an Android device for runtime acceptance.

## IMPORTANT: signing compatibility and future versions

The signing certificate of the original v2.1.2 build is:

`1041fb20ac401cf49f6fb486d192a56deadf8c580da1135e845f9e23c5728578`

**The private key for that certificate is not included in the repository.** The
v2.1.3 build was signed using a fresh key generated in GitHub Actions. The new
signing certificate does not match the old one.

- Android **will not** accept v2.1.3 as an in-place update over v2.1.2.
- Users must **back up any local-only app data**, uninstall v2.1.2 and then
  install v2.1.3. Uninstalling can erase application data. Merely having the same
  package ID is insufficient for signature-compatible updates.
- The generated release keystore was ephemeral and **is not retained**. A future
  v2.1.4 update signed by a different key would also require reinstalling.
- Before any subsequent sustainable production Android release, configure a
  **persistent private release keystore** in appropriately protected GitHub
  Actions secrets, or rebuild using the author's original 2.1.2 signing key.
  Do not commit private keystores or their passwords to the public repo.
- The rebuild workflow can consume `ISTAROTH_KEYSTORE_BASE64`,
  `ISTAROTH_KEYSTORE_PASSWORD`, `ISTAROTH_KEY_ALIAS`, and
  `ISTAROTH_KEY_PASSWORD` as protected GitHub Secrets, if available.
- This release is therefore **a signed installable build, not a
  signature-compatible upgrade**.

## Android runtime acceptance checklist

Before announcing production-finalized release:
1. Open the download page in mobile and desktop browsers. Only latest (2.1.3)
   and previous (2.1.2) should appear on the Build card, and the Earlier
   Downloads dialog should show 2.0.
2. Download 2.1.3; verify the file SHA-256 above.
3. On a test device (with **no important local data**), uninstall the previous
   app if installed. Install 2.1.3 and verify the launcher label, splash
   title, and interior screens.
4. Confirm class schedule, alarms, notification permission, task list and
   notification text still function identically to the 2.1.2 release.
5. Check persistence of data stored in the Supabase backend separately from
   any local storage lost during uninstall.
6. Review Android signing-key custody before planning v2.1.4.

## Build reproducibility

`.github/workflows/rebuild-android-2.1.3.yml` runs Apktool v2.11.1
(with a pinned SHA-256 checksum), rebases all text modifications on the
unmodified v2.1.2 APK, increments Android version, reassembles, aligns,
signs, verifies, uploads an Actions artifact, and commits the binary to the
release branch. `scripts/rebrand_apk.py` contains the narrow patching logic.

Do not assume that generating a second signing certificate with the same
subject `CN=Project Istaroth` makes it cryptographically equivalent.
