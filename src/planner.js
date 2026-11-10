import L from 'leaflet';
import {attachToyokoHotels} from './toyoko-layer';
import {findVerifiedHotels} from './hotel-catalog';
import {makeDefaultPlan,redistributeAfter} from './default-plan';
import {coordinates} from './locations';

const KEY='tokaido-overnight-plan-v1';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validPoint=p=>p&&typeof p.name==='string'&&p.name.length<=120&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
const duration=seconds=>{const mins=Math.round(seconds/60);return `${Math.floor(mins/60)}時間${mins%60}分`;};
export function createPlanner({map,container,stops,getCurrent}) {
 let hadSavedPlan=false;let nights=[];try{hadSavedPlan=localStorage.getItem(KEY)!==null;const stored=JSON.parse(localStorage.getItem(KEY));if(Array.isArray(stored))nights=stored.filter(validPoint).slice(0,60);}catch{}
 let markers=[],lines=[],controller,timer,version=0,picking=false,results=null,searchController,lastSearch=0;
 const cache=new Map();let fullRoute=null,undoPlan=null;
 container.innerHTML=`<section class="trip-planner"><div class="planner-heading"><div><div class="eyebrow">MY WALKING PLAN</div><h3>何泊で、どこまで歩こう？</h3></div><span>出発：日本橋</span></div><p class="planner-intro">泊まりたい場所を順に追加すると、前の宿泊地からの距離と時間を計算します。</p><div class="default-plan-controls"><button id="plan-default" class="secondary" disabled>1日約25kmのプランを作る</button><p id="plan-default-status" role="status">全ルートの読み込み後、初回は約25kmごとの目安ピンを自動配置します。</p><button id="plan-default-confirm" class="secondary" hidden>今の計画を25kmプランに置き換える</button></div><section id="plan-hotels" hidden aria-label="宿泊地点の近くのホテル"><h4 id="plan-hotels-title"></h4><p>半径3kmの宿泊施設を表示します。地図への登録状況により掲載がない場合があります。営業状況・空室・料金は各施設でご確認ください。</p><form id="replace-hotel-form"><label for="replace-hotel-query">この宿泊地をホテル名・住所で変更</label><div><input id="replace-hotel-query" maxlength="150" placeholder="ホテル名と市区町村、または住所" required><button type="submit" class="secondary">場所を検索</button></div></form><p id="replace-hotel-status" role="status"></p><div id="replace-hotel-results"></div><p id="hotel-results-status" role="status"></p><div id="hotel-results"></div><a id="plan-hotels-link" class="primary" target="_blank" rel="noopener noreferrer">近くのホテル・旅館を探す ↗</a><button id="plan-hotels-close" class="secondary">閉じる</button></section><div class="auto-adjust-controls"><label><input type="checkbox" id="plan-auto-adjust" checked> 宿泊地を変更したら、その先を約25kmずつに自動調整</label><p id="plan-adjust-status" role="status"></p><button id="plan-undo-adjust" class="secondary" hidden>自動調整前に戻す</button></div><div id="plan-timeline" aria-label="日本橋から京都までの縦の旅程図"></div><div class="planner-add"><button id="plan-pick" class="primary" aria-pressed="false">地図を押して宿泊地を追加</button><button id="plan-current" class="secondary">選択中の宿場に泊まる</button></div><p id="plan-pick-status" role="status"></p><form id="plan-search"><label for="plan-query">ホテル名・住所・場所名で探す</label><div><input id="plan-query" maxlength="150" placeholder="例：戸塚駅、泊まりたいホテルの住所" required><button type="submit" class="secondary">場所を検索</button></div></form><p id="plan-search-status" role="status"></p><div id="plan-search-results"></div><div id="plan-candidate" hidden><label for="plan-name">宿泊地の名前</label><input id="plan-name" maxlength="120"><button id="plan-confirm" class="primary">ここを宿泊地にする</button><button id="plan-cancel" class="secondary">キャンセル</button></div><p id="plan-status" role="status"></p><ol id="plan-days"></ol><div class="planner-total" id="plan-total"></div><div class="planner-actions"><button id="plan-fit" class="secondary">旅程を地図で見る</button><button id="plan-retry" class="secondary" hidden>距離・時間を再計算</button></div><p id="plan-save-status" role="status"></p><p class="planner-footnote">計画はこのブラウザに保存。時間は休憩・観光を含まない徒歩の目安です。計算は指定地点間の現代の徒歩経路で、青い東海道ルートに沿うとは限りません。検索にはOpenStreetMap Nominatim、経路にはFOSSGISを利用し、検索語・経路の座標を各サービスへ送信します。</p></section>`;
 const q=s=>container.querySelector(s);
 let hotelController,hotelVersion=0,editingNight=null,replaceController;
 function hotelUrl(n){return `https://www.google.com/maps/search/ホテル/@${n.lat},${n.lng},15z`;}
 function hotelDistance(a,b){const rad=d=>d*Math.PI/180;const h=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
 async function showHotels(i){
  const n=nights[i];if(!n)return;editingNight=n;replaceController?.abort();q('#replace-hotel-results').replaceChildren();q('#replace-hotel-query').value='';q('#replace-hotel-status').textContent='候補の住所を確認して選ぶと、この日のピンが移動します。';const revision=++hotelVersion;hotelController?.abort();hotelController=new AbortController();const active=hotelController;
  q('#plan-hotels-title').textContent=`${i+1}日目：${n.name}の近くに泊まる`;q('#plan-hotels-link').href=hotelUrl(n);q('#plan-hotels').hidden=false;q('#hotel-results').replaceChildren();q('#hotel-results-status').textContent='半径3kmのホテル・旅館を探しています…';q('#plan-hotels').scrollIntoView({behavior:'smooth',block:'center'});
  const timeout=setTimeout(()=>active.abort(),20000);
  try{
   const query=`[out:json][timeout:15];nwr["tourism"~"^(hotel|motel|guest_house|hostel)$"](around:3000,${n.lat},${n.lng});out center tags;`;
   const response=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:new URLSearchParams({data:query}),signal:active.signal});if(!response.ok)throw Error('search');const data=await response.json();if(revision!==hotelVersion)return;if(!Array.isArray(data.elements))throw Error('format');
   const seen=new Set();const hotels=data.elements.map(e=>({name:e.tags?.['name:ja']||e.tags?.name,lat:e.lat??e.center?.lat,lng:e.lon??e.center?.lon})).filter(h=>validPoint(h)&&h.name.trim()).map(h=>({...h,distance:hotelDistance(n,h)})).filter(h=>{const k=`${h.name}:${h.lat.toFixed(4)}:${h.lng.toFixed(4)}`;if(h.distance>3000||seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>a.distance-b.distance).slice(0,20);
   q('#hotel-results-status').textContent=hotels.length?`周辺の宿泊施設 ${hotels.length}件（直線距離順・OpenStreetMap）`:'地図データに登録された宿泊施設が見つかりません。Google マップでも周辺を確認できます。';
   for(const h of hotels){const card=document.createElement('article');const title=document.createElement('strong');title.textContent=h.name;const dist=document.createElement('p');dist.textContent=`ピンから直線で約${(h.distance/1000).toFixed(1)}km（徒歩距離とは異なります）`;const link=document.createElement('a');const url=new URL('https://www.google.com/maps/search/');url.search=new URLSearchParams({api:'1',query:`${h.lat},${h.lng}`});link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='場所を確認 ↗';const choose=document.createElement('button');choose.className='secondary';choose.textContent='この宿を宿泊地にする';choose.onclick=()=>{if(nights[i]!==n)return;nights[i]={name:h.name,lat:h.lat,lng:h.lng};hotelVersion++;active.abort();changed(i);map.setView([h.lat,h.lng],16);};card.append(title,dist,link,choose);q('#hotel-results').append(card);}
  }catch{if(revision===hotelVersion)q('#hotel-results-status').textContent='周辺の宿泊施設を取得できませんでした。下のGoogle マップで周辺を確認してください。';}finally{clearTimeout(timeout);}
 }
 q('#replace-hotel-form').onsubmit=async e=>{
  e.preventDefault();const query=q('#replace-hotel-query').value.trim(),target=editingNight;if(!query||!target)return;
  if(Date.now()-lastSearch<1100){q('#replace-hotel-status').textContent='少し待ってから検索してください。';return;}
  lastSearch=Date.now();replaceController?.abort();replaceController=new AbortController();const active=replaceController;const timeout=setTimeout(()=>active.abort(),15000);
  q('#replace-hotel-results').replaceChildren();q('#replace-hotel-status').textContent='ホテルの場所を検索しています…';
  try{const url=new URL('https://nominatim.openstreetmap.org/search');url.search=new URLSearchParams({q:query,format:'jsonv2',countrycodes:'jp',limit:'5','accept-language':'ja',viewbox:`${target.lng-.3},${target.lat+.3},${target.lng+.3},${target.lat-.3}`});const verified=findVerifiedHotels(query);const r=verified.length?{ok:true,json:async()=>verified}:await fetch(url,{signal:active.signal});if(!r.ok)throw Error('search');const data=await r.json();if(active!==replaceController||editingNight!==target)return;if(!Array.isArray(data))throw Error('search');const places=data.map(p=>({name:String(p.display_name||'').slice(0,120),lat:Number(p.lat),lng:Number(p.lon)})).filter(validPoint);
   q('#replace-hotel-status').textContent=places.length?'住所・支店名を確認し、変更先を選んでください。':'見つかりませんでした。市区町村や住所を加えて検索してください。';
   places.forEach(point=>{const button=document.createElement('button');button.type='button';button.className='replacement-result';button.textContent=point.name+' ／ この場所に変更';button.onclick=()=>{const index=nights.indexOf(target);if(index<0)return;nights[index]=point;editingNight=null;replaceController?.abort();hotelVersion++;hotelController?.abort();changed(index);map.setView([point.lat,point.lng],16);};q('#replace-hotel-results').append(button);});
  }catch{if(active===replaceController)q('#replace-hotel-status').textContent='場所を検索できませんでした。通信を確認するか、住所で再検索してください。今のピンは変更していません。';}finally{clearTimeout(timeout);}
 };
 q('#plan-hotels-close').onclick=()=>{hotelVersion++;hotelController?.abort();q('#plan-hotels').hidden=true;};
 const start={name:'日本橋',lat:coordinates[0][1],lng:coordinates[0][0]};
 let candidate=null,candidateMarker;
 function clearCandidate(){candidate=null;candidateMarker?.remove();candidateMarker=null;q('#plan-candidate').hidden=true;}
 function choose(point){candidate=point;q('#plan-name').value=point.name;q('#plan-candidate').hidden=false;candidateMarker?.remove();candidateMarker=L.circleMarker([point.lat,point.lng],{radius:10,color:'#a44378'}).addTo(map);map.setView([point.lat,point.lng],16);q('#plan-candidate').scrollIntoView({behavior:'smooth',block:'nearest'});}
 function save(){try{localStorage.setItem(KEY,JSON.stringify(nights));q('#plan-save-status').textContent='このブラウザに保存しました。';}catch{q('#plan-save-status').textContent='ブラウザに保存できませんでした。保存設定をご確認ください。';}}
 function clearLines(){lines.forEach(l=>l.remove());lines=[];}
 function render(){
  q('#plan-hotels').hidden=true;
  markers.forEach(m=>m.remove());
  markers=nights.map((n,i)=>{const m=L.marker([n.lat,n.lng],{draggable:true,icon:L.divIcon({className:'overnight-marker',iconSize:[38,38],iconAnchor:[19,38],html:`<span>${i+1}泊</span>`})}).addTo(map);m.bindTooltip(document.createTextNode(`${i+1}泊目：${n.name}（押してホテルを探す）`));m.on('click',()=>showHotels(i));m.on('dragend',()=>{const p=m.getLatLng();n.lat=p.lat;n.lng=p.lng;changed(i);});return m;});
  q('#plan-days').innerHTML=nights.map((n,i)=>{const r=results?.[i];return `<li data-night="${i}"><div class="day-heading"><strong>${i+1}日目・${i+1}泊目</strong><div><button data-action="up" data-index="${i}" ${i===0?'disabled':''} aria-label="${i+1}泊目を前へ">↑</button><button data-action="down" data-index="${i}" ${i===nights.length-1?'disabled':''} aria-label="${i+1}泊目を後へ">↓</button><button data-action="delete" data-index="${i}" aria-label="${i+1}泊目を削除">削除</button></div></div><label>宿泊地の名前<input data-rename="${i}" maxlength="120" value="${escape(n.name)}"></label><p class="day-route">${escape(i?nights[i-1].name:'日本橋')} → ${escape(n.name)}</p><p class="day-metrics">${r?`<strong>${(r.distance/1000).toFixed(1)} km</strong><span>徒歩 約${duration(r.duration)}</span>`:'距離・時間は計算待ち'}</p><button data-action="hotels" data-index="${i}" class="day-show">近くのホテルを探す</button> · <button data-action="show" data-index="${i}" class="day-show">この日の道を見る</button></li>`;}).join('');
  q('#plan-total').textContent=results?`合計 ${(results.reduce((a,b)=>a+b.distance,0)/1000).toFixed(1)} km ／ 徒歩 約${duration(results.reduce((a,b)=>a+b.duration,0))}`:nights.length?`${nights.length}泊の計画`:'まだ宿泊地がありません。地図から1泊目を選びましょう。';
  q('#plan-fit').disabled=!nights.length;
  let cumulative=0;
  q('#plan-timeline').innerHTML='<h4>日本橋から京都までの旅程</h4><p class="timeline-note">縦の線で順番を表示（間隔は距離の縮尺ではありません）</p><ol class="vertical-journey"><li class="timeline-start"><strong>日本橋</strong><small>出発・0 km</small></li>'+nights.map((n,i)=>{const r=results?.[i];if(r)cumulative+=r.distance;return `<li><button type="button" data-timeline="${i}"><span>${i+1}日目 ${n.name.includes('（到着）')?'到着':`${i+1}泊目`}</span><strong>${escape(n.name)}</strong><small>${r?`この日 ${(r.distance/1000).toFixed(1)} km ／ 約${duration(r.duration)}<br>日本橋から累計 ${(cumulative/1000).toFixed(1)} km`:'距離・時間は計算待ち'}</small></button></li>`}).join('')+(nights.at(-1)?.name.includes('（到着）')?'':'<li class="timeline-end"><strong>京都・三条大橋</strong><small>ゴール</small></li>')+'</ol>';
  container.querySelectorAll('[data-timeline]').forEach(b=>b.onclick=()=>showHotels(+b.dataset.timeline));
  container.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{const i=+b.dataset.index;if(b.dataset.action==='hotels'){showHotels(i);return;}if(b.dataset.action==='show'){if(lines[i])map.fitBounds(lines[i].getBounds(),{padding:[30,30]});else map.setView([nights[i].lat,nights[i].lng],16);return;}if(b.dataset.action==='delete')nights.splice(i,1);else{const j=i+(b.dataset.action==='up'?-1:1);[nights[i],nights[j]]=[nights[j],nights[i]];}changed();});
  container.querySelectorAll('[data-rename]').forEach(input=>input.onchange=()=>{nights[+input.dataset.rename].name=input.value.trim()||`${+input.dataset.rename+1}泊目`;save();render();});
 }
 function show(data){results=data.legs;clearLines();lines=data.legs.map((leg,i)=>L.geoJSON({type:'MultiLineString',coordinates:leg.steps.map(s=>s.geometry.coordinates)},{style:{color:['#9a3d79','#247d65','#ac5c25','#6658a6'][i%4],weight:6,opacity:.9,className:'overnight-route-line'}}).addTo(map));render();q('#plan-status').textContent='各日の徒歩距離・時間を計算しました。';}
 function changed(index){
  if(Number.isInteger(index)&&q('#plan-auto-adjust').checked){
   if(fullRoute){try{const before=nights.map(n=>({...n}));nights=redistributeAfter(fullRoute,nights,index);undoPlan=before;q('#plan-undo-adjust').hidden=false;q('#plan-adjust-status').textContent=`${index+1}泊目までを残し、その先を約25kmごとの候補地点に調整しました。元の全線ルート上での目安で、ルートから宿までの寄り道により距離は変わります。`;}
   catch{q('#plan-adjust-status').textContent='全線ルートから離れているため自動調整できませんでした。変更した宿泊地を保存し、他の地点は残しています。';}}
   else q('#plan-adjust-status').textContent='全線ルートを取得できていないため、その先の自動調整は行っていません。';
  }
  save();schedule();
 }
 q('#plan-undo-adjust').onclick=()=>{if(!undoPlan)return;nights=undoPlan;undoPlan=null;q('#plan-undo-adjust').hidden=true;q('#plan-adjust-status').textContent='その先の地点を自動調整前に戻しました。';save();schedule();};
 function schedule(force=false){
  const revision=++version;clearTimeout(timer);controller?.abort();results=null;clearLines();render();q('#plan-retry').hidden=true;
  if(!nights.length){q('#plan-status').textContent='';return;}
  const points=[start,...nights].map(p=>`${p.lng},${p.lat}`).join(';');
  if(!force&&cache.has(points)){show(cache.get(points));return;}
  q('#plan-status').textContent='徒歩距離・時間を計算しています…';
  timer=setTimeout(async()=>{controller=new AbortController();const active=controller;const timeout=setTimeout(()=>active.abort(),30000);try{
   const response=await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${points}?overview=false&geometries=geojson&steps=true`,{signal:active.signal});
   if(!response.ok)throw Error('service');const body=await response.json(),data=body.routes?.[0];
   if(body.code!=='Ok'||data?.legs?.length!==nights.length||!data.legs.every(l=>Number.isFinite(l.distance)&&l.distance>=0&&Number.isFinite(l.duration)&&l.duration>=0&&Array.isArray(l.steps)&&l.steps.length&&l.steps.every(s=>s.geometry?.type==='LineString'&&Array.isArray(s.geometry.coordinates)&&s.geometry.coordinates.length>=2&&s.geometry.coordinates.every(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])))))throw Error('route');
   if(revision!==version)return;cache.set(points,data);show(data);
  }catch{if(revision!==version)return;q('#plan-status').textContent='距離・時間を取得できませんでした。ピンは保存されています。通信を確認して再計算してください。';q('#plan-retry').hidden=false;}finally{clearTimeout(timeout);}},1100);
 }
 function stopPicking(){picking=false;q('#plan-pick').setAttribute('aria-pressed','false');q('#plan-pick-status').textContent='';map.getContainer().classList.remove('picking-night');}
 q('#plan-pick').onclick=()=>{if(picking){stopPicking();return;}picking=true;q('#plan-pick').setAttribute('aria-pressed','true');q('#plan-pick-status').textContent='地図上の泊まりたい場所を押してください。';map.getContainer().classList.add('picking-night');map.getContainer().scrollIntoView({behavior:'smooth',block:'center'});};
 map.on('click',e=>{if(!picking)return;stopPicking();choose({name:`${nights.length+1}泊目`,lat:e.latlng.lat,lng:e.latlng.lng});});
 q('#plan-current').onclick=()=>{stopPicking();const i=getCurrent();choose({name:stops[i].name,lat:coordinates[i][1],lng:coordinates[i][0]});};
 q('#plan-confirm').onclick=()=>{if(!candidate)return;if(nights.length>=60){q('#plan-status').textContent='1つの計画には60泊まで登録できます。';return;}nights.push({...candidate,name:q('#plan-name').value.trim()||`${nights.length+1}泊目`});clearCandidate();changed();};
 q('#plan-cancel').onclick=clearCandidate;
 q('#plan-fit').onclick=()=>map.fitBounds([start,...nights].map(p=>[p.lat,p.lng]),{padding:[35,35]});
 q('#plan-retry').onclick=()=>schedule(true);
 q('#plan-search').onsubmit=async e=>{
  e.preventDefault();const query=q('#plan-query').value.trim();if(!query)return;
  if(Date.now()-lastSearch<1100){q('#plan-search-status').textContent='少し待ってから検索してください。';return;}
  lastSearch=Date.now();searchController?.abort();searchController=new AbortController();const active=searchController;
  q('#plan-search-results').replaceChildren();q('#plan-search-status').textContent='場所を検索しています…';
  const timeout=setTimeout(()=>active.abort(),15000);
  try{const url=new URL('https://nominatim.openstreetmap.org/search');url.search=new URLSearchParams({q:query,format:'jsonv2',countrycodes:'jp',limit:'5','accept-language':'ja'});
   const verified=findVerifiedHotels(query);const response=verified.length?{ok:true,json:async()=>verified}:await fetch(url,{signal:active.signal});if(!response.ok)throw Error('search');const data=await response.json();if(active!==searchController)return;if(!Array.isArray(data))throw Error('search');
   const places=data.map(p=>({name:String(p.display_name||'').slice(0,120),lat:Number(p.lat),lng:Number(p.lon)})).filter(validPoint);
   q('#plan-search-status').textContent=places.length?'候補を選び、地図の位置を確認してください。':'見つかりませんでした。住所で検索するか、地図を押して指定してください。';
   places.forEach(p=>{const b=document.createElement('button');b.type='button';b.textContent=p.name;b.onclick=()=>choose(p);q('#plan-search-results').append(b);});
  }catch{if(active!==searchController)return;q('#plan-search-status').textContent='検索できませんでした。地図を押すか「選択中の宿場に泊まる」で指定できます。';}finally{clearTimeout(timeout);}
 };
 function applyDefault(){try{nights=makeDefaultPlan(fullRoute);hadSavedPlan=true;changed();q('#plan-default-confirm').hidden=true;q('#plan-default-status').textContent='徒歩ルートに沿って約25kmごとに配置しました。宿泊施設の所在地ではありません。ピンを動かして調整できます。';}catch{q('#plan-default-status').textContent='全ルートから目安地点を作れませんでした。';}}
 q('#plan-default').onclick=()=>{if(nights.length){q('#plan-default-confirm').hidden=false;return;}applyDefault();};
 q('#plan-default-confirm').onclick=applyDefault;
 attachToyokoHotels({map,container:container.querySelector('.trip-planner'),onChoose:choose});
 schedule();
 return {setRoute(route){fullRoute=route;q('#plan-default').disabled=false;if(!hadSavedPlan&&!nights.length)applyDefault();else q('#plan-default-status').textContent='保存済みの計画を表示しています。25kmプランへの置き換えもできます。';}};
}
