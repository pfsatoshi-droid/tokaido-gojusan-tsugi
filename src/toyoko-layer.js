import L from 'leaflet';
import hotels from './toyoko-hotels.json';
export function attachToyokoHotels({map,container,onChoose}){
 const panel=document.createElement('section');panel.className='toyoko-panel';
 const label=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=true;
 label.append(toggle,document.createTextNode(` 東横INNを表示（${hotels.length}施設）`));
 const note=document.createElement('p');note.textContent='公式ページで施設名・住所・座標を確認。表示中の全線徒歩ルートから直線5km以内の施設です。料金・空室は公式サイトで確認してください。';
 panel.append(label,note);container.prepend(panel);
 const group=L.layerGroup().addTo(map);
 for(const h of hotels){
  const marker=L.marker([h.lat,h.lon],{title:h.name,icon:L.divIcon({className:'toyoko-marker',iconSize:[25,25],iconAnchor:[12,12],html:'<span>東</span>'})});
  const popup=document.createElement('div');popup.className='toyoko-popup';const title=document.createElement('strong');title.textContent=h.name;const address=document.createElement('p');address.textContent=h.address;
  const source=document.createElement('a');source.href=h.source;source.target='_blank';source.rel='noopener noreferrer';source.textContent='公式サイト・料金を確認 ↗';
  const choose=document.createElement('button');choose.type='button';choose.className='secondary';choose.textContent='このホテルを宿泊候補にする';choose.onclick=()=>{marker.closePopup();onChoose({name:h.name,lat:h.lat,lng:h.lon});};
  popup.append(title,address,source,choose);marker.bindTooltip(h.name).bindPopup(popup);group.addLayer(marker);
 }
 toggle.onchange=()=>toggle.checked?group.addTo(map):group.remove();
}
