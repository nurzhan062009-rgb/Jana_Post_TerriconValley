/* Jana Address — локальный разбор адреса (запасной режим без бэкенда).
   Правила совпадают с ТЗ: название улицы «как в строке», тип отдельно, дом с дробью и литерой. */
(function(g){
'use strict';
const G=g.JPGEO;
const FIELDS=['province','city','district','living_area','street_type','street_name','house','apartment','entrance','floor','landmark'];
const clean=s=>String(s==null?'':s).replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00AD]/g,'').replace(/[\u00A0\u2007\u202F]/g,' ').replace(/\s+/g,' ').trim();
const trimP=s=>String(s||'').replace(/^[\s.,\-–:;]+|[\s.,\-–:;]+$/g,'');
const NB='(?<![\\p{L}\\d])',NL='(?![\\p{L}\\d])';
const R=src=>new RegExp(src,'iu');
const APT=[R(NB+'(?:квартира|кв|kv|flat|apt|офис|оф)\\.?\\s*№?\\s*(\\d+)'),R('(\\d+)\\s*-?\\s*(?:квартира|кв|kv|flat|apt|офис|оф)\\.?'+NL)];
const HOUSE=[R(NB+'(?:дом|д)\\.?\\s*№?\\s*(\\d+(?:\\/\\d+)?(?:-?[а-яa-z](?![\\p{L}]))?)'),R('(\\d+(?:\\/\\d+)?(?:-?[а-яa-z])?)\\s*-?\\s*(?:дом|д)\\.?'+NL)];
const ENT=[R('(\\d+)\\s*-?\\s*(?:подъезд|подьезд|под|пд)\\.?'+NL),R(NB+'(?:подъезд|подьезд|под|пд|парадная)\\.?\\s*№?\\s*(\\d+)')];
const FLR=[R('(\\d+)\\s*-?\\s*(?:этаж|эт)\\.?'+NL),R(NB+'(?:этаж|эт)\\.?\\s*№?\\s*(\\d+)')];
const LM=R(NB+'(?:магазин|маг\\.?|тц|трц|кафе|аптека|школа|мечеть|больница|поликлиника|рынок|базар|остановка|банк|qazpost|казпочта|kaspi|halyk|рядом\\s+с|возле|около|напротив)(?![\\p{L}])[^,]*');
const TYPES=[['микрорайон','микрорайон|мкрн|мкр|мик|ықшамаудан'],['квартал','квартал|кв-л'],['проспект','проспект|просп|пр-т|пр|даңғылы'],['улица','улица|ул|көшесі'],['переулок','переулок|пер'],['бульвар','бульвар|б-р|бул'],['шоссе','шоссе'],['проезд','проезд'],['тупик','тупик'],['площадь','площадь|пл'],['набережная','набережная|наб']]
 .map(([t,a])=>[t,R('(?<![\\p{L}])(?:'+a+')\\.?(?![\\p{L}])')]);
