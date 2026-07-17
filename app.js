'use strict';
/* Ryan Shirley — World Travel Map. Buildless MapLibre + native clustering (scales to 1000s of pins).
   Data: data/app.json {meta, places[], videos[]}. Weather: Open-Meteo (on demand). No API keys. */
let DATA=null, MAP=null, PLACES=[], BYID={}, FILT={cont:'all'}, LB=null;
const esc=s=>(s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const CONTS=[['all','All','#eef2f7'],['Europe','Europe','var(--eu)'],['Asia','Asia','var(--as)'],
  ['Africa','Africa','var(--af)'],['North America','N. America','var(--na)'],
  ['South America','S. America','var(--sa)'],['Oceania','Oceania','var(--oc)']];
const CC={'Europe':'#5aa0ff','Asia':'#e8794a','Africa':'#e5c04a','North America':'#9b6cf0',
  'South America':'#5bd6c0','Oceania':'#f05a8c','Other':'#8492a3'};

/* booking + map links (deterministic, real, bookable — no fabrication) */
const q=s=>encodeURIComponent(s);
const bookingUrl=p=>`https://www.booking.com/searchresults.html?ss=${q(p.name+', '+p.country)}`;
const airbnbUrl=p=>`https://www.airbnb.com/s/${q(p.name+', '+p.country)}/homes`;
const googleHotelsUrl=p=>`https://www.google.com/travel/search?q=${q('hotels in '+p.name+' '+p.country)}`;
const osmUrl=p=>`https://www.openstreetmap.org/search?query=${q(p.name+', '+p.country)}`;
/* flights from Boston (BOS) */
const flightUrl=p=>{const a=p.airport&&p.airport.iata?String(p.airport.iata).toLowerCase():'';
  return a?`https://www.skyscanner.com/transport/flights/bos/${a}/`
          :`https://www.google.com/travel/flights?q=${q('flights from Boston to '+((p.airport&&p.airport.city)||p.country))}`;};

/* safety + cost helpers */
const ADV={1:['#5cc98a','Exercise normal precautions'],2:['#e5c04a','Exercise increased caution'],
  3:['#e8794a','Reconsider travel'],4:['#e2685f','Do not travel']};
const advColor=l=>(ADV[l]||['#8492a3',''])[0];
const usd=n=>(n||n===0)?'$'+Number(n).toLocaleString():'—';
const costTierHTML=t=>{t=t||0;let s='';for(let i=1;i<=4;i++)s+=`<span class="${i<=t?'ct-on':'ct-off'}">$</span>`;return s;};

/* weather */
const WX={0:['☀️','Clear'],1:['🌤️','Mostly clear'],2:['⛅','Partly cloudy'],3:['☁️','Overcast'],
 45:['🌫️','Fog'],48:['🌫️','Fog'],51:['🌦️','Drizzle'],53:['🌦️','Drizzle'],55:['🌦️','Drizzle'],
 61:['🌧️','Light rain'],63:['🌧️','Rain'],65:['🌧️','Heavy rain'],71:['🌨️','Light snow'],73:['🌨️','Snow'],
 75:['❄️','Heavy snow'],77:['🌨️','Snow'],80:['🌦️','Showers'],81:['🌦️','Showers'],82:['⛈️','Heavy showers'],
 85:['🌨️','Snow showers'],86:['🌨️','Snow showers'],95:['⛈️','Thunderstorm'],96:['⛈️','Storm'],99:['⛈️','Hailstorm']};
const wxOf=c=>WX[c]||['🌡️','—'];
const wxCache={};
async function loadWx(p){
  if(wxCache[p.id]) return wxCache[p.id];
  const u=`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lng}&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m,apparent_temperature&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=10&temperature_unit=fahrenheit&wind_speed_unit=mph`;
  const d=await fetch(u).then(r=>r.json()); wxCache[p.id]=d; return d;
}

/* ---------------- BOOT ---------------- */
async function boot(){
  try{
    DATA=await fetch('data/app.json?_='+Date.now()).then(r=>r.json());
    PLACES=DATA.places; PLACES.forEach(p=>BYID[p.id]=p);
    document.title=DATA.meta.title;
    renderStats(); renderFilters(); initMap(); wireUI();
    document.getElementById('loading').classList.add('gone');
  }catch(e){
    document.getElementById('loading').textContent='Could not load map data — run the build pipeline first. ('+e+')';
    console.error(e);
  }
}
function renderStats(){
  const m=DATA.meta;
  document.getElementById('stats').innerHTML=
    [['videos','videos'],['pinned','places mapped'],['countries','countries']]
    .map(([k,l])=>`<div class="st"><b>${(m[k]||0).toLocaleString()}</b><small>${l}</small></div>`).join('');
}
function renderFilters(){
  document.getElementById('filters').innerHTML=CONTS.map(([k,l,c])=>
    `<button data-cont="${k}" class="${k==='all'?'on':''}">${k!=='all'?`<span class="cdot" style="background:${c}"></span>`:''}${l}</button>`).join('');
  document.querySelectorAll('#filters button').forEach(b=>b.onclick=()=>setCont(b.dataset.cont));
}

/* ---------------- MAP (Leaflet + clustering — worker-free, robust everywhere) ---------------- */
let CLUSTER=null, MARKERS={};
function initMap(){
  // Opens centered on the Mediterranean (the current focus); all other places remain — just zoom out.
  MAP=L.map('map',{worldCopyJump:true,minZoom:2,maxZoom:18,zoomControl:false,center:[38.5,14.5],zoom:5,preferCanvas:true});
  L.control.zoom({position:'bottomright'}).addTo(MAP);
  // Real satellite imagery — accurate to the actual landscape, more detail as you zoom in.
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {maxZoom:19,maxNativeZoom:19,attribution:'Imagery © Esri, Maxar, Earthstar Geographics · places from Ryan Shirley'}).addTo(MAP);
  // Soft place-name + boundary labels layered over the imagery.
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    {maxZoom:19,maxNativeZoom:19,opacity:.85}).addTo(MAP);
  CLUSTER=L.markerClusterGroup({chunkedLoading:true,maxClusterRadius:50,showCoverageOnHover:false,
    iconCreateFunction:c=>{const n=c.getChildCount();const s=n<10?34:n<50?42:n<200?52:62;
      return L.divIcon({html:`<div class="cl">${n}</div>`,className:'cluster-ic',iconSize:[s,s]});}});
  MAP.addLayer(CLUSTER);
  renderMarkers();
  MAP.on('moveend',updateRank);
  MAP.on('zoomend',onZoomTown);
  MAP.whenReady(()=>updateRank());
  [200,800].forEach(t=>setTimeout(()=>{ if(MAP){MAP.invalidateSize();updateRank();} },t));
}
function renderMarkers(){
  if(!CLUSTER) return;
  CLUSTER.clearLayers(); MARKERS={};
  const pts=PLACES.filter(p=>p.pinned&&(FILT.cont==='all'||p.continent===FILT.cont));
  const ms=pts.map(p=>{
    const m=L.circleMarker([p.lat,p.lng],{radius:6,fillColor:CC[p.continent]||CC.Other,fillOpacity:.95,
      color:'#0b0f16',weight:1.5});
    m.bindTooltip(p.name,{direction:'top',offset:[0,-4]});
    m.on('click',()=>openPlace(p.id));
    MARKERS[p.id]=m; return m;
  });
  CLUSTER.addLayers(ms);
}
const LBOX={'Europe':[[34,-11],[60,30]],'Asia':[[5,40],[55,145]],'Africa':[[-35,-18],[38,52]],
  'North America':[[10,-125],[50,-66]],'South America':[[-55,-82],[12,-34]],'Oceania':[[-48,110],[-8,180]]};
