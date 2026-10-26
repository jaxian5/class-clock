import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,statSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";

const base=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const homepage=readFileSync(resolve(base,"index.html"),"utf8");
const download=readFileSync(resolve(base,"download.html"),"utf8");
const origin="https://jaxian5.github.io/class-clock/";
const apkRoot=resolve(base,"downloads");

function oldUpdaterFindFirstApk(html){
  // Reproduce the documented, already-installed Android 2.1.2 checker:
  // download the homepage (max 500 KB), scan extension hits, locate a
  // preceding href within 240 characters, and resolve against homepage URL.
  const source=html.slice(0,500*1024);
  const re=/\.apk/ig;
  for(const match of source.matchAll(re)){
    const preceding=source.slice(Math.max(0,match.index-240),match.index);
    const hrefPosition=preceding.lastIndexOf("href");
    if(hrefPosition<0)continue;
    const quoted=preceding.slice(hrefPosition).match(/^href\s*=\s*(["'])([^"']+)\1/i);
    // Quoted URL may extend past the extension occurrence.
    const remaining=source.slice(match.index,match.index+20);
    if(quoted && quoted[2].toLowerCase().endsWith(".apk")){
      return new URL(quoted[2],origin).href;
    }
    const full=source.slice(Math.max(0,match.index-240)+hrefPosition,
      match.index+10);
    const complete=full.match(/^href\s*=\s*(["'])([^"']+\.apk)\1/i);
    if(complete)return new URL(complete[2],origin).href;
  }
  return origin+"downloads/ClassClock.apk";
}

function sha(data){return createHash("sha256").update(data).digest("hex")}
test("Old 2.1.2 homepage parser discovers current Project Istaroth APK, not fallback",()=>{
  assert.ok(Buffer.byteLength(homepage,"utf8")<500*1024,"Homepage exceeds legacy download cap");
  const urls=[...homepage.matchAll(/\.apk/ig)];
  assert.equal(urls.length,1,"Exactly one extension on homepage, first must be current release");
  const first=urls[0].index;
  const fragment=homepage.slice(first-100,first+8);
  assert.match(fragment,/href="downloads\/Project-Istaroth\.apk"/,
    "Native updater must find href close to extension, not a comment or other asset");
  assert.equal(oldUpdaterFindFirstApk(homepage),origin+"downloads/Project-Istaroth.apk");
});
test("Discoverable homepage APK matches actual latest build in download card",()=>{
  const current=download.match(/<strong>2\.1\.3<\/strong>[\s\S]{0,850}?<a\s[^>]*href="([^"]+\.apk)"/i);
  assert.ok(current,"Expected latest 2.1.3 card and its direct APK link");
  const latestHref=current[1];
  assert.equal(new URL(latestHref,origin).href,oldUpdaterFindFirstApk(homepage));
  assert.equal(latestHref,"downloads/Project-Istaroth.apk");
  assert.ok(statSync(resolve(base,latestHref)).size>1024);
  assert.ok(statSync(resolve(base,latestHref)).size<8*1024*1024);
});
test("Existing installed v2.1.2 byte hash differs from current v2.1.3 release",()=>{
  const old=readFileSync(resolve(apkRoot,"ClassClock.apk"));
  const current=readFileSync(resolve(apkRoot,"Project-Istaroth.apk"));
  assert.notEqual(sha(old),sha(current));
  assert.ok(old.length>1024&&old.length<8*1024*1024);
  assert.ok(current.length>1024&&current.length<8*1024*1024);
});
test("Actual installed v2.1.3 hash matches latest homepage target, so no false update",()=>{
  const current=readFileSync(resolve(apkRoot,"Project-Istaroth.apk"));
  const url=oldUpdaterFindFirstApk(homepage);
  const path=new URL(url).pathname.replace(/^\/class-clock\//,"");
  const linked=readFileSync(resolve(base,path));
  assert.equal(sha(linked),sha(current));
});
test("Human navigation and signing limitations remain clear",()=>{
  assert.match(homepage,/href="download\.html"/);
  assert.match(download,/Version 2\.1\.3 uses a different signing certificate/);
  assert.match(download,/uninstall the old app/);
  assert.match(download,/href="downloads\/ClassClock\.apk"/);
  assert.match(download,/href="downloads\/ClassClock-2\.0\.apk"/);
  assert.doesNotMatch(homepage,/onload\s*=|script[^>]+src="downloads\/.*\.apk"/i);
});
