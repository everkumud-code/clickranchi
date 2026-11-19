const test=require("node:test");
const assert=require("node:assert/strict");
const {spawn}=require("node:child_process");
const path=require("node:path");
let child,base;
test("HTTP server exposes health, public feed and SEO endpoints",async t=>{
 const port=3917;base="http://127.0.0.1:"+port;
 child=spawn(process.execPath,[path.join(__dirname,"..","server.js")],{cwd:path.join(__dirname,".."),env:{...process.env,NODE_ENV:"test",PORT:String(port),SITE_URL:base,ADMIN_USER:"test-admin",ADMIN_PASSWORD:"test-password",SESSION_SECRET:"test-secret-long-enough-for-hmac-signing"} ,stdio:"ignore"});
 t.after(()=>{if(child&&!child.killed)child.kill("SIGTERM");});
 let ready=false;
 for(let i=0;i<50;i++){try{const r=await fetch(base+"/api/health");if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.equal(ready,true,"server did not start");
 const health=await fetch(base+"/api/health").then(r=>r.json());
 assert.equal(health.ok,true);
 assert.equal(health.storage,"json-local");
 const trend=await fetch(base+"/api/trending").then(r=>r.json());assert.ok(Array.isArray(trend.trending));
 const feed=await fetch(base+"/api/stories").then(r=>r.json());
 assert.ok(Array.isArray(feed.stories));
 assert.equal((await fetch(base+"/robots.txt")).status,200);
 assert.equal((await fetch(base+"/sitemap.xml")).status,200);
 assert.equal((await fetch(base+"/api/admin/overview")).status,401);
 const login=await fetch(base+"/api/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username:"test-admin",password:"test-password"})});
 assert.equal(login.status,200);
 const cookie=login.headers.get("set-cookie");assert.ok(cookie&&cookie.includes("cr_session="));
 const admin=await fetch(base+"/api/admin/overview",{headers:{cookie:cookie.split(";")[0]}}).then(r=>r.json());
 assert.equal(admin.storage,"Local JSON");
});
