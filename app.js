/* מיפוי האקדמיה הישראלית בתחום החלל — לוגיקת האפליקציה */
"use strict";
document.documentElement.setAttribute("dir","rtl");

/* ---------- constants ---------- */
const TYPES=["מעבדה","תואר","קורס","מרכז/מכון","תוכנית מיוחדת"];
const TCOLORS={"מעבדה":"var(--c-lab)","תואר":"var(--c-deg)","קורס":"var(--c-crs)","מרכז/מכון":"var(--c-ctr)","תוכנית מיוחדת":"var(--c-spc)"};
const DOMS=["פיזיקה ואסטרופיזיקה / אסטרונומיה","חישה מרחוק ולוויינים","הנדסת אוויר וחלל / אווירונאוטיקה","רובוטיקה ומערכות חלל","תקשורת לוויינית","מדעי כדור הארץ והאטמוספירה","משפט / רפואת / מדיניות חלל"];
const DOM_SHORT={"פיזיקה ואסטרופיזיקה / אסטרונומיה":"אסטרופיזיקה ואסטרונומיה","חישה מרחוק ולוויינים":"חישה מרחוק ולוויינים","הנדסת אוויר וחלל / אווירונאוטיקה":"הנדסת אוויר וחלל","רובוטיקה ומערכות חלל":"רובוטיקה ומערכות חלל","תקשורת לוויינית":"תקשורת לוויינית","מדעי כדור הארץ והאטמוספירה":"מדעי כדוה\"א והאטמוספירה","משפט / רפואת / מדיניות חלל":"משפט, רפואה ומדיניות"};
const STATUS_LBL={active:["✓ פעיל","ok"],closed:["✕ נסגר","bad"],uncertain:["⚠ לבדיקה","warn"],unverified:["⏳ ממתין לאימות","warn"]};
const CITY_REGION={"חיפה":"north","כרמיאל":"north","קריית שמונה":"north","עמק הירדן":"north","עמק חפר":"center","ירושלים":"jerusalem","באר שבע":"south","שדרות":"south"};
const REGION_WORDS={"בדרומ":"south","דרומ":"south","הדרומ":"south","בצפונ":"north","צפונ":"north","הצפונ":"north","בירושלימ":"jerusalem","ירושלימ":"jerusalem","במרכז":"center","מרכז":"center","הארצ":null};

const state={dom:null,type:null,inst:null,rakia:false,status:null,degree:null,core:false,q:"",table:false,shown:30,edit:false};

