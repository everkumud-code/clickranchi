const { DISTRICTS, CATEGORIES, classify } = require("./news");
const allowedDistricts = new Set(["Jharkhand", ...DISTRICTS.map(x => x[0])]);
const allowedCategories = new Set(["Jharkhand", ...Object.keys(CATEGORIES)]);
const clean = (s,n) => String(s||"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,n);
async function enrichStory({title,excerpt}) {
 const fallback=classify(title,excerpt), key=process.env.AI_API_KEY;
 if(!key)return {...fallback,aiSummary:clean(excerpt,280),aiProcessed:false};
 try {
  const endpoint=(process.env.AI_BASE_URL||"https://api.openai.com/v1/chat/completions").replace(/\/+$/,"");
  const response=await fetch(endpoint,{method:"POST",headers:{"authorization":"Bearer "+key,"content-type":"application/json"},signal:AbortSignal.timeout(20000),body:JSON.stringify({
   model:process.env.AI_MODEL||"gpt-4o-mini",temperature:0,response_format:{type:"json_object"},
   messages:[
    {role:"system",content:"You classify Jharkhand news. Use only the supplied headline and RSS excerpt. Never add facts or infer details. Return JSON only with district, category, language, summary. district must be one of: "+[...allowedDistricts].join(", ")+". category must be one of: "+[...allowedCategories].join(", ")+". language must be hi or en. summary must be a neutral summary of the supplied text, maximum 240 characters. If uncertain, use Jharkhand for district/category and infer language from text."},
    {role:"user",content:JSON.stringify({headline:clean(title,350),rssExcerpt:clean(excerpt,420)})}
   ]
  })});
  if(!response.ok)throw new Error("AI provider HTTP "+response.status);
  const payload=await response.json(),raw=payload.choices?.[0]?.message?.content;
  if(!raw)throw new Error("AI provider returned an empty result");
  const result=JSON.parse(raw);
  return {district:allowedDistricts.has(result.district)?result.district:fallback.district,category:allowedCategories.has(result.category)?result.category:fallback.category,language:["hi","en"].includes(result.language)?result.language:fallback.language,aiSummary:clean(result.summary,240)||clean(excerpt,240),aiProcessed:true};
 } catch(error) { console.error("[ai-enrichment]",error.message);return {...fallback,aiSummary:clean(excerpt,240),aiProcessed:false}; }
}
module.exports={enrichStory};