function setCont(c){FILT.cont=c;
  document.querySelectorAll('#filters button').forEach(b=>b.classList.toggle('on',b.dataset.cont===c));
  renderMarkers();
  const box=LBOX[c];
  if(box) MAP.fitBounds(box,{padding:[40,40]}); else MAP.setView([28,6],2);
  updateRank();
}

/* ---------------- RANKING LEADERBOARD (top places in current view) ---------------- */
const rankScore=p=>(p.sources?p.sources.filter(s=>s.url).length:0);
function updateRank(){
  const host=document.getElementById('rank'); if(!host||!MAP) return;
  let b; try{ b=MAP.getBounds(); }catch(e){ return; }
  const inview=PLACES.filter(p=>p.pinned && (FILT.cont==='all'||p.continent===FILT.cont) && b.contains([p.lat,p.lng]));
  inview.sort((a,z)=> rankScore(z)-rankScore(a) || (z.photos?z.photos.length:0)-(a.photos?a.photos.length:0) || a.name.localeCompare(z.name));
  const top=inview.slice(0,40);
  const max=top.length?Math.max(1,rankScore(top[0])):1;
  const rows=top.map((p,i)=>{
    const v=rankScore(p), w=Math.max(6,Math.round(v/max*100));
    return `<button class="rk-row" data-id="${esc(p.id)}" title="${esc(p.name)}, ${esc(p.country)}">
      <span class="rk-n">${i+1}</span>
      <div class="rk-body">
        <div class="rk-name">${esc(p.name)}</div>
        <div class="rk-meta">${p.advisory?`<span class="rk-safe" style="background:${advColor(p.advisory.level)}" title="Safety Level ${p.advisory.level}"></span>`:''}${esc(p.country)} · ${v} vid${v!==1?'s':''}${p.costTier?` · <span class="rk-cost">${'$'.repeat(p.costTier)}</span>`:''}</div>
        <div class="rk-bar"><span style="width:${w}%"></span></div>
      </div></button>`;
  }).join('');
  host.innerHTML=`<div class="rank-head">
      <div class="rank-title"><span class="rk-live"></span>Top in view</div>
      <div class="rank-sub">${inview.length.toLocaleString()} place${inview.length!==1?'s':''} here · ranked by how often Ryan features them</div>
    </div>
    <div class="rank-list">${rows||'<div class="rank-empty">No places in view — zoom out or pan to Ryan’s spots.</div>'}</div>`;
  host.querySelectorAll('.rk-row').forEach(el=>{
    el.onclick=()=>openPlace(el.dataset.id);
    el.onmouseenter=()=>{const m=MARKERS[el.dataset.id]; if(m&&m.setStyle) m.setStyle({radius:9,weight:3});};
    el.onmouseleave=()=>{const m=MARKERS[el.dataset.id]; if(m&&m.setStyle) m.setStyle({radius:6,weight:1.5});};
  });
}

