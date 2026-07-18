'use strict';
/* World travel guide. Buildless Leaflet + markercluster, scales to 1,500+ pins.
   Data: data/app.json {meta, places[], videos[]}. Weather: Open-Meteo (on demand). No API keys. */
/* Faceted filter state. loc = Set of location facets — 'z:<collection>' | 'k:<continent>' | 'c:<country>'.
   Location facets OR within themselves; they AND across the safety/price/text facets.
   Everything maps to real data fields — no fabrication. */
let DATA=null, MAP=null, PLACES=[], BYID={}, FILT={q:'',loc:new Set(),safety:'all',price:4,famous:false}, LB=null;
const esc=s=>(s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
/* Hand-curated collections that sit on top of the world map */
const ZONEDOT={med:'#2bb4d6',sa:'#f08a46',fr:'#b58cf0'};
const ZONELAB={med:'Mediterranean coast',sa:'Exotic & safe S. America',fr:'Charming France'};
const ZONEBOX={med:[[30,-6],[46,36]],sa:[[-56,-82],[6,-34]],fr:[[42.2,-4.8],[51.1,8.3]]};
/* Whole-world geography */
const CONTS=['Europe','Asia','Africa','North America','South America','Oceania'];
const CONTCOL={'Europe':'#5aa0ff','Asia':'#e8794a','Africa':'#e5c04a','North America':'#9b6cf0',
  'South America':'#5bd6c0','Oceania':'#f05a8c','Other':'#8492a3'};
const CONTBOX={'Europe':[[34,-11],[60,30]],'Asia':[[5,40],[55,145]],'Africa':[[-35,-18],[38,52]],
  'North America':[[10,-125],[50,-66]],'South America':[[-55,-82],[12,-34]],'Oceania':[[-48,110],[-8,180]]};
const WORLDVIEW={center:[25,8],zoom:2};
const markerCol=p=>CONTCOL[p.continent]||CONTCOL.Other;

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
/* richer per-country cost breakdown + safety detail (real typical figures, tagged confidence) */
function costDetailHTML(cd){
  if(!cd) return '';
  const row=(ic,lab,v)=>(v||v===0)?`<div class="cd-row"><span class="cd-ic">${ic}</span><span class="cd-lab">${esc(lab)}</span><span class="cd-v">${usd(v)}</span></div>`:'';
  const items=[row('🍽','Cheap local meal',cd.mealInexpensive),row('🍷','Dinner for two',cd.mealMidTwo),
    row('🍺','Local beer',cd.beer),row('☕','Coffee',cd.coffee),row('💧','Water 1.5L',cd.water),
    row('🚌','Local transit',cd.localTransit),row('🚕','Taxi start',cd.taxiStart),row('📶','Tourist SIM',cd.simData)].join('');
  if(!items) return '';
  return `<div class="cd-grid">${items}</div>
    <div class="src-note">Typical everyday prices${cd.confidence?` · confidence ${esc(cd.confidence)}`:''}</div>`;
}
function safetyDetailHTML(sd){
  if(!sd) return '';
  const tips=(sd.tips||[]).map(t=>`<li>${esc(t)}</li>`).join('');
  const chips=[sd.emergency?`<span class="sd-chip">🚨 Emergency ${esc(sd.emergency)}</span>`:'',
    sd.tapWater?`<span class="sd-chip">🚰 Tap water: ${esc(sd.tapWater)}</span>`:''].filter(Boolean).join('');
  return `${tips?`<div class="sd-lab">Good to know</div><ul class="sd-tips">${tips}</ul>`:''}
    ${chips?`<div class="sd-meta">${chips}</div>`:''}
    ${sd.soloFemale?`<div class="sd-solo">👤 <b>Solo:</b> ${esc(sd.soloFemale)}</div>`:''}`;
}

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
    renderStats(); renderFilters(); initMap(); wireUI(); syncFacetUI(); layoutRank();
    window.addEventListener('resize',()=>{layoutRank(); if(MAP) MAP.invalidateSize();});
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
/* ---------- FACETED FILTERS (search + stackable, real-data-only) ---------- */
function countriesByContinent(){
  const m={};
  PLACES.forEach(p=>{ if(!p.country) return;
    const k=p.continent||'Other'; (m[k]=m[k]||new Set()).add(p.country); });
  const order=CONTS.concat(['Other']);
  const out=[];
  order.forEach(k=>{ if(m[k]) out.push([k,[...m[k]].sort()]); });
  return out;
}
/* A place passes only if it satisfies text AND (any selected location) AND safety AND price. */
function matches(p){
  if(!p.pinned) return false;
  if(p.icon && !FILT.famous && !FILT.q) return false;            // famous spots hidden by default, but findable by name
  if(FILT.q){
    const hay=(p.name+' '+(p.country||'')+' '+(p.region||'')+' '+(p.continent||'')+' '+(ZONELAB[p.zone]||'')+' '+(p.curTag||'')).toLowerCase();
    if(!hay.includes(FILT.q)) return false;
  }
  if(FILT.loc.size){
    let ok=false;
    for(const f of FILT.loc){
      const kind=f.slice(0,2), val=f.slice(2);
      if(kind==='z:'&&p.zone===val){ok=true;break;}          // curated collection
      if(kind==='k:'&&p.continent===val){ok=true;break;}     // continent
      if(kind==='c:'&&p.country===val){ok=true;break;}       // country
    }
    if(!ok) return false;
  }
  const lvl=(p.advisory&&p.advisory.level)||9;
  if(FILT.safety==='safe'&&lvl>2) return false;
  if(FILT.safety==='very'&&lvl>1) return false;
  if(FILT.price<4&&(p.costTier||9)>FILT.price) return false;
  return true;
}
function renderFilters(){
  const host=document.getElementById('filters'); if(!host) return;
  const groups=countriesByContinent();
  const ctyList=groups.map(([k,list])=>
    `<div class="fdd-sec" data-sec="${esc(k)}">${esc(k)}</div>`+
    list.map(c=>`<label class="fcc" data-name="${esc(c.toLowerCase())}"><input type="checkbox" data-country="${esc(c)}"><span>${esc(c)}</span></label>`).join('')
  ).join('');
  host.innerHTML=`
   <div class="fb-scroll">
    <div class="fgrp loc">
      <span class="fglab">✦ Collections</span>
      <button class="fchip" data-zone="med"><span class="fc-dot" style="background:${ZONEDOT.med}"></span>Mediterranean coast</button>
      <button class="fchip" data-zone="fr"><span class="fc-dot" style="background:${ZONEDOT.fr}"></span>Charming France</button>
      <button class="fchip" data-zone="sa"><span class="fc-dot" style="background:${ZONEDOT.sa}"></span>Exotic &amp; safe S. America</button>
    </div>
    <div class="fgrp loc">
      <span class="fglab">🌍 Continent</span>
      ${CONTS.map(k=>`<button class="fchip" data-cont="${esc(k)}"><span class="fc-dot" style="background:${CONTCOL[k]}"></span>${esc(k==='North America'?'N. America':k==='South America'?'S. America':k)}</button>`).join('')}
      <span id="cty-chips" class="cty-chips"></span>
      <div class="fdd">
        <button class="fchip fdd-btn" id="cty-btn">＋ Country <span class="caret">▾</span></button>
        <div class="fdd-menu" id="cty-menu" hidden>
          <input id="cty-search" class="fdd-search" type="search" placeholder="Filter countries…" autocomplete="off" />
          <div id="cty-list">${ctyList}</div>
        </div>
      </div>
    </div>
    <div class="fgrp"><span class="fglab">🛡 Safety</span>
      <div class="seg" id="seg-safe">
        <button data-safe="all" class="on">Any</button>
        <button data-safe="safe" title="US State Dept advisory level 1–2">Safe</button>
        <button data-safe="very" title="US State Dept advisory level 1 only">Safest</button>
      </div></div>
    <div class="fgrp"><span class="fglab">💰 Price</span>
      <div class="seg" id="seg-price">
        <button data-price="4" class="on">Any</button>
        <button data-price="1" title="cheapest">$</button>
        <button data-price="2">$$</button>
        <button data-price="3">$$$</button>
      </div></div>
    <label class="ftog"><input type="checkbox" id="fam-tog"> Show famous spots</label>
   </div>
   <div class="fb-foot"><span class="fcount" id="fcount"></span><button class="fclear" id="fclear" hidden>Clear all</button></div>`;
  wireFacets();
}
function wireFacets(){
  const host=document.getElementById('filters');
  host.querySelectorAll('[data-zone]').forEach(b=>b.onclick=()=>{
    const z='z:'+b.dataset.zone;
    if(FILT.loc.has(z)) FILT.loc.delete(z); else { FILT.loc.add(z); const box=ZONEBOX[b.dataset.zone]; if(box&&MAP) MAP.fitBounds(box,{padding:[24,24],animate:false}); }
    applyFilters();
  });
  host.querySelectorAll('[data-cont]').forEach(b=>b.onclick=()=>{
    const k='k:'+b.dataset.cont;
    if(FILT.loc.has(k)) FILT.loc.delete(k);
    else { FILT.loc.add(k); const box=CONTBOX[b.dataset.cont]; if(box&&MAP) MAP.fitBounds(box,{padding:[24,24],animate:false}); }
    applyFilters();
  });
  const cbtn=host.querySelector('#cty-btn'), cmenu=host.querySelector('#cty-menu');
  cbtn.onclick=e=>{e.stopPropagation(); cmenu.hidden=!cmenu.hidden;
    if(!cmenu.hidden){const s=host.querySelector('#cty-search'); if(s) s.focus();}};
  const csearch=host.querySelector('#cty-search');
  if(csearch) csearch.oninput=()=>{
    const v=csearch.value.trim().toLowerCase();
    host.querySelectorAll('#cty-list .fcc').forEach(el=>{
      el.style.display=(!v||el.dataset.name.includes(v))?'':'none'; });
    host.querySelectorAll('#cty-list .fdd-sec').forEach(sec=>{
      let n=sec.nextElementSibling, any=false;
      while(n&&!n.classList.contains('fdd-sec')){ if(n.style.display!=='none') any=true; n=n.nextElementSibling; }
      sec.style.display=any?'':'none'; });
  };
  host.querySelectorAll('[data-country]').forEach(cb=>cb.onchange=()=>{
    const k='c:'+cb.dataset.country; if(cb.checked) FILT.loc.add(k); else FILT.loc.delete(k); applyFilters();
  });
  host.querySelectorAll('#seg-safe button').forEach(b=>b.onclick=()=>{FILT.safety=b.dataset.safe; applyFilters();});
  host.querySelectorAll('#seg-price button').forEach(b=>b.onclick=()=>{FILT.price=+b.dataset.price; applyFilters();});
  host.querySelector('#fam-tog').onchange=e=>{FILT.famous=e.target.checked; applyFilters();};
  host.querySelector('#fclear').onclick=clearFilters;
}
function applyFilters(){ renderMarkers(); updateRank(); syncFacetUI(); layoutRank(); }
/* The filter bar wraps to a variable number of rows (collections + continents + country chips),
   so the leaderboard's top is measured from it rather than hard-coded. */
function layoutRank(){
  const f=document.getElementById('filters'), r=document.getElementById('rank');
  if(!f||!r||getComputedStyle(r).display==='none') return;
  const b=f.getBoundingClientRect();
  if(b.height>0) r.style.top=Math.round(b.bottom+12)+'px';
}
function syncFacetUI(){
  const host=document.getElementById('filters'); if(!host) return;
  host.querySelectorAll('[data-zone]').forEach(b=>b.classList.toggle('on',FILT.loc.has('z:'+b.dataset.zone)));
  host.querySelectorAll('[data-cont]').forEach(b=>b.classList.toggle('on',FILT.loc.has('k:'+b.dataset.cont)));
  host.querySelectorAll('#seg-safe button').forEach(b=>b.classList.toggle('on',b.dataset.safe===FILT.safety));
  host.querySelectorAll('#seg-price button').forEach(b=>b.classList.toggle('on',+b.dataset.price===FILT.price));
  host.querySelectorAll('[data-country]').forEach(cb=>cb.checked=FILT.loc.has('c:'+cb.dataset.country));
  const chips=host.querySelector('#cty-chips');
  const cts=[...FILT.loc].filter(x=>x[0]==='c').map(x=>x.slice(2));
  if(chips){ chips.innerHTML=cts.map(c=>`<span class="cchip" data-country="${esc(c)}">${esc(c)}<b>✕</b></span>`).join('');
    chips.querySelectorAll('.cchip').forEach(el=>el.onclick=()=>{FILT.loc.delete('c:'+el.dataset.country); applyFilters();}); }
  const n=PLACES.filter(matches).length;
  const active=!!(FILT.q||FILT.loc.size||FILT.safety!=='all'||FILT.price<4||FILT.famous);
  const cnt=host.querySelector('#fcount'); if(cnt) cnt.innerHTML=`<b>${n}</b> place${n!==1?'s':''}${active?' match':' on the map'}`;
  const cl=host.querySelector('#fclear'); if(cl) cl.hidden=!active;
  const badge=document.getElementById('filt-count');
  if(badge){ const c=FILT.loc.size+(FILT.safety!=='all'?1:0)+(FILT.price<4?1:0)+(FILT.famous?1:0)+(FILT.q?1:0);
    badge.textContent=c||''; badge.hidden=!c; }
}
function clearFilters(){
  FILT.q=''; FILT.loc.clear(); FILT.safety='all'; FILT.price=4; FILT.famous=false;
  const s=document.getElementById('search'); if(s) s.value='';
  const ft=document.getElementById('fam-tog'); if(ft) ft.checked=false;
  const res=document.getElementById('results'); if(res) res.hidden=true;
  applyFilters();
}

/* ---------------- MAP (Leaflet + clustering — worker-free, robust everywhere) ---------------- */
let CLUSTER=null, MARKERS={};
function initMap(){
  // Opens centered on the Mediterranean (the current focus); all other places remain — just zoom out.
  MAP=L.map('map',{worldCopyJump:true,minZoom:2,maxZoom:18,zoomControl:false,center:WORLDVIEW.center,zoom:WORLDVIEW.zoom,preferCanvas:true});
  L.control.zoom({position:'bottomright'}).addTo(MAP);
  // Real satellite imagery — accurate to the actual landscape, more detail as you zoom in.
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {maxZoom:19,maxNativeZoom:19,attribution:'Imagery © Esri, Maxar, Earthstar Geographics · places from Ryan Shirley'}).addTo(MAP);
  // Soft place-name + boundary labels layered over the imagery.
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    {maxZoom:19,maxNativeZoom:19,opacity:.85}).addTo(MAP);
  CLUSTER=L.markerClusterGroup({chunkedLoading:true,maxClusterRadius:50,showCoverageOnHover:false,zoomToBoundsOnClick:false,
    iconCreateFunction:c=>{const n=c.getChildCount();const s=n<10?34:n<50?42:n<200?52:62;
      return L.divIcon({html:`<div class="cl">${n}</div>`,className:'cluster-ic',iconSize:[s,s]});}});
  MAP.addLayer(CLUSTER);
  // The plugin's own zoomToBounds() uses animated moves (which silently no-op here), so drive it ourselves.
  CLUSTER.on('clusterclick',e=>{ MAP.fitBounds(e.layer.getBounds(),{padding:[40,40],animate:false}); });
  renderMarkers();
  MAP.on('moveend',updateRank);
  MAP.on('zoomend',onZoomTown);
  MAP.whenReady(()=>updateRank());
  [200,800].forEach(t=>setTimeout(()=>{ if(MAP){MAP.invalidateSize();updateRank();} },t));
}
function renderMarkers(){
  if(!CLUSTER) return;
  CLUSTER.clearLayers(); MARKERS={};
  const pts=PLACES.filter(matches);
  const ms=pts.map(p=>{
    const m=L.circleMarker([p.lat,p.lng],{radius:6,fillColor:markerCol(p),fillOpacity:.95,
      color:'#0b0f16',weight:1.5});
    m.bindTooltip(p.name,{direction:'top',offset:[0,-4]});
    m.on('click',()=>openPlace(p.id));
    MARKERS[p.id]=m; return m;
  });
  CLUSTER.addLayers(ms);
}
/* ---------------- RANKING LEADERBOARD (top places in current view) ---------------- */
const rankScore=p=>(p.sources?p.sources.filter(s=>s.url).length:0);
function updateRank(){
  const host=document.getElementById('rank'); if(!host||!MAP) return;
  let b; try{ b=MAP.getBounds(); }catch(e){ return; }
  const inview=PLACES.filter(p=>matches(p) && b.contains([p.lat,p.lng]));
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
  const totalMatch=PLACES.filter(matches).length;
  const emptyMsg = totalMatch===0
    ? `<div class="rank-empty">No places match these filters.<br><button class="rank-clear" id="rank-clear">Clear all filters</button></div>`
    : `<div class="rank-empty">Nothing in this view — pan or zoom to your ${totalMatch} match${totalMatch!==1?'es':''}.</div>`;
  host.innerHTML=`<div class="rank-head">
      <div class="rank-title"><span class="rk-live"></span>Top in view</div>
      <div class="rank-sub">${inview.length.toLocaleString()} place${inview.length!==1?'s':''} here · ranked by how often Ryan features them</div>
    </div>
    <div class="rank-list">${rows||emptyMsg}</div>`;
  const rc=host.querySelector('#rank-clear'); if(rc) rc.onclick=clearFilters;
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
  // The "Maps" hub points at the owner's other LOCAL servers — dead links (and a layout leak) on a public deploy.
  const isLocal=location.protocol==='file:'||/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const hubBtn=document.getElementById('hub-btn');
  if(!isLocal){ if(hubBtn) hubBtn.remove(); if(hub) hub.remove(); }
  s.oninput=()=>{
    const v=s.value.trim().toLowerCase(); FILT.q=v; applyFilters();   // search IS a live filter
    if(!v){res.hidden=true;return;}
    const hits=PLACES.filter(matches).sort((a,b)=>rankScore(b)-rankScore(a)).slice(0,30);
    res.innerHTML=hits.length?hits.map(p=>`<div class="r" data-id="${esc(p.id)}">
        <div><div class="r-name">${esc(p.name)}</div>
        <div class="r-sub">${p.advisory?`<span class="r-safe" style="background:${advColor(p.advisory.level)}"></span>`:''}${esc(p.country)} · ${esc(ZONELAB[p.zone]||p.continent||'')}</div></div></div>`).join('')
      :'<div class="r-none">No matches in the curated set.</div>';
    res.hidden=false;
    res.querySelectorAll('.r').forEach(el=>el.onclick=()=>{res.hidden=true; openPlace(el.dataset.id);});
  };
  if(hubBtn&&hub) hubBtn.onclick=()=>{hub.hidden=!hub.hidden;};
  const ft=document.getElementById('filt-toggle');
  if(ft) ft.onclick=()=>document.getElementById('filters').classList.toggle('open');
  document.addEventListener('click',e=>{
    if(hub&&hub.isConnected&&!hub.contains(e.target)&&e.target.id!=='hub-btn') hub.hidden=true;
    if(!res.contains(e.target)&&e.target!==s) res.hidden=true;
    const cm=document.getElementById('cty-menu'), cb=document.getElementById('cty-btn');
    if(cm&&!cm.hidden&&!cm.contains(e.target)&&cb&&!cb.contains(e.target)) cm.hidden=true;
  });
  document.addEventListener('keydown',e=>{ if(e.key!=='Escape') return;
    if(LB&&LB.dataset.on==='1'){LB.dataset.on='';return;}       // lightbox first
    if(!res.hidden){res.hidden=true;return;}
    if(hub&&!hub.hidden){hub.hidden=true;return;}
    closePanel(); });
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
  if(townFor&&townFor!==id) clearTown();       // stale hotel/sight pins from a previous town
  clearTimeout(panelTimer);                    // don't let a pending close blank the new panel
  lastPlace=p;
  if(p.pinned&&MAP) MAP.setView([p.lat,p.lng],Math.max(MAP.getZoom(),6),{animate:false});
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
    ${safetyDetailHTML(p.safetyDetail)}
    <div class="src-note">US State Dept advisory for ${esc(p.country)}</div></div>` : '';
  const priceHTML = (p.dailyMidUSD||p.flightRT) ? `<div class="p-sec"><h4>Typical prices</h4>
    <div class="price-grid">
      <div class="pc"><div class="pc-lab">Daily spend</div><div class="pc-val">${usd(p.dailyBudgetUSD)}–${usd(p.dailyMidUSD)}</div><div class="pc-sub">budget → mid, per day</div></div>
      <div class="pc"><div class="pc-lab">Hotel / night</div><div class="pc-val">${usd(p.hotelBudgetUSD)}–${usd(p.hotelMidUSD)}</div><div class="pc-sub">budget → mid-range</div></div>
      <div class="pc"><div class="pc-lab">Flight from Boston</div><div class="pc-val">${p.flightRT?usd(p.flightRT[0])+'–'+usd(p.flightRT[1]):'—'}</div><div class="pc-sub">round-trip${p.airport&&p.airport.city?' · '+esc(p.airport.city):''}</div></div>
      <div class="pc"><div class="pc-lab">Cost level</div><div class="pc-val cost-tier">${costTierHTML(p.costTier)}</div><div class="pc-sub">${p.flightNote?esc(p.flightNote):'vs. other countries'}</div></div>
    </div>
    ${costDetailHTML(p.costDetail)}
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
      ${photos.length>1?`<button class="p-nphoto" id="p-gallery">📸 ${photos.length} photos</button>`:''}
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
  panel.querySelector('#p-gallery')?.addEventListener('click',()=>lightbox(photos,0));
  panel.querySelectorAll('.near button').forEach(el=>el.onclick=()=>openPlace(el.dataset.id));
  renderWx(p);
}
function tsec(t){const a=(t||'').split(':').map(Number);return a.length===2?a[0]*60+a[1]:(a.length===3?a[0]*3600+a[1]*60+a[2]:0);}
let panelTimer=null;
function closePanel(){const p=document.getElementById('panel');p.classList.remove('show');clearTimeout(panelTimer);panelTimer=setTimeout(()=>{p.hidden=true;},320);}
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

