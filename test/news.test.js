const test=require("node:test");
const assert=require("node:assert/strict");
const {canonicalUrl,parseFeed,classify,similarity,makeCluster,DISTRICTS}=require("../lib/news");
test("canonical URL removes tracking parameters",()=>assert.equal(canonicalUrl("https://example.com/story/?utm_source=x&fbclid=1#top"),"https://example.com/story"));
test("RSS parser extracts safe story metadata",()=>{const x=parseFeed("<rss><channel><item><title><![CDATA[रांची में शिक्षा बैठक]]></title><link>https://example.com/a?utm_source=rss</link><description><![CDATA[<b>शिक्षा</b> update]]></description><pubDate>Tue, 18 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>");assert.equal(x.length,1);assert.equal(x[0].title,"रांची में शिक्षा बैठक");assert.equal(x[0].url,"https://example.com/a");assert.match(x[0].excerpt,/शिक्षा update/)});
test("classifier detects Jharkhand district, category and Hindi",()=>{const x=classify("रांची में स्कूल शिक्षा परीक्षा","झारखंड");assert.equal(x.district,"Ranchi");assert.equal(x.category,"Education");assert.equal(x.language,"hi")});
test("all 24 districts are configured",()=>assert.equal(DISTRICTS.length,24));
test("story similarity clusters near-identical headlines",()=>assert.ok(similarity("Ranchi school exam result announced today","Ranchi school exam result announced")>0.62));
test("cluster reuses existing matching cluster",()=>assert.equal(makeCluster("Ranchi school exam result announced today",[{title:"Ranchi school exam result announced",clusterId:"cluster-a"}]),"cluster-a"));