import {test,expect} from '@playwright/test';
async function setup(page){
 const requests=[];
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.route('https://routing.openstreetmap.de/**',async r=>{
  const url=r.request().url();if(!url.includes('overview=false'))return r.fulfill({status:503,body:'Unavailable'});
  const coords=url.split('/driving/')[1].split('?')[0].split(';').map(p=>p.split(',').map(Number));requests.push(coords);
  const legs=coords.slice(1).map((p,i)=>({distance:(i+1)*12300,duration:(i+1)*9000,steps:[{geometry:{type:'LineString',coordinates:[coords[i],[(coords[i][0]+p[0])/2,(coords[i][1]+p[1])/2+.002],p]}}]}));
  await r.fulfill({json:{code:'Ok',routes:[{legs}]}});
 });
 await page.goto('/');await page.locator('#map-nav').click();return requests;
}
async function addStation(page,i,name){await page.locator('#map-destination').selectOption(String(i));await page.locator('#plan-current').click();await page.locator('#plan-name').fill(name);await page.locator('#plan-confirm').click();}
test('overnights calculate consecutive legs, persist, reorder and delete',async({page})=>{
 const requests=await setup(page);
 await addStation(page,1,'1泊目のホテル');
 await expect(page.locator('#plan-status')).toContainText('計算しました');
 await expect(page.locator('[data-night="0"] .day-route')).toHaveText('日本橋 → 1泊目のホテル');
 await expect(page.locator('[data-night="0"] .day-metrics')).toContainText('12.3 km');
 await expect(page.locator('[data-night="0"] .day-metrics')).toContainText('2時間30分');
 await addStation(page,2,'2泊目のホテル');
 await expect(page.locator('[data-night="1"] .day-route')).toHaveText('1泊目のホテル → 2泊目のホテル');
 await expect(page.locator('[data-night="1"] .day-metrics')).toContainText('24.6 km');
 expect(requests.at(-1)).toEqual([[139.774,35.684],[139.742,35.622],[139.703,35.531]]);
 await expect(page.locator('.overnight-route-line')).toHaveCount(2);
 await expect(page.locator('#plan-total')).toHaveText('合計 36.9 km ／ 徒歩 約7時間30分');
 await page.reload();await page.locator('#map-nav').click();
 await expect(page.locator('#plan-days li')).toHaveCount(2);
 await expect(page.locator('#plan-status')).toContainText('計算しました');
 await page.getByRole('button',{name:'2泊目を前へ',exact:true}).click();
 await expect(page.locator('[data-night="0"] .day-route')).toHaveText('日本橋 → 2泊目のホテル');
 await expect(page.locator('#plan-status')).toContainText('計算しました');
 expect(requests.at(-1)).toEqual([[139.774,35.684],[139.703,35.531],[139.742,35.622]]);
 await page.getByRole('button',{name:'1泊目を削除',exact:true}).click();
 await expect(page.locator('[data-night="0"] .day-route')).toHaveText('日本橋 → 1泊目のホテル');
 await expect(page.locator('#plan-status')).toContainText('計算しました');
 await page.locator('[data-rename="0"]').fill('<img src=x onerror=alert(1)>');await page.locator('[data-rename="0"]').blur();
 await expect(page.locator('.day-route')).toContainText('<img');
 await expect(page.locator('#plan-days img')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.locator('.trip-planner').screenshot({path:'/tmp/tokaido-planner.png'});
});
test('map click and place search create custom overnight pins',async({page})=>{
 await setup(page);
 await page.locator('#plan-pick').click();await page.locator('#road-map').click({position:{x:180,y:160}});
 await expect(page.locator('#plan-candidate')).toBeVisible();
 await page.locator('#plan-name').fill('地図で指定した宿');await page.locator('#plan-confirm').click();
 await expect(page.locator('.overnight-marker')).toHaveCount(1);
 await page.route('https://nominatim.openstreetmap.org/**',r=>r.fulfill({json:[{display_name:'戸塚のホテル',lat:'35.400',lon:'139.534'}]}));
 await page.locator('#plan-query').fill('戸塚のホテル');await page.locator('#plan-search button').click();
 await page.getByRole('button',{name:'戸塚のホテル',exact:true}).click();await page.locator('#plan-confirm').click();
 await expect(page.locator('#plan-days li')).toHaveCount(2);
 await expect(page.locator('#plan-status')).toContainText('計算しました');
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('tokaido-overnight-plan-v1')));
 expect(stored[1]).toEqual({name:'戸塚のホテル',lat:35.4,lng:139.534});
});
test('failed recalculation removes stale metrics but preserves the plan',async({page})=>{
 await setup(page);await addStation(page,1,'品川');await expect(page.locator('#plan-status')).toContainText('計算しました');
 await page.route('https://routing.openstreetmap.de/**',r=>r.fulfill({status:503,body:'Unavailable'}));
 await addStation(page,2,'川崎');
 await expect(page.locator('#plan-status')).toContainText('取得できません');
 await expect(page.locator('.overnight-route-line')).toHaveCount(0);
 await expect(page.locator('.day-metrics strong')).toHaveCount(0);
 await expect(page.locator('#plan-days li')).toHaveCount(2);
 await expect(page.locator('#plan-retry')).toBeVisible();
});
test('25km defaults create pins and a vertical itinerary without replacing saved plans',async({page})=>{
 await page.route('https://tile.openstreetmap.org/**',r=>r.abort());
 await page.route('https://routing.openstreetmap.de/**',async r=>{
  const coords=r.request().url().split('/driving/')[1].split('?')[0].split(';').map(p=>p.split(',').map(Number));
  const legs=coords.slice(1).map((p,i)=>({distance:coords.length===55?1000:i<2?25000:4000,duration:3600,steps:[{geometry:{type:'LineString',coordinates:[coords[i],p]}}]}));
  await r.fulfill({json:{code:'Ok',routes:[{distance:54000,duration:54000,geometry:{type:'LineString',coordinates:coords},legs}]}});
 });
 await page.goto('/');await page.locator('#map-nav').click();
 await expect(page.locator('#plan-days li')).toHaveCount(3);
 await expect(page.locator('.overnight-marker')).toHaveCount(3);
 await expect(page.locator('#plan-timeline')).toContainText('約25km地点');
 await expect(page.locator('#plan-timeline')).toContainText('約50km地点');
 await expect(page.locator('#plan-timeline')).toContainText('京都・三条大橋（到着）');
 await expect(page.locator('#plan-status')).toContainText('計算しました');
 await expect(page.locator('#plan-total')).toContainText('54.0 km');
 await page.locator('[data-rename="0"]').fill('自分で選んだ宿');await page.locator('[data-rename="0"]').blur();
 await page.reload();await page.locator('#map-nav').click();
 await expect(page.locator('[data-rename="0"]')).toHaveValue('自分で選んだ宿');
 await page.locator('#plan-default').click();
 await expect(page.locator('#plan-default-confirm')).toBeVisible();
 await expect(page.locator('[data-rename="0"]')).toHaveValue('自分で選んだ宿');
});
test('overnight timeline and map pins open nearby hotel search for exact coordinates',async({page})=>{
 await setup(page);await addStation(page,1,'泊まりたい場所');
 await page.locator('[data-timeline="0"]').click();
 await expect(page.locator('#plan-hotels')).toBeVisible();
 await expect(page.locator('#plan-hotels-title')).toContainText('泊まりたい場所');
 const url=new URL(await page.locator('#plan-hotels-link').getAttribute('href'));
 expect(decodeURI(url.pathname)).toBe('/maps/search/ホテル/@35.622,139.742,15z');
 await expect(page.locator('#plan-hotels-link')).toHaveAttribute('target','_blank');
 await page.locator('#plan-hotels-close').click();
 await page.locator('#plan-fit').click();
 await page.locator('.overnight-marker').click();
 await expect(page.locator('#plan-hotels')).toBeVisible();
});

