// Facility name, address and coordinates verified from the operator's structured data.
const catalog=[{name:'東横INN横浜新子安駅前',address:'神奈川県横浜市神奈川区子安通2-240-32',lat:35.486148,lon:139.653484,source:'https://www.toyoko-inn.com/search/detail/00159/',verified:'2026-11-10'}];
const normalize=s=>s.normalize('NFKC').toLowerCase().replace(/東横inn/g,'東横イン').replace(/[\s・－-]/g,'');
export function findVerifiedHotels(query){const text=normalize(query);if(text.length<4)return [];return catalog.filter(h=>normalize(h.name).includes(text)||normalize(h.address).includes(text)).map(h=>({display_name:`${h.name}｜${h.address}（公式所在地確認済み）`,lat:String(h.lat),lon:String(h.lon)}));}