/* ---------- normalization ---------- */
const norm=s=>(s||"").replace(/[֑-ׇ]/g,"").replace(/[״"'׳`]/g,"").replace(/[\-–—/\\|,:;·\.\(\)\[\]]/g," ")
  .replace(/ם/g,"מ").replace(/ן/g,"נ").replace(/ץ/g,"צ").replace(/ף/g,"פ").replace(/ך/g,"כ")
  .replace(/וו/g,"ו").replace(/יי/g,"י")
  .toLowerCase().replace(/\s+/g," ").trim();

/* ---------- local edits overlay (localStorage) ---------- */
const LS_KEY="spacemap-edits-v1";
let overlay={added:[],removed:[],edited:{}};
try{const raw=localStorage.getItem(LS_KEY);if(raw){const o=JSON.parse(raw);if(o&&Array.isArray(o.added))overlay=o}}catch(e){}
function saveOverlay(){try{localStorage.setItem(LS_KEY,JSON.stringify(overlay))}catch(e){}}
function overlayCount(){return overlay.added.length+overlay.removed.length+Object.keys(overlay.edited).length}

let ALL=[];        // effective dataset (base minus removed, plus edits, plus added)
let byN=new Map();
function rebuildData(){
  ALL=[];byN=new Map();
  for(const d of DATA){
    if(overlay.removed.includes(d.n))continue;
    const e=overlay.edited[d.n]?Object.assign({},d,overlay.edited[d.n],{_edited:true}):d;
    ALL.push(e);byN.set(e.n,e);
  }
  for(const a of overlay.added){const e=Object.assign({},a,{_added:true});ALL.push(e);byN.set(e.n,e)}
  indexAll();
  _pqCache={q:null,pq:null};
}

/* ---------- search index ---------- */
let VOCAB=new Map(); // token -> Set of n
function entryTokens(u){return (u._name+" "+u._inst+" "+u._body).split(" ").filter(w=>w.length>=3)}
function indexAll(){
  VOCAB=new Map();
  for(const u of ALL){
    u.doms=u.doms&&u.doms.length?u.doms:[u.dom].filter(Boolean);
    u._name=norm([u.name,u.person,u.code].join(" "));
    u._inst=norm([u.inst,u.fac].join(" "));
    u._body=norm([u.dom,(u.doms||[]).join(" "),u.what,u.why,u.notes,u.degree,u.prereq].join(" "));
    u._tags=new Set(u.tags||[]);
    u._region=CITY_REGION[(MAPGEO.cities[u.inst]||{}).city]||"center";
    for(const t of new Set(entryTokens(u))){
      if(!VOCAB.has(t))VOCAB.set(t,new Set());
      VOCAB.get(t).add(u.n);
    }
  }
}

/* bounded Levenshtein distance (early exit above `max`) */
function editDist(a,b,max){
  if(Math.abs(a.length-b.length)>max)return max+1;
  let prev=new Array(b.length+1),cur=new Array(b.length+1);
  for(let j=0;j<=b.length;j++)prev[j]=j;
  for(let i=1;i<=a.length;i++){
    cur[0]=i;let rowMin=i;
    for(let j=1;j<=b.length;j++){
      cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
      if(cur[j]<rowMin)rowMin=cur[j];
    }
    if(rowMin>max)return max+1;
    [prev,cur]=[cur,prev];
  }
  return prev[b.length];
}
function fuzzyNs(term){ // entries containing a token close to `term`
  const max=term.length>=8?2:term.length>=4?1:0;
  if(!max)return null;
  const out=new Set();
  for(const [tok,ns] of VOCAB){
    if(Math.abs(tok.length-term.length)>max)continue;
    if(tok[0]!==term[0]&&tok[1]!==term[0])continue; // cheap prefilter
    if(editDist(term,tok,max)<=max)for(const n of ns)out.add(n);
  }
  return out.size?out:null;
}

/* concepts: match query tokens/phrases to concept ids */
const CONCEPT_SYNS=[]; // [{cid, syn}]
for(const cid in CONCEPTS)for(const s of CONCEPTS[cid].s)CONCEPT_SYNS.push({cid,syn:s});
function conceptsFor(qn,tokens){
  const hits=new Map(); // cid -> strength
  for(const {cid,syn} of CONCEPT_SYNS){
    if(syn.includes(" ")){if(qn.includes(syn))hits.set(cid,Math.max(hits.get(cid)||0,2));continue}
    for(const t of tokens){
      const vars=t.length>3&&"בלמהושכ".includes(t[0])?[t,t.slice(1)]:[t];
      for(const v of vars){
        if(v===syn){hits.set(cid,Math.max(hits.get(cid)||0,2))}
        else if(v.length>=4&&syn.length>=4&&((syn.startsWith(v)&&syn.length-v.length<=2)||(v.startsWith(syn)&&v.length-syn.length<=2))){hits.set(cid,Math.max(hits.get(cid)||0,2))}
        else if(v.length>=4&&editDist(v,syn,1)<=1){hits.set(cid,Math.max(hits.get(cid)||0,1))}
      }
    }
  }
  return hits;
}

const STOP=new Set(["של","עמ","על","גמ","או","את","זה","כל","יש","בתחומ","תחומ","חלל","בחלל","החלל","לחלל","הקשורימ","שקשורימ","קשורימ","בנושא","נושא","ללימודי","לימודי","לגבי","עבור","וגמ","מה","איזה","אילו","יחידות","the","of","in","and","for"].map(norm));
const TYPE_WORDS=(()=>{const raw={"קורס":"קורס","קורסים":"קורס","שיעור":"קורס","שיעורים":"קורס","תואר":"תואר","תארים":"תואר","תוכנית":"תואר","תוכניות":"תואר","תכנית":"תואר","מסלול":"תואר","מסלולים":"תואר","מעבדה":"מעבדה","מעבדות":"מעבדה","מרכז":"מרכז/מכון","מרכזים":"מרכז/מכון","מכון":"מרכז/מכון","מכונים":"מרכז/מכון"};
  const o={};for(const k in raw)o[norm(k)]=raw[k];return o})();

var _pqCache={q:null,pq:null};
function parseQuery(raw){
  if(_pqCache.q===raw)return _pqCache.pq;
  const qn=norm(raw);
  let pq=null;
  if(qn){
    const words=qn.split(" ").filter(w=>w&&!STOP.has(w));
    let type=null,region=null;const terms=[];
    for(const w of words){
      if(TYPE_WORDS[w]){type=TYPE_WORDS[w];continue}
      if(w in REGION_WORDS){if(REGION_WORDS[w])region=REGION_WORDS[w];continue}
      terms.push(w);
    }
    const concepts=conceptsFor(qn,terms);
    const fuzzy={};for(const t of terms)if(!/^\d+$/.test(t))fuzzy[t]=null; // lazily filled
    pq={type,region,terms,concepts,fuzzy};
  }
  _pqCache={q:raw,pq};
  return pq;
}
function scoreUnit(u,pq){
  let score=0,covered=0;
  if(pq.type&&u.type!==pq.type)return -1;
  if(pq.region&&u._region!==pq.region)return -1;
  const conceptHit=[...pq.concepts.entries()].filter(([c])=>u._tags.has(c));
  const strongHit=conceptHit.some(([,st])=>st>=2);
  for(const t of pq.terms){
    let s=0;
    if(/^\d{3,}$/.test(t)){ // course code
      if((u.code&&norm(u.code).includes(t))||u._name.includes(t))s=12;
    }else{
      const vars=t.length>3&&"בלמהושכ".includes(t[0])?[t,t.slice(1)]:[t];
      for(const v of vars){
        if(u._name.includes(v)){s=Math.max(s,10)}
        else if(u._inst.includes(v)){s=Math.max(s,6)}
        else if(u._body.includes(v)){s=Math.max(s,3)}
      }
      if(!s&&t.length>=4){ // fuzzy fallback
        if(pq.fuzzy[t]===null)pq.fuzzy[t]=fuzzyNs(t)||false;
        if(pq.fuzzy[t]&&pq.fuzzy[t].has(u.n))s=4;
      }
    }
    if(s)covered++;
    score+=s;
  }
  score+=conceptHit.slice(0,2).reduce((a,[,st])=>a+(st>=2?5:3),0);
  const need=pq.terms.length?Math.max(1,Math.ceil(pq.terms.length*0.6)):0;
  const enough=pq.terms.length? (covered>=need||strongHit||(covered>=1&&conceptHit.length))
                              : (conceptHit.length>0||pq.type||pq.region);
  if(!enough||score<=0){
    if(pq.terms.length===0&&(pq.type||pq.region))return 0.1; // pure type/region query
    return -1;
  }
  if(u.status==="active")score+=0.5;
  return score;
}
function matchDegree(u,deg){
  if(!deg)return true;
  const d=u.degree||"";
  if(deg==="תארים מתקדמים")return d.includes("מתקדמ")||d.includes("שני")||d.includes("דוקטורט");
  return d.includes(deg.replace("תואר ","")) || d===deg;
}
function matchStatus(u){
  if(!state.status)return true;
  if(state.status==="uncertain")return u.status==="uncertain"||u.status==="unverified";
  return u.status===state.status;
}
function filtered(){
  const base=ALL.filter(u=>
    (!state.dom||u.doms.includes(state.dom))&&
    (!state.type||u.type===state.type)&&
    (!state.inst||u.inst===state.inst)&&
    (!state.rakia||u.rakia)&&
    matchStatus(u)&&
    matchDegree(u,state.degree)&&
    (!state.core||u.core!=="support"));
  const pq=parseQuery(state.q);
  if(!pq)return base;
  if(!pq.terms.length&&!pq.concepts.size&&!pq.type&&!pq.region)return base;
  return base.map(u=>[scoreUnit(u,pq),u]).filter(x=>x[0]>=0)
             .sort((a,b)=>b[0]-a[0]).map(x=>x[1]);
}

/* ---------- "did you mean" suggestions ---------- */
function renderSuggest(list){
  const box=document.getElementById("suggest");
  if(!state.q||list.length>0){box.hidden=true;return}
  const pq=parseQuery(state.q);
  const cands=new Map();
  for(const {cid,syn} of CONCEPT_SYNS){
    for(const t of (pq?pq.terms:[])){
      if(t.length<3)continue;
      const d=editDist(t,syn,2);
      if(d<=2||syn.includes(t)||t.includes(syn))cands.set(cid,Math.min(cands.get(cid)||9,d));
    }
  }
  const top=[...cands.entries()].sort((a,b)=>a[1]-b[1]).slice(0,5).map(([cid])=>cid);
  if(!top.length){box.hidden=true;return}
  box.hidden=false;
  box.innerHTML="אולי התכוונתם: "+top.map(cid=>`<button class="chip" data-cq="${CONCEPTS[cid].l}">${CONCEPTS[cid].l}</button>`).join("");
  box.querySelectorAll("[data-cq]").forEach(b=>b.onclick=()=>{document.getElementById("q").value=b.dataset.cq;state.q=b.dataset.cq;state.shown=30;renderAll()});
}

/* ---------- KPIs ---------- */
function kpis(){
  const labs=ALL.filter(u=>u.type==="מעבדה"||u.type==="מרכז/מכון").length;
  const degs=ALL.filter(u=>u.type==="תואר").length;
  const crs=ALL.filter(u=>u.type==="קורס").length;
  const insts=new Set(ALL.map(u=>u.inst)).size;
  const act=ALL.filter(u=>u.status==="active").length;
  document.getElementById("kpis").innerHTML=[[ALL.length,"יחידות אקדמיות"],[labs,"מעבדות ומרכזים"],[degs,"תוכניות תואר"],[crs,"קורסים"],[insts,"מוסדות"],[act,"אומתו כפעילות"]]
    .map(([b,s])=>`<div class="kpi"><b>${b}</b><span>${s}</span></div>`).join("");
}

/* ---------- chips / tabs / selects ---------- */
function instShort(i){return INST_SHORT[i]||i.replace(/\s*\(.*?\)\s*/g,"").split("–")[0].trim()}
function chips(){
  const counts=d=>ALL.filter(u=>u.doms.includes(d)).length;
  document.getElementById("domChips").innerHTML=
    `<button class="chip" data-dom="" aria-pressed="${!state.dom}">הכל</button>`+
    DOMS.map(d=>`<button class="chip" data-dom="${d}" aria-pressed="${state.dom===d}">${DOM_SHORT[d]} · ${counts(d)}</button>`).join("");
  document.getElementById("typeTabs").innerHTML=
    `<button data-type="" aria-pressed="${!state.type}">הכל</button>`+
    TYPES.filter(t=>ALL.some(u=>u.type===t)).map(t=>`<button data-type="${t}" aria-pressed="${state.type===t}">${t}</button>`).join("");
  const nR=ALL.filter(u=>u.rakia).length;
  const nAct=ALL.filter(u=>u.status==="active").length,nCls=ALL.filter(u=>u.status==="closed").length,
        nUnc=ALL.filter(u=>u.status==="uncertain"||u.status==="unverified").length;
  document.getElementById("extraChips").innerHTML=
    `<span class="lbl">סינון:</span>`+
    `<button class="chip" id="rakiaChip" aria-pressed="${state.rakia}">🗂 מיפוי רקיע · ${nR}</button>`+
    `<span class="lbl">·</span><span class="lbl">סטטוס:</span>`+
    `<button class="chip" data-status="" aria-pressed="${!state.status}">הכל</button>`+
    `<button class="chip" data-status="active" aria-pressed="${state.status==='active'}">✓ פעיל · ${nAct}</button>`+
    (nCls?`<button class="chip" data-status="closed" aria-pressed="${state.status==='closed'}">✕ נסגר · ${nCls}</button>`:"")+
    `<button class="chip" data-status="uncertain" aria-pressed="${state.status==='uncertain'}">⚠ לבדיקה · ${nUnc}</button>`+
    (ALL.some(u=>u.core)?`<span class="lbl">·</span><button class="chip" id="coreChip" aria-pressed="${state.core}">🎯 ליבת חלל בלבד · ${ALL.filter(u=>u.core!=="support").length}</button>`:"");
  const instCounts={};ALL.forEach(u=>instCounts[u.inst]=(instCounts[u.inst]||0)+1);
  const insts=Object.keys(instCounts).sort((a,b)=>instCounts[b]-instCounts[a]);
  document.getElementById("instSel").innerHTML=`<option value="">כל המוסדות (${insts.length})</option>`+
    insts.map(i=>`<option value="${i}" ${state.inst===i?"selected":""}>${instShort(i)} (${instCounts[i]})</option>`).join("");
  document.getElementById("degSel").value=state.degree||"";
  document.getElementById("legend").innerHTML=TYPES.filter(t=>ALL.some(u=>u.type===t)).map(t=>`<span><i style="background:${TCOLORS[t]}"></i>${t}</span>`).join("");
  document.getElementById("instList").innerHTML=insts.map(i=>`<option value="${i}">`).join("");
}

/* ---------- chart ---------- */
function chart(){
  const instCounts={};
  ALL.forEach(u=>{(instCounts[u.inst]=instCounts[u.inst]||{tot:0})[u.type]=(instCounts[u.inst][u.type]||0)+1;instCounts[u.inst].tot++});
  const insts=Object.keys(instCounts).sort((a,b)=>instCounts[b].tot-instCounts[a].tot);
  const max=Math.max(...insts.map(i=>instCounts[i].tot));
  const W=860,LBL=128,BH=19,GAP=8,H=insts.length*(BH+GAP)+6;
  let s=`<svg viewBox="0 0 ${W} ${H}" style="direction:ltr" role="img" aria-label="מספר יחידות לפי מוסד וסוג">`;
  insts.forEach((inst,r)=>{
    const y=r*(BH+GAP)+3;const d=instCounts[inst];
    const sel=state.inst&&state.inst!==inst?0.28:1;
    s+=`<text x="${W-4}" y="${y+BH-5}" text-anchor="end" font-size="12.5" font-weight="600" fill="var(--ink2)" opacity="${sel}">${instShort(inst)}</text>`;
    let x=W-LBL;
    TYPES.forEach(t=>{
      const v=d[t]||0;if(!v)return;
      const w=Math.max(2,(v/max)*(W-LBL-46));
      s+=`<rect class="seg" x="${x-w}" y="${y}" width="${w-2}" height="${BH}" rx="4" fill="${TCOLORS[t]}" opacity="${sel}" data-inst="${inst}" data-type="${t}" data-v="${v}"><title>${inst} · ${t}: ${v}</title></rect>`;
      x-=w;
    });
    s+=`<text x="${x-6}" y="${y+BH-5}" text-anchor="end" font-size="12" font-weight="700" fill="var(--ink3)" opacity="${sel}" style="font-variant-numeric:tabular-nums">${d.tot}</text>`;
  });
  s+="</svg>";
  document.getElementById("chart").innerHTML=s;
  document.querySelectorAll("#chart .seg").forEach(el=>{
    el.addEventListener("click",()=>{
      const i=el.dataset.inst,t=el.dataset.type;
      if(state.inst===i&&state.type===t){state.inst=null;state.type=null}
      else{state.inst=i;state.type=t}
      state.shown=30;renderAll();
    });
    el.addEventListener("mousemove",e=>tipShow(e,`${el.dataset.inst} · ${el.dataset.type}: ${el.dataset.v}`));
    el.addEventListener("mouseleave",tipHide);
  });
}
function tipShow(e,txt){const tip=document.getElementById("tip");tip.textContent=txt;tip.style.opacity=1;
  tip.style.left=Math.max(8,e.clientX-tip.offsetWidth-12)+"px";tip.style.top=(e.clientY-14)+"px"}
function tipHide(){document.getElementById("tip").style.opacity=0}

/* ---------- geographic map ---------- */
let mapVB=null;
const MAP_HOME=[0,0,200,338]; // מהחרמון ועד דרום הנגב (אילת בגרירה למטה)
function mapCounts(){
  const pq=parseQuery(state.q);const counts={};
  ALL.forEach(u=>{
    if(state.dom&&!u.doms.includes(state.dom))return;
    if(state.type&&u.type!==state.type)return;
    if(state.rakia&&!u.rakia)return;
    if(!matchStatus(u))return;
    if(!matchDegree(u,state.degree))return;
    if(state.core&&u.core==="support")return;
    if(pq&&scoreUnit(u,pq)<0)return;
    counts[u.inst]=(counts[u.inst]||0)+1;
  });
  return counts;
}
function renderMap(){
  const box=document.getElementById("map");
  if(!mapVB)mapVB=[...MAP_HOME];
  const counts=mapCounts();
  const nodes=Object.keys(MAPGEO.cities).filter(i=>counts[i]).map(inst=>({
    inst,x:MAPGEO.cities[inst].x,y:MAPGEO.cities[inst].y,city:MAPGEO.cities[inst].city,
    c:counts[inst],r:3.4+Math.sqrt(counts[inst])*1.55
  }));
  for(let it=0;it<90;it++){let moved=false;
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
      const a=nodes[i],b=nodes[j],dx=b.x-a.x,dy=b.y-a.y;
      const dist=Math.hypot(dx,dy)||.01,min=a.r+b.r+.9;
      if(dist<min){const p=(min-dist)/2,ux=dx/dist,uy=dy/dist;
        a.x-=ux*p;a.y-=uy*p;b.x+=ux*p;b.y+=uy*p;moved=true}}
    if(!moved)break}
  let s=`<svg id="mapsvg" viewBox="${mapVB.join(" ")}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="מפת מוסדות">`;
  s+=`<defs>
    <linearGradient id="seaG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--sea1)"/><stop offset="1" stop-color="var(--sea2)"/></linearGradient>
    <linearGradient id="landG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--land-n)"/><stop offset=".45" stop-color="var(--land-c)"/><stop offset="1" stop-color="var(--land-s)"/></linearGradient>
    <filter id="coastSh" x="-8%" y="-4%" width="116%" height="108%">
      <feDropShadow dx="-0.7" dy="0.9" stdDeviation="1.3" flood-color="#0a2a45" flood-opacity="0.28"/></filter>
  </defs>`;
  s+=`<rect x="-400" y="-400" width="1000" height="1400" fill="url(#seaG)"/>`;
  s+=`<g filter="url(#coastSh)"><path d="${MAPGEO.pse}" fill="url(#landG)"/><path d="${MAPGEO.isr}" fill="url(#landG)"/></g>`;
  s+=`<path d="${MAPGEO.isr}" fill="none" stroke="var(--coast)" stroke-width=".55"/>`;
  s+=`<path d="${MAPGEO.pse}" fill="none" stroke="var(--border-dash)" stroke-width=".45" stroke-dasharray="1.6 1.4"/>`;
  s+=`<path d="${MAPGEO.kinneret}" fill="url(#seaG)" stroke="var(--coast)" stroke-width=".3"/>`;
  s+=`<path d="${MAPGEO.deadsea}" fill="url(#seaG)" stroke="var(--coast)" stroke-width=".3"/>`;
  s+=`<path d="${MAPGEO.deadseaS}" fill="url(#seaG)" stroke="var(--coast)" stroke-width=".3"/>`;
  s+=`<text class="sealbl" x="22" y="150" font-size="6.5" transform="rotate(-76 22 150)">הים התיכון</text>`;
  s+=`<text class="sealbl" x="168" y="92" font-size="4">כנרת</text>`;
  s+=`<text class="sealbl" x="163" y="262" font-size="4" transform="rotate(-86 163 262)">ים המלח</text>`;
  nodes.sort((a,b)=>b.r-a.r).forEach(n=>{
    const sel=state.inst===n.inst,dim=state.inst&&!sel;
    s+=`<circle class="bub${sel?" sel":""}${dim?" dim":""}" cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.r.toFixed(1)}" data-inst="${n.inst}" data-c="${n.c}"/>`;
    if(n.r>=5.4)s+=`<text class="blbl" x="${n.x.toFixed(1)}" y="${(n.y+1.9).toFixed(1)}" font-size="${Math.min(6.5,n.r*.9).toFixed(1)}">${n.c}</text>`;
    if(n.r>=7.6||sel)s+=`<text class="mlbl${dim?" dim":""}" x="${n.x.toFixed(1)}" y="${(n.y-n.r-1.8).toFixed(1)}" font-size="5">${instShort(n.inst)}</text>`;
  });
  s+="</svg>";
  s+=`<div class="mapbtns"><button data-z="in" aria-label="הגדלה">+</button><button data-z="out" aria-label="הקטנה">−</button><button data-z="reset" aria-label="איפוס תצוגה">⌂</button></div>`;
  box.innerHTML=s;
  const svg=box.querySelector("svg");
  function zoomAt(f,cx,cy){
    const [x,y,w,h]=mapVB;const nw=Math.min(Math.max(w/f,26),320);const nh=nw*h/w;
    const rx=(cx-x)/w,ry=(cy-y)/h;
    mapVB=[cx-rx*nw,cy-ry*nh,nw,nh];renderMap();
  }
  box.querySelectorAll(".mapbtns button").forEach(b=>b.onclick=()=>{
    const [x,y,w,h]=mapVB;
    if(b.dataset.z==="reset"){mapVB=[...MAP_HOME];renderMap()}
    else zoomAt(b.dataset.z==="in"?1.45:1/1.45,x+w/2,y+h/2);
  });
  svg.addEventListener("wheel",e=>{
    e.preventDefault();
    const r=svg.getBoundingClientRect();
    const cx=mapVB[0]+(e.clientX-r.left)/r.width*mapVB[2];
    const cy=mapVB[1]+(e.clientY-r.top)/r.height*mapVB[3];
    zoomAt(e.deltaY<0?1.25:1/1.25,cx,cy);
  },{passive:false});
  let pan=null;
  svg.addEventListener("pointerdown",e=>{if(e.target.classList.contains("bub"))return;
    pan={x:e.clientX,y:e.clientY,vb:[...mapVB]};svg.classList.add("panning");svg.setPointerCapture(e.pointerId)});
  svg.addEventListener("pointermove",e=>{if(!pan)return;
    const r=svg.getBoundingClientRect();
    mapVB[0]=pan.vb[0]-(e.clientX-pan.x)*pan.vb[2]/r.width;
    mapVB[1]=pan.vb[1]-(e.clientY-pan.y)*pan.vb[3]/r.height;
    svg.setAttribute("viewBox",mapVB.join(" "))});
  const endPan=()=>{pan=null;svg.classList.remove("panning")};
  svg.addEventListener("pointerup",endPan);svg.addEventListener("pointercancel",endPan);
  box.querySelectorAll(".bub").forEach(el=>{
    el.addEventListener("click",()=>{state.inst=state.inst===el.dataset.inst?null:el.dataset.inst;state.shown=30;renderAll()});
    el.addEventListener("mousemove",e=>tipShow(e,`${el.dataset.inst} · ${el.dataset.c} יחידות`));
    el.addEventListener("mouseleave",tipHide);
  });
}

/* ---------- results ---------- */
function activeChips(list){
  const parts=[];
  if(state.dom)parts.push(["תחום: "+DOM_SHORT[state.dom],"dom"]);
  if(state.type)parts.push(["סוג: "+state.type,"type"]);
  if(state.inst)parts.push(["מוסד: "+instShort(state.inst),"inst"]);
  if(state.rakia)parts.push(["מיפוי רקיע","rakia"]);
  if(state.status)parts.push(["סטטוס: "+STATUS_LBL[state.status][0],"status"]);
  if(state.degree)parts.push(["תואר: "+state.degree,"degree"]);
  if(state.q)parts.push(["„"+state.q+"”","q"]);
  document.getElementById("activeChips").innerHTML=parts.length?
    parts.map(([l,k])=>`<button class="chip" data-clear="${k}">${l}<b>✕</b></button>`).join("")+
    `<button class="chip" data-clear="all">נקה הכל</button>`:"";
  document.querySelectorAll("#activeChips .chip").forEach(el=>el.onclick=()=>{
    const k=el.dataset.clear;
    if(k==="all"){Object.assign(state,{dom:null,type:null,inst:null,rakia:false,status:null,degree:null,q:""});document.getElementById("q").value=""}
    else if(k==="q"){state.q="";document.getElementById("q").value=""}
    else if(k==="rakia")state.rakia=false;
    else state[k]=null;
    state.shown=30;renderAll();
  });
  document.getElementById("count").textContent=`נמצאו ${list.length} יחידות`;
}
/* עטיפת קטעים לטיניים בסוגריים כדי שלא יתהפכו בטקסט RTL */
function bidi(s){
  return String(s||"").replace(/\(([A-Za-z0-9][^()֐-׿]*)\)/g,'<span class="ltr">($1)</span>');
}
function statusTag(u){
  const st=STATUS_LBL[u.status]||STATUS_LBL.unverified;
  if(u.status==="unverified"&&u.ok)return `<span class="tag ok">✓ אומת</span>`;
  return `<span class="tag ${st[1]}">${st[0]}</span>`;
}
function card(u){
  const teaser=(u.what||"").split(/(?<=\.)\s/)[0]||"";
  return `<div class="card" role="button" tabindex="0" data-n="${u.n}" style="--tc:${TCOLORS[u.type]}">
    <div class="editbtns"><button class="ed" data-ed="${u.n}" title="עריכה">✎</button><button class="del" data-del="${u.n}" title="מחיקה">✕</button></div>
    <div class="tags"><span class="tag type">${u.type}</span>${u.degree?`<span class="tag deg">🎓 ${u.degree}</span>`:""}<span class="tag dom">${DOM_SHORT[u.doms[0]]||u.doms[0]}</span>${statusTag(u)}${u.rakia?`<span class="tag rakia">🗂 מיפוי רקיע</span>`:""}${u._added||u._edited?`<span class="tag local">✎ ${u._added?"נוסף ידנית":"נערך"}</span>`:""}${u.year&&u.year>=2023?'<span class="tag new">🆕 '+u.year+'</span>':""}</div>
    <h3>${bidi(u.name)}</h3>
    <div class="inst">${u.inst}${u.fac?" · "+bidi(u.fac):""}</div>
    ${teaser?`<div class="teaser">${teaser}</div>`:""}
    ${u.person?`<div class="person">👤 ${bidi(u.person)}</div>`:""}
  </div>`;
}
function tableView(list){
  const rows=list.map(u=>`<tr><td><a href="#" data-n="${u.n}" style="color:inherit;text-decoration:none;font-weight:600">${bidi(u.name)}</a></td><td>${instShort(u.inst)}</td><td>${u.type}</td><td>${u.degree||"—"}</td><td>${statusTag(u)}</td><td class="ltr">${u.code||""}</td><td>${DOM_SHORT[u.doms[0]]||u.doms[0]}</td><td>${u.person||"—"}</td><td>${u.rakia?"🗂":""}</td><td><a href="${u.url}" target="_blank" rel="noopener">קישור ↗</a></td></tr>`).join("");
  document.getElementById("tablewrap").innerHTML=`<table><thead><tr><th>יחידה</th><th>מוסד</th><th>סוג</th><th>תואר</th><th>סטטוס</th><th>מס' קורס</th><th>תחום</th><th>חוקר/מרצה</th><th>רקיע</th><th>קישור</th></tr></thead><tbody>${rows}</tbody></table>`;
  document.querySelectorAll("#tablewrap [data-n]").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();openDrawer(+a.dataset.n)}));
}
function editbar(){
  const bar=document.getElementById("editbar");
  if(!state.edit){bar.innerHTML="";return}
  const removedNames=overlay.removed.map(n=>{const d=DATA.find(x=>x.n===n);return d?d.name:("#"+n)});
  bar.innerHTML=`<b>מצב עריכה</b>
    <span>נוספו: ${overlay.added.length} · נערכו: ${Object.keys(overlay.edited).length} · הוסרו: ${overlay.removed.length}</span>
    <button class="chip primary" id="addBtn">➕ הוספת יחידה</button>
    <button class="chip" id="expOv">⬇ ייצוא גיבוי</button>
    <button class="chip" id="impOv">⬆ ייבוא גיבוי</button>
    ${overlayCount()?`<button class="chip danger" id="rstOv">איפוס כל השינויים</button>`:""}
    ${overlay.removed.length?`<span style="width:100%"></span><span>הוסרו: ${removedNames.map((nm,i)=>`<button class="chip" data-restore="${overlay.removed[i]}" title="שחזור">↩ ${nm.slice(0,40)}</button>`).join(" ")}</span>`:""}
    <input type="file" id="impFile" accept="application/json" hidden>`;
  document.getElementById("addBtn").onclick=()=>openModal(null);
  document.getElementById("expOv").onclick=exportOverlay;
  document.getElementById("impOv").onclick=()=>document.getElementById("impFile").click();
  document.getElementById("impFile").onchange=importOverlay;
  const rst=document.getElementById("rstOv");
  if(rst)rst.onclick=()=>{if(confirm("לאפס את כל השינויים המקומיים? הפעולה אינה הפיכה.")){overlay={added:[],removed:[],edited:{}};saveOverlay();rebuildData();renderAll()}};
  bar.querySelectorAll("[data-restore]").forEach(b=>b.onclick=()=>{
    overlay.removed=overlay.removed.filter(n=>n!==+b.dataset.restore);saveOverlay();rebuildData();renderAll()});
}
function renderResults(){
  const list=filtered();
  activeChips(list);renderSuggest(list);editbar();
  const is=document.getElementById("instSum");
  if(state.inst&&INST_SUMM[state.inst]){is.hidden=false;is.innerHTML=`<h2>${state.inst}</h2><p style="margin:6px 0 0;max-width:75ch;color:var(--ink2)">${INST_SUMM[state.inst]}</p>`}
  else is.hidden=true;
  const grid=document.getElementById("grid"),tw=document.getElementById("tablewrap"),
        more=document.getElementById("more"),empty=document.getElementById("empty");
  empty.hidden=list.length>0;
  if(state.table){grid.hidden=true;tw.hidden=false;more.hidden=true;tableView(list)}
  else{
    grid.hidden=false;tw.hidden=true;
    grid.innerHTML=`<button class="addcard" id="addCard">➕ הוספת יחידה חדשה</button>`+list.slice(0,state.shown).map(card).join("");
    more.hidden=list.length<=state.shown;
    grid.querySelectorAll(".card").forEach(el=>{
      el.addEventListener("click",e=>{if(e.target.closest(".editbtns"))return;openDrawer(+el.dataset.n)});
      el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openDrawer(+el.dataset.n)}});
    });
    grid.querySelectorAll("[data-del]").forEach(b=>b.onclick=e=>{e.stopPropagation();removeEntry(+b.dataset.del)});
    grid.querySelectorAll("[data-ed]").forEach(b=>b.onclick=e=>{e.stopPropagation();openModal(+b.dataset.ed)});
    const ac=document.getElementById("addCard");
    if(ac)ac.onclick=()=>openModal(null);
  }
}
function renderAll(){kpis();chips();chart();renderMap();renderResults();bindControls()}

