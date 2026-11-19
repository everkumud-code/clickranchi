const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data");
const DB = path.join(DATA, "stories.json");
const SOURCES = path.join(DATA, "sources.json");
const PORT = Number(process.env.PORT || 3000);
const USER = process.env.ADMIN_USER || "admin";
const PASS = process.env.ADMIN_PASSWORD || "change-this-before-deploy";
const INTERVAL = Math.max(5, Number(process.env.SYNC_INTERVAL_MINUTES || 10));
const sessions = new Set();

fs.mkdirSync(DATA, { recursive: true });
if (!fs.existsSync(DB)) fs.writeFileSync(DB, "[]");
const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeStories = (v) => fs.writeFileSync(DB, JSON.stringify(v, null, 2));
const escapeHTML = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
function parseItems(xml) {
  const chunks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(m => m[0]);
  return chunks.map(chunk => {
    const val = (name) => {
      const m = chunk.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "i"));
      return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\\s+/g, " ").trim() : "";
    };
    let link = val("link");
    if (!link) { const m = chunk.match(/<link[^>]+href=["']([^"']+)["']/i); link = m?.[1] || ""; }
    const title = val("title");
    const description = val("description") || val("summary") || val("content:encoded");
    const date = val("pubDate") || val("published") || val("updated") || new Date().toISOString();
    try { const u = new URL(link); if (!["http:", "https:"].includes(u.protocol)) return null; } catch { return null; }
    if (!title || !link) return null;
    return { title, url: link, excerpt: description.slice(0, 420), publishedAt: Number.isNaN(Date.parse(date)) ? new Date().toISOString() : new Date(date).toISOString() };
  }).filter(Boolean);
}
async function syncSource(source) {
  const res = await fetch(source.feedUrl, { headers: { "user-agent": "ClickRanchi/0.1 (+news aggregation; contact site admin)" }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error("Feed returned HTTP " + res.status);
  const xml = await res.text();
  if (!/<(rss|feed|RDF)\b/i.test(xml)) throw new Error("Response does not look like RSS/Atom XML");
  const items = parseItems(xml);
  const stories = readJSON(DB);
  let added = 0;
  for (const item of items) {
    if (stories.some(s => s.url === item.url)) continue;
    stories.push({ id: crypto.randomUUID(), ...item, sourceId: source.id, sourceName: source.name, status: source.autoPublish ? "published" : "pending", collectedAt: new Date().toISOString() });
    added++;
  }
  writeStories(stories);
  source.lastSyncAt = new Date().toISOString();
  source.lastError = null;
  source.lastAdded = added;
  return added;
}
async function syncAll() {
  const sources = readJSON(SOURCES);
  for (const source of sources.filter(s => s.enabled)) {
    try { await syncSource(source); }
    catch (e) { source.lastSyncAt = new Date().toISOString(); source.lastError = e.message; }
  }
  fs.writeFileSync(SOURCES, JSON.stringify(sources, null, 2));
}
function send(res, code, body, type = "application/json; charset=utf-8") { res.writeHead(code, { "content-type": type, "cache-control": "no-store" }); res.end(type.startsWith("application/json") ? JSON.stringify(body) : body); }
function bodyJSON(req) { return new Promise((resolve, reject) => { let b = ""; req.on("data", c => { b += c; if (b.length > 1e6) reject(new Error("Body too large")); }); req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch (e) { reject(e); } }); }); }
function authenticated(req) { return sessions.has((req.headers.cookie || "").split(";").map(s=>s.trim()).find(s=>s.startsWith("cr_session="))?.slice(11)); }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (req.method === "GET" && url.pathname === "/api/health") return send(res, 200, { ok: true, intervalMinutes: INTERVAL });
    if (req.method === "GET" && url.pathname === "/api/stories") {
      const stories = readJSON(DB).filter(s => s.status === "published").sort((a,b) => b.publishedAt.localeCompare(a.publishedAt));
      return send(res, 200, { stories });
    }
    if (req.method === "POST" && url.pathname === "/api/login") {
      const b = await bodyJSON(req);
      if (b.username !== USER || b.password !== PASS || PASS === "change-this-before-deploy") return send(res, 401, { error: "Invalid credentials or admin password not configured" });
      const token = crypto.randomBytes(32).toString("hex"); sessions.add(token);
      res.setHeader("Set-Cookie", "cr_session=" + token + "; HttpOnly; SameSite=Strict; Path=/");
      return send(res, 200, { ok: true });
    }
    if (url.pathname.startsWith("/api/admin/") && !authenticated(req)) return send(res, 401, { error: "Unauthorised" });
    if (req.method === "GET" && url.pathname === "/api/admin/sources") return send(res, 200, { sources: readJSON(SOURCES) });
    if (req.method === "GET" && url.pathname === "/api/admin/stories") return send(res, 200, { stories: readJSON(DB) });
    if (req.method === "POST" && url.pathname === "/api/admin/sync") { await syncAll(); return send(res, 200, { ok: true }); }
    if (req.method === "POST" && url.pathname === "/api/admin/story-status") {
      const b = await bodyJSON(req); const stories = readJSON(DB); const item = stories.find(s => s.id === b.id);
      if (!item || !["pending","published","rejected"].includes(b.status)) return send(res, 400, { error: "Invalid story or status" });
      item.status = b.status; writeStories(stories); return send(res, 200, { ok: true });
    }
    if (req.method === "GET") {
      const file = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
      const full = path.resolve(PUBLIC, file);
      if (!full.startsWith(PUBLIC + path.sep)) return send(res, 403, "Forbidden", "text/plain");
      if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return send(res, 404, "Not found", "text/plain");
      const ext = path.extname(full); const type = ext === ".html" ? "text/html; charset=utf-8" : ext === ".js" ? "text/javascript; charset=utf-8" : "text/plain; charset=utf-8";
      return send(res, 200, fs.readFileSync(full), type);
    }
    send(res, 404, { error: "Not found" });
  } catch (e) { send(res, 500, { error: e.message }); }
});
server.listen(PORT, () => console.log("ClickRanchi listening on port " + PORT));
syncAll().catch(console.error);
setInterval(() => syncAll().catch(console.error), INTERVAL * 60_000);
