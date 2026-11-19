const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { parseFeed, makeCluster } = require("./lib/news");
const { enrichStory } = require("./lib/ai");
const ROOT=__dirname, PUBLIC=path.join(ROOT,"public"), DATA=path.join(ROOT,"data");
const DB=path.join(DATA,"stories.json"), SOURCES=path.join(DATA,"sources.json");
const PORT=Number(process.env.PORT||3000), USER=process.env.ADMIN_USER||"admin";
const PASS=process.env.ADMIN_PASSWORD||"", SECRET=process.env.SESSION_SECRET||"";
const INTERVAL=Math.max(5,Number(process.env.SYNC_INTERVAL_MINUTES||10));
const SITE_URL=(process.env.SITE_URL||"http://localhost:"+PORT).replace(/\/+$/,"");
const MAX_ITEMS=Math.max(5,Math.min(100,Number(process.env.MAX_FEED_ITEMS||30)));
const isProd=process.env.NODE_ENV==="production";
let pool=null, syncing=false;
const loginAttempts=new Map();
fs.mkdirSync(DATA,{recursive:true});
if(!fs.existsSync(DB))fs.writeFileSync(DB,"[]");
if(!fs.existsSync(SOURCES))fs.writeFileSync(SOURCES,"[]");
function readJSON(p){return JSON.parse(fs.readFileSync(p,"utf8"));}
function writeJSON(p,v){const tmp=p+".tmp";fs.writeFileSync(tmp,JSON.stringify(v,null,2));fs.renameSync(tmp,p);}
function timingSafeText(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function sign(payload){const body=Buffer.from(JSON.stringify(payload)).toString("base64url");const sig=crypto.createHmac("sha256",SECRET).update(body).digest("base64url");return body+"."+sig;}
function verify(token){try{const [body,sig]=String(token||"").split(".");const expected=crypto.createHmac("sha256",SECRET).update(body).digest("base64url");if(!timingSafeText(sig,expected))return false;const p=JSON.parse(Buffer.from(body,"base64url").toString());return p.exp>Date.now()&&p.user===USER;}catch{return false;}}
function cookie(req,name){return (req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="))?.slice(name.length+1)||"";}
function authenticated(req){return verify(cookie(req,"cr_session"));}
function send(res,code,body,type="application/json; charset=utf-8",extra={}){res.writeHead(code,{"content-type":type,"cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"strict-origin-when-cross-origin",...extra});res.end(type.startsWith("application/json")?JSON.stringify(body):body);}
function bodyJSON(req){return new Promise((resolve,reject)=>{let b="";req.on("data",c=>{b+=c;if(b.length>1e6){reject(new Error("Request body too large"));req.destroy();}});req.on("end",()=>{try{resolve(JSON.parse(b||"{}"));}catch{reject(new Error("Invalid JSON"));}});});}
function cleanText(s,max=500){return String(s||"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max);}
async function initStore(){
 if(process.env.DATABASE_URL){
  const {Pool}=require("pg");pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==="true"?{rejectUnauthorized:false}:undefined,max:10,idleTimeoutMillis:30000,connectionTimeoutMillis:10000});
  await pool.query("CREATE TABLE IF NOT EXISTS stories (id text PRIMARY KEY, url text UNIQUE NOT NULL, title text NOT NULL, excerpt text NOT NULL DEFAULT '', published_at timestamptz NOT NULL, collected_at timestamptz NOT NULL, source_id text NOT NULL, source_name text NOT NULL, status text NOT NULL, district text NOT NULL, category text NOT NULL, language text NOT NULL, cluster_id text NOT NULL)");
  await pool.query("ALTER TABLE stories ADD COLUMN IF NOT EXISTS ai_summary text NOT NULL DEFAULT ''");
  await pool.query("CREATE INDEX IF NOT EXISTS stories_published_idx ON stories(status,published_at DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS stories_cluster_idx ON stories(cluster_id)");
 }else if(isProd){throw new Error("DATABASE_URL is required in production");}
}
function fromRow(r){return {id:r.id,url:r.url,title:r.title,excerpt:r.excerpt,aiSummary:r.ai_summary||"",publishedAt:new Date(r.published_at).toISOString(),collectedAt:new Date(r.collected_at).toISOString(),sourceId:r.source_id,sourceName:r.source_name,status:r.status,district:r.district,category:r.category,language:r.language,clusterId:r.cluster_id};}
async function listStories({publishedOnly=false,limit=500}={}){
 if(pool){const r=await pool.query("SELECT * FROM stories "+(publishedOnly?"WHERE status='published' ":"")+"ORDER BY published_at DESC LIMIT $1",[limit]);return r.rows.map(fromRow);}
 const rows=readJSON(DB).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));return (publishedOnly?rows.filter(x=>x.status==="published"):rows).slice(0,limit);
}
async function saveStory(s){
 if(pool){const r=await pool.query("INSERT INTO stories(id,url,title,excerpt,ai_summary,published_at,collected_at,source_id,source_name,status,district,category,language,cluster_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(url) DO NOTHING",[s.id,s.url,s.title,s.excerpt,s.aiSummary||"",s.publishedAt,s.collectedAt,s.sourceId,s.sourceName,s.status,s.district,s.category,s.language,s.clusterId]);return r.rowCount>0;}
 const rows=readJSON(DB);if(rows.some(x=>x.url===s.url))return false;rows.push(s);writeJSON(DB,rows);return true;
}
async function updateStory(id,status){if(pool){const r=await pool.query("UPDATE stories SET status=$2 WHERE id=$1",[id,status]);return r.rowCount>0;}const rows=readJSON(DB),item=rows.find(x=>x.id===id);if(!item)return false;item.status=status;writeJSON(DB,rows);return true;}
async function countStories(){if(pool){const r=await pool.query("SELECT status,count(*)::int AS n FROM stories GROUP BY status");return Object.fromEntries(r.rows.map(x=>[x.status,x.n]));}const rows=readJSON(DB);return rows.reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{});}
async function syncSource(source){
 const response=await fetch(source.feedUrl,{headers:{"user-agent":"ClickRanchi/1.0 (+https://clickranchi.com; RSS news aggregation)","accept":"application/rss+xml, application/atom+xml, application/xml, text/xml"},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error("Feed returned HTTP "+response.status);
 const xml=await response.text();if(xml.length>3000000)throw new Error("Feed exceeds 3 MB limit");
 if(!/<(rss|feed|rdf:RDF)\b/i.test(xml))throw new Error("Response is not a recognised RSS/Atom feed");
 const items=parseFeed(xml).slice(0,MAX_ITEMS), existing=await listStories({limit:350});let added=0;
 for(const item of items){
  const meta=await enrichStory({title:item.title,excerpt:item.excerpt});
  const story={id:crypto.randomUUID(),...item,excerpt:cleanText(item.excerpt,420),aiSummary:cleanText(meta.aiSummary||item.excerpt,240),sourceId:source.id,sourceName:source.name,status:source.autoPublish?"published":"pending",collectedAt:new Date().toISOString(),...meta,clusterId:makeCluster(item.title,existing)};
  if(await saveStory(story)){added++;existing.unshift(story);}
 }
 source.lastSyncAt=new Date().toISOString();source.lastError=null;source.lastAdded=added;source.lastFetched=items.length;return added;
}
async function syncAll(){
 if(syncing)return {skipped:true};syncing=true;const sources=readJSON(SOURCES);let added=0;
 try{for(const source of sources.filter(x=>x.enabled)){try{added+=await syncSource(source);}catch(e){source.lastSyncAt=new Date().toISOString();source.lastError=cleanText(e.message,300);}}
  writeJSON(SOURCES,sources);return {added,sources:sources.length};
 }finally{syncing=false;}
}
function requireAdmin(req,res){if(!authenticated(req)){send(res,401,{error:"Unauthorised"});return false;}return true;}
function originAllowed(req){const origin=req.headers.origin;if(!origin)return true;try{return new URL(origin).host===new URL(SITE_URL).host;}catch{return false;}}
function rateLimited(key){const now=Date.now(),old=loginAttempts.get(key)||{n:0,at:now};if(now-old.at>900000){old.n=0;old.at=now;}old.n++;loginAttempts.set(key,old);return old.n>8;}
async function route(req,res){
 const u=new URL(req.url,"http://localhost"),p=u.pathname;
 if(req.method==="GET"&&p==="/api/health")return send(res,200,{ok:true,service:"clickranchi",storage:pool?"postgresql":"json-local",syncIntervalMinutes:INTERVAL,syncing});
 if(req.method==="GET"&&p==="/robots.txt")return send(res,200,"User-agent: *\nAllow: /\nSitemap: "+SITE_URL+"/sitemap.xml\n","text/plain; charset=utf-8");
 if(req.method==="GET"&&p==="/sitemap.xml"){const stories=await listStories({publishedOnly:true,limit:5000});const body='<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'+SITE_URL+'/</loc></url>'+stories.map(s=>'<url><loc>'+SITE_URL+'/story/'+encodeURIComponent(s.id)+'</loc><lastmod>'+s.publishedAt.slice(0,10)+'</lastmod></url>').join("")+'</urlset>';return send(res,200,body,"application/xml; charset=utf-8");}
 if(req.method==="GET"&&p==="/api/stories"){const all=await listStories({publishedOnly:true,limit:5000});const q=cleanText(u.searchParams.get("q"),100).toLowerCase(),cat=u.searchParams.get("category"),district=u.searchParams.get("district"),source=u.searchParams.get("source");const filtered=all.filter(s=>(!cat||s.category===cat)&&(!district||s.district===district)&&(!source||s.sourceId===source)&&(!q||(s.title+" "+s.excerpt+" "+s.district).toLowerCase().includes(q)));return send(res,200,{stories:filtered.slice(0,100),total:filtered.length});}
 if(req.method==="GET"&&p.startsWith("/api/stories/")){const id=decodeURIComponent(p.split("/").pop());const s=(await listStories({publishedOnly:true,limit:5000})).find(x=>x.id===id);return s?send(res,200,{story:s}):send(res,404,{error:"Story not found"});}
 if(req.method==="POST"&&p==="/api/login"){const ip=req.headers["x-forwarded-for"]||req.socket.remoteAddress||"unknown";if(rateLimited(ip))return send(res,429,{error:"Too many login attempts. Try again in 15 minutes."});const b=await bodyJSON(req);if(!PASS||!SECRET||!timingSafeText(b.username,USER)||!timingSafeText(b.password,PASS))return send(res,401,{error:"Invalid credentials or admin secrets not configured"});const token=sign({user:USER,exp:Date.now()+28800000});const secure=isProd||req.headers["x-forwarded-proto"]==="https";return send(res,200,{ok:true},"application/json; charset=utf-8",{"set-cookie":"cr_session="+token+"; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800"+(secure?"; Secure":"")});}
 if(p.startsWith("/api/admin/")&&!requireAdmin(req,res))return;
 if(req.method==="POST"&&p.startsWith("/api/admin/")&&!originAllowed(req))return send(res,403,{error:"Origin rejected"});
 if(req.method==="GET"&&p==="/api/admin/overview"){const counts=await countStories();return send(res,200,{counts,sources:readJSON(SOURCES),storage:pool?"PostgreSQL":"Local JSON",syncing});}
 if(req.method==="GET"&&p==="/api/admin/sources")return send(res,200,{sources:readJSON(SOURCES)});
 if(req.method==="GET"&&p==="/api/admin/stories")return send(res,200,{stories:await listStories({limit:500})});
 if(req.method==="POST"&&p==="/api/admin/sync")return send(res,200,{ok:true,...await syncAll()});
 if(req.method==="POST"&&p==="/api/admin/story-status"){const b=await bodyJSON(req);if(!b.id||!["published","pending","rejected"].includes(b.status))return send(res,400,{error:"Invalid story or status"});return send(res,await updateStory(b.id,b.status)?200:404,{ok:true});}
 if(req.method==="POST"&&p==="/api/logout")return send(res,200,{ok:true},"application/json; charset=utf-8",{"set-cookie":"cr_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"});
 if(req.method==="GET"&&p.startsWith("/story/")){
  const id=decodeURIComponent(p.slice(7)),story=(await listStories({publishedOnly:true,limit:5000})).find(x=>x.id===id);
  if(!story)return send(res,404,"Story not found","text/plain; charset=utf-8");
  const esc=x=>String(x||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const html='<!doctype html><html lang="'+(story.language==="hi"?"hi":"en")+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(story.title)+' | ClickRanchi</title><meta name="description" content="'+esc(story.aiSummary||story.excerpt)+'"><link rel="canonical" href="'+SITE_URL+'/story/'+encodeURIComponent(story.id)+'"></head><body style="font:17px/1.6 system-ui;max-width:760px;margin:40px auto;padding:0 20px;color:#202820"><a href="/" style="color:#173d2c;font-weight:bold">CLICKRANCHI</a><p style="color:#98671b;font-size:12px;text-transform:uppercase">'+esc(story.category)+' · '+esc(story.district)+'</p><h1>'+esc(story.title)+'</h1><p style="color:#777;font-size:13px">'+esc(story.sourceName)+' · '+new Date(story.publishedAt).toLocaleString("en-IN")+'</p><p>'+esc(story.aiSummary||story.excerpt)+'</p><p>This is a short news listing. Read the original report at the publisher.</p><a href="'+esc(story.url)+'" rel="noopener noreferrer" target="_blank">Read original report ↗</a></body></html>';
  return send(res,200,html,"text/html; charset=utf-8");
 }
 if(req.method==="GET"){
  const rel=p==="/"?"index.html":p==="/admin"?"admin.html":p.replace(/^\/+/,"");
  const full=path.resolve(PUBLIC,rel);if(!full.startsWith(PUBLIC+path.sep))return send(res,403,"Forbidden","text/plain");
  if(!fs.existsSync(full)||!fs.statSync(full).isFile())return send(res,404,"Not found","text/plain");
  const ext=path.extname(full),types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".svg":"image/svg+xml",".ico":"image/x-icon"};
  return send(res,200,fs.readFileSync(full),types[ext]||"application/octet-stream");
 }
 return send(res,404,{error:"Not found"});
}
async function main(){
 if(isProd&&(!PASS||PASS.length<16||SECRET.length<32))throw new Error("Production requires ADMIN_PASSWORD (16+ chars) and SESSION_SECRET (32+ chars)");
 await initStore();
 const server=http.createServer((req,res)=>route(req,res).catch(e=>{console.error("[request]",e);if(!res.headersSent)send(res,500,{error:isProd?"Internal server error":e.message});}));
 server.listen(PORT,"0.0.0.0",()=>console.log("ClickRanchi listening on "+PORT+"; storage="+(pool?"PostgreSQL":"local JSON")));
 syncAll().then(x=>console.log("[initial sync]",x)).catch(console.error);
 const timer=setInterval(()=>syncAll().then(x=>console.log("[scheduled sync]",x)).catch(console.error),INTERVAL*60000);timer.unref();
 const shutdown=async()=>{server.close();if(pool)await pool.end();process.exit(0);};process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);
}
main().catch(e=>{console.error("[startup]",e);process.exit(1);});