/* ---------- drawer ---------- */
let lastFocus=null;
function openDrawer(n){
  const u=byN.get(n);if(!u)return;
  lastFocus=document.activeElement;
  const d=document.getElementById("drawer");
  const prereqEntries=(u.prereqIds||[]).map(x=>byN.get(x)).filter(Boolean);
  const continuations=ALL.filter(x=>(x.prereqIds||[]).includes(u.n));
  const facts=[
    u.code?["מס' קורס",`<span class="ltr">${u.code}</span>`]:null,
    u.credits?["נ\"ז",u.credits]:null,
    u.degree?["קהל היעד",u.degree]:null,
    u.mandatory?["חובה/בחירה",u.mandatory]:null,
    u.year?["פועל/ת משנת",u.year]:null,
  ].filter(Boolean);
  const st=u.status;
  d.innerHTML=`<div class="inner">
    <button class="close" aria-label="סגירה">✕</button>
    <div class="crumbs">${u.inst}${u.fac?" ◂ "+bidi(u.fac):""}</div>
    <div class="tags"><span class="tag type" style="background:${TCOLORS[u.type]}">${u.type}</span>
      ${u.degree?`<span class="tag deg">🎓 ${u.degree}</span>`:""}
      <span class="tag dom">${u.doms.map(x=>DOM_SHORT[x]||x).join(" · ")}</span>
      ${statusTag(u)}
      ${u.rakia?`<span class="tag rakia" title="אותרה במיפוי הידני של צוות רקיע">🗂 מיפוי רקיע</span>`:""}
      ${u._added?`<span class="tag local">✎ נוסף ידנית</span>`:u._edited?`<span class="tag local">✎ נערך מקומית</span>`:""}</div>
    <h2 id="dTitle">${bidi(u.name)}</h2>
    ${facts.length?`<div class="facts">${facts.map(([k,v])=>`<span class="fact">${k}: <b>${v}</b></span>`).join("")}</div>`:""}
    ${u.what?`<div class="sec"><h4>מה זה?</h4><p>${u.what}</p></div>`:""}
    ${u.person?`<div class="sec people"><h4>מי מוביל${u.type==="קורס"?" את הקורס":""}?</h4><p>${u.person}</p></div>`:""}
    ${u.why?`<div class="sec why"><h4>למה זה חשוב?</h4><p>${u.why}</p></div>`:""}
    ${st==="closed"?`<div class="badbox"><b>התוכנית נסגרה.</b> ${u.statusNote||""}</div>`
      :st==="uncertain"?`<div class="warnbox"><b>הסטטוס דורש בדיקה.</b> ${u.statusNote||u.notes||""}</div>`
      :st==="active"&&u.statusNote?`<div class="okbox">✓ אומת: ${u.statusNote}</div>`
      :st==="unverified"&&!u.ok?`<div class="warnbox">הפרטים ביחידה זו נאספו ממקור רשמי אך טרם אומתו במלואם.${u.notes?" הערת הבודקים: "+u.notes:""}</div>`:""}
    ${u.prereq||prereqEntries.length?`<div class="sec"><h4>דרישות קדם</h4>
      ${prereqEntries.length?`<div class="rel">${prereqEntries.map(p=>`<button class="relchip" data-open="${p.n}">◂ ${bidi(p.name)}<small>${p.code?p.code+" · ":""}${p.degree||""}</small></button>`).join("")}</div>`:""}
      ${u.prereq?`<p style="font-size:13.5px;color:var(--ink3);margin-top:8px">${u.prereq}</p>`:""}</div>`:""}
    ${continuations.length?`<div class="sec"><h4>קורסי המשך (דורשים את הקורס הזה)</h4>
      <div class="rel">${continuations.map(p=>`<button class="relchip" data-open="${p.n}">${bidi(p.name)} ▸<small>${p.code?p.code+" · ":""}${p.degree||""}</small></button>`).join("")}</div></div>`:""}
    <a class="cta" href="${u.url}" target="_blank" rel="noopener">לעמוד הרשמי ↗</a>
    ${state.edit?`<div style="margin-top:14px;display:flex;gap:8px"><button class="btn" data-med="${u.n}">✎ עריכת היחידה</button><button class="btn danger" data-mdel="${u.n}">✕ מחיקה</button></div>`:""}
    <div class="src">מקור: <span class="ltr">${(()=>{try{return new URL(u.url).hostname}catch(e){return u.url}})()}</span></div>
  </div>`;
  d.classList.add("open");document.getElementById("backdrop").classList.add("open");
  d.querySelector(".close").focus();
  d.querySelector(".close").addEventListener("click",closeDrawer);
  d.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>openDrawer(+b.dataset.open));
  const me=d.querySelector("[data-med]");if(me)me.onclick=()=>{closeDrawer();openModal(n)};
  const md=d.querySelector("[data-mdel]");if(md)md.onclick=()=>{closeDrawer();removeEntry(n)};
}
function closeDrawer(){
  document.getElementById("drawer").classList.remove("open");
  document.getElementById("backdrop").classList.remove("open");
  if(lastFocus&&lastFocus.isConnected)lastFocus.focus();
}
document.getElementById("backdrop").addEventListener("click",closeDrawer);
addEventListener("keydown",e=>{if(e.key==="Escape"){closeDrawer();closeModal()}});

