const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function load(){
 const root=$("#stories"),status=$("#status"),q=$("#q"),district=$("#district"),publisher=$("#publisher");
 const params=new URLSearchParams(location.search);const category=params.get("category")||"";
 if(category)status.textContent="Category: "+category;
 try{
  const response=await fetch("/api/stories");if(!response.ok)throw new Error("News feed unavailable");
  const {stories=[]}=await response.json();
  const districts=[...new Set(stories.map(s=>s.district).filter(Boolean))].sort();
  const publishers=[...new Map(stories.map(s=>[s.sourceId,s.sourceName])).entries()];
  district.innerHTML='<option value="">All districts</option>'+districts.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join("");
  publisher.innerHTML='<option value="">All publishers</option>'+publishers.map(([id,name])=>'<option value="'+esc(id)+'">'+esc(name)+'</option>').join("");
  function render(){
   const term=q.value.toLocaleLowerCase();
   const list=stories.filter(s=>(!category||s.category===category)&&(!district.value||s.district===district.value)&&(!publisher.value||s.sourceId===publisher.value)&&(!term||(s.title+" "+s.excerpt+" "+s.sourceName+" "+s.district).toLocaleLowerCase().includes(term)));
   root.innerHTML=list.map(s=>'<article class="card"><div class="tag">'+esc(s.category||"Jharkhand")+' · '+esc(s.district||"Jharkhand")+'</div><h2>'+esc(s.title)+'</h2><div class="meta">'+esc(s.sourceName)+' · '+new Date(s.publishedAt).toLocaleString("en-IN")+'</div><p>'+esc(s.aiSummary||s.excerpt||"")+'</p><a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">Read original report ↗</a></article>').join("")||'<p class="meta">No published stories match these filters yet.</p>';
   status.textContent=list.length+" published stories";
  }
  [q,district,publisher].forEach(el=>el.addEventListener(el===q?"input":"change",render));render();
 }catch(e){root.innerHTML='<div class="card">News could not be loaded right now. Please try again shortly.</div>';status.textContent=e.message;}
}
load();