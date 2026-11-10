import L from 'leaflet';
import {unzipSync} from 'fflate';
export function parseKml(text){
 const xml=new DOMParser().parseFromString(text,'application/xml');if(xml.querySelector('parsererror'))throw Error('KMLを読み取れません。');
 const features=[];
 for(const placemark of xml.getElementsByTagNameNS('*','Placemark')){
  const name=placemark.getElementsByTagNameNS('*','name')[0]?.textContent||'ルート';
  for(const line of placemark.getElementsByTagNameNS('*','LineString')){
   const value=line.getElementsByTagNameNS('*','coordinates')[0]?.textContent||'';
   const coords=value.trim().split(/\s+/).filter(Boolean).map(p=>p.split(',').slice(0,2).map(Number));
   if(coords.length<2||coords.some(p=>p.length!==2||!p.every(Number.isFinite)||p[0]<120||p[0]>155||p[1]<20||p[1]>46))throw Error('日本国内の有効なルート座標ではありません。');
   features.push({type:'Feature',properties:{name,mode:/水路|渡し.*徒歩不可/.test(name)?'water':'land'},geometry:{type:'LineString',coordinates:coords}});
  }
 }
 if(!features.length)throw Error('道筋のLineStringがありません。一里塚などの地点データだけでは経路を表示できません。');
 return {type:'FeatureCollection',features};
}
export function attachHistoricRoute({map,container}){
 const panel=document.createElement('section');panel.className='toyoko-panel historic-route-panel';panel.innerHTML='<h4>旧東海道の参考ルートを読み込む</h4><p>電子足跡の旧東海道参考データを自動表示します。歴史的な水路や通行できない区間を含む場合があります。手元のKML／KMZで置き換えることもできます（選択ファイルは送信しません）。<a href="https://e-footprints.info/tokaido/index.html" target="_blank" rel="noopener noreferrer">出典：電子足跡</a></p><input type="file" accept=".kml,.kmz" aria-label="旧東海道のKMLまたはKMZ"><p role="status"></p><label><input type="checkbox" checked> 読み込んだ参考ルートを表示</label><button type="button" class="secondary" disabled>参考ルート全体を見る</button><p>紫：読み込んだ陸路参考／青緑の点線：水路参考（徒歩不可）／青：現在の徒歩検索。宿泊計画の距離計算は引き続き現代の徒歩経路です。</p>';
 container.prepend(panel);let layer,customLoaded=false;
 const status=panel.querySelector('[role=status]'),toggle=panel.querySelector('[type=checkbox]'),fit=panel.querySelector('button');
 const loadFile=async e=>{const file=e.target.files[0];if(!file)return;status.textContent='読み込んでいます…';try{if(file.size>10*1024*1024)throw Error('ファイルは10MB以内にしてください。');let text;if(file.name.toLowerCase().endsWith('.kmz')){const files=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:entry=>entry.name.toLowerCase().endsWith('.kml')&&entry.originalSize<=20*1024*1024});const names=Object.keys(files);if(!names.length)throw Error('KMZ内に読み込み可能なKMLがありません。');text=new TextDecoder().decode(files[names.find(n=>n.toLowerCase()==='doc.kml')||names[0]]);}else text=await file.text();const geo=parseKml(text);const next=L.geoJSON(geo,{style:feature=>({color:feature.properties.mode==='water'?'#248e95':'#963d98',weight:5,opacity:.9,dashArray:feature.properties.mode==='water'?'8 8':null,className:feature.properties.mode==='water'?'historic-reference-line historic-water-line':'historic-reference-line'}),onEachFeature:(feature,l)=>l.bindTooltip(document.createTextNode(feature.properties.name))});layer?.remove();layer=next;if(toggle.checked)layer.addTo(map);fit.disabled=false;map.fitBounds(layer.getBounds(),{padding:[25,25]});status.textContent=`${file.name}：${geo.features.length}本の参考線を表示しました。道筋・年代・通行可否は資料と現地で確認してください。`;}catch(error){status.textContent=error.message;}};
 panel.querySelector('[type=file]').onchange=e=>{customLoaded=true;loadFile(e);};
 status.textContent='旧東海道の参考データを読み込んでいます…';
 fetch(import.meta.env.BASE_URL+'data/old-tokaido-reference.kml').then(r=>{if(!r.ok)throw Error('load');return r.text();}).then(text=>{if(!customLoaded)return loadFile({target:{files:[new File([text],'旧東海道参考ルート.kml',{type:'application/xml'})]}});}).catch(()=>{if(!customLoaded)status.textContent='参考データを読み込めませんでした。再読み込みするか、手元のKMLを選んでください。';});
 toggle.onchange=()=>{if(layer)toggle.checked?layer.addTo(map):layer.remove();};fit.onclick=()=>layer&&map.fitBounds(layer.getBounds(),{padding:[25,25]});
}