/* ---------- edit: add/edit/remove ---------- */
function clientTags(u){
  const text=norm([u.name,u.fac,u.what,u.why,u.dom,(u.doms||[]).join(" ")].join(" "));
  const tags=[];
  for(const cid in CONCEPTS){
    if(CONCEPTS[cid].s.some(syn=>syn.length>=3&&text.includes(syn)))tags.push(cid);
  }
  return tags;
}
function removeEntry(n){
  const u=byN.get(n);if(!u)return;
  if(!state.edit){state.edit=true;document.body.classList.add("edit-mode");document.getElementById("editToggle").setAttribute("aria-pressed","true")}
  if(!confirm(`למחוק את „${u.name}"?\n(אפשר לשחזר מסרגל העריכה)`))return;
  if(u._added)overlay.added=overlay.added.filter(a=>a.n!==n);
  else{overlay.removed.push(n);delete overlay.edited[n]}
  saveOverlay();rebuildData();renderAll();
}
let modalFor=null; // null=new, number=edit existing
function openModal(n){
  modalFor=n;
  const f=document.getElementById("editForm");
  f.querySelector('[name=type]').innerHTML=TYPES.map(t=>`<option>${t}</option>`).join("");
  f.querySelector('[name=dom]').innerHTML=DOMS.map(d=>`<option>${d}</option>`).join("");
  f.querySelector('[name=dom2]').innerHTML=`<option value="">—</option>`+DOMS.map(d=>`<option>${d}</option>`).join("");
  document.getElementById("mTitle").textContent=n==null?"הוספת יחידה":"עריכת יחידה";
  document.getElementById("formErr").textContent="";
  f.reset();
  if(n!=null){
    const u=byN.get(n);if(!u)return;
    for(const k of ["type","inst","name","fac","dom","degree","person","code","credits","prereq","url","year","status","what","why"]){
      const el=f.querySelector(`[name=${k}]`);if(el)el.value=u[k]||(k==="status"?"active":"");
    }
    f.querySelector('[name=dom2]').value=(u.doms||[])[1]||"";
    f.querySelector('[name=rakia]').checked=!!u.rakia;
    f.querySelector('[name=core]').checked=u.core!=="support";
  }
  document.getElementById("modal").classList.add("open");
  f.querySelector('[name=name]').focus();
}
function closeModal(){document.getElementById("modal").classList.remove("open");modalFor=null}
document.getElementById("mCancel").onclick=closeModal;
document.getElementById("modal").addEventListener("click",e=>{if(e.target.id==="modal")closeModal()});
document.getElementById("editForm").addEventListener("submit",e=>{
  e.preventDefault();
  const f=e.target,v=k=>f.querySelector(`[name=${k}]`).value.trim();
  if(!v("name")||!v("inst")||!v("url")){document.getElementById("formErr").textContent="נא למלא שם, מוסד וקישור";return}
  const doms=[v("dom")];if(v("dom2")&&v("dom2")!==v("dom"))doms.push(v("dom2"));
  const patch={
    type:v("type"),inst:v("inst"),name:v("name"),fac:v("fac"),dom:v("dom"),doms,
    degree:v("degree"),person:v("person"),code:v("code"),credits:v("credits"),prereq:v("prereq"),
    url:v("url"),year:v("year")?+v("year"):null,status:v("status"),
    what:v("what"),why:v("why"),
    rakia:f.querySelector('[name=rakia]').checked,
    core:f.querySelector('[name=core]').checked?"core":"support",
  };
  patch.tags=clientTags(patch);
  if(modalFor==null){
    const maxN=Math.max(10000,...overlay.added.map(a=>a.n));
    patch.n=maxN+1;patch.statusNote="נוסף ידנית";
    overlay.added.push(patch);
  }else{
    const u=byN.get(modalFor);
    if(u._added){const i=overlay.added.findIndex(a=>a.n===modalFor);overlay.added[i]=Object.assign({},overlay.added[i],patch)}
    else overlay.edited[modalFor]=Object.assign({},overlay.edited[modalFor]||{},patch);
  }
  saveOverlay();rebuildData();closeModal();renderAll();
});
function exportOverlay(){
  const payload={format:"spacemap-backup",exportedAt:new Date().toISOString(),overlay,
                 snapshot:ALL.map(u=>{const c=Object.assign({},u);delete c._name;delete c._inst;delete c._body;delete c._tags;delete c._region;return c})};
  saveBlob(new Blob([JSON.stringify(payload,null,1)],{type:"application/json"}),"space-academy-edits.json");
}
function importOverlay(e){
  const file=e.target.files[0];if(!file)return;
  const rd=new FileReader();
  rd.onload=()=>{
    try{
      const o=JSON.parse(rd.result);
      const ov=o.overlay&&Array.isArray(o.overlay.added)?o.overlay:(Array.isArray(o.added)?o:null);
      if(!ov)throw new Error("bad format");
      overlay=ov;saveOverlay();rebuildData();renderAll();
    }catch(err){alert("קובץ הגיבוי אינו בפורמט המוכר")}
  };
  rd.readAsText(file);e.target.value="";
}

