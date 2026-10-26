#!/usr/bin/env python3
"""Rebrand the unpacked, original 2.1.2 APK. No application logic changes."""
from pathlib import Path
import re
import sys

root = Path(sys.argv[1])
if not root.joinpath("AndroidManifest.xml").exists():
    raise SystemExit("Expected decoded APK directory")

old_name = "Class Clock"
new_name = "Project Istaroth (fka Class Clock)"
old_upper = "CLASS CLOCK"
new_upper = "PROJECT ISTAROTH (FKA CLASS CLOCK)"
modifications = []
for filename in [root / "assets/www/index.html", root / "assets/www/app.js"]:
    original = filename.read_text(encoding="utf-8")
    updated = original.replace(old_name, new_name).replace(old_upper, new_upper)
    updated = updated.replace("2.1.2", "2.1.3")
    if updated != original:
        filename.write_text(updated, encoding="utf-8")
        modifications.append((filename.relative_to(root), original.count(old_name), original.count(old_upper)))
    # Never migrate existing preference keys or module/application identifiers.
    if filename.name == "app.js" and any(token in updated for token in ["const appName = 'Class Clock'"]):
        raise SystemExit("Unreplaced app branding")
manifest = root / "AndroidManifest.xml"
original = manifest.read_text(encoding="utf-8")
updated = original.replace('android:label="Class Clock"', 'android:label="Project Istaroth (fka Class Clock)"')
if updated == original:
    raise SystemExit("Android application label not found")
manifest.write_text(updated, encoding="utf-8")
modifications.append(("AndroidManifest.xml", 1, 0))

# Only actual quoted text inside smali, never Java/Dalvik class names,
# .field names, app.pup.classclock package identifiers or resource IDs.
for filename in root.glob("smali*/**/*.smali"):
    original = filename.read_text(encoding="utf-8")
    updated = re.sub(
        r'(const-string(?:/jumbo)?\s+[vp]\d+,\s*")([^"]*)(")',
        lambda m: m.group(1) +
        m.group(2).replace(old_name, new_name).replace(old_upper, new_upper) +
        m.group(3),
        original,
    )
    if updated != original:
        filename.write_text(updated, encoding="utf-8")
        modifications.append((str(filename.relative_to(root)), original.count(old_name), original.count(old_upper)))

# The version is declared in the apktool metadata and embedded in app labels.
apktool = root / "apktool.yml"
original = apktool.read_text(encoding="utf-8")
version_code = re.sub(r"(versionCode:\s*'?)(\d+)('?)", lambda m: m.group(1) + str(max(int(m.group(2)) + 1, 35)) + m.group(3), original, count=1)
version_name = re.sub(r"(versionName:\s*'?)([^\s'\r\n]+)('?)", lambda m: m.group(1) + "2.1.3" + m.group(3), version_code, count=1)
if version_code == original or version_name == version_code:
    raise SystemExit("Unable to update apktool.yml versionCode/versionName")
apktool.write_text(version_name, encoding="utf-8")
modifications.append(("apktool.yml", 1, 0))

print("Rebranded files:")
for path, old, upper in modifications:
    print(" -", path, "human-readable references:", old + upper)
html = (root / "assets/www/index.html").read_text(encoding="utf-8")
if "Project Istaroth (fka Class Clock)" not in html or "2.1.3" not in html:
    raise SystemExit("Home screen branding or version missing")
if len(modifications) < 3:
    raise SystemExit("Expected to update the manifest and webapp metadata")
