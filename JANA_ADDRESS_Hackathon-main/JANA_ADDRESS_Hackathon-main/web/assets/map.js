/* Jana Address — карта на Leaflet: реальные улицы, точки Jana Post, адреса клиентов.
   Тайлы: Esri World Street Map (работает и при открытии как файл), запасной — tile.openstreetmap.org.
   Поиск работает по адресам клиентов; произвольную улицу можно найти через геокодер Nominatim. */
(function(){
'use strict';
const $=id=>document.getElementById(id),G=JPGEO,LOW=JP.LOW,t=(k,p)=>JP.t(k,p);
const KZB=[[40.4,46.4],[55.6,87.6]];
const CLU_B=7,CLU_A=6; // зум, ниже которого точки группируются в кластеры
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const hash=s=>{let x=2166136261;for(let i=0;i<s.length;i++){x^=s.charCodeAt(i);x=Math.imul(x,16777619)}return(x>>>0)/4294967296};

if(!window.L){ // Leaflet не загрузился (нет сети)
  $('offlinewarn').classList.add('on');
  window.JPMap={showAddr:()=>false,flyToCity:()=>false,selectId:()=>false,refresh(){},zoomIn(){},zoomOut(){},reset(){},count:()=>0,getMap:()=>null};
  return;
}

const dark=matchMedia('(prefers-color-scheme:dark)');
const isDark=()=>{const th=document.documentElement.dataset.theme;return th?th==='dark':dark.matches};
/* Порядок важен: первыми — самые свежие тайлы с домами. Google и CARTO не блокируют
   запросы без referer (открытие как file://), Esri — запасной, OSM — последний. */
const SRC=[
 {u:'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',a:'&copy; Google Maps',m:20},
 {u:'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',a:'&copy; CARTO, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',m:19,s:['a','b','c','d']},
 {u:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',a:'&copy; Esri, HERE, Garmin, © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',m:19},
 {u:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',a:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',m:19}
];
const map=L.map('cv2',{zoomControl:false,attributionControl:true,minZoom:4,maxZoom:20});
map.attributionControl.setPrefix('');
let base=null,srcI=0,bad=0;
function applyBase(){
  if(base)map.removeLayer(base);
  const s=SRC[srcI];
  base=L.tileLayer(s.u,{attribution:s.a,maxZoom:s.m,subdomains:s.s||'abc',className:isDark()?'jp-dark-tiles':''});
  base.on('tileerror',()=>{if(++bad>8&&srcI<SRC.length-1){srcI++;bad=0;applyBase()}});
  base.on('tileload',()=>{bad=0});
  base.addTo(map);
}
applyBase();
dark.addEventListener('change',applyBase);
window.addEventListener('jp-prefs',applyBase);
map.fitBounds(KZB,{padding:[8,8]});
setTimeout(()=>map.invalidateSize(),200);

const layB=L.layerGroup().addTo(map),layA=L.layerGroup().addTo(map),laySel=L.layerGroup().addTo(map),layRoute=L.layerGroup().addTo(map);

/* ---------- данные ---------- */
let pts=[],unplaced=[],BR=[],showB=true,showA=true,onlyLow=false,query='',selPt=null,geoSearch=null,addressRequest=0;

/* геокодинг — общий модуль JPGeocode (structured-запросы к Nominatim, кэш jp_gc, очередь 1.2 c).
   Ключ кэша — исходная строка адреса: одинаковые адреса не запрашиваются дважды. */
const GC={get:k=>JPGeocode.cache.get('v4:'+k),pos:r=>{
  const g=JPGeocode.cache.get('v4:'+r.raw_address);
  if(Array.isArray(g))return{pos:g,exact:false};return g&&g.pos?g:null}};
function geo(r,cb,max,prio){JPGeocode.search(r,r.raw_address,max,prio).then(cb).catch(error=>{console.error('Address geocoding failed:',error);cb(null)})}
const KX=0.669;
function approx(r){
  const c=G.findCity(r.city)||G.findCity(r.province);if(!c)return null;
  const d=G.districtPoint(c.n,r.district),b=d||[c.lat,c.lon],rad=d?.012:(c.t===1?.06:.025);
  const a=hash(r.id+'a')*Math.PI*2,rr=Math.sqrt(hash(r.id+'b'))*rad;
  return{lat:b[0]+Math.sin(a)*rr,lon:b[1]+Math.cos(a)*rr/KX,c:c,d:!!d};
}
function mkPt(r){
  const ap=approx(r);if(!ap)return null;
  const g=GC.pos(r);
  return{r,c:ap.c,lat:g?g.pos[0]:ap.lat,lon:g?g.pos[1]:ap.lon,exact:Boolean(g?.exact),low:(r.confidence||0)<LOW,d:ap.d,mk:null};
}
function build(){
  addressRequest++;
  const rows=JP.store.get();pts=[];unplaced=[];
  for(const r of rows){const p=mkPt(r);if(p)pts.push(p);else unplaced.push(r)}
  BR=window.JPBRANCHES||[];
  selPt=null;geoSearch=null;layRoute.clearLayers();
  $('empty').classList.toggle('on',!rows.length);
  lastZB=lastZA=null;renderAll();renderList();
  let budget=80; // не больше 80 фоновых адресов на загрузку страницы (3 варианта запроса на адрес)
  for(const p of pts)if(!p.exact&&budget-->0)geo(p.r,result=>{
    if(!result)return;p.exact=Boolean(result.exact);p.lat=result.pos[0];p.lon=result.pos[1];
    if(p.mk)p.mk.setLatLng([p.lat,p.lon]);
    if(selPt&&selPt.r===p.r)drawSel();
  },3);
}
const hav=(a,b,c,d)=>{const r=Math.PI/180,x=(c-a)*r,y=(d-b)*r,q=Math.sin(x/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(y/2)**2;return 12742*Math.asin(Math.sqrt(q))};
const kmT=km=>km<1?Math.round(km*1000)+' м':km.toFixed(1)+' км';
function nearest(lat,lon){let best=null;for(const b of BR){const km=hav(lat,lon,b.lat,b.lon);if(!best||km<best.km)best={b,km}}return best}
function decodePolyline(value){
  let index=0,latitude=0,longitude=0,coordinates=[];
  while(index<value.length){
    const deltas=[];
    for(let axis=0;axis<2;axis++){
      let byte,shift=0,result=0;
      do{byte=value.charCodeAt(index++)-63;result|=(byte&31)<<shift;shift+=5}while(byte>=32);
      deltas.push(result&1?~(result>>1):result>>1);
    }
    latitude+=deltas[0];longitude+=deltas[1];coordinates.push([longitude/1e6,latitude/1e6]);
  }
  return coordinates;
}
async function routeToNearest(id){
  const p=(selPt&&String(selPt.r.id)===id?selPt:null)||pts.find(point=>String(point.r.id)===id);
  if(!p||!p.exact){JP.toast(t('route_needs_exact'));return}
  const near=nearest(p.lat,p.lon);
  if(!near){JP.toast(t('mp_notfound'));return}
  const button=document.querySelector('[data-route-address="'+encodeURIComponent(id)+'"]');
  if(button)button.disabled=true;
  try{
    const response=await fetch('https://valhalla1.openstreetmap.de/route',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({locations:[{lat:p.lat,lon:p.lon},{lat:near.b.lat,lon:near.b.lon}],costing:'auto',language:'ru-RU'})
    });
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json(),leg=data.trip?.legs?.[0];
    if(!leg||!data.trip.summary)throw new Error(data.error||t('route_not_found'));
    const coordinates=decodePolyline(leg.shape).map(([lon,lat])=>[lat,lon]);
    if(coordinates.length<2)throw new Error(t('route_not_found'));
    layRoute.clearLayers();
    L.polyline(coordinates,{color:'#d44936',weight:5,opacity:.9}).addTo(layRoute);
    map.fitBounds(L.latLngBounds(coordinates),{paddingTopLeft:[40,60],bottomRight:[340,60],maxZoom:16});
    JP.toast(t('route_built',{km:data.trip.summary.length.toFixed(1),min:Math.round(data.trip.summary.time/60)}));
  }catch(error){
    console.error('Road route calculation failed:',error);
    JP.toast(t('route_failed'));
  }finally{
    if(button)button.disabled=false;
  }
}

/* ---------- иконки ---------- */
const G_ENV='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7.5 9 5.5 9-5.5"/></svg>';
const G_BOX='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/></svg>';
const icB=b=>L.divIcon({className:'',iconSize:[24,31],iconAnchor:[12,31],popupAnchor:[0,-30],html:'<span class="jp-b'+(b.type==='Постамат'?' post':'')+'">'+(b.type==='Постамат'?G_BOX:G_ENV)+'</span>'});
const icA=(p,sel)=>L.divIcon({className:'',iconSize:[sel?26:18,sel?26:18],iconAnchor:[sel?13:9,sel?13:9],popupAnchor:[0,-10],html:'<span class="jp-a'+(p.low?' low':'')+(sel?' sel':'')+(p.exact?'':' ap')+'"></span>'});
const icC=(n,kind)=>L.divIcon({className:'',iconSize:[40,40],iconAnchor:[20,20],html:'<span class="jp-c '+kind+'">'+n+'</span>'});
const icX=()=>L.divIcon({className:'',iconSize:[30,30],iconAnchor:[15,15],popupAnchor:[0,-14],html:'<span class="jp-x"></span>'});

/* ---------- попапы ---------- */
function popA(p){
  const r=p.r,near=nearest(p.lat,p.lon);
  return '<div class="jpp"><b>'+JP.esc(r.current_address?.display||r.raw_address)+'</b>'
   +(r.current_address?'<p class="note">'+JP.esc(t('entered_addr'))+' '+JP.esc(r.raw_address)+'</p>':'')
   +'<dl>'+JP.FIELDS.filter(([k])=>r[k]).map(([k,l])=>'<div><dt>'+JP.esc(l)+'</dt><dd>'+JP.esc(r[k])+'</dd></div>').join('')+'</dl>'
   +'<span class="conf '+((r.confidence||0)<LOW?'low':'')+'">'+Math.round((r.confidence||0)*100)+'%</span>'
   +(p.exact?'<span class="note"> · '+JP.esc(t('pp_exact'))+'</span>':'<span class="note"> · '+JP.esc(t('pp_approx'))+'</span>')
   +(p.exact&&near?'<p style="margin:8px 0 0"><b>'+JP.esc(t('pp_near'))+'</b><br>'+JP.esc(near.b.name)+'<br>'+JP.esc(near.b.addr)+' — '+kmT(near.km)+' ('+JP.esc(t('pp_straight'))+')</p>':'')
   +(!p.exact?'<p class="note">'+JP.esc(t('route_needs_exact'))+'</p>':'')
   +(p.exact&&near&&!window.JPBRANCHES_DEMO?'<button class="btn sm" type="button" data-route-address="'+encodeURIComponent(r.id)+'">'+JP.esc(t('pp_route'))+'</button>':'')
   +(p.exact&&near&&window.JPBRANCHES_DEMO?'<p class="note">'+JP.esc(t('route_demo'))+'</p>':'')
   +'<div class="row" style="margin-top:10px"><a class="btn ghost sm" href="batch.html?edit='+encodeURIComponent(r.id)+'">'+JP.esc(t('pp_edit'))+'</a><a class="btn ghost sm" href="check.html?q='+encodeURIComponent(r.raw_address)+'">'+JP.esc(t('pp_check'))+'</a><a class="btn ghost sm" target="_blank" rel="noopener" href="'+JP.gis2(r)+'">'+JP.esc(t('open_2gis'))+'</a></div></div>';
}
function popB(b){
  return '<div class="jpp"><b>'+JP.esc(b.name)+'</b>'
   +'<dl><div><dt>'+JP.esc(t('pp_type'))+'</dt><dd>'+JP.esc(b.type)+'</dd></div><div><dt>'+JP.esc(t('pp_city'))+'</dt><dd>'+JP.esc(b.city)+'</dd></div><div><dt>'+JP.esc(t('pp_addr'))+'</dt><dd>'+JP.esc(b.addr)+'</dd></div><div><dt>'+JP.esc(t('pp_hours'))+'</dt><dd>'+JP.esc(b.hours)+'</dd></div></dl>'
   +'<div class="row" style="margin-top:10px"><a class="btn ghost sm" target="_blank" rel="noopener" href="https://2gis.kz/search/'+encodeURIComponent(b.addr+', '+b.city)+'">'+JP.esc(t('open_2gis'))+'</a></div>'
   +(window.JPBRANCHES_DEMO?'<p class="note">'+JP.esc(t('pp_demo'))+'</p>':'')+'</div>';
}

/* ---------- слои ---------- */
function match(r,q){return[r.raw_address,r.street_name,r.street_type,r.district,r.living_area,r.landmark,r.city,r.province].filter(Boolean).join(' ').toLowerCase().includes(q)}
const vis=p=>(!onlyLow||p.low)&&(!query||match(p.r,query));
let lastZB=null,lastZA=null;
function renderAll(){renderB();renderA()}
function renderB(){
  layB.clearLayers();if(!showB)return;
  const z=map.getZoom();
  if(z<=CLU_B){
    const by={};
    for(const b of BR){const c=G.findCity(b.city);if(!c)continue;const o=by[c.n]=by[c.n]||{c:c,n:0};o.n++}
    for(const k in by){const o=by[k];
      const m=L.marker([o.c.lat,o.c.lon],{icon:icC(o.n,'b'),title:o.c.n+': '+o.n+' · '+t('l_pt')});
      m.on('click',()=>map.flyTo([o.c.lat,o.c.lon],Math.max(z+4,11)));layB.addLayer(m)}
  }else{
    for(const b of BR){const m=L.marker([b.lat,b.lon],{icon:icB(b),title:b.name});m.bindPopup(popB(b),{maxWidth:300});layB.addLayer(m)}
  }
}
function renderA(){
  layA.clearLayers();for(const p of pts)p.mk=null;
  if(!showA)return;
  const list=pts.filter(vis),z=map.getZoom();
  if(z<=CLU_A&&!query){
    const by={};
    for(const p of list){const o=by[p.c.n]=by[p.c.n]||{p:p,n:0,low:0};o.n++;if(p.low)o.low++}
    for(const k in by){const o=by[k];
      const m=L.marker([o.p.lat,o.p.lon],{icon:icC(o.n,'a'+(o.low?' low':'')),title:o.p.c.n+': '+o.n+' · '+t('l_cl')+(o.low?', '+t('sb_check')+' '+o.low:'')});
      m.on('click',()=>map.flyTo([o.p.lat,o.p.lon],Math.max(z+4,13)));layA.addLayer(m)}
  }else{
    for(const p of list){
      const m=L.marker([p.lat,p.lon],{icon:icA(p,false),title:p.r.raw_address});
      m.bindPopup(()=>popA(p),{maxWidth:320});
      m.on('click',()=>{selPt=p;geoSearch=null;layRoute.clearLayers();drawSel()});
      p.mk=m;layA.addLayer(m)}
  }
}
function drawSel(){
  laySel.clearLayers();
  if(geoSearch){
    const g=geoSearch;
    L.marker([g.lat,g.lon],{icon:icX(),zIndexOffset:1000}).addTo(laySel)
     .bindPopup('<div class="jpp"><b>'+JP.esc(g.label)+'</b>'+(g.exact&&g.near?'<p style="margin:8px 0 0"><b>'+JP.esc(t('pp_near'))+'</b><br>'+JP.esc(g.near.b.name)+'<br>'+JP.esc(g.near.b.addr)+' — '+kmT(g.near.km)+' ('+JP.esc(t('pp_straight'))+')</p>':'')+'<p class="note">'+JP.esc(t('pp_src'))+'</p></div>',{maxWidth:320}).openPopup();
    if(g.exact&&g.near){L.polyline([[g.lat,g.lon],[g.near.b.lat,g.near.b.lon]],{color:css('--deep'),weight:2.5,dashArray:'7 6'}).addTo(laySel);
      L.marker([g.near.b.lat,g.near.b.lon],{icon:icB(g.near.b),zIndexOffset:800}).bindPopup(popB(g.near.b)).addTo(laySel)}
    return;
  }
  if(!selPt)return;
  const p=selPt,near=nearest(p.lat,p.lon);
  L.marker([p.lat,p.lon],{icon:icA(p,true),zIndexOffset:1000}).addTo(laySel).bindPopup(()=>popA(p),{maxWidth:320}).openPopup();
  if(near&&p.exact){
    L.polyline([[p.lat,p.lon],[near.b.lat,near.b.lon]],{color:css('--deep'),weight:2.5,dashArray:'7 6'}).addTo(laySel);
    L.marker([near.b.lat,near.b.lon],{icon:icB(near.b),zIndexOffset:800}).bindPopup(popB(near.b)).addTo(laySel);
    L.marker([(p.lat+near.b.lat)/2,(p.lon+near.b.lon)/2],{icon:L.divIcon({className:'',iconSize:[90,22],iconAnchor:[45,11],html:'<span class="jp-d">'+kmT(near.km)+'</span>'}),interactive:false}).addTo(laySel);
  }
}
function focusOn(p){
  if(window.JPBRANCHES_DEMO){map.flyTo([p.lat,p.lon],16);return}
  const near=nearest(p.lat,p.lon);
  if(near&&Math.abs(p.lat-near.b.lat)+Math.abs(p.lon-near.b.lon)<3)
    map.flyToBounds([[Math.min(p.lat,near.b.lat),Math.min(p.lon,near.b.lon)],[Math.max(p.lat,near.b.lat),Math.max(p.lon,near.b.lon)]],{paddingTopLeft:[40,60],bottomRight:[340,60],maxZoom:16});
  else map.flyTo([p.lat,p.lon],15);
}
map.on('zoomend',()=>{const z=map.getZoom();
  if(lastZB!==(z<=CLU_B)){lastZB=z<=CLU_B;renderB()}
  if(lastZA!==(z<=CLU_A)){lastZA=z<=CLU_A;renderA()}
});
map.on('popupopen',event=>{
  const button=event.popup.getElement()?.querySelector('[data-route-address]');
  if(button)button.addEventListener('click',()=>routeToNearest(decodeURIComponent(button.dataset.routeAddress)));
});

/* ---------- сайдбар ---------- */
function renderList(){
  const ex=pts.filter(p=>p.exact).length;
  $('mstat').textContent=t('mp_stat',{a:showA?pts.filter(vis).length:0,e:ex?t('mp_stat_e',{e:ex}):'',b:showB?BR.length:0,u:unplaced.length});
  if(query){
    const hits=pts.filter(vis).slice(0,60);
    const unh=unplaced.filter(r=>match(r,query)).slice(0,20);
    $('mlist').innerHTML=(hits.length?'<h4>'+JP.esc(t('l_cl'))+'</h4>':'')
     +hits.map(p=>'<li><button type="button" data-p="'+JP.esc(p.r.id)+'"><span style="font-size:13px">'+JP.esc(p.r.raw_address.slice(0,52))+'</span><small>'+(p.low?JP.esc(t('sb_check')):Math.round((p.r.confidence||0)*100)+'%')+'</small></button></li>').join('')
     +(unh.length?'<h4>'+JP.esc(t('sb_nocity2'))+'</h4>':'')
     +unh.map(r=>'<li><button type="button" data-e="'+encodeURIComponent(r.id)+'"><span style="font-size:13px">'+JP.esc(r.raw_address.slice(0,52))+'</span><small>'+JP.esc(t('sb_fix'))+'</small></button></li>').join('')
     +(hits.length?'':'<li><button type="button" data-g="1"><span>🔍 «'+JP.esc(query.slice(0,40))+'» — '+JP.esc(t('sb_search'))+'</span></button></li>');
  }else{
    const by={};
    if(showA)for(const p of pts){const o=by[p.c.n]=by[p.c.n]||{c:p.c,n:0,low:0,b:0};o.n++;if(p.low)o.low++}
    if(showB)for(const b of BR){const c=G.findCity(b.city);if(c)(by[c.n]=by[c.n]||{c:c,n:0,low:0,b:0}).b++}
    const arr=Object.values(by).sort((x,y)=>(y.b+y.n)-(x.b+x.n));
    $('mlist').innerHTML='<h4>'+JP.esc(t('sb_cities'))+'</h4>'+arr.map(o=>'<li><button type="button" data-c="'+JP.esc(o.c.n)+'"><span>'+JP.esc(o.c.n)+'</span><small>'+[o.b?'Jana Post: '+o.b:'',o.n?t('l_cl')+': '+o.n:'',o.low?t('sb_check')+': '+o.low:''].filter(Boolean).map(JP.esc).join(' · ')+'</small></button></li>').join('')
     +(unplaced.length?'<h4>'+JP.esc(t('sb_nocity'))+'</h4>'+unplaced.slice(0,40).map(r=>'<li><button type="button" data-e="'+encodeURIComponent(r.id)+'"><span style="font-size:13px">'+JP.esc(r.raw_address.slice(0,46))+'</span></button></li>').join(''):'');
  }
}
$('mlist').onclick=e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.c){const c=G.findCity(b.dataset.c);if(c)map.flyTo([c.lat,c.lon],11);
    document.querySelectorAll('#mlist button').forEach(x=>x.removeAttribute('aria-current'));b.setAttribute('aria-current','true')}
  else if(b.dataset.p)selectId(b.dataset.p);
  else if(b.dataset.g)searchStreet($('mq').value.trim());
  else if(b.dataset.e)location.href='batch.html?edit='+b.dataset.e};
let qt=null;
$('mq').oninput=e=>{clearTimeout(qt);qt=setTimeout(()=>{query=e.target.value.trim().toLowerCase();geoSearch=null;laySel.clearLayers();renderList();renderA();renderB()},180)};
$('mq').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();const v=e.target.value.trim();if(v&&!pts.filter(vis).length)searchStreet(v)}};
if(window.JPSuggest)JPSuggest.attach($('mq'),{onPick:(d,v)=>searchStreet(v)});