/* ---------- export (styled Excel + CSV) ---------- */
function saveBlob(blob,fname){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download=fname;a.rel="noopener";
  document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2500);
}
const XLS_TC={"מעבדה":"#1E6FC0","תואר":"#9A6410","קורס":"#058C63","מרכז/מכון":"#6C48BE","תוכנית מיוחדת":"#C13B6B"};
const STATUS_TXT={active:"פעיל",closed:"נסגר",uncertain:"לבדיקה",unverified:"טרם אומת"};
function exportXLS(){
  const list=filtered();
  const esc=s=>String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const rows=list.map((u,i)=>`<tr${i%2?' class="alt"':''}>
    <td class="num">${i+1}</td><td class="b">${esc(u.name)}</td><td>${esc(u.inst)}</td><td>${esc(u.fac)}</td>
    <td><span style="color:${XLS_TC[u.type]};font-weight:bold">${u.type}</span></td>
    <td>${esc(u.degree)}</td><td>${esc(u.code)}</td><td>${esc(u.credits)}</td>
    <td>${esc(u.person)}</td><td>${esc(u.dom)}</td>
    <td>${STATUS_TXT[u.status]||""}${u.statusNote?" — "+esc(u.statusNote):""}</td>
    <td>${u.rakia?"מיפוי רקיע":""}</td><td>${esc(u.prereq)}</td>
    <td><a href="${esc(u.url)}">${esc(u.url)}</a></td><td>${esc(u.notes)}</td></tr>`).join("");
  const html=`﻿<html dir="rtl" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">
  <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>מיפוי חלל</x:Name>
  <x:WorksheetOptions><x:DisplayRightToLeft/><x:FrozenNoSplit/><x:SplitHorizontal>1</x:SplitHorizontal><x:TopRowBottomPane>1</x:TopRowBottomPane></x:WorksheetOptions>
  </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
  <style>
    table{border-collapse:collapse;font-family:Arial;font-size:11pt;direction:rtl}
    th{background:#111B32;color:#F9FDFF;font-weight:bold;padding:8px 10px;border:1px solid #33405F;font-size:11pt}
    td{padding:6px 9px;border:1px solid #D8E4F0;vertical-align:top;mso-number-format:'\\@'}
    tr.alt td{background:#F0F6FA}
    td.b{font-weight:bold}td.num{color:#7A8AA6}
    caption{font-size:15pt;font-weight:bold;padding:10px;color:#111B32}
  </style></head><body>
  <table><caption>מיפוי האקדמיה הישראלית בתחום החלל · ${list.length} יחידות · עודכן ${META.updated}</caption>
  <thead><tr><th>#</th><th>שם היחידה</th><th>מוסד</th><th>פקולטה/בית ספר</th><th>סוג</th><th>קהל יעד</th><th>מס' קורס</th><th>נ"ז</th><th>חוקר/מרצה מוביל</th><th>תחום חלל</th><th>סטטוס</th><th>מיפוי רקיע</th><th>דרישות קדם</th><th>קישור</th><th>הערות</th></tr></thead>
  <tbody>${rows}</tbody></table></body></html>`;
  saveBlob(new Blob([html],{type:"application/vnd.ms-excel;charset=utf-8"}),"israel-space-academy-mapping.xls");
}
function csv(){
  const list=filtered();
  const head=["שם יחידה","מוסד","פקולטה","סוג","קהל יעד","מס' קורס","נ\"ז","חוקר/מרצה מוביל","תחום חלל","סטטוס","הערת סטטוס","מיפוי רקיע","דרישות קדם","קישור","הערות"];
  const esc=v=>`"${String(v||"").replace(/"/g,'""')}"`;
  const body=list.map(u=>[u.name,u.inst,u.fac,u.type,u.degree,u.code,u.credits,u.person,u.dom,STATUS_TXT[u.status]||"",u.statusNote,u.rakia?"כן":"",u.prereq,u.url,u.notes].map(esc).join(","));
  saveBlob(new Blob(["﻿"+[head.map(esc).join(",")].concat(body).join("\r\n")],{type:"text/csv;charset=utf-8"}),"israel-space-academy-mapping.csv");
}

