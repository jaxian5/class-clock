import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {Script} from "node:vm";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=name=>readFileSync(resolve(root,name),"utf8");
const project="Project Istaroth (fka Class Clock)";

test("Public site has exact new project identity, not old standalone branding",()=>{
 const html=read("index.html");
 assert.match(html,/<title>Project Istaroth \(fka Class Clock\)/);
 assert.match(html,/class="logo-project">PROJECT ISTAROTH</);
 assert.match(html,/class="logo-legacy">\(fka Class Clock\)/);
 assert.match(html,/Project Istaroth \(fka Class Clock\) · Ver 2\.9c\.3/);
 assert.doesNotMatch(html,/<div class="logo">BSIT 2-1<\/div>/);
 assert.match(html,/style\.css\?v=22/);
 assert.match(html,/script\.js\?v=21/);
});

test("Admin route retains its authentication workflow under new name",()=>{
 const html=read("admin.html");
 assert.match(html,/<title>Project Istaroth \(fka Class Clock\)/);
 assert.match(html,/class="brand">PROJECT ISTAROTH/);
 assert.match(html,/admin-legacy-name">\(fka Class Clock\)/);
 assert.match(html,/href="index\.html".*PROJECT ISTAROTH/);
 assert.match(html,/id="login-form"/);
 assert.match(html,/id="admin-panel"/);
 assert.match(html,/admin\.js\?v=10/);
});

test("Download FAQ explains Project Istaroth branding and keeps legacy APK assets",()=>{
 const html=read("download.html");
 assert.match(html,/<title>Download Project Istaroth \(fka Class Clock\)/);
 assert.doesNotMatch(html,/class="app-rename-note"/);
 assert.match(html,/Is Project Istaroth the same app as Class Clock\?/);
 assert.match(html,/earlier Android builds \(2\.1\.2 and 2\.0\) still display Class Clock/);
 for(const apk of ["ClassClock.apk","ClassClock-2.0.apk"]){
   assert.match(html,new RegExp('href="downloads/'+apk.replace(/\./g,"\\.")+'"'));
   assert.ok(existsSync(resolve(root,"downloads",apk)),
     "Legacy APK must remain downloadable: "+apk);
 }
});

test("Browser behavior, persisted preferences and database settings are preserved",()=>{
 const script=read("script.js");
 const admin=read("admin.js");
 for(const [label,code] of [["script",script],["admin",admin]]){
   assert.doesNotThrow(()=>new Script(code,{filename:label+".js"}));
   assert.match(code,/SUPABASE_URL/);
   assert.match(code,/SUPABASE_PUBLISHABLE_KEY/);
 }
 for(const key of ["classClockViewMode","classClockTasksDone","classClockNotificationsEnabled"]){
   assert.ok(script.includes('"'+key+'"'),"Missing legacy persisted state key: "+key);
 }
 assert.match(script,/new Notification\("Project Istaroth \(fka Class Clock\)"/);
 assert.match(admin,/public Project Istaroth \(fka Class Clock\)/);
});

test("Responsive branding rules exist for desktop and mobile",()=>{
 const css=read("style.css");
 const admin=read("admin.css");
 assert.match(css,/\.logo-project/);
 assert.match(css,/\.logo-legacy/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(admin,/\.admin-legacy-name/);
 assert.match(admin,/@media\(max-width:650px\)/);
});