/* ---------- поиск улицы/адреса через Nominatim ---------- */
/* Введённая строка разбирается локальным парсером, затем перебираются варианты запроса
   (structured street/city → free-text в обоих порядках → район/жилмассив). Так находятся
   даже адреса, которые OSM не понимает в русской форме («Астана, улица Достык 5»). */
function searchStreet(q){
  q=String(q||'').trim();if(!q)return;addressRequest++;JP.toast(t('mp_searching'));
  JPGeocode.searchText(q).then(res=>{
    if(!res){JP.toast(t('mp_notfound'));showGisFallback(q);return}
    geoSearch={lat:res.pos[0],lon:res.pos[1],label:res.label||q,near:nearest(res.pos[0],res.pos[1])};selPt=null;
    drawSel();focusOn(geoSearch);
  }).catch(()=>JP.toast(t('mp_neterr')));
}
function showGisFallback(q){ // последняя надежда — 2ГИС, там база адресов полнее
  const list=$('mlist');
  const li=document.createElement('li');
  li.innerHTML='<a class="btn primary sm" style="width:100%" target="_blank" rel="noopener" href="https://2gis.kz/search/'+encodeURIComponent(q)+'">🔎 '+JP.esc(t('open_2gis'))+'</a>';
  list.prepend(li);
}

