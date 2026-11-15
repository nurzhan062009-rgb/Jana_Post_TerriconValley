/* Элизабет — встроенный ассистент Jana Address (голос + текст).
   Работает полностью локально: разбор команд по правилам (без внешних моделей), синтез речи через speechSynthesis.
   Распознавание речи использует Web Speech API браузера. В Chrome/Edge оно обычно идёт через сервис браузера и требует интернет;
   без сети остаётся текстовый ввод + озвучивание ответов. Режим «только текст» отключает микрофон и озвучку. */
(function(){
'use strict';
if(window.__jv)return;window.__jv=1;
const JP=window.JP,G=window.JPGEO;if(!JP)return;
const esc=JP.esc;
const ss=(k,v)=>{try{if(v===undefined)return sessionStorage.getItem(k);v===null?sessionStorage.removeItem(k):sessionStorage.setItem(k,v)}catch(e){return null}};
const ls=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}};
const SR=window.SpeechRecognition||window.webkitSpeechRecognition,TTS='speechSynthesis' in window;
let log=[];try{log=JSON.parse(ss('jv_log')||'[]')}catch(e){}
let voiceOn=ls('jv_voice')!=='0',textMode=ls('jv_mode')==='text',wake=ls('jv_wake')==='1'&&!!SR,rec=null,awaiting=false,speaking=false,voices=[],busyListen=false;
const page=JP.cur;