function take(s,res){for(const re of res){const m=re.exec(s);if(m)return[m[1],s.slice(0,m.index)+' , '+s.slice(m.index+m[0].length)]}return[null,s]}
function findType(s){let best=null;for(const[t,re]of TYPES){const m=re.exec(s);if(m&&(!best||m.index<best.i))best={type:t,i:m.index,len:m[0].length}}return best}
const HTAIL=/^(.*\p{L})\s*(\d+(?:\/\d+)?(?:-?\p{L})?)$/u;
function cityOfSeg(sg){for(const p of sg.split('/')){const c=G.findCity(p);if(c)return c}return null}
function provOf(sg){const parts=sg.split('/').map(clean);const p=parts.find(x=>/област/i.test(x))||parts[0];return clean(p.replace(/\s*обл\.?$/i,' область').replace(/\s+облысы$/i,' область'))}
function distOf(sg){const p=clean(sg.split('/')[0]).replace(/\s*(район|р-н|р-он|аудан\S*)\.?/ig,' ').replace(/^\s*(район|р-н)\s+/i,'');return trimP(p)||null}
function parseItem(it){
  const t=findType(it);let name=it,type=null,living=null;
  if(t){
    type=t.type;const b=trimP(it.slice(0,t.i)),a=trimP(it.slice(t.i+t.len));
    if(type==='микрорайон'||type==='квартал'){
      const last=b.split(' ').pop();
      if(b&&/^\d+[\p{L}]?$/u.test(last)){name=last;living=trimP(b.slice(0,b.length-last.length))||null}
      else if(a){if(b&&/^\d+[\p{L}]?$/u.test(a)){name=a;living=b}else name=a}
      else name=b;
    }else name=trimP(b+' '+a);
  }else name=trimP(it);
  let house=null;
  if(!(type==='микрорайон'||type==='квартал')){const m=HTAIL.exec(name);if(m){name=trimP(m[1]);house=m[2]}}
  return{type,name,living,house};
}
function parse(raw){
  const out={};FIELDS.forEach(k=>out[k]=null);
  let s=clean(raw),v;
  s=s.replace(/(?<![\p{L}])(ул|пр|пер|мкр|мкрн|бул|пл|пр-т|б-р)\s+\./giu,'$1.');
  [v,s]=take(s,APT);out.apartment=v;
  [v,s]=take(s,HOUSE);out.house=v;
  [v,s]=take(s,ENT);out.entrance=v;
  [v,s]=take(s,FLR);out.floor=v;
  const lm=LM.exec(s);
  if(lm){out.landmark=trimP(lm[0]);s=s.slice(0,lm.index)+' , '+s.slice(lm.index+lm[0].length)}
  const segs=s.split(',').map(x=>trimP(clean(x))).filter(Boolean);
  let city=null,prov=null,dist=null;const items=[];let living=null;
  for(const sg of segs){
    if(/^(?:республика\s+)?(?:казахстан|қазақстан|рк|kz|kazakhstan)$/i.test(sg)||/^\d{6}$/.test(sg))continue;
    const c=cityOfSeg(sg);
    if(c){if(!city||c.t>=city.t)city=c;continue}
    if(/област|облыс|(^|\s)обл\.?$/i.test(sg)){prov=provOf(sg);continue}
    if(/район|р-н|аудан/i.test(sg)&&!/\d/.test(sg)){dist=distOf(sg);continue}
    if(/^\d+(?:\/\d+)?\p{L}?$/u.test(sg)){if(!out.house)out.house=sg;continue}
    const jk=/^(?:жк|жилой комплекс|жилой массив|жм)\.?\s*(.+)$/iu.exec(sg);
    if(jk){living=living||trimP(jk[1]);continue}
    let seg=sg;
    if(!city){
      const tk=seg.replace(/^(?:г|гор|город)\.?\s+/i,'').split(' ');
      for(const n of [2,1]){if(tk.length>n){const c=G.findCity(tk.slice(0,n).join(' '));if(c){city=c;seg=tk.slice(n).join(' ');break}}}
    }
    // «Алматы район Ул Космонавтов» — район без запятой, остальное продолжается в том же сегменте.
    // \b после кириллицы не работает (\w = ASCII), поэтому юникод-lookahead.
    const rd=/^(.+?)\s+(?:район|р-н|р-он|аудан[а-яёіңғүұқөһ]*)(?![\p{L}\d])/iu.exec(seg);
    if(rd&&rd[1]&&!/\d/.test(rd[1])){dist=dist||trimP(rd[1]);seg=trimP(seg.slice(rd[0].length))}
    if(seg)items.push(parseItem(seg));
  }
  // «мкр Ордабасы 40 кв 12» — дом прилип к названию микрорайона; отделяем, если другого дома нет,
  // но «Аксай 3а»/«Кок-Тобе 5» остаются именем (литера или отдельный сегмент дома)
  const mi0=items.find(i=>i.type==='микрорайон'||i.type==='квартал');
  if(mi0&&mi0.name&&!out.house&&!items.some(i=>i.house)){
    const hm=/^(\p{L}[\p{L}\s\-]*?)\s+(\d{1,4}(?:\/\d+)?)$/u.exec(mi0.name);
    if(hm){mi0.name=trimP(hm[1]);mi0.house=hm[2]}
  }
  const micro=items.find(i=>i.type==='микрорайон'||i.type==='квартал');
  const street=items.find(i=>i!==micro&&i.name);
  if(street&&micro){out.street_type=street.type;out.street_name=street.name;out.living_area=micro.name}
  else if(micro){out.street_type=micro.type;out.street_name=micro.name;out.living_area=micro.living}
  else if(street){out.street_type=street.type;out.street_name=street.name}
  if(!out.living_area&&living)out.living_area=living;
  const hi=items.find(i=>i.house);if(!out.house&&hi)out.house=hi.house;
  out.city=city?city.n:null;
  out.province=prov||(city?city.p:null);
  out.district=dist;
  /* Справочник (по ТЗ восстановление недостающих полей приветствуется):
     уникальная улица → город+тип, улица при известном городе → тип, район → город. */
  const key=out.street_name?G.norm(out.street_name):'';
  const sc=(key&&G.streetCities)?G.streetCities(out.street_name):null;
  if(sc&&sc.length){
    const e=out.city?(sc.find(x=>G.norm(x[1])===G.norm(out.city))||null):(sc.length===1?sc[0]:null);
    if(e){
      if(!out.street_type)out.street_type=e[0];
      if(!out.city){const c=G.findCity(e[1]);if(c){out.city=c.n;if(!out.province)out.province=c.p}}
    }
  }
  if(!out.city&&out.district&&G.districtCity){
    const cn=G.districtCity(out.district),c=cn&&G.findCity(cn);
    if(c){out.city=c.n;if(!out.province)out.province=c.p}
  }
  if(!out.district&&out.city&&G.MICRO_DISTRICT&&G.MICRO_DISTRICT[out.city]){ // микрорайон → район
    const tb=G.MICRO_DISTRICT[out.city];
    for(const cand of [out.living_area,out.street_type==='микрорайон'?out.street_name:null]){
      if(!cand)continue;const nc=G.norm(cand);
      for(const k in tb)if(nc.indexOf(k)===0){out.district=tb[k];break}
      if(out.district)break;
    }
  }
  if(!out.district&&out.city&&out.street_name&&G.DISTRICTS[out.city]){ // название = известный район города
    const dn=G.norm(out.street_name);
    for(const k in G.DISTRICTS[out.city])if(G.norm(k)===dn){out.district=k;break}
  }
  let sug=[];
  const ent=(sc&&sc.length)?sc[0]:(key?(G.STREETS[key]||G.STREETS[key.replace(/ /g,'')]):null);
  if(ent&&(!out.city||!out.street_type)){ // неоднозначный случай — оставляем подсказку
    const[t,cn]=ent,c=G.findCity(cn);
    const patch={};
    if(!out.city&&c){patch.city=c.n;patch.province=c.p}
    if(!out.street_type)patch.street_type=t;
    if(Object.keys(patch).length)sug.push({text:(out.street_type||t)+' '+out.street_name+(out.city?'':', '+cn),patch});
  }
  let cf=.3;
  if(out.city)cf+=.22;if(out.province)cf+=.06;if(out.street_name)cf+=.24;if(out.house)cf+=.2;if(out.street_type)cf+=.08;
  if(out.apartment||out.entrance||out.floor)cf+=.05;
  if(out.district||out.living_area)cf+=.03;
  if(sc&&sc.length){cf+=.08;if(out.city&&sc.some(x=>G.norm(x[1])===G.norm(out.city)))cf+=.04}
  else if(ent)cf+=.08;
  if(out.city&&/^(Астана|Караганда)$/i.test(out.city))cf+=.05;
  if(sug.length)cf-=.05;
  if(!out.house)cf-=.08;
  let hx=0;for(let i=0;i<raw.length;i++)hx=(hx*31+raw.charCodeAt(i))>>>0;
  cf-=(hx%5)/100;
  out.confidence=Math.round(Math.max(.2,Math.min(.99,cf))*100)/100;
  if(sug.length)out.suggestions=sug;
  return out;
}
g.JPParser={parse,clean,FIELDS};
})(typeof window!=='undefined'?window:globalThis);
