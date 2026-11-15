/* Jana Address — геокодер поверх Nominatim (OSM).
   Главный приём: structured-запрос (street=/city=/country=) находит то, что free-text не может.
   Для каждого адреса строим цепочку вариантов и берём первый нашедшийся. Кэш в localStorage,
   вежливая очередь ≤1 запрос/1.2 c. Используется картой, «показать на карте» и подсказками. */
(function(g){
'use strict';
const G=g.JPGEO;
const BASE='https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=kz';
const qs=o=>Object.entries(o).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');

/* Упорядоченные варианты запроса для разобранного адреса.
   Каждый вариант — строка-хвост URL (после BASE&…). Сначала точные structured, потом free-text. */
function variants(row,max){
  row=row||{};
  const out=[],seen=new Set();
  const push=s=>{if(s&&!seen.has(s)){seen.add(s);out.push(s)}};
  const st=(o)=>qs(o)+'&limit=1';
  const living=row.living_area||row.current_address?.living_area||'';
  const addresses=[row.current_address,row].filter(address=>address&&address.street_name).map(address=>{
    const name=address.street_name,alias=(G.geoAlias&&name)?G.geoAlias(name):null;
    return{
      city:address.city||row.city||row.province||'',
      type:address.street_type||row.street_type||'',
      house:address.house||row.house||'',
      living:address.living_area||living,
      names:[name,...(alias&&alias!==name?[alias]:[])]
    };
  });
  // Current names must win over legacy names when resolving a renamed street.
  for(const address of addresses)if(address.city&&address.house)
    push(st({street:address.names[0]+' '+address.house,city:address.city,country:'Казахстан'}));
  for(const address of addresses)if(address.city&&address.house)
    for(const name of address.names.slice(1))
      push(st({street:name+' '+address.house,city:address.city,country:'Казахстан'}));
  for(const address of addresses)if(address.city&&address.living)
    push(st({street:address.living+(address.house?' '+address.house:''),city:address.city,country:'Казахстан'}));
  for(const address of addresses)if(address.city)
    for(const name of address.names)push(st({street:name,city:address.city,country:'Казахстан'}));
  for(const address of addresses)for(const name of address.names){
    const full=(address.type?address.type+' ':'')+name+(address.house?' '+address.house:'');
    push('q='+encodeURIComponent([full,address.city,'Казахстан'].filter(Boolean).join(', '))+'&limit=1');
  }
  for(const address of addresses)for(const name of address.names){
    const full=(address.type?address.type+' ':'')+name+(address.house?' '+address.house:'');
    push('q='+encodeURIComponent([address.city,full,'Казахстан'].filter(Boolean).join(', '))+'&limit=1');
  }
  const city=row.city||row.province||'';
  // 6) район города
  if(row.district&&city)push('q='+encodeURIComponent([row.district+' район',city,'Казахстан'].filter(Boolean).join(', '))+'&limit=1');
  // 7) жилой массив отдельно
  if(living&&city)push('q='+encodeURIComponent([living,city,'Казахстан'].filter(Boolean).join(', '))+'&limit=1');
  return max?out.slice(0,max):out;
}

/* ---- кэш ---- */
let GC={};try{GC=JSON.parse(localStorage.getItem('jp_gc')||'{}')}catch(e){}
const save=()=>{try{localStorage.setItem('jp_gc',JSON.stringify(GC))}catch(e){}};
const cacheGet=k=>GC[k];
const cacheSet=(k,v)=>{GC[k]=v;save()};

/* ---- вежливая очередь с приоритетом и backoff на 429 ----
   Интерактивный поиск (prio выше) проходит вперёд фонового обогащения карты.
   На 429/503 — глобальная пауза (circuit breaker): пока IP заблокирован, очередь
   НЕ долбит сервер, а интерактивный запрос быстро возвращает null (UI показывает
   fallback «Открыть в 2ГИС») и НЕ кэшируется как «не найдено». */
const queue=[];let busy=false,cool=1200,blockedUntil=0;
const isBlocked=()=>Date.now()<blockedUntil;
function pump(){
  if(busy||!queue.length)return;
  if(isBlocked()){setTimeout(pump,Math.max(300,blockedUntil-Date.now()));return}
  busy=true;
  let bi=0;for(let i=1;i<queue.length;i++)if((queue[i].prio||0)>(queue[bi].prio||0))bi=i;
  const job=queue.splice(bi,1)[0];
  const next=ms=>setTimeout(()=>{busy=false;pump()},ms);
  const requeue=()=>{job.retries=(job.retries||0)+1;if(job.retries>3){job.done(null);next(cool)}else{queue.push(job);next(cool)}};
  fetch(BASE+'&'+job.q,{headers:{Accept:'application/json'}}).then(async r=>{
    if(r.status===429||r.status===503){cool=Math.min(cool*2,20000);blockedUntil=Date.now()+cool;requeue();return}
    cool=1200;
    const a=await r.json().catch(()=>null);
    job.done(Array.isArray(a)?a:null);next(cool);
  }).catch(()=>{job.done(null);next(4000)});
}
function one(q,prio){ // → Promise массива результатов Nominatim
  return new Promise(res=>{
    if((prio||0)>=8&&isBlocked()){res(null);return} // интерактив не ждёт окончания блока
    queue.push({q,done:res,prio:prio||0});pump();
  });
}
/* Ограничивает ожидание ответа: если Nominatim молчит дольше ms — null (не кэшируется). */
function raceTimeout(p,ms){
  return new Promise(res=>{let t=setTimeout(()=>res(null),ms);p.then(v=>{clearTimeout(t);res(v)},()=>{clearTimeout(t);res(null)})});
}

/* Поиск координат дома по разобранному адресу: перебирает варианты, кэширует по исходному ключу.
   key — строка-идентификатор (обычно raw_address). prio — приоритет очереди.
   Возвращает {pos:[lat,lon],label} | null. */
async function search(row,key,max,prio){
  const k='v4:'+(key||(row&&row.raw_address)||JSON.stringify(row||{}));
  const hit=GC[k];
  if(Array.isArray(hit))return{pos:hit,label:hit.label||k};
  if(hit&&hit.pos)return hit;
  if(hit===false)return null;
  const interactive=(prio||0)>=8;
  const deadline=interactive?Date.now()+12000:0; // интерактив не висит дольше 12 c
  const currentRow=row.current_address?.street_name
    ?{...row,...row.current_address,current_address:undefined}
    :null;
  const primary=currentRow?variants(currentRow,max):[];
  const primarySet=new Set(primary);
  const vs=[...primary,...variants(row,max).filter(variant=>!primarySet.has(variant))];
  let fallback=null;
  for(let index=0;index<vs.length;index++){
    if(index===primary.length&&fallback){
      cacheSet(k,fallback);
      return fallback;
    }
    const q=vs[index];
    if(interactive&&(isBlocked()||Date.now()>deadline))return null; // быстрый выход, не кэшируем отрицательно
    const cached=GC['v4:'+q];
    if(cached&&cached.pos){
      if(cached.exact){cacheSet(k,cached);return cached}
      fallback??=cached;
      continue;
    }
    if(cached===false)continue;
    const a=await (interactive?raceTimeout(one(q,prio),Math.max(400,deadline-Date.now())):one(q,prio));
    const o=a&&a[0];
    if(o){
      const requestedHouse=row.house||row.current_address?.house;
      const foundHouse=o.address?.house_number;
      const exact=Boolean(requestedHouse)&&String(foundHouse||'').trim().toLocaleLowerCase('ru')===String(requestedHouse).trim().toLocaleLowerCase('ru');
      const res={pos:[+o.lat,+o.lon],label:o.display_name||k,exact};
      cacheSet('v4:'+q,res);
      if(exact){cacheSet(k,res);return res}
      fallback??=res;
    }
    else if(a!==null)cacheSet('v4:'+q,false); // кэшируем только уверенный пустой ответ, не 429/блок
  }
  if(fallback){cacheSet(k,fallback);return fallback}
  if(!isBlocked())cacheSet(k,false);
  return null;
}

/* Поиск по произвольному тексту: сначала локальный разбор, затем варианты. */
function searchText(text,max){
  const row=(g.JPParser?JPParser.parse(text):null)||{};
  if(!row.raw_address)row.raw_address=text;
  return search(row,text,max,10); // интерактив — высокий приоритет
}

/* Запросы для автодополнения (нужен список). Если free-text пуст — пробуем разобранные
   варианты «улица дом, город» (в т.ч. алиас из справочника). */
async function suggest(text,limit){
  limit=limit||6;
  const tail='&limit='+limit+'&dedupe=1';
  const full=/казахстан|казах|kz\b/i.test(text)?text:text+', Казахстан';
  let a=await one('q='+encodeURIComponent(full)+tail,8);
  if((!a||!a.length)&&g.JPParser){
    const row=JPParser.parse(text);
    const city=row.city||row.province;
    if(row.street_name&&city){
      const tried=new Set();
      for(const n of [(G.geoAlias?G.geoAlias(row.street_name):null),row.street_name]){
        if(!n||tried.has(n))continue;tried.add(n);
        const s=n+(row.house?' '+row.house:'');
        const b=await one('q='+encodeURIComponent([s,city,'Казахстан'].join(', '))+tail,8);
        if(b&&b.length){a=b;break}
      }
    }
  }
  return a||[];
}

g.JPGeocode={variants,search,searchText,suggest,cache:{get:cacheGet,set:cacheSet},BASE};
})(typeof window!=='undefined'?window:globalThis);