/* ---------- управление ---------- */
$('lb').onchange=e=>{showB=e.target.checked;showB?layB.addTo(map):map.removeLayer(layB);lastZB=null;renderB();renderList()};
$('la').onchange=e=>{showA=e.target.checked;showA?layA.addTo(map):map.removeLayer(layA);lastZA=null;renderA();renderList()};
$('zi').onclick=()=>map.zoomIn();$('zo').onclick=()=>map.zoomOut();
$('zr').onclick=()=>{addressRequest++;geoSearch=null;selPt=null;laySel.clearLayers();map.flyToBounds(KZB,{padding:[8,8]})};
document.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>{onlyLow=b.dataset.f==='low';document.querySelectorAll('.seg button').forEach(x=>x.setAttribute('aria-pressed',x===b));renderList();renderA()});
$('mdemo').onclick=async()=>{const x=await JP.parse(JP.sampleList());JP.store.set(x.rows.map(r=>({...r,_e:false})));build()};
map.on('click',()=>{if(geoSearch){geoSearch=null;laySel.clearLayers()}});
window.addEventListener('storage',build);

/* ---------- публичный API (Элизабет, ссылки с других страниц) ---------- */
function flyToCity(name){const c=G.findCity(name)||G.findCityInText(name);if(!c)return false;map.flyTo([c.lat,c.lon],11);return true}
function selectId(id){const p=pts.find(x=>x.r.id===id);if(!p)return false;addressRequest++;selPt=p;geoSearch=null;focusOn(p);setTimeout(drawSel,650);return true}
function showAddr(r){
  const request=++addressRequest;
  geoSearch=null;
  const g=GC.pos(r),ap=approx(r);
  if(!ap&&!g)return false;
  $('empty').classList.remove('on');
  const hasStreetAddress=Boolean(r.street_name||r.current_address?.street_name);
  selPt=g?{r,c:ap?.c||null,lat:g.pos[0],lon:g.pos[1],exact:Boolean(g.exact),low:(r.confidence||0)<LOW}
    :hasStreetAddress?null:(ap?mkPt(r):null);
  if(selPt){focusOn(selPt);drawSel()}
  else if(ap){map.flyTo([ap.c.lat,ap.c.lon],11);JP.toast(t('mp_searching'))}
  if(!g||!g.exact)geo(r,result=>{
    if(request!==addressRequest)return;
    if(!result){JP.toast(t('mp_notfound'));return}
    selPt={r,c:ap?.c||null,lat:result.pos[0],lon:result.pos[1],exact:Boolean(result.exact),low:(r.confidence||0)<LOW};
    focusOn(selPt);drawSel();
  },12,8);
  return true;
}
window.JPMap={showAddr:showAddr,flyToCity:flyToCity,selectId:selectId,refresh:build,zoomIn:()=>map.zoomIn(),zoomOut:()=>map.zoomOut(),reset:()=>$('zr').click(),count:()=>pts.length,getMap:()=>map};

build();
const qs=new URLSearchParams(location.search);
setTimeout(()=>{const id=qs.get('id'),f=qs.get('focus');
  if(qs.get('addr')){const l=JP.store.last();if(l&&showAddr(l))return}
  if(id)selectId(id);else if(f)flyToCity(f)},350);
})();
