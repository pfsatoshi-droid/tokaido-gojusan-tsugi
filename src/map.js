// Approximate historical town centers, [longitude, latitude].
// The route connects these points schematically; it is not a walking route.
const coordinates = [
 [139.774,35.684],[139.742,35.622],[139.703,35.531],[139.631,35.477],
 [139.596,35.447],[139.534,35.400],[139.486,35.343],[139.349,35.328],
 [139.313,35.307],[139.157,35.250],[139.026,35.192],[138.919,35.121],
 [138.858,35.095],[138.794,35.124],[138.686,35.162],[138.608,35.120],
 [138.565,35.107],[138.523,35.049],[138.485,35.020],[138.383,34.975],
 [138.346,34.940],[138.283,34.919],[138.257,34.867],[138.176,34.833],
 [138.126,34.821],[138.076,34.808],[138.015,34.772],[137.925,34.749],
 [137.851,34.727],[137.730,34.704],[137.609,34.685],[137.559,34.694],
 [137.514,34.684],[137.449,34.724],[137.391,34.769],[137.316,34.838],
 [137.305,34.859],[137.217,34.911],[137.166,34.955],[137.039,35.008],
 [136.970,35.079],[136.906,35.120],[136.695,35.064],[136.625,34.965],
 [136.562,34.920],[136.540,34.894],[136.450,34.855],[136.394,34.852],
 [136.335,34.890],[136.281,34.934],[136.172,34.968],[136.055,35.011],
 [135.961,35.016],[135.868,35.005],[135.772,35.009]
];
const project=([lon,lat])=>[70+(lon-135.65)*235,60+(35.8-lat)*350];
const path=points=>points.map((p,i)=>`${i?'L':'M'}${project(p).join(',')}`).join(' ');
export function createJourneyMap({stops,onSelect}) {
 const root=document.querySelector('#journey-map');
 const route=path(coordinates);
 const coast=[[135.65,34.35],[136.1,34.35],[136.52,34.5],[136.7,34.7],[136.64,34.95],[136.85,35.06],[136.89,34.85],[137.08,34.72],[137.23,34.63],[137.52,34.65],[137.78,34.65],[138.20,34.59],[138.25,34.78],[138.42,34.91],[138.58,35.02],[138.75,35.08],[138.88,35.01],[138.76,34.75],[138.85,34.58],[139.08,34.68],[139.17,34.9],[139.13,35.15],[139.45,35.25],[139.60,35.18],[139.68,35.28],[139.63,35.46],[139.78,35.57],[139.91,35.62]];
 const coastline=path(coast);
 root.innerHTML=`<div class="map-toolbar"><label for="map-destination">宿場へ移動 <select id="map-destination"><option value="">宿場を選ぶ</option>${stops.map(s=>`<option value="${s.i}">${s.i===0?'出発':s.i===54?'到着':s.i+'宿'} · ${s.name}</option>`).join('')}</select></label><div class="map-controls"><button type="button" id="map-out" aria-label="地図を縮小">−</button><span id="map-scale" aria-live="polite">100%</span><button type="button" id="map-in" aria-label="地図を拡大">＋</button><button type="button" id="map-reset">標準</button></div></div><div class="map-viewport" tabindex="0" aria-label="東海道の絵地図。横にスクロールできます"><div class="map-plane"><svg viewBox="0 0 1120 550" aria-hidden="true"><rect width="1120" height="550" fill="#e4ece5"/><path d="M0 0 ${coastline.replace(/^M/,'L')} L1120 0Z" fill="#eef0dc"/><path d="${coastline}" fill="none" stroke="#bdcdb5" stroke-width="2"/><path d="M150 90q20-40 33-30q-3 28-22 54q-20 12-11-24" fill="#c6dce0"/><text x="190" y="75" class="map-geography">琵琶湖</text><path d="M690 150l30-45 30 45Z" fill="#b5c4a0"/><path d="M710 120l10-15 10 15" fill="#fffdf1"/><text x="720" y="175" text-anchor="middle" class="map-geography">富士山</text><text x="720" y="460" class="map-sea">駿 河 湾</text><text x="420" y="430" class="map-sea">遠 州 灘</text><text x="285" y="330" class="map-sea">伊 勢 湾</text><path d="${route}" fill="none" stroke="#fffdf0" stroke-width="9" stroke-linejoin="round"/><path d="${route}" fill="none" stroke="#bf825b" stroke-width="3" stroke-linejoin="round" stroke-dasharray="5 4"/></svg><div class="map-pins">${stops.map(s=>{const [x,y]=project(coordinates[s.i]);return `<button class="map-pin" style="left:${x/1120*100}%;top:${y/550*100}%" data-map-stop="${s.i}" aria-label="${s.name}の紹介を開く" title="${s.name}"><span>${s.i===0?'発':s.i===54?'着':s.i}</span>${[0,1,10,16,19,29,34,38,41,42,49,52,54].includes(s.i)?`<b class="pin-label label-${s.i}">${s.name}</b>`:''}</button>`}).join('')}</div></div></div><div class="map-footer"><span><i class="legend-dot"></i>未訪問 <i class="legend-dot done"></i>訪問済み <i class="legend-route"></i>旅の道筋</span><span id="map-match" role="status"></span></div><p class="map-caption">宿場を押すと紹介が開きます。拡大してスクロールすると、近くの宿場も選べます。<br>位置・海岸線は概略です。点線は宿場を結んだもので、実際の旧街道や徒歩ルートではありません。</p>`;
 const viewport=root.querySelector('.map-viewport'),plane=root.querySelector('.map-plane');
 let zoom=1;
 function resize(value){const oldWidth=plane.offsetWidth,oldHeight=plane.offsetHeight;const cx=(viewport.scrollLeft+viewport.clientWidth/2)/oldWidth,cy=(viewport.scrollTop+viewport.clientHeight/2)/oldHeight;zoom=Math.max(1,Math.min(3,value));plane.style.width=`${1120*zoom}px`;root.querySelector('#map-scale').textContent=`${Math.round(zoom*100)}%`;root.querySelector('#map-out').disabled=zoom===1;root.querySelector('#map-in').disabled=zoom===3;viewport.scrollLeft=cx*plane.offsetWidth-viewport.clientWidth/2;viewport.scrollTop=cy*plane.offsetHeight-viewport.clientHeight/2;}
 root.querySelector('#map-in').onclick=()=>resize(zoom+.5);
 root.querySelector('#map-out').onclick=()=>resize(zoom-.5);
 root.querySelector('#map-out').disabled=true;
 root.querySelector('#map-reset').onclick=()=>{resize(1);viewport.scrollTo({left:0,top:0})};
 root.querySelectorAll('[data-map-stop]').forEach(pin=>pin.onclick=()=>onSelect(Number(pin.dataset.mapStop)));
 root.querySelector('#map-destination').onchange=e=>{if(e.target.value==='')return;const i=Number(e.target.value);onSelect(i);e.target.value=''};
 return {update(visible,visited){const ids=new Set(visible.map(s=>s.i));root.querySelectorAll('[data-map-stop]').forEach(pin=>{const i=Number(pin.dataset.mapStop);pin.hidden=!ids.has(i);pin.classList.toggle('is-visited',visited.has(i));pin.setAttribute('aria-label',`${stops[i].name}${visited.has(i)?'（訪問済み）':''}の紹介を開く`)});root.querySelectorAll('option[value]').forEach(o=>{if(o.value!=='')o.hidden=!ids.has(Number(o.value))});root.querySelector('#map-match').textContent=visible.length?`${visible.length} 地点を表示`:'該当する宿場がありません';}};
}