/* ---------- интерфейс ---------- */
const ico={mic:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
 send:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
 spk:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7"/></svg>',
 ear:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h3l2-6 4 12 3-9 2 3h6"/></svg>',
 kbd:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>',
 x:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>'};
const root=document.createElement('div');
root.innerHTML=`<button id="jv-fab" type="button" aria-label="Открыть ассистента Элизабет (Alt+J)" title="Элизабет (Alt+J)"><span class="jv-orb"></span></button>
<section id="jv" role="dialog" aria-label="Ассистент Элизабет"><header><span class="jv-orb sm"></span><div class="t"><b>Элизабет</b><small id="jv-state">готов</small></div>
<button class="jvb" id="jv-mode" type="button" aria-pressed="${textMode}" title="Только текст: без микрофона и озвучки" aria-label="Режим только текст">${ico.kbd}</button>
<button class="jvb" id="jv-voice" type="button" aria-pressed="${voiceOn&&!textMode}" title="Озвучивать ответы" aria-label="Озвучивать ответы">${ico.spk}</button>
<button class="jvb" id="jv-wake" type="button" aria-pressed="${wake&&!textMode}" title="Режим ожидания: скажите «Элизабет»" aria-label="Режим ожидания слова Элизабет">${ico.ear}</button>
<button class="jvb" id="jv-x" type="button" aria-label="Закрыть">${ico.x}</button></header>
<div id="jv-log" aria-live="polite"></div><div id="jv-chips"></div>
<form id="jv-form" autocomplete="off"><button type="button" id="jv-mic" aria-label="Говорить" title="Говорить">${ico.mic}</button><input id="jv-in" aria-label="Команда для Элизабет" placeholder="Скажите или напишите команду"><button type="submit" aria-label="Отправить">${ico.send}</button></form></section>`;
document.body.appendChild(root);
const $=id=>document.getElementById(id),box=$('jv'),logEl=$('jv-log'),inp=$('jv-in');
const CHIPS=['Что ты умеешь?','Загрузи пример','Покажи на карте Алматы','Статистика','Следующая сомнительная','Разбери Туран 55/6 магазин береке 4подьезд 9этаж'];
$('jv-chips').innerHTML=CHIPS.map(c=>`<button type="button" class="chip">${esc(c)}</button>`).join('');
function setState(t,cls){$('jv-state').textContent=t;box.classList.remove('listening','speaking','thinking');$('jv-fab').classList.remove('listening','speaking','thinking');if(cls){box.classList.add(cls);$('jv-fab').classList.add(cls)}}
function render(){logEl.innerHTML=log.map(m=>`<div class="m ${m.r}">${m.h}</div>`).join('');logEl.scrollTop=logEl.scrollHeight}
function add(r,h){log.push({r,h});if(log.length>40)log=log.slice(-40);ss('jv_log',JSON.stringify(log));render()}
function open(v){box.classList.toggle('on',v);ss('jv_open',v?'1':'0');if(v)setTimeout(()=>inp.focus(),50)}
$('jv-fab').onclick=()=>open(!box.classList.contains('on'));$('jv-x').onclick=()=>open(false);
document.addEventListener('keydown',e=>{if(e.altKey&&(e.key==='j'||e.key==='о'||e.code==='KeyJ')){e.preventDefault();open(!box.classList.contains('on'))}if(e.key==='Escape'&&box.classList.contains('on')&&!document.getElementById('panel')?.classList.contains('open'))open(false)});

/* ---------- речь ---------- */
function loadVoices(){if(TTS)voices=speechSynthesis.getVoices()}
if(TTS){loadVoices();speechSynthesis.onvoiceschanged=loadVoices}
const FEM=/female|жен|milena|katya|katica|alena|alenа|ал[ёе]на|tatyana|tatiana|svetlana|sveta|irina|daria|darya|aria|elia|elya|sara|ludmila|luda|marina|olga|sofia|zoya|elena|elen|Марía|мария|анна|valentina|viktoria|polina/i;
const MALE=/\bmale\b|муж|pavel|yuri|dmitri|dmitry|artem|maksim|maxim|nikolai|ivan|sergey|orus|george|david|james|alexey/i;
function pickVoice(){
  if(!voices.length)return null;
  const ru=voices.filter(v=>/^(ru|kk)/i.test(v.lang));
  return ru.find(v=>FEM.test(v.name)&&!MALE.test(v.name))||ru.find(v=>!MALE.test(v.name))||voices.find(v=>FEM.test(v.name)&&!MALE.test(v.name))||null;
}
const plain=h=>String(h).replace(/<[^>]+>/g,' ').replace(/&amp;/g,'и').replace(/&[a-z]+;/g,' ').replace(/\s+/g,' ').trim();
function speak(t){
  if(textMode||!voiceOn||!TTS||!t)return;
  speechSynthesis.cancel();pauseRec();
  const u=new SpeechSynthesisUtterance(plain(t).slice(0,600));u.lang='ru-RU';
  const v=pickVoice();if(v){u.voice=v;u.lang=v.lang}
  u.rate=.98;u.pitch=1.08;
  u.onstart=()=>{speaking=true;setState('говорю…','speaking')};
  const fin=()=>{speaking=false;setState(wake&&!textMode?'жду слово «Элизабет»':'готов');resumeWake()};
  u.onend=fin;u.onerror=fin;speechSynthesis.speak(u);
}
function stopSpeak(){if(TTS)speechSynthesis.cancel();speaking=false}
function reply(h,spoken){add('j',h);speak(spoken||h)}

/* ---------- распознавание ---------- */
function mk(){const r=new SR();r.lang='ru-RU';r.interimResults=true;r.maxAlternatives=1;return r}
function pauseRec(){if(rec){const r=rec;rec=null;r.onend=null;r.onresult=null;r.onerror=null;try{r.abort()}catch(e){}}}
function recError(e){
  const c=e.error;if(c==='no-speech'||c==='aborted')return;
  if(c==='not-allowed'||c==='service-not-allowed'){wake=false;ls('jv_wake','0');$('jv-wake').setAttribute('aria-pressed','false');reply('Нет доступа к микрофону. Разрешите его в настройках браузера или пишите команды текстом.')}
  else if(c==='network'){wake=false;ls('jv_wake','0');$('jv-wake').setAttribute('aria-pressed','false');reply('Распознавание речи в этом браузере работает через сервис и требует интернет. Сейчас сети нет, поэтому используйте текстовый ввод. Озвучивание ответов работает и без сети.')}
  else reply('Не удалось распознать речь ('+esc(c)+'). Попробуйте ещё раз или напишите команду.');
  setState('готов');
}
function listenOnce(){
  if(textMode){add('j','Включён режим «только текст»: микрофон выключен. Нажмите клавиатуру вверху чата, чтобы вернуть голос.');return}
  if(!SR){reply('В этом браузере нет распознавания речи. Откройте сервис в Chrome или Edge, либо пишите команды текстом.');return}
  stopSpeak();pauseRec();busyListen=true;let fin='';
  rec=mk();rec.continuous=false;
  rec.onstart=()=>setState('слушаю…','listening');
  rec.onresult=e=>{let i='',f='';for(const r of e.results){r.isFinal?f+=r[0].transcript:i+=r[0].transcript}inp.value=i||f;if(f)fin=f};
  rec.onerror=recError;
  rec.onend=()=>{busyListen=false;rec=null;setState(wake&&!textMode?'жду слово «Элизабет»':'готов');if(fin){inp.value='';run(fin)}else resumeWake()};
  try{rec.start()}catch(e){busyListen=false}
}
const WAKE=/(?:^|\s)(?:[э]?лизабет|изабет|лиза|леля|эля|джарвис|джарви[сз]|жарвис|ярвис|чарвис|jarvis)[,.!?\s]*(.*)$/i;
function startWake(){
  if(!SR||!wake||textMode||speaking||busyListen)return;pauseRec();rec=mk();rec.continuous=true;
  rec.onstart=()=>setState('жду слово «Элизабет»');
  rec.onresult=e=>{for(let i=e.resultIndex;i<e.results.length;i++){const r=e.results[i];if(!r.isFinal)continue;const t=r[0].transcript.trim(),m=t.match(WAKE);
    if(m){const cmd=m[1].trim();if(cmd){awaiting=false;run(cmd)}else{awaiting=true;open(true);reply('Слушаю.')}}
    else if(awaiting){awaiting=false;run(t)}}};
  rec.onerror=recError;
  rec.onend=()=>{rec=null;if(wake&&!textMode&&!speaking&&!busyListen)setTimeout(startWake,350)};
  try{rec.start()}catch(e){}
}
function resumeWake(){if(wake&&!textMode&&!speaking&&!busyListen)setTimeout(startWake,300)}
function setWake(v){
  if(v&&textMode){add('j','Сначала выключите режим «только текст» (кнопка с клавиатурой вверху чата).');return}
  wake=v&&!!SR;ls('jv_wake',wake?'1':'0');$('jv-wake').setAttribute('aria-pressed',wake);
  if(v&&!SR){reply('Режим ожидания недоступен: браузер не поддерживает распознавание речи.');return}
  if(wake){reply('Режим ожидания включён. Скажите «Элизабет» и команду.');}else{pauseRec();setState('готов');reply('Режим ожидания выключен.')}}
$('jv-wake').onclick=()=>setWake(!wake);
$('jv-voice').onclick=()=>{if(textMode){add('j','Сначала выключите режим «только текст» (кнопка с клавиатурой вверху чата).');return}voiceOn=!voiceOn;ls('jv_voice',voiceOn?'1':'0');$('jv-voice').setAttribute('aria-pressed',voiceOn);if(!voiceOn)stopSpeak();add('j',voiceOn?'Озвучивание включено.':'Озвучивание выключено.');if(voiceOn)speak('Озвучивание включено.')};
function setMode(txt,silent){textMode=txt;ls('jv_mode',txt?'text':'voice');$('jv-mode').setAttribute('aria-pressed',txt);$('jv-voice').setAttribute('aria-pressed',voiceOn&&!txt);$('jv-wake').setAttribute('aria-pressed',wake&&!txt);
 $('jv-mic').style.display=txt?'none':'';inp.placeholder=txt?'Напишите команду':'Скажите или напишите команду';
 if(txt){stopSpeak();pauseRec();busyListen=false;setState('только текст')}else{setState(wake?'жду слово «Элизабет»':'готов');resumeWake()}
 if(!silent){add('j',txt?'Режим «только текст»: я не слушаю и не озвучиваю — переписываемся письмом.':'Голосовой режим включён: можно говорить и слышать меня.')}
 if(!silent&&voiceOn&&!txt)speak('Голосовой режим включён.')}
$('jv-mode').onclick=()=>setMode(!textMode);
$('jv-mic').onclick=()=>busyListen?(pauseRec(),busyListen=false,setState('готов')):listenOnce();
$('jv-form').onsubmit=e=>{e.preventDefault();const t=inp.value.trim();if(t){inp.value='';run(t)}};
$('jv-chips').onclick=e=>{const b=e.target.closest('.chip');if(b)run(b.textContent)};

/* ---------- данные ---------- */
const T=s=>s.toLowerCase().replace(/ё/g,'е');
const rowsAll=()=>JP.store.get();
const lowRows=()=>rowsAll().filter(r=>(r.confidence||0)<JP.LOW).sort((a,b)=>(a.confidence||0)-(b.confidence||0));
const pct=r=>Math.round((r.confidence||0)*100);
function card(r){
  const f=JP.FIELDS.filter(([k])=>r[k]).map(([k,l])=>`<div><span>${esc(l)}</span><b>${esc(r[k])}</b></div>`).join('')+`<div><span>Уверенность</span><b>${pct(r)}%</b></div>`;
  return `<div class="jd">${f}</div>`;
}
function say(r){
  const p=[];if(r.city)p.push('город '+r.city);else if(r.province)p.push(r.province);
  if(r.district)p.push('район '+r.district);if(r.living_area)p.push(r.living_area);
  if(r.street_name)p.push((r.street_type||'улица')+' '+r.street_name);if(r.house)p.push('дом '+r.house);
  if(r.apartment)p.push('квартира '+r.apartment);if(r.entrance)p.push('подъезд '+r.entrance);if(r.floor)p.push('этаж '+r.floor);if(r.landmark)p.push('ориентир '+r.landmark);
  return (p.length?'Разобрал: '+p.join(', ')+'.':'Не удалось выделить поля.')+' Уверенность '+pct(r)+' процентов.'+((r.confidence||0)<JP.LOW?' Рекомендую проверить вручную.':'');
}
const act=(a,t)=>`<button type="button" class="btn ghost sm" data-a="${esc(a)}">${esc(t)}</button>`;
async function parseAddr(text){
  const x=await JP.parse([{id:'jarvis',raw_address:text}]);const r=x.rows[0];JP.store.setLast(r);
  let h=`<b>${esc(r.raw_address)}</b>${card(r)}`;
  if(r.suggestions&&r.suggestions.length)h+=`<div style="margin-top:6px;font-size:13px">Возможно, вы имели в виду: <b>${esc(r.suggestions[0].text)}</b></div>`;
  h+=`<div class="acts">${(r.city||r.province)?act('map','На карте'):''}${act('copy','Копировать JSON')}${act('add','Добавить в таблицу')}</div>`;
  reply(h,say(r));
}
const PAGES=[[/главн|домой|начал/,'index.html','главную'],[/проверк.*адрес|проверк|одиночн/,'check.html','проверку адреса'],[/пакет|таблиц|файл|загрузк/,'batch.html','пакетную обработку'],[/карт/,'map.html','карту'],[/кабинет|аккаунт|профил|мой адрес|мои адрес|личн/,'account.html','личный кабинет'],[/компани|о нас/,'about.html','страницу о компании']];
function go(file,name){
  if(file===page){reply('Вы уже на этой странице.');return}
  reply('Открываю '+name+'.');setTimeout(()=>{location.href=file},speaking?1500:600);
}
function pending(a){ss('jv_pending',JSON.stringify(a))}
const FAQ=[
[/(как|чем).*(запуст|установ|стартова|поднять)|docker/,'Запуск одной командой: docker compose up. Образ содержит справочники и модели, поэтому сервис работает автономно, без сети.'],
[/скорост|быстр|сколько времени|5 минут|производительн/,'Разбор укладывается в 5 минут на 1000 записей. Загрузка справочников при старте в лимит не входит, но запуск контейнера не должен занимать больше 3 минут.'],
[/офлайн|без сети|без интернет|автоном/,'Во время финального прогона сеть отключена. Все справочники и модели лежат внутри контейнера. Эта карта и мой разбор тоже работают без интернета.'],
[/confidence|уверенност|достовер/,'Confidence — оценка уверенности разбора от нуля до единицы. Записи ниже 80 процентов подсвечены и попадают в фильтр «Требуют проверки». В метрику жюри он не входит, его смотрят на защите.'],
[/дроб|литер|номер дом|house|формат дом/,'Номер дома возвращается с дробью и литерой: «55/6», «12а». «1/2» и «1» считаются разными значениями, дробь терять нельзя.'],
[/тип улиц|street.?type|проспект.*улиц/,'Тип улицы возвращается отдельным полем: улица, проспект, микрорайон, переулок, квартал. Название улицы остаётся как в строке, без исправления падежей и опечаток.'],
[/null|не определ|пустой|не удалось разобрат/,'Поле, которое не удалось определить, возвращается как null. Пропускать записи нельзя: на каждую входную запись есть ответ, при неудаче поля null, а confidence низкий.'],
[/справочник|район|жилой массив|жилого массива|osm|като|egov/,'Район и жилой массив берутся из строки, если они там указаны, а недостающие восстанавливаются по справочнику: OpenStreetMap, КАТО или data.egov.kz. Справочник команда готовит сама и кладёт в образ.'],
[/метрик|оценк|вес|балл|жюри/,'Метрики на скрытом наборе: точность адреса 60 процентов, точность деталей 25, справочные поля 15. Итог команды: метрики 45 процентов, инженерия 30, интерфейс 15, презентация 10.'],
[/формат|api|метод|эндпоинт|endpoint|rest/,'Метод пакетной обработки: POST /api/v1/parse/batch. Принимает список объектов с id и raw_address, возвращает разбор на каждую запись: все поля, confidence и подсказки.'],
[/ручн|правк|исправ|редактир/,'Откройте пакетную обработку, выберите запись в таблице и поправьте поля в боковой панели. Кнопка «Сохранить и дальше» переходит к следующей сомнительной записи.'],
[/как.*карт|карт.*работа|что.*карт/,'Карта на Leaflet с реальными улицами (тайлы Esri, запасной вариант — OpenStreetMap). Точки Jana Post и адреса клиентов; без интернета карта показывает заглушку, а разбор и поиск по сохранённым адресам работают.'],
[/зачем|для чего|польз/,'Адрес хранится в базе одной строкой. Из-за этого не работает аналитика по городам, не считается зона доставки, а курьер уточняет квартиру и подъезд по телефону. Разбор на поля решает все три задачи.']
];
const JOKES=['Я бы пошутил про адрес «где-то рядом с магазином», но курьеру и так тяжело.','Лучший адрес в мире — тот, где подъезд указан цифрой, а не словами «ну там, за углом».'];
let jk=0;

/* ---------- обработка команд ---------- */
async function run(raw){
  let text=raw.trim();if(!text)return;
  open(true);add('u',esc(text));setState('думаю…','thinking');
  const m=text.match(/^(?:эй\s+)?(?:[э]?лизабет|изабет|лиза|леля|джарвис|jarvis)[,.!:\s]+(.*)$/i);if(m)text=m[1].trim()||'привет';
  const t=T(text).replace(/[«»"“”!?]/g,'').trim();
  try{await handle(text,t)}catch(e){reply('Что-то пошло не так: '+esc(e.message||e)+'. Попробуйте ещё раз.')}
  setState(wake&&!textMode?'жду слово «Элизабет»':'готов');
}
async function handle(text,t){
  let m;
  if((m=text.match(/^(?:разбери|разобрать|распарси|парси|проверь\s+адрес|адрес)[\s:,\-–]+(.{4,})$/i))){return parseAddr(m[1])}
  if(/^(привет|здравствуй|добрый|хай|hello|салем|сәлем)/.test(t))return reply('Здравствуйте. Я Элизабет, ассистент Jana Address. Могу разобрать адрес, показать записи на карте и открыть нужную страницу. Скажите «что ты умеешь», если нужен список команд.');
  if(/(кто ты|как тебя зовут|представься)/.test(t))return reply('Я Элизабет, внутренний ассистент Jana Address. Работаю в браузере без внешних сервисов: понимаю команды по правилам, разбираю адреса и управляю картой и таблицей. Могу говорить или отвечать только текстом.');
  if(/(что (ты )?умеешь|помощь|помоги|команды|справка|help)/.test(t))return reply('Вот что я умею:<ul style="margin:6px 0 0 18px;padding:0"><li>«Разбери <i>адрес</i>» — разобрать строку на поля</li><li>«Покажи на карте Алматы» — найти город на карте</li><li>«Открой карту / проверку / пакет / личный кабинет»</li><li>«Загрузи пример», «Статистика», «Сколько требуют проверки»</li><li>«Следующая сомнительная» — зачитать запись для проверки</li><li>«Скачай JSON», «Очисти данные»</li><li>Вопросы про формат, скорость, метрики, запуск</li></ul>','Я могу разобрать адрес, показать город на карте, открыть любую страницу, загрузить пример, прочитать статистику и сомнительные записи, скачать результат и ответить на вопросы про формат и запуск.');
  if(/^(спасибо|благодар|рахмет)/.test(t))return reply('Всегда к вашим услугам.');
  if(/(как дела|как ты)/.test(t))return reply('Все системы в норме. Справочники на месте, сеть не требуется.');
  if(/(который час|сколько времени сейчас|время сейчас|сколько сейчас времени)/.test(t||''))return reply('Сейчас '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})+'.');
  if(/(какое сегодня число|какая сегодня дата|какой сегодня день|дата сегодня)/.test(t))return reply('Сегодня '+new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+'.');
  if(/шутк|анекдот/.test(t))return reply(JOKES[jk++%JOKES.length]);
  if(/^(замолчи|тихо|стоп|хватит|помолчи)/.test(t)){stopSpeak();return add('j','Молчу.')}
  if(/(выключи|отключи|перестань).*(ожидани|слушай)/.test(t))return setWake(false);
  if(/(только текст|текстовый режим|режим текста|пиши молча)/.test(t)){setMode(true);return}
  if(/(голосовой режим|режим голоса|включи слух|ты можешь говорить)/.test(t)){setMode(false);return}
  if(/(выключи|отключи).*(голос|озвучк)/.test(t)){if(textMode)return setMode(false);voiceOn=false;ls('jv_voice','0');$('jv-voice').setAttribute('aria-pressed','false');stopSpeak();return add('j','Озвучивание выключено.')}
  if(/(включи).*(голос|озвучк)/.test(t)){if(textMode)setMode(false);voiceOn=true;ls('jv_voice','1');$('jv-voice').setAttribute('aria-pressed','true');return reply('Озвучивание включено.')}
  if(/(включи|активируй).*(ожидани|слушай)/.test(t))return setWake(true);
  if(/(закрой|скрой|сверни).*(чат|окно|ассистент|джарвис|лизабет|изабет)/.test(t)){reply('Сворачиваюсь.');return setTimeout(()=>open(false),700)}
  // карта: масштаб и сброс
  if(/(приблизь|увеличь|zoom in)/.test(t)&&window.JPMap){JPMap.zoomIn();return reply('Приблизил.')}
  if(/(отдали|уменьши масштаб|zoom out)/.test(t)&&window.JPMap){JPMap.zoomOut();return reply('Отдалил.')}
  if(/(весь казахстан|сбрось карту|вся страна|общий вид)/.test(t)){if(window.JPMap){JPMap.reset();return reply('Показываю весь Казахстан.')}pending({a:'reset'});return go('map.html','карту')}
  // на карте
  if(/(на карте|найди город|где находится|покажи город)/.test(t)||/^карта\s+\S/.test(t)){
    const c=G.findCityInText(text);const last=JP.store.last();
    const target=c||(last&&(G.findCity(last.city)||G.findCity(last.province)))||null;
    if(!target)return reply('Какой город показать? Например: «покажи на карте Астану».');
    const nm=target.n;if(/ближайш|филиал/.test(t)&&last&&window.JPMap&&JPMap.showAddr(last))return reply('Показываю адрес и ближайший филиал.');
    if(window.JPMap){JPMap.flyToCity(nm);return reply('Показываю '+nm+' на карте.')}
    pending({a:'focus',v:nm});return go('map.html?q='+encodeURIComponent(nm),'карту: '+nm);
  }
  // статистика
  if(/(статистик|сводк|итог|сколько.*(записей|адрес|всего)|сколько.*(провер|сомнит)|средняя уверенность)/.test(t)){
    const rows=rowsAll();if(!rows.length)return reply('Данных пока нет. Загрузите файл или скажите «загрузи пример».');
    const lo=lowRows().length,av=Math.round(rows.reduce((a,r)=>a+(r.confidence||0),0)/rows.length*100),noc=rows.filter(r=>!r.city&&!r.province).length;
    return reply(`<b>Записей:</b> ${rows.length}<br><b>Требуют проверки:</b> ${lo}<br><b>Без города:</b> ${noc}<br><b>Средняя уверенность:</b> ${av}%`,`Всего записей ${rows.length}. Требуют проверки ${lo}. Без определённого города ${noc}. Средняя уверенность ${av} процентов.`);
  }
  // следующая сомнительная
  if(/(следующ|прочитай|зачитай|дальше|сомнительн)/.test(t)&&/(сомнит|провер|запис)/.test(t)){
    const l=lowRows();if(!l.length)return reply(rowsAll().length?'Сомнительных записей нет. Всё разобрано уверенно.':'Данных пока нет. Скажите «загрузи пример».');
    let i=+(ss('jv_ptr')||0);if(i>=l.length)i=0;ss('jv_ptr',String(i+1));const r=l[i];JP.store.setLast(r);
    return reply(`<b>${i+1} из ${l.length}</b>: ${esc(r.raw_address)}${card(r)}<div class="acts">${act('edit:'+r.id,'Править')}${(r.city||r.province)?act('map','На карте'):''}</div>`,`Запись ${i+1} из ${l.length}. ${r.raw_address}. ${say(r)}`);
  }
  // пример
  if(/(загрузи|покажи|открой|дай).*(пример|демо|тестов)/.test(t)){
    const x=await JP.parse(JP.sampleList());JP.store.set(x.rows.map(r=>({...r,_e:false})));ss('jv_ptr','0');
    if(window.JPMap)JPMap.refresh();
    if(page==='batch.html'){pending({a:'reload'});setTimeout(()=>location.reload(),900)}
    return reply(`Загрузил ${x.rows.length} записей, из них ${x.rows.filter(r=>(r.confidence||0)<JP.LOW).length} требуют проверки.<div class="acts">${act('go:batch.html','Открыть таблицу')}${act('go:map.html','Открыть карту')}</div>`,`Загрузил ${x.rows.length} записей. Откройте таблицу или карту.`);
  }
  if(/(скачай|выгрузи|экспорт|сохрани).*(json|результат|файл|таблиц)?/.test(t)&&/(json|результат|файл|экспорт|скачай|выгрузи)/.test(t)){
    if(!rowsAll().length)return reply('Скачивать нечего: данных пока нет. Скажите «загрузи пример».');
    const b=document.getElementById('exp');if(b){b.click();return reply('Скачиваю результат в JSON.')}
    pending({a:'download'});return go('batch.html','пакетную обработку, чтобы скачать файл');
  }
  if(/(очисти|удали|сотри|сбрось).*(данн|запис|таблиц|все)/.test(t)){JP.store.clear();ss('jv_ptr','0');if(window.JPMap)JPMap.refresh();if(page==='batch.html'){setTimeout(()=>location.reload(),700)}return reply('Данные очищены.')}
  // навигация
  if(/(открой|перейди|зайди|покажи страниц|перейти|открыть|go to|на страницу|вернись)/.test(t)||/^(главная|карта|о компании|проверка|пакетная обработка|личный кабинет|кабинет)$/.test(t)){
    for(const[re,file,name]of PAGES)if(re.test(t))return go(file,name);
  }
  // FAQ
  let best=null,bs=0;for(const[re,a]of FAQ){if(re.test(t)){const s=(t.match(re)||[''])[0].length;if(s>bs){best=a;bs=s}}}
  if(best)return reply(best);
  // похоже на адрес
  if(/\d/.test(t)&&(/(кв|дом|ул|пр|мкр|микрорайон|квартал|подъезд|подьезд|этаж|\d\/\d)/.test(t)||text.includes(',')||/\p{L}\d|\d\p{L}/u.test(text)))return parseAddr(text);
  if(G.findCityInText(text)&&text.split(/\s+/).length<=3){const c=G.findCityInText(text);if(window.JPMap){JPMap.flyToCity(c.n);return reply('Показываю '+c.n+' на карте.')}}
  return reply('Не понял команду. Попробуйте: «Разбери адрес…», «Покажи на карте Астану», «Статистика» или «Что ты умеешь».');
}

/* ---------- кнопки внутри сообщений ---------- */
logEl.onclick=async e=>{
  const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a,last=JP.store.last();
  if(a==='map'&&last){const n=last.city||last.province;if(window.JPMap&&JPMap.showAddr(last)){}else if(!window.JPMap)location.href='map.html?q='+encodeURIComponent(last.raw_address||n)}
  else if(a==='copy'&&last){const{suggestions,...c}=last;try{await navigator.clipboard.writeText(JSON.stringify(c,null,2));JP.toast('JSON скопирован')}catch(err){JP.toast('Не удалось скопировать')}}
  else if(a==='add'&&last){const rows=rowsAll();const id='rec_u'+Date.now().toString(36);rows.push({...last,id,_e:false});JP.store.set(rows);if(window.JPMap)JPMap.refresh();JP.toast('Запись добавлена в таблицу');if(page==='batch.html')setTimeout(()=>location.reload(),600)}
  else if(a.startsWith('go:'))location.href=a.slice(3);
  else if(a.startsWith('edit:'))location.href='batch.html?edit='+encodeURIComponent(a.slice(5));
};

/* ---------- старт ---------- */
if(!log.length){log.push({r:'j',h:'Здравствуйте. Я Элизабет. Могу разобрать адрес, показать город на карте, открыть страницу или прочитать сомнительные записи. Нажмите микрофон, напишите команду или включите режим ожидания и скажите «Элизабет». Кнопка с клавиатурой вверху чата переключает меня в режим «только текст».'});}
render();
if(ss('jv_open')==='1')open(true);
if(!SR){$('jv-mic').title='Распознавание речи не поддерживается в этом браузере';$('jv-wake').style.opacity='.5'}
if(textMode){$('jv-mic').style.display='none';inp.placeholder='Напишите команду';setState('только текст')}
// отложенные действия после перехода между страницами
try{
  const p=JSON.parse(ss('jv_pending')||'null');
  if(p){ss('jv_pending',null);setTimeout(()=>{
    if(p.a==='download'){const b=document.getElementById('exp');b&&b.click()}
    else if(p.a==='focus'&&window.JPMap)JPMap.flyToCity(p.v);
    else if(p.a==='reset'&&window.JPMap)JPMap.reset();
  },500)}
}catch(e){}
if(wake)setTimeout(startWake,600);
window.JPJarvis={run,open,speak};
})();
