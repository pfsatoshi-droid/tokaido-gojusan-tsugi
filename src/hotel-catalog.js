// Facility name, address and coordinates verified from the operator's structured data.
import catalog from './toyoko-hotels.json';
const normalize=s=>s.normalize('NFKC').toLowerCase().replace(/東横inn/g,'東横イン').replace(/[\s・－-]/g,'');
export function findVerifiedHotels(query){const text=normalize(query);if(text.length<4)return [];return catalog.filter(h=>normalize(h.name).includes(text)||normalize(h.address).includes(text)).map(h=>({display_name:`${h.name}｜${h.address}（公式所在地確認済み）`,lat:String(h.lat),lon:String(h.lon)}));}