/* ---------------- TOWN MODE (hotels + attractions plotted on the map) ---------------- */
let TOWNLAYER=null, lastPlace=null, townFor=null;
const ATTR_ICON={beach:'🏖️',viewpoint:'🌅','old-town':'🏘️',landmark:'🏛️',nature:'🌿',cove:'🏝️',museum:'🖼️',other:'📍'};
function hotelDivIcon(){return L.divIcon({className:'town-ic',html:'<div class="ti ti-hotel">🛏️</div>',iconSize:[30,30],iconAnchor:[15,30],popupAnchor:[0,-28]});}
function attrDivIcon(a){return L.divIcon({className:'town-ic',html:`<div class="ti ti-attr">${ATTR_ICON[a.kind]||'📍'}</div>`,iconSize:[28,28],iconAnchor:[14,28],popupAnchor:[0,-26]});}
function hotelPopup(h,p){
  return `<div class="tp"><div class="tp-name">🛏️ ${esc(h.name)}</div>
    <div class="tp-sub">${esc(h.type||'')}${h.nightlyUSD?' · '+usd(h.nightlyUSD)+'/night':''}</div>
    ${h.angle?`<div class="tp-note">${esc(h.angle)}</div>`:''}
    <div class="tp-btns"><a href="${hotelBookUrl(h,p)}" target="_blank" rel="noopener">Booking ↗</a><a href="${hotelAirbnbUrl(h,p)}" target="_blank" rel="noopener">Airbnb ↗</a></div></div>`;
}
function attrPopup(a){
  return `<div class="tp"><div class="tp-name">${ATTR_ICON[a.kind]||'📍'} ${esc(a.name)}</div>
    ${a.note?`<div class="tp-note">${esc(a.note)}</div>`:''}<div class="tp-sub">${esc(a.kind||'')}</div></div>`;
}
let flyingTown=false;
function renderTownMarkers(p){
  if(!TOWNLAYER) TOWNLAYER=L.layerGroup().addTo(MAP);
  TOWNLAYER.clearLayers(); let n=0;
  (p.stays||[]).forEach(h=>{ if(typeof h.lat==='number'&&typeof h.lng==='number'){
    L.marker([h.lat,h.lng],{icon:hotelDivIcon(),zIndexOffset:1000}).addTo(TOWNLAYER).bindPopup(hotelPopup(h,p)); n++; }});
  (p.attractions||[]).forEach(a=>{ if(typeof a.lat==='number'&&typeof a.lng==='number'){
    L.marker([a.lat,a.lng],{icon:attrDivIcon(a)}).addTo(TOWNLAYER).bindPopup(attrPopup(a)); n++; }});
  showTownBar(p,n); return n;
}
function loadTown(p, fly=true){
  if(!MAP) return 0; townFor=p.id;
  if(fly){ flyingTown=true; MAP.setView([p.lat,p.lng],14,{animate:false}); setTimeout(()=>{ flyingTown=false; },400); }
  renderTownMarkers(p);
  return 0;
}
function clearTown(){ if(TOWNLAYER) TOWNLAYER.clearLayers(); townFor=null; const b=document.getElementById('townbar'); if(b) b.remove(); }
function showTownBar(p,n){
  let b=document.getElementById('townbar');
  if(!b){b=document.createElement('div');b.id='townbar';b.className='townbar';document.body.appendChild(b);}
  b.innerHTML=`<span class="tb-dot"></span><b>${esc(p.name)}</b> · 🛏️ hotels &amp; 📍 sights on the map · ${n} pins
    <button id="tb-back">details</button><button id="tb-clear">✕</button>`;
  document.getElementById('tb-clear').onclick=clearTown;
  document.getElementById('tb-back').onclick=()=>openPlace(p.id);
}
function onZoomTown(){
  if(!MAP||flyingTown) return; const z=MAP.getZoom();
  if(z<11){ if(townFor) clearTown(); return; }
  if(z>=13 && lastPlace && lastPlace.town && townFor!==lastPlace.id){
    const c=MAP.getCenter();
    if(Math.abs(c.lat-lastPlace.lat)<0.45 && Math.abs(c.lng-lastPlace.lng)<0.6) loadTown(lastPlace,false);
  }
}

