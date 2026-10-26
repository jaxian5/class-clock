import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,statSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=path=>readFileSync(resolve(root,path),"utf8");
const page=read("download.html");
const buildPanel=page.match(/<section class="panel" aria-label="Android builds">([\s\S]*?)<\/section>/)?.[1];
test("Release card displays exactly 2.1.3 and previous 2.1.2, with 2.0 in the archive",()=>{
 assert.ok(buildPanel,"Main release card not found");
 assert.match(buildPanel,/<strong>2\.1\.3<\/strong>[\s\S]*?CURRENT/);
 assert.match(buildPanel,/<strong>2\.1\.2<\/strong>/);
 assert.doesNotMatch(buildPanel,/<strong>2\.0<\/strong>/);
 assert.match(page,/<dialog id="earlier-downloads-dialog"/);
 assert.match(page,/<h2 id="earlier-downloads-title">Earlier Downloads<\/h2>/);
 assert.match(page,/<strong>2\.0<\/strong>/);
 assert.match(page,/earlier-downloads-button/);
 assert.match(page,/\.showModal\(\)/);
 assert.match(page,/\.close\(\)/);
});
test("Download links preserve all earlier APK builds and new actual latest APK",()=>{
 const links=[
  ["2.1.3","downloads/Project-Istaroth.apk"],
  ["2.1.2","downloads/ClassClock.apk"],
  ["2.0","downloads/ClassClock-2.0.apk"]
 ];
 for(const [version,path] of links){
  assert.match(page,new RegExp('href="'+path.replace(/\./g,"\\.")+'"'),version);
  assert.ok(statSync(resolve(root,path)).size>10000,version+" download missing or empty");
 }
});
test("Preserved page structure and existing screenshot lightbox interactions",()=>{
 for(const phrase of ["download-top","download-pair","download-stack","showcase",
   "showcase-lightbox","faq-item","download-back","Download","iOS is not available yet"]){
    assert.ok(page.includes(phrase),"Layout element missing: "+phrase);
 }
 assert.match(page,/id="showcase-prev"/);
 assert.match(page,/id="showcase-next"/);
 assert.match(page,/id="lightbox-close"/);
});
test("Release note warns about actual different signing certificate",()=>{
 assert.match(page,/Version 2\.1\.3 uses a different signing certificate/);
 assert.match(page,/uninstall the old app/);
 assert.match(page,/Back up|back up/i);
});

test("Formerly Class Clock notice is removed from the top of download page",()=>{
 assert.doesNotMatch(page,/class="app-rename-note"/);
 assert.doesNotMatch(page,/\.app-rename-note\s*\{/);
 const lead=page.match(/<section class="download-lead">([\s\S]*?)<\/section>/)?.[1];
 assert.ok(lead);
 assert.match(lead,/<h1>Project Istaroth/);
 assert.match(lead,/Android app for the BSIT 2-1 schedule/);
 assert.doesNotMatch(lead,/<p[^>]+class="app-rename-note"/);
});
test("FAQ explains new branding and real Android update limits accurately",()=>{
 assert.match(page,/<summary>Is Project Istaroth the same app as Class Clock\?<\/summary>/);
 assert.match(page,/<summary>Can I update directly from Class Clock 2\.1\.2 to Project Istaroth 2\.1\.3\?<\/summary>/);
 assert.match(page,/signed with a different Android certificate/);
 assert.match(page,/Uninstalling may erase data stored only on your device/);
 assert.match(page,/<summary>Why does Google Play Protect ask to scan the app\?<\/summary>/);
 assert.match(page,/<summary>Will Project Istaroth be released on Google Play\?<\/summary>/);
 assert.match(page,/there is no confirmed date/);
});
