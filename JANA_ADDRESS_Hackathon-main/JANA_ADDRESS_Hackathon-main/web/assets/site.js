(function(){
const T=(k,p)=>window.JPI18N?JPI18N.t(k,p):k;
const NAV=[['index.html',T('nav_home')],['check.html',T('nav_check')],['batch.html',T('nav_batch')],['offline-map.html',T('nav_offline_map')],['about.html',T('nav_about')]];
const FOOTER_NAV=[...NAV.slice(0,3),['map.html',T('nav_map')],...NAV.slice(3)];
const cur=(p=>['map','map.html','unified-map.html'].includes(p)?'offline-map.html':p)(location.pathname.split('/').pop()||'index.html');
const h=document.getElementById('hdr'),f=document.getElementById('ftr');
const LOGO='<a class="logo" href="index.html" aria-label="Jana Post — '+T('nav_home')+'">JANA<small>POST</small></a>';
const safe=(fn,d)=>{try{return fn()}catch(e){return d}};
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js')
 .catch(e=>console.error('Jana Address offline cache registration failed:',e));
const accGet=()=>safe(()=>JSON.parse(localStorage.getItem('jp_acc')||'null'),null);
const ACC_ICON='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const LANGS=['ru','kk','en'],cl=window.JPI18N?JPI18N.lang:'ru';
if(h){const a=accGet();h.innerHTML=`<header class="top"><div class="container bar">${LOGO}<button class="burger" aria-label="Меню" aria-expanded="false"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button><nav>${NAV.map(([u,t])=>`<a href="${u}"${u===cur?' aria-current="page"':''}>${t}</a>`).join('')}</nav><div class="langsw" role="group" aria-label="Language">${LANGS.map(l=>`<button type="button" data-l="${l}" aria-pressed="${cl===l}">${l.toUpperCase()}</button>`).join('')}</div><a class="acc" href="account.html" aria-label="${T('nav_account')}" title="${T('nav_account')}">${ACC_ICON}<span>${a?esc(a.name):T('cab')}</span></a></div></header>`;
 const b=h.querySelector('.burger'),n=h.querySelector('nav');b.onclick=()=>{const o=n.classList.toggle('open');b.setAttribute('aria-expanded',o)};
 h.querySelector('.langsw').onclick=e=>{const x=e.target.closest('button[data-l]');if(x&&window.JPI18N)JPI18N.set(x.dataset.l)}}
if(f)f.innerHTML=`<footer><div class="container"><div>${LOGO.replace('class="logo"','class="logo flogo"')}<p>${T('foot_desc')}</p></div><div class="fnav">${FOOTER_NAV.map(([u,t])=>`<a href="${u}">${t}</a>`).join('')}<a href="account.html">${T('nav_account')}</a></div><div class="fnote">${T('foot_note')}</div></div></footer>`;
const FIELDS=[['province',T('f_province')],['city',T('f_city')],['district',T('f_district')],['living_area',T('f_living_area')],['street_type',T('f_street_type')],['street_name',T('f_street_name')],['house',T('f_house')],['apartment',T('f_apartment')],['entrance',T('f_entrance')],['floor',T('f_floor')],['landmark',T('f_landmark')]];
const N=null;
// ДЕМО-данные: эталонные ответы для показа интерфейса без бэкенда. В итоговом решении удалить.
const DEMO=[
{id:'rec_00417',raw_address:'город Алматы/Алматы қаласы, Мкр Аксай 3а, 59, кв 70',province:'Алматы',city:'Алматы',district:'Ауэзовский',living_area:N,street_type:'микрорайон',street_name:'Аксай 3а',house:'59',apartment:'70',entrance:N,floor:N,landmark:N,confidence:.96},
{id:'rec_00418',raw_address:'66квартал 12дом 69квартира',province:N,city:N,district:N,living_area:N,street_type:'квартал',street_name:'66',house:'12',apartment:'69',entrance:N,floor:N,landmark:N,confidence:.86},
{id:'rec_00419',raw_address:'Туран 55/6 магазин береке 4подьезд 9этаж',province:N,city:N,district:N,living_area:N,street_type:N,street_name:'Туран',house:'55/6',apartment:N,entrance:'4',floor:'9',landmark:'магазин береке',confidence:.9,suggestions:[{text:'проспект Туран, Астана',patch:{province:'Астана',city:'Астана',street_type:'проспект'}}]},
{id:'rec_00420',raw_address:'Ул .Курильская 9 кв 1',province:N,city:N,district:N,living_area:N,street_type:'улица',street_name:'Курильская',house:'9',apartment:'1',entrance:N,floor:N,landmark:N,confidence:.93},
{id:'rec_00421',raw_address:'город Актобе/Ақтөбе қаласы, Нурсити 2 микрорайон 11дом 5 подьезд 239 кв',province:'Актюбинская область',city:'Актобе',district:N,living_area:'Нурсити',street_type:'микрорайон',street_name:'2',house:'11',apartment:'239',entrance:'5',floor:N,landmark:N,confidence:.97}];
const EXTRA1=['г. Астана, пр. Туран 37, кв 14, 3 подъезд','Астана, Кабанбай батыра 11/1, офис 204','город Шымкент/Шымкент қаласы, Аль-Фарабийский район, мкр Нурсат, 12, кв 34','Караганда, ул. Ержанова 25 кв 8 этаж 4','г Атырау ул Абая 14/2 кв 55 подьезд 2','Павлодар Торайгырова 100, рядом с магазин Small','Актау 15 мкр 22 дом 40 кв','город Усть-Каменогорск/Өскемен қаласы, ул. Протозанова 31 кв 9','Костанай, пр. Аль-Фараби 65, kv 102','Тараз Төле би 45а кв 7','г. Семей, Найманбаева 129 кв 3 подъезд 1 этаж 2','Алматы, Алатауский район, мкр Шанырак-2, ул. Жандосова 12, кв 4','Алматы Достык 99 кв 15','Боралдай, Qazpost Солнечный, 14','Кокшетау 5 микрорайон 12дом 34кв','неизвестный текст без адреса','Туркестан, ул. Яссауи 17, кв 3','Кызылорда, Желтоксан 23/1 кв 6',
'Алматы, ул. Розыбакиева 123 кв 45','Алматы, пр. Аль-Фараби 71/2, БЦ Нурлытау, 4 этаж','Алматы, ул. Сейфуллина 520, кв 12','Алматы, мкр Кок-Тобе 5, дом 12, кв 3','Алматы, ул. Жулдыз 14в, квартира 8','Алматы, ул. Мынбаева 150 кв 220 подъезд 3','Алматы, пр. Достык 145, офис 306','Алматы, ул. Тимирязева 42, ТЦ Мегастар, 2 подъезд, 4 этаж','Алматы, ул. Саина 16 к 2 кв 91','алматы абая 8 кв2',
'Астана, пр. Мангилик Ел 28, кв 56','Астана, ул. Кенесары 30/1 кв 88','Астана, мкр Альшер, 12, дом 4, кв 17','Астана, ул. Иманова 13, кв 205, подъезд 2','Астана, пр. Кабанбай батыра 27, БЦ Изумрудный квадрат, 5 этаж','Астана, ул. Сарыарка 44 кв 12','астана достык 12 кв3',
'Шымкент, ул. Кунаева 76 кв 14','Шымкент, мкр Айнабастау 3, дом 21, кв 5','Шымкент, мкр Ордабасы, 40, кв 12','Шымкент, ул. Бекзат Саттарханов 218 кв 3',
'Караганда, пр. Бухар-Жырау 29 кв 12','Караганда, 52 мкр, дом 15, кв 44','Атырау, пр. Айтеке би 112 кв 33','Атырау, ул. Курмангазы 87, кв 9, рядом с аптечка',
'Павлодар, ул. Ломова 18 кв 7','Павлодар, 14 мкр, дом 24, кв 51','Усть-Каменогорск, пр. Сатпаева 15 кв 41','Костанай, ул. Тауелсиздик 50 кв 9','Тараз, ул. Айтеке би 115 кв 2','Кызылорда, ул. Коркыт ата 26 кв 11',
'Актау, 11-й мкр, дом 12, кв 47','Уральск, ул. Достык 210 кв 5','Петропавловск, ул. Конкарбаева 18 кв 3','Семей, ул. Абая 162 кв 19','Актобе, пр. Абилхайыр хана 10, кв 112','Туркестан, ул. Ойдынова 12 кв 6',
'Конаев, 16-й мкр, дом 7, кв 23','Жезказган, 12 мкр, дом 5, кв 14','Экибастуз, пр. Богелия 25 кв 71','Рудный, 6-й мкр, дом 18, кв 9','Темиртау, пр. Металлургов 32 кв 15','Балхаш, ул. Ломоносова 41 кв 3','Талдыкорган, пр. Сатпаева 45 кв 22','Кокшетау, ул. Уалиханова 114/1 кв 18','Жанаозен, 5-й мкр, дом 39, кв 12','Аксу, ул. Жибек Жолы 8 кв 4'];
const EXTRA2=[
'Астана, ул. Калибек Куанышбаев 11а, кв 7','Астана КалибекКуанышбаев 11а','Астана, пр. Тауелсиздик 55, кв 120','Астана, ул. Сыганак 14, БЦ Европа, 3 этаж','Астана, мкр Жас Улан 24','Астана, ул. Орынбор 8, кв 41','Астана, пр. Улы Дала 35/1','Астана, ул. Сауран 14, кв 22','Астана, ул. Айтматова 18/1','Астана, ул. Кошкарбаева 76, кв 310','Астана, пр. Богенбай батыра 62','Астана, ул. Иманжанова 26, кв 12','Астана, мкр Коктем 12, дом 3','Астана, ул. Жубанова 29/1','Астана, бул. Нуржол 14','Астана, ул. Керей Жанибек хандар 38/1','Астана, ул. Мусрепова 13','Астана, ул. Есенберлина 22 кв 4','Астана, ул. Жансугурова 5','Астана, ул. Сарайшык 7, ЖК Номад','Астана, ул. Кенесары 40 кв 15','Астана, пр. Женис 47','Астана, ул. Бараева 20','Астана, ул. Жумабаева 17','Астана, ул. Желтоксан 14','Астана, ул. Космонавтов 28','Астана, ул. Валиханова 24','Астана, ул. Бейбитшилик 44','Астана, ул. Аманжолова 52','Астана, пр. Алаш 29','Астана, ул. Момышулы 11/2','Астана, ул. Петрова 12 кв 3','Астана, район Есиль, ул. Достык 5',
'Караганда, пр. Бухар-Жырау 49/2, кв 30','Караганда, пр. Нуркена Абдирова 21','Караганда, ул. Ержанова 12 кв 5','Караганда, мкр Степной 4, дом 17, кв 8','Караганда, мкр Восток-3, 12, кв 45','Караганда, ул. Гоголя 49','Караганда, ул. Университетская 28','Караганда, пр. Республики 15','Караганда, пр. Шахтеров 5','Караганда, ул. Волочаевская 14 кв 2','Караганда, ул. Муканова 11','Караганда, ул. Терешковой 8а','Караганда, ул. Чкалова 22','Караганда, ул. Крупской 31','Караганда, ул. Пичугина 6','Караганда, ул. Кривогуза 63','Караганда, ул. Мустафина 17','Караганда, мкр Кунгей 4','Караганда, ул. Затаевича 12','Караганда, ул. Сакена Сейфуллина 29','Караганда, Майкудук, мкр 12, дом 8 кв 3','Караганда, Пришахтинск, ул. Горняцкая 4','Караганда, Юго-Восток, ул. Ержанова 30 кв 12',
'Шымкент, пр. Тауке хана 15 кв 7','Актобе, ул. Алия Молдагулова 34','Атырау, ул. Бейбарыса 12 кв 4','Павлодар, ул. Естая 61','Усть-Каменогорск, пр. Ауэзова 25','Костанай, ул. Алтынсарина 19','Тараз, ул. Жамбыла 45','Туркестан, пр. Яссауи 3','Петропавловск, ул. Жамбыла 12','Семей, пр. Шакарима Кудайбердиева 27','Кокшетау, ул. Абая 88','Актау, 28 мкр, дом 41 кв 9','Темиртау, ул. Чкалова 8','Экибастуз, пр. Энергетиков 14','Жезказган, ул. Кеншинбаева 3'];
const EXTRA=EXTRA1.concat(EXTRA2);
const sampleList=()=>DEMO.map(({id,raw_address})=>({id,raw_address})).concat(EXTRA.map((raw_address,i)=>({id:'rec_'+String(500+i).padStart(5,'0'),raw_address})));
function toast(t){let e=document.getElementById('toast');if(!e){e=document.createElement('div');e.id='toast';e.className='toast';e.setAttribute('role','status');document.body.appendChild(e)}e.textContent=t;e.style.display='block';clearTimeout(e._t);e._t=setTimeout(()=>e.style.display='none',2600)}
const store={
 get:()=>safe(()=>JSON.parse(localStorage.getItem('jp_rows')||'[]'),[]),
 set:r=>safe(()=>localStorage.setItem('jp_rows',JSON.stringify(r))),
 clear:()=>safe(()=>localStorage.removeItem('jp_rows')),
 last:()=>safe(()=>JSON.parse(sessionStorage.getItem('jp_last')||'null'),null),
 setLast:r=>safe(()=>sessionStorage.setItem('jp_last',JSON.stringify(r)))
};
// Личный кабинет (демо без бэкенда): пользователи и сессия хранятся в localStorage этого браузера.
const usersGet=()=>safe(()=>JSON.parse(localStorage.getItem('jp_users')||'{}'),{});
const usersSet=u=>safe(()=>localStorage.setItem('jp_users',JSON.stringify(u)));
const accSet=a=>safe(()=>a?localStorage.setItem('jp_acc',JSON.stringify(a)):localStorage.removeItem('jp_acc'));
const addrKey=()=> 'jp_addr_'+((accGet()||{}).phone||'');
const addrsGet=()=>safe(()=>JSON.parse(localStorage.getItem(addrKey())||'[]'),[]);
const addrsSet=l=>safe(()=>localStorage.setItem(addrKey(),JSON.stringify(l)));
const hashPw=async p=>{try{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('jp|'+p));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('')}catch(e){let x=2166136261;for(let i=0;i<p.length;i++){x^=p.charCodeAt(i);x=Math.imul(x,16777619)}return 'f'+(x>>>0).toString(16)}};
// ссылка на поиск в 2ГИС по разобранным полям
const gis2=r=>{const a=r.current_address||r,p=[[a.street_type,a.street_name].filter(Boolean).join(' '),a.house,r.living_area?'мкр '+r.living_area:'',a.city||r.city||r.province].filter(Boolean);return 'https://2gis.kz/search/'+encodeURIComponent(p.join(', '))};
const blank=x=>({id:x.id,raw_address:x.raw_address,...Object.fromEntries(FIELDS.map(([k])=>[k,N])),confidence:.1});
// Use the server parser and optional local AI; retain a visible local fallback for static use.
async function parse(list){
 try{const c=new AbortController(),timer=setTimeout(()=>c.abort(),300000);
  let r;
  try{r=await fetch('/api/parse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({records:list}),signal:c.signal})}
  finally{clearTimeout(timer)}
  const payload=await r.json();
  if(!r.ok)throw new Error(payload.error||`API ${r.status}`);
  if(!Array.isArray(payload.records)||payload.records.length!==list.length)throw new Error('API returned an invalid record list');
  const rows=payload.records.map((record,index)=>{
   const local=window.JPParser?.parse(list[index].raw_address);
   return local?.suggestions?.length?{...record,suggestions:local.suggestions}:record
  });
  return{rows,demo:false,ai:payload.ai||null}
 }
 catch(e){return{demo:true,error:e instanceof Error?e.message:String(e),rows:list.map(x=>{const d=DEMO.find(d=>d.raw_address===x.raw_address);if(d)return{...d,id:x.id||d.id};
  const p=window.JPParser?JPParser.parse(x.raw_address):blank(x);return{...blank(x),...p,id:x.id,raw_address:x.raw_address}})}}}
// темы и акценты: sys = как в системе; применение без перезагрузки
const prefs={
 get theme(){return safe(()=>localStorage.getItem('jp_theme')||'sys','sys')},
 set theme(v){safe(()=>{v==='sys'?localStorage.removeItem('jp_theme'):localStorage.setItem('jp_theme',v)});applyPrefs()},
 get accent(){return safe(()=>localStorage.getItem('jp_accent')||'green','green')},
 set accent(v){safe(()=>{v==='green'?localStorage.removeItem('jp_accent'):localStorage.setItem('jp_accent',v)});applyPrefs()}};
function applyPrefs(){const r=document.documentElement,th=prefs.theme;
 if(th==='dark')r.dataset.theme='dark';else if(th==='light')r.dataset.theme='light';else r.removeAttribute('data-theme');
 if(prefs.accent==='green')r.removeAttribute('data-accent');else r.dataset.accent=prefs.accent;
 dispatchEvent(new CustomEvent('jp-prefs'));}
window.JP={esc,toast,FIELDS,DEMO,sampleList,parse,LOW:.8,store,NAV,cur,prefs,t:T,gis2,acc:{get:accGet,set:accSet,usersGet,usersSet,addrsGet,addrsSet,hashPw}};
if(window.JPI18N)JPI18N.apply(document);
})();