/* ---------------- SEARCH ---------------- */
function wireUI(){
  const s=document.getElementById('search'), res=document.getElementById('results'), hub=document.getElementById('hub');
  s.oninput=()=>{const v=s.value.trim().toLowerCase(); if(!v){res.hidden=true;return;}
    const hits=PLACES.filter(p=>p.name.toLowerCase().includes(v)||(p.country||'').toLowerCase().includes(v))
      .sort((a,b)=>(b.pinned-a.pinned)||b.sources.length-a.sources.length).slice(0,40);
    res.innerHTML=hits.length?hits.map(p=>`<div class="r" data-id="${esc(p.id)}">
        <div><div class="r-name">${esc(p.name)}</div><div class="r-sub">${esc(p.country)}${p.pinned?'':' · not mapped'}</div></div></div>`).join('')
      :'<div class="r-none">No matches.</div>';
    res.hidden=false;
    res.querySelectorAll('.r').forEach(el=>el.onclick=()=>{res.hidden=true;s.value='';openPlace(el.dataset.id);});
  };
  document.getElementById('hub-btn').onclick=()=>{hub.hidden=!hub.hidden;};
  document.addEventListener('click',e=>{
    if(!hub.contains(e.target)&&e.target.id!=='hub-btn') hub.hidden=true;
    if(!res.contains(e.target)&&e.target!==s) res.hidden=true;
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closePanel();hub.hidden=true;res.hidden=true;if(LB)LB.dataset.on='';}});
}