/* ---------------- LIGHTBOX (gallery: prev/next + keyboard + counter) ---------------- */
let LBP=[], LBI=0;
function lbShow(){ if(!LB) return; const p=LBP[LBI]; if(!p) return;
  LB.querySelector('img').src=p.url;
  LB.querySelector('.lb-cap').innerHTML=`${esc(p.credit||'')} <span class="lb-n">${LBI+1} / ${LBP.length}</span>`; }
function lbNav(d){ if(!LBP.length) return; LBI=(LBI+d+LBP.length)%LBP.length; lbShow(); }
function lightbox(photos,i){
  photos=(photos||[]).filter(x=>x&&x.url); if(!photos.length) return;
  LBP=photos; LBI=i||0;
  if(!LB){LB=document.createElement('div');LB.className='lb';
    LB.innerHTML='<button class="x" aria-label="Close">✕</button><button class="lb-prev" aria-label="Previous">‹</button><img alt=""><button class="lb-next" aria-label="Next">›</button><div class="lb-cap"></div>';
    document.body.appendChild(LB);
    LB.querySelector('.x').onclick=()=>LB.dataset.on='';
    LB.querySelector('.lb-prev').onclick=e=>{e.stopPropagation();lbNav(-1);};
    LB.querySelector('.lb-next').onclick=e=>{e.stopPropagation();lbNav(1);};
    LB.addEventListener('click',e=>{if(e.target===LB)LB.dataset.on='';});
    document.addEventListener('keydown',e=>{ if(!LB||LB.dataset.on!=='1') return;
      if(e.key==='ArrowLeft') lbNav(-1); else if(e.key==='ArrowRight') lbNav(1); });}
  lbShow(); LB.dataset.on='1';
}
boot();
