import L from 'leaflet';
import {attachCustomPins} from './custom-pins.js';
import 'leaflet/dist/leaflet.css';
import {coordinates,walkingUrl} from './locations';

export function createJourneyMap({stops,onSelect}) {
 const root=document.querySelector('#journey-map');
 root.innerHTML=`<div class="map-toolbar"><label for="map-destination">宿場へ移動 <select id="map-destination"><option value="">宿場を選ぶ</option>${stops.map(s=>`<option value="${s.i}">${s.i===0?'出発':s.i===54?'到着':s.i+'宿'} · ${s.name}</option>`).join('')}</select></label><div class="map-controls"><button id="map-locate">現在地</button><button id="map-out" aria-label="地図を縮小">−</button><span id="map-scale" aria-live="polite"></span><button id="map-in" aria-label="地図を拡大">＋</button><button id="map-reset">全宿場</button></div></div><section class="walking-route-panel" aria-label="表示中の徒歩ルート"><div><strong id="route-title"></strong><p id="route-status" role="status"></p></div><div class="route-actions"><button id="route-prev" aria-label="前の区間">←</button><button id="route-fit">道順全体</button><button id="route-next" aria-label="次の区間">→</button><button id="route-retry" hidden>再読み込み</button></div></section><section class="custom-pin-toolbar" aria-label="自分のピン"><div><strong>📌 自分のピン（<span id="pin-count">0</span>）</strong><p>ピンを追加して地図上の場所をタップ。名前とメモを保存できます。</p></div><button id="map-pin-add" aria-pressed="false">＋ ピンを追加</button><div id="custom-pin-list" class="custom-pin-list"></div><p id="pin-status" role="status"></p></section><div id="road-map" aria-label="道路や交差点を確認できる東海道の地図"></div><p id="map-network" role="status" hidden>地図を読み込めません。通信を確認するか、下の「Google マップで徒歩経路」を開いてください。</p><div class="map-selected"><div><strong id="map-selected-name">日本橋周辺</strong><small>宿場付近の目安地点</small></div><button id="map-details" class="secondary">宿場の紹介</button><a id="map-walk" class="primary" target="_blank" rel="noopener noreferrer">Google マップで徒歩経路 ↗</a></div><div class="map-footer"><span><i class="legend-dot"></i>宿場 <i class="legend-dot done"></i>訪問済み</span><span id="map-match" role="status"></span></div><p id="location-status" class="map-caption" role="status"></p><p class="map-caption">拡大すると道路・交差点が見えます。宿場を選ぶと周辺を拡大します。地図の読み込みには通信が必要です。<br>ピンは宿場付近の概略位置です。青い線は全宿場をつなぐ現代の徒歩経路です。橙色は選択中の区間で、宿場を切り替えても青い線は残ります。旧東海道の正確な道筋ではありません。通行規制や現地の案内を確認してください。経路提供：FOSSGIS / OpenStreetMap。</p>`;
 let map,tiles,markers=[],current=0,positionMarker,positionCircle,lastVisible=stops,lastVisited=new Set(),lastIds='',locating=false;
 const latlng=i=>[coordinates[i][1],coordinates[i][0]];
 function select(i,focus=true){current=i;root.querySelector('#map-selected-name').textContent=stops[i].name+'周辺';root.querySelector('#map-walk').href=walkingUrl(i);root.querySelector('#map-destination').value=String(i);if(map&&focus)map.setView(latlng(i),16);if(map)loadRoute();}
 let routeLine,highlightLine,routeData,routeLoading=false,routeAttempted=false;
 function updateRouteSelection(){
  highlightLine?.remove();highlightLine=null;
  root.querySelector('#route-title').textContent='日本橋 → 三条大橋・全54区間';
  root.querySelector('#route-prev').disabled=current===0;
  root.querySelector('#route-next').disabled=current===54;
  root.querySelector('#route-fit').disabled=!routeLine;
  if(!routeData)return;
  const total=`全ルート 約${(routeData.distance/1000).toFixed(1)} km`;
  const leg=routeData.legs[current];
  if(!leg){root.querySelector('#route-status').textContent=total+' ・ 終点の三条大橋です';return;}
  root.querySelector('#route-status').textContent=`${total} ／ 選択中：${stops[current].name} → ${stops[current+1].name} 約${(leg.distance/1000).toFixed(1)} km・約${Math.round(leg.duration/60)}分`;
  const segments=leg.steps.map(step=>step.geometry.coordinates);
  highlightLine=L.geoJSON({type:'MultiLineString',coordinates:segments},{style:{color:'#d57932',weight:7,opacity:1,className:'selected-route-line'}}).addTo(map);
 }
 function validLine(line){return line?.type==='LineString'&&Array.isArray(line.coordinates)&&line.coordinates.length>=2&&line.coordinates.every(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1]));}
 async function loadRoute(force=false){
  if(!map||root.hidden)return;
  updateRouteSelection();
  if(routeLoading||routeData||(routeAttempted&&!force))return;
  routeAttempted=true;routeLoading=true;
  root.querySelector('#route-retry').hidden=true;
  root.querySelector('#route-status').textContent='全宿場をつなぐ徒歩ルートを読み込んでいます…';
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),45000);
  try{
   // Request all 55 waypoints once; the routed-foot backend provides walking routes.
   const points=coordinates.map(p=>p.join(',')).join(';');
   const response=await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${points}?overview=full&geometries=geojson&steps=true`,{signal:controller.signal});
   if(!response.ok)throw Error('Route unavailable');
   const result=await response.json(),data=result.routes?.[0];
   if(result.code!=='Ok'||!validLine(data?.geometry)||!Number.isFinite(data.distance)||!Number.isFinite(data.duration)||data.legs?.length!==54||!data.legs.every(leg=>Number.isFinite(leg.distance)&&Number.isFinite(leg.duration)&&Array.isArray(leg.steps)&&leg.steps.length&&leg.steps.every(step=>validLine(step.geometry))))throw Error('Incomplete route');
   routeData=data;
   routeLine=L.geoJSON(data.geometry,{style:{color:'#2569bd',weight:5,opacity:.85,className:'walking-route-line'}}).addTo(map);
   updateRouteSelection();
  }catch{
   root.querySelector('#route-status').textContent='全ルートを取得できませんでした。通信を確認して再読み込みしてください。';
   root.querySelector('#route-retry').hidden=false;
  }finally{clearTimeout(timeout);routeLoading=false;}
 }
 root.querySelector('#route-prev').onclick=()=>select(Math.max(0,current-1));
 root.querySelector('#route-next').onclick=()=>select(Math.min(54,current+1));
 root.querySelector('#route-fit').onclick=()=>{if(routeLine)map.fitBounds(routeLine.getBounds(),{padding:[35,35],maxZoom:16});};
 root.querySelector('#route-retry').onclick=()=>loadRoute(true);
 select(0,false);
 function status(){root.querySelector('#map-scale').textContent=`拡大 ${map.getZoom()}`;root.querySelector('#map-in').disabled=map.getZoom()>=19;root.querySelector('#map-out').disabled=map.getZoom()<=5;}
 function fit(){if(!map||!lastVisible.length)return;map.fitBounds(lastVisible.map(s=>latlng(s.i)),{padding:[30,30],maxZoom:16,animate:false});}
 function paint(){if(!map)return;markers.forEach(m=>m.remove());markers=lastVisible.map(s=>{
  const marker=L.marker(latlng(s.i),{title:s.name,alt:s.name,icon:L.divIcon({className:'road-marker',iconSize:[30,30],iconAnchor:[15,15],html:`<button class="road-pin ${lastVisited.has(s.i)?'is-visited':''}" data-map-stop="${s.i}" aria-label="${s.name}周辺の道路を見る">${s.i===0?'発':s.i===54?'着':s.i}</button>`})}).addTo(map);
  marker.bindTooltip(s.name,{direction:'top'});
  marker.on('click',()=>select(s.i));
  return marker;
 });}
 function ensureMap(){if(root.hidden)return;if(!map){map=L.map('road-map',{zoomControl:false,minZoom:5,maxZoom:19,scrollWheelZoom:false}).setView(latlng(0),15);tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'}).addTo(map);tiles.on('tileerror',()=>root.querySelector('#map-network').hidden=false);tiles.on('load',()=>{const images=[...root.querySelectorAll('.leaflet-tile')];if(images.length&&images.every(img=>img.complete&&img.naturalWidth>0))root.querySelector('#map-network').hidden=true;});L.control.scale({imperial:false}).addTo(map);attachCustomPins({L,map,root});map.on('zoomend',status);paint();status();map.fitBounds(coordinates.map((_,i)=>latlng(i)),{padding:[30,30],animate:false});}map.invalidateSize();loadRoute();}
 root.querySelector('#map-destination').onchange=e=>{if(e.target.value!=='')select(Number(e.target.value));};
 root.querySelector('#map-details').onclick=()=>onSelect(current);
 root.querySelector('#map-in').onclick=()=>map?.zoomIn();
 root.querySelector('#map-out').onclick=()=>map?.zoomOut();
 root.querySelector('#map-reset').onclick=fit;
 root.querySelector('#map-locate').onclick=()=>{
  const label=root.querySelector('#location-status');
  if(!navigator.geolocation){label.textContent='このブラウザでは現在地を取得できません。宿場を選んで地図を開いてください。';return;}
  if(locating)return;locating=true;root.querySelector('#map-locate').disabled=true;label.textContent='現在地を確認しています…';
  navigator.geolocation.getCurrentPosition(p=>{locating=false;root.querySelector('#map-locate').disabled=false;const point=[p.coords.latitude,p.coords.longitude];positionMarker?.remove();positionCircle?.remove();positionCircle=L.circle(point,{radius:p.coords.accuracy,color:'#3676aa',weight:1,fillOpacity:.1}).addTo(map);positionMarker=L.circleMarker(point,{radius:7,color:'#fff',weight:2,fillColor:'#3676aa',fillOpacity:1}).addTo(map).bindTooltip('現在地');map.setView(point,16);label.textContent=`現在地を表示しました（精度の目安：約${Math.round(p.coords.accuracy)}m）。位置情報は保存しません。`;},e=>{locating=false;root.querySelector('#map-locate').disabled=false;label.textContent=e.code===1?'位置情報が許可されていません。宿場選択から地図を開くこともできます。':'現在地を取得できませんでした。屋外で再試行するか、宿場を選んでください。';},{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
 };
 return {update(visible,visited){const ids=visible.map(s=>s.i).join(',');const changed=lastIds!==ids;lastIds=ids;lastVisible=visible;lastVisited=visited;root.querySelector('.map-selected').hidden=!visible.length;if(visible.length&&!visible.some(s=>s.i===current))select(visible[0].i,false);root.querySelector('#map-match').textContent=visible.length?`${visible.length} 地点を表示`:'該当する宿場がありません';root.querySelectorAll('option[value]').forEach(o=>{if(o.value!=='')o.hidden=!visible.some(s=>s.i===Number(o.value));});requestAnimationFrame(()=>{ensureMap();if(map){paint();if(changed)fit();}});}};
}