/* ---------------- CURATED HOTELS ---------------- */
function hotelBookUrl(h,p){return `https://www.booking.com/searchresults.html?ss=${q(h.name+', '+p.name+', '+p.country)}`;}
function hotelAirbnbUrl(h,p){return `https://www.airbnb.com/s/${q(h.name+' '+p.name+', '+p.country)}/homes`;}
function stayCardHTML(h,p){
  const tags=(h.tags||[]).slice(0,5).map(t=>`<span class="stag">${esc(t)}</span>`).join('');
  const price=h.nightlyUSD?`<b>${usd(h.nightlyUSD)}</b><span class="per">/night</span>`:`<span class="per">rate varies</span>`;
  return `<article class="stay">
    <div class="stay-top"><div class="stay-name">${esc(h.name)}</div>${h.rating?`<span class="rating alt">★ ${esc(String(h.rating))}</span>`:''}</div>
    <div class="stay-sub">${esc(h.area||p.name)}${h.type?' · '+esc(h.type):''}</div>
    ${tags?`<div class="stags">${tags}</div>`:''}
    ${h.angle?`<p class="stay-why">${esc(h.angle)}</p>`:''}
    <div class="stay-foot"><div class="stay-price">${price}</div>
      <div class="stay-btns"><a class="btn-bk" href="${hotelBookUrl(h,p)}" target="_blank" rel="noopener">Booking ↗</a>
        <a class="btn-ab" href="${hotelAirbnbUrl(h,p)}" target="_blank" rel="noopener">Airbnb ↗</a></div></div>
  </article>`;
}

