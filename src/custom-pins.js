// User-created map pins are browser-local and never sent to a server.
const STORAGE_KEY = 'tokaido-custom-pins-v1';
const valid = p => p && typeof p.id === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat)<=90 && Math.abs(p.lng)<=180 && typeof p.title === 'string';
export function attachCustomPins({L,map,root}) {
 let pins=[];
 try { const data=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'); if(Array.isArray(data))pins=data.filter(valid).slice(0,300); } catch {}
 const markers=new Map();
 let adding=false, draft=null;
 const button=root.querySelector('#map-pin-add');
 const list=root.querySelector('#custom-pin-list');
 const status=root.querySelector('#pin-status');
 const save=()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(pins));status.textContent='ピンをこのブラウザに保存しました。';return true}catch{status.textContent='保存に失敗しました。ブラウザの保存設定を確認してください。';return false}};
 const stopAdding=()=>{adding=false;button.textContent='＋ ピンを追加';button.setAttribute('aria-pressed','false');map.getContainer().classList.remove('is-adding-pin')};
 const focus=id=>{const p=pins.find(p=>p.id===id);if(p){map.setView([p.lat,p.lng],16);markers.get(id)?.openPopup()}};
 function editor(p,isNew=false) {
  const container=document.createElement('div');container.className='custom-pin-editor';
  const heading=document.createElement('strong');heading.textContent=isNew?'新しいピン':'ピンを編集';container.append(heading);
  const title=document.createElement('input');title.type='text';title.maxLength=80;title.placeholder='場所の名前';title.setAttribute('aria-label','場所の名前');title.value=p.title||'';container.append(title);
  const note=document.createElement('textarea');note.maxLength=1000;note.rows=3;note.placeholder='メモ（任意）';note.setAttribute('aria-label','ピンのメモ');note.value=p.note||'';container.append(note);
  const actions=document.createElement('div');actions.className='custom-pin-actions';
  const submit=document.createElement('button');submit.textContent='保存';submit.className='primary';
  submit.onclick=()=>{const name=title.value.trim();if(!name){title.focus();return;}const next={id:p.id,lat:p.lat,lng:p.lng,title:name,note:note.value};if(isNew)pins.push(next);else pins=pins.map(v=>v.id===p.id?next:v);if(save()){draft?.remove();draft=null;render();markers.get(p.id)?.openPopup();}};
  const cancel=document.createElement('button');cancel.textContent='キャンセル';cancel.className='secondary';cancel.onclick=()=>{draft?.remove();draft=null;if(!isNew)markers.get(p.id)?.closePopup();};actions.append(submit,cancel);
  if(!isNew){const del=document.createElement('button');del.textContent='削除';del.className='secondary';del.onclick=()=>{if(!window.confirm('このピンを削除しますか？'))return;pins=pins.filter(v=>v.id!==p.id);if(save())render();};actions.append(del)}
  container.append(actions);return container;
 }
 function popup(p){const wrap=document.createElement('div');wrap.className='custom-pin-popup';const name=document.createElement('strong');name.textContent=p.title;wrap.append(name);if(p.note){const detail=document.createElement('p');detail.textContent=p.note;wrap.append(detail)}const edit=document.createElement('button');edit.textContent='編集・削除';edit.className='secondary';edit.onclick=()=>{markers.get(p.id)?.bindPopup(editor(p)).openPopup()};wrap.append(edit);return wrap;}
 function render(){
  for(const m of markers.values())m.remove();markers.clear();list.replaceChildren();
  pins.forEach(p=>{
   const m=L.marker([p.lat,p.lng],{title:p.title,icon:L.divIcon({className:'custom-location-icon',html:'<span aria-hidden="true">📌</span>',iconSize:[30,36],iconAnchor:[15,33]})}).addTo(map);
   m.bindPopup(popup(p));markers.set(p.id,m);
   const item=document.createElement('button');item.className='custom-pin-item';item.textContent='📌 '+p.title;item.onclick=()=>focus(p.id);list.append(item);
  });
  if(!pins.length){const empty=document.createElement('span');empty.textContent='まだピンがありません';list.append(empty)}
  root.querySelector('#pin-count').textContent=String(pins.length);
 }
 button.onclick=()=>{if(adding){stopAdding();return;}adding=true;button.textContent='キャンセル';button.setAttribute('aria-pressed','true');status.textContent='地図上の保存したい場所をタップしてください。';map.getContainer().classList.add('is-adding-pin')};
 map.on('click',e=>{if(!adding)return;stopAdding();draft?.remove();const p={id:'pin-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),lat:e.latlng.lat,lng:e.latlng.lng,title:'',note:''};draft=L.marker(e.latlng,{icon:L.divIcon({className:'custom-location-icon',html:'<span aria-hidden="true">📌</span>',iconSize:[30,36],iconAnchor:[15,33]})}).addTo(map);draft.bindPopup(editor(p,true),{minWidth:210,closeOnClick:false}).openPopup()});
 render();return {refresh:render};
}