test('nearby hotel results use radius search and can replace the overnight destination',async({page})=>{
 await setup(page);await addStation(page,1,'品川');
 await page.route('https://overpass-api.de/**',async r=>{expect(new URLSearchParams(r.request().postData()).get('data')).toContain('around:3000,35.622,139.742');await r.fulfill({json:{elements:[{tags:{name:'近くのホテル'},lat:35.623,lon:139.742},{tags:{name:'遠いホテル'},lat:36,lon:140}]}});});
 await page.locator('[data-timeline="0"]').click();
 await expect(page.locator('#hotel-results article')).toHaveCount(1);
 await expect(page.locator('#hotel-results')).toContainText('近くのホテル');
 await page.getByRole('button',{name:'この宿を宿泊地にする'}).click();
 await expect(page.locator('[data-rename="0"]')).toHaveValue('近くのホテル');
 await expect(page.locator('#plan-status')).toContainText('計算しました');
});
test('hotel name search replaces the clicked night without adding a new night',async({page})=>{
 await setup(page);await addStation(page,1,'一泊目');await addStation(page,2,'二泊目');
 await page.route('https://nominatim.openstreetmap.org/**',r=>r.fulfill({json:[{display_name:'ホテルテスト 横浜市',lat:'35.45',lon:'139.63'}]}));
 await page.locator('[data-timeline="0"]').click();await page.locator('#replace-hotel-query').fill('ホテルテスト 横浜');await page.locator('#replace-hotel-form button').click();
 await page.locator('.replacement-result').click();
 await expect(page.locator('#plan-days li')).toHaveCount(2);
 await expect(page.locator('[data-rename="0"]')).toHaveValue('ホテルテスト 横浜市');
 await expect(page.locator('[data-night="1"] .day-route')).toContainText('ホテルテスト 横浜市 → 二泊目');
 await expect(page.locator('#plan-status')).toContainText('計算しました');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('tokaido-overnight-plan-v1')));expect(saved[0].lat).toBe(35.45);expect(saved[0].lng).toBe(139.63);
});
test('東横INN横浜新子安駅前 resolves to operator-verified coordinates without geocoder',async({page})=>{
 await setup(page);await addStation(page,1,'一泊目');
 await page.route('https://nominatim.openstreetmap.org/**',r=>r.abort());
 await page.locator('[data-timeline="0"]').click();await page.locator('#replace-hotel-query').fill('東横INN横浜新子安駅前');await page.locator('#replace-hotel-form button').click();
 await expect(page.locator('.replacement-result')).toContainText('子安通2-240-32');
 await page.locator('.replacement-result').click();
 await expect(page.locator('#plan-status')).toContainText('計算しました');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('tokaido-overnight-plan-v1')));
 expect(saved[0].lat).toBe(35.486148);expect(saved[0].lng).toBe(139.653484);
 await page.reload();await page.locator('#map-nav').click();await expect(page.locator('[data-rename="0"]')).toHaveValue(/東横INN横浜新子安駅前/);
});