/* ---------------- PLACE PANEL ---------------- */
function openPlace(id){
  const p=BYID[id]; if(!p) return;
  lastPlace=p;
  if(p.pinned&&MAP) MAP.setView([p.lat,p.lng],Math.max(MAP.getZoom(),6),{animate:true});
  const photos=p.photos||[];
  const hero=photos[0];
  const thumbs=photos.length>1?`<div class="p-thumbs">${photos.map((im,i)=>`<img src="${esc(im.url)}" data-i="${i}" alt="${esc(im.alt||'')}" loading="lazy">`).join('')}</div>`:'';
  const hasTown=(p.town||(p.stays||[]).some(h=>typeof h.lat==='number')||(p.attractions||[]).some(a=>typeof a.lat==='number'));
  const townBtn=hasTown?`<button class="town-btn" id="town-btn">🗺️ Load the town — see hotels &amp; sights on the map</button>`:'';
  const adv=p.advisory;
  const safetyHTML = adv ? `<div class="p-sec"><h4>Safety</h4>
    <div class="safety" style="--ac:${advColor(adv.level)}">
      <span class="adv-badge">L${adv.level}</span>
      <div class="adv-body"><div class="adv-label">${esc(adv.label||(ADV[adv.level]||['',''])[1])}</div>
        ${adv.note?`<div class="adv-note">${esc(adv.note)}</div>`:''}</div>
      ${p.safetyIndex!=null?`<span class="safety-idx" title="safety index — higher is safer">${p.safetyIndex}<small>/100</small></span>`:''}
    </div>
    ${p.safetySummary?`<p class="safety-sum">${esc(p.safetySummary)}</p>`:''}
    <div class="src-note">US State Dept advisory for ${esc(p.country)}</div></div>` : '';
  const priceHTML = (p.dailyMidUSD||p.flightRT) ? `<div class="p-sec"><h4>Typical prices</h4>
    <div class="price-grid">
      <div class="pc"><div class="pc-lab">Daily spend</div><div class="pc-val">${usd(p.dailyBudgetUSD)}–${usd(p.dailyMidUSD)}</div><div class="pc-sub">budget → mid, per day</div></div>
      <div class="pc"><div class="pc-lab">Hotel / night</div><div class="pc-val">${usd(p.hotelBudgetUSD)}–${usd(p.hotelMidUSD)}</div><div class="pc-sub">budget → mid-range</div></div>
      <div class="pc"><div class="pc-lab">Flight from Boston</div><div class="pc-val">${p.flightRT?usd(p.flightRT[0])+'–'+usd(p.flightRT[1]):'—'}</div><div class="pc-sub">round-trip${p.airport&&p.airport.city?' · '+esc(p.airport.city):''}</div></div>
      <div class="pc"><div class="pc-lab">Cost level</div><div class="pc-val cost-tier">${costTierHTML(p.costTier)}</div><div class="pc-sub">${p.flightNote?esc(p.flightNote):'vs. other countries'}</div></div>
    </div>
    <a class="btn-flight" href="${flightUrl(p)}" target="_blank" rel="noopener">✈ Search flights: Boston → ${esc((p.airport&&p.airport.city)||p.country)} ↗</a>
    <div class="src-note">Typical/approx — use the booking &amp; flight links for exact live prices for your dates.</div></div>` : '';
  const highlights=(p.highlights||[]).length?`<div class="p-sec"><h4>Cool spots here (per Ryan)</h4><div class="chips">${p.highlights.map(h=>`<span class="chip">${esc(h)}</span>`).join('')}</div></div>`:'';
  const hotels=(p.hotelsMentioned||[]).length?`<div class="p-sec"><h4>Ryan mentions staying</h4><div class="chips">${p.hotelsMentioned.map(h=>`<span class="chip">🏨 ${esc(h)}</span>`).join('')}</div></div>`:'';
  const stays=(p.stays||[]);
  const staysBlock = stays.length ? `<div class="p-sec"><h4>Where to stay — ${stays.length} real picks</h4>
    <div class="stay-actions"><a class="btn-air2" href="${airbnbUrl(p)}" target="_blank" rel="noopener">🏡 Browse all Airbnb homes in ${esc(p.name)} ↗</a></div>
    <div class="stay-list">${stays.map(h=>stayCardHTML(h,p)).join('')}</div></div>` : '';
  const vsrc=(p.sources||[]).filter(s=>s.url);
  const editorial=(p.sources||[]).some(s=>!s.url);
  const vids = vsrc.length ? `<div class="p-sec vids"><h4>Featured in ${vsrc.length} of Ryan’s video${vsrc.length>1?'s':''}</h4>${
    vsrc.map(s=>`<a href="${esc(s.url)}${s.timestamp?'&t='+tsec(s.timestamp)+'s':''}" target="_blank" rel="noopener">
      <span class="vy">▶</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.title)}</span>
      ${s.timestamp?`<span class="vt">${esc(s.timestamp)}</span>`:''}</a>`).join('')}</div>`
    : (editorial ? `<div class="p-sec"><div class="src-note">◆ Editor’s pick · added for Mediterranean coastal coverage</div></div>` : '');
  const near=nearbyHTML(p);
  const factual=p.factual?`<div class="p-sec"><h4>About</h4><p class="factual">${esc(p.factual)}${p.wiki?` <a href="${esc(p.wiki)}" target="_blank" rel="noopener">Wikipedia ↗</a>`:''}</p></div>`:'';
  const panel=document.getElementById('panel');
  panel.innerHTML=`
    <div class="p-hero">
      ${hero?`<img src="${esc(hero.url)}" alt="${esc(p.name)}" onload="this.classList.add('on')" onerror="this.remove()">`:''}
      <div class="p-grad"></div>
      <button class="p-x" aria-label="Close">✕</button>
      <div class="p-cap">${p.kind?`<span class="p-kind">${esc(p.kind)}</span>`:''}
        <div class="p-name">${esc(p.name)}</div>
        <div class="p-loc">📍 ${esc([p.region,p.country].filter(Boolean).join(', '))}</div></div>
    </div>
    <div class="p-body">
      ${thumbs}
      ${townBtn}
      ${p.why?`<div class="why-ryan"><div class="wr-by">${(p.sources||[]).some(s=>s.url)?'Why Ryan picked it':'Why go here'}</div><p>${esc(p.why)}</p></div>`:''}
      ${safetyHTML}
      ${priceHTML}
      <div class="p-sec"><h4>Weather now &amp; 10-day</h4><div class="wx" id="wx"><div class="wx-load">Loading live weather…</div></div></div>
      ${highlights}
      ${hotels}
      ${staysBlock}
      <div class="p-sec"><h4>${stays.length?'Or search all stays':'Book your stay'}</h4>
        <div class="book">
          <a class="primary" href="${bookingUrl(p)}" target="_blank" rel="noopener">Booking.com ↗</a>
          <a href="${airbnbUrl(p)}" target="_blank" rel="noopener">Airbnb ↗</a>
          <a href="${googleHotelsUrl(p)}" target="_blank" rel="noopener">Google Hotels ↗</a>
          <a href="${osmUrl(p)}" target="_blank" rel="noopener">Map ↗</a>
        </div>
        <div class="book-note">Live search links — real, bookable results for ${esc(p.name)}. ${p.hotelsMentioned&&p.hotelsMentioned.length?'':'Ryan didn’t name a specific hotel here.'}</div>
      </div>
      ${factual}
      ${vids}
      ${near}
    </div>`;
  panel.hidden=false; void panel.offsetWidth; panel.classList.add('show');
  panel.scrollTop=0;
  panel.querySelector('.p-x').onclick=closePanel;
  const tb=panel.querySelector('#town-btn'); if(tb) tb.onclick=()=>{ closePanel(); loadTown(p,true); };
  panel.querySelectorAll('.p-thumbs img').forEach(el=>el.onclick=()=>lightbox(photos,+el.dataset.i));
  if(hero) panel.querySelector('.p-hero img')?.addEventListener('click',()=>lightbox(photos,0));
  panel.querySelectorAll('.near button').forEach(el=>el.onclick=()=>openPlace(el.dataset.id));
  renderWx(p);
}
function tsec(t){const a=(t||'').split(':').map(Number);return a.length===2?a[0]*60+a[1]:(a.length===3?a[0]*3600+a[1]*60+a[2]:0);}
function closePanel(){const p=document.getElementById('panel');p.classList.remove('show');setTimeout(()=>{p.hidden=true;},320);}
function nearbyHTML(p){
  const others=PLACES.filter(x=>x.country===p.country&&x.id!==p.id&&x.pinned).slice(0,8);
  if(!others.length) return '';
  return `<div class="p-sec"><h4>More in ${esc(p.country)}</h4><div class="near">${
    others.map(o=>`<button data-id="${esc(o.id)}">${esc(o.name)}</button>`).join('')}</div></div>`;
}
function renderWx(p){
  loadWx(p).then(d=>{
    const host=document.getElementById('wx'); if(!host) return;
    const c=d.current||{},dl=d.daily||{},[ic,lab]=wxOf(c.weather_code);
    const days=(dl.time||[]).map((t,i)=>{const[di]=wxOf((dl.weather_code||[])[i]);
      const dow=new Date(t+'T12:00:00').toLocaleDateString('en-US',{weekday:'short'});
      return `<div class="wxd"><div class="d">${i===0?'Now':dow}</div><div class="i">${di}</div>
        <div class="h"><b>${Math.round((dl.temperature_2m_max||[])[i])}°</b><span>${Math.round((dl.temperature_2m_min||[])[i])}°</span></div></div>`;}).join('');
    host.innerHTML=`<div class="wx-now"><div class="wx-ic">${ic}</div>
      <div><div class="wx-t">${Math.round(c.temperature_2m)}°<span>F</span></div>
        <div class="wx-lab">${lab}</div>
        <div class="wx-sub">feels ${Math.round(c.apparent_temperature)}° · 💧${c.relative_humidity_2m}% · 💨${Math.round(c.wind_speed_10m)}mph</div></div></div>
      <div class="wx-strip">${days}</div>`;
  }).catch(()=>{const h=document.getElementById('wx');if(h)h.innerHTML='<div class="wx-load">Live weather unavailable right now.</div>';});
}

/* ---------------- LIGHTBOX ---------------- */
function lightbox(photos,i){
  photos=(photos||[]).filter(x=>x&&x.url); if(!photos.length) return;
  if(!LB){LB=document.createElement('div');LB.className='lb';
    LB.innerHTML='<button class="x">✕</button><img alt="">';document.body.appendChild(LB);
    LB.querySelector('.x').onclick=()=>LB.dataset.on='';
    LB.addEventListener('click',e=>{if(e.target===LB)LB.dataset.on='';});}
  LB.querySelector('img').src=photos[i].url; LB.dataset.on='1';
}
boot();
