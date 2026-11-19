const crypto = require("node:crypto");

const DISTRICTS = [
  ["Ranchi", ["ranchi","रांची"]], ["Dhanbad", ["dhanbad","धनबाद"]],
  ["East Singhbhum", ["east singhbhum","jamshedpur","जमशेदपुर","पूर्वी सिंहभूम"]],
  ["West Singhbhum", ["west singhbhum","chaibasa","चाईबासा","पश्चिमी सिंहभूम"]],
  ["Bokaro", ["bokaro","बोकारो"]], ["Hazaribagh", ["hazaribagh","हजारीबाग"]],
  ["Deoghar", ["deoghar","देवघर"]], ["Giridih", ["giridih","गिरिडीह"]],
  ["Ramgarh", ["ramgarh","रामगढ़"]], ["Palamu", ["palamu","पलामू"]],
  ["Garhwa", ["garhwa","गढ़वा"]], ["Latehar", ["latehar","लातेहार"]],
  ["Chatra", ["chatra","चतरा"]], ["Koderma", ["koderma","कोडरमा"]],
  ["Godda", ["godda","गोड्डा"]], ["Sahibganj", ["sahibganj","साहिबगंज"]],
  ["Pakur", ["pakur","पाकुड़"]], ["Dumka", ["dumka","दुमका"]],
  ["Jamtara", ["jamtara","जामताड़ा"]], ["Simdega", ["simdega","सिमडेगा"]],
  ["Khunti", ["khunti","खूंटी"]], ["Gumla", ["gumla","गुमला"]],
  ["Lohardaga", ["lohardaga","लोहरदगा"]], ["Seraikela-Kharsawan", ["seraikela","kharsawan","सरायकेला","खरसावां"]]
];
const CATEGORIES = {
  Politics: ["politics","election","minister","assembly","सरकार","मंत्री","चुनाव","विधानसभा","मुख्यमंत्री","हेमंत सोरेन"],
  Crime: ["crime","police","murder","arrest","theft","rape","डकैती","हत्या","गिरफ्तार","पुलिस","अपराध"],
  Education: ["education","school","college","university","exam","result","शिक्षा","स्कूल","कॉलेज","परीक्षा","रिजल्ट"],
  Business: ["business","industry","company","market","investment","उद्योग","व्यापार","बाजार","निवेश"],
  Sports: ["sports","cricket","football","hockey","खेल","क्रिकेट","फुटबॉल","हॉकी"],
  "Tribal Affairs": ["tribal","adivasi","आदिवासी","जनजाति","सरना","हो भाषा","मुंडा","संथाल"],
  Civic: ["road","water","electricity","municipal","नगर निगम","सड़क","पानी","बिजली","नाली"],
  Health: ["hospital","health","doctor","medical","अस्पताल","स्वास्थ्य","डॉक्टर"],
  Agriculture: ["farmer","agriculture","crop","किसान","कृषि","फसल"]
};
function decodeEntities(s="") {
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
    .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
}
function stripMarkup(s="") {
  return decodeEntities(s.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim();
}
function canonicalUrl(raw) {
  try {
    const u=new URL(raw); if(!["http:","https:"].includes(u.protocol)) return null;
    u.hash=""; ["fbclid","gclid","mc_cid","mc_eid"].forEach(k=>u.searchParams.delete(k));
    [...u.searchParams.keys()].filter(k=>/^utm_/i.test(k)).forEach(k=>u.searchParams.delete(k));
    if(u.pathname.length>1)u.pathname=u.pathname.replace(/\/+$/,"");
    return u.toString();
  } catch { return null; }
}
function parseFeed(xml) {
  const chunks=[...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(m=>m[0]);
  return chunks.map(chunk=>{
    const value=(tag)=>{
      const re=new RegExp("<"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)</"+tag+">","i");
      const m=chunk.match(re); return m?stripMarkup(m[1]):"";
    };
    const linkTag=chunk.match(/<link\b([^>]*)\/?\s*>/i);
    let link=value("link");
    if(linkTag){const href=linkTag[1].match(/\bhref=["']([^"']+)["']/i);if(href)link=href[1];}
    const url=canonicalUrl(link), title=value("title");
    const excerpt=(value("description")||value("summary")||value("content:encoded")||value("content")).slice(0,420);
    const date=value("pubDate")||value("published")||value("updated");
    if(!url||!title)return null;
    return {title:title.slice(0,350),url,excerpt,publishedAt:Number.isNaN(Date.parse(date))?new Date().toISOString():new Date(date).toISOString()};
  }).filter(Boolean);
}
function classify(title="", excerpt="") {
  const text=(title+" "+excerpt).toLowerCase();
  const district=DISTRICTS.find(([,terms])=>terms.some(t=>text.includes(t.toLowerCase())))?.[0]||"Jharkhand";
  const category=Object.entries(CATEGORIES).find(([,terms])=>terms.some(t=>text.includes(t.toLowerCase())))?.[0]||"Jharkhand";
  const devanagari=(text.match(/[\u0900-\u097f]/g)||[]).length;
  const latin=(text.match(/[a-z]/g)||[]).length;
  const language=devanagari>latin*0.12?"hi":"en";
  return {district,category,language};
}
function tokens(s=""){return new Set(s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}\s]/gu," ").split(/\s+/).filter(x=>x.length>2));}
function similarity(a="",b=""){const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let n=0;for(const x of A)if(B.has(x))n++;return n/(A.size+B.size-n);}
function makeCluster(title, existing=[]) {
  const match=existing.find(s=>similarity(title,s.title)>=0.62);
  return match?.clusterId||crypto.createHash("sha1").update(title.toLowerCase()).digest("hex").slice(0,14);
}
module.exports={DISTRICTS,CATEGORIES,canonicalUrl,parseFeed,classify,similarity,makeCluster,stripMarkup};