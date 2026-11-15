/* Jana Address — автодополнение адресов как в 2ГИС: подсказки улиц и домов Казахстана (Nominatim/OSM). */
(function(g){
'use strict';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const TY={
 ru:{road:'улица',housing:'жилмассив',residential:'жилрайон',town:'город',city:'город',village:'село',quarter:'квартал',house_number:'дом',building:'здание',amenity:'объект',shop:'магазин',supermarket:'ТЦ',school:'школа',hospital:'больница',place:'место'},
 kk:{road:'көше',housing:'тұрғын алап',residential:'тұрғын аудан',town:'қала',city:'қала',village:'ауыл',quarter:'квартал',house_number:'үй',building:'ғимарат',amenity:'нысан',shop:'дүкен',supermarket:'СОК',school:'мектеп',hospital:'аурухана',place:'орын'},
 en:{road:'street',housing:'living area',residential:'residential area',town:'town',city:'city',village:'village',quarter:'quarter',house_number:'house',building:'building',amenity:'place',shop:'shop',supermarket:'mall',school:'school',hospital:'hospital',place:'place'}
};
const TYPES=TY[(window.JPI18N&&JPI18N.lang)||'ru']||TY.ru;
function label(d){
  const p=String(d.display_name||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(/казахстан|kazakhstan/i.test(p[p.length-1]||''))p.pop();
  return p.slice(0,3).join(', ');
}
function attach(inp,opts){
  opts=opts||{};
  let box=null,tm=null,items=[],cur=-1,last='';
  function ensure(){
    if(box)return;
    box=document.createElement('div');box.className='sg';box.setAttribute('role','listbox');
    document.body.appendChild(box);
    box.addEventListener('mousedown',e=>{const b=e.target.closest('[data-i]');if(b){e.preventDefault();pick(items[+b.dataset.i])}});
  }
  function hide(){cur=-1;if(box)box.classList.remove('on')}
  function place(){const r=inp.getBoundingClientRect();box.style.left=r.left+'px';box.style.top=(r.bottom+4)+'px';box.style.width=r.width+'px'}
  function render(){
    if(!items.length){hide();return}
    ensure();place();
    box.innerHTML=items.map((d,i)=>'<button type="button" role="option" data-i="'+i+'" class="'+(i===cur?'cur':'')+'"><span>'+esc(label(d))+'</span><small>'+esc(TYPES[d.type]||d.class||'')+'</small></button>').join('');
    box.classList.add('on');
  }
  function pick(d){if(!d)return;inp.value=label(d);hide();opts.onPick&&opts.onPick(d,inp.value)}
  async function ask(q){
    try{
      const a=window.JPGeocode?await JPGeocode.suggest(q,6):[];
      if(inp.value.trim().toLowerCase()!==q.toLowerCase())return;
      items=Array.isArray(a)?a:[];cur=-1;render();
    }catch(e){hide()}
  }
  inp.addEventListener('input',()=>{
    const q=inp.value.trim();
    if(q.length<3||q===last){hide();return}
    last=q;clearTimeout(tm);tm=setTimeout(()=>ask(q),450);
  });
  inp.addEventListener('keydown',e=>{
    if(!box||!box.classList.contains('on'))return;
    if(e.key==='ArrowDown'){e.preventDefault();cur=Math.min(cur+1,items.length-1);render()}
    else if(e.key==='ArrowUp'){e.preventDefault();cur=Math.max(cur-1,0);render()}
    else if(e.key==='Enter'&&cur>=0){e.preventDefault();pick(items[cur])}
    else if(e.key==='Escape'){hide()}
  });
  inp.addEventListener('blur',()=>setTimeout(hide,150));
}
g.JPSuggest={attach,label};
})(window);