/* ---------- events ---------- */
function bindControls(){
  document.querySelectorAll("#domChips .chip").forEach(el=>el.onclick=()=>{state.dom=el.dataset.dom||null;state.shown=30;renderAll()});
  document.querySelectorAll("#typeTabs button").forEach(el=>el.onclick=()=>{state.type=el.dataset.type||null;state.shown=30;renderAll()});
  document.getElementById("instSel").onchange=e=>{state.inst=e.target.value||null;state.shown=30;renderAll()};
  document.getElementById("degSel").onchange=e=>{state.degree=e.target.value||null;state.shown=30;renderAll()};
  const rc=document.getElementById("rakiaChip");
  if(rc)rc.onclick=()=>{state.rakia=!state.rakia;state.shown=30;renderAll()};
  document.querySelectorAll("#extraChips .chip[data-status]").forEach(el=>el.onclick=()=>{state.status=el.dataset.status||null;state.shown=30;renderAll()});
  const cc=document.getElementById("coreChip");
  if(cc)cc.onclick=()=>{state.core=!state.core;state.shown=30;renderAll()};
  const t=document.getElementById("viewToggle");
  t.onclick=()=>{state.table=!state.table;t.setAttribute("aria-pressed",state.table);renderResults()};
  const et=document.getElementById("editToggle");
  et.onclick=()=>{state.edit=!state.edit;et.setAttribute("aria-pressed",state.edit);
    document.body.classList.toggle("edit-mode",state.edit);renderResults()};
  document.getElementById("xlsBtn").onclick=exportXLS;
  document.getElementById("csvBtn").onclick=csv;
  document.getElementById("more").onclick=()=>{state.shown+=60;renderResults()};
}
let qTimer=null;
document.getElementById("q").addEventListener("input",e=>{
  clearTimeout(qTimer);
  qTimer=setTimeout(()=>{state.q=e.target.value;state.shown=30;renderAll()},140);
});

/* ---------- init ---------- */
rebuildData();
document.getElementById("footMeta").textContent=`עודכן: ${META.updated} · ${META.total} יחידות ממופות · כל יחידה מקושרת למקור רשמי`;
renderAll();
