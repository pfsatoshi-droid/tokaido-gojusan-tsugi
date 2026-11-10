const radians=d=>d*Math.PI/180;
function meters(a,b){const dlat=radians(b[1]-a[1]),dlon=radians(b[0]-a[0]);const h=Math.sin(dlat/2)**2+Math.cos(radians(a[1]))*Math.cos(radians(b[1]))*Math.sin(dlon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
// Split the returned walking geometry, not straight lines between stations.
export function makeDefaultPlan(route,spacing=25000){
 const edges=[];let total=0;
 for(const leg of route.legs)for(const step of leg.steps){const pts=step.geometry.coordinates;let lengths=pts.slice(1).map((p,i)=>meters(pts[i],p));const sum=lengths.reduce((a,b)=>a+b,0);if(!sum)continue;const distance=Number.isFinite(step.distance)?step.distance:leg.distance*sum/leg.steps.reduce((a,s)=>a+s.geometry.coordinates.slice(1).reduce((n,p,i)=>n+meters(s.geometry.coordinates[i],p),0),0);for(let i=0;i<lengths.length;i++){const d=distance*lengths[i]/sum;if(d>0){edges.push({a:pts[i],b:pts[i+1],from:total,to:total+d});total+=d;}}}
 if(!edges.length||!Number.isFinite(total))throw Error('No route geometry');
 const nights=[];for(let target=spacing;target<total-100;target+=spacing){const edge=edges.find(e=>e.to>=target);const t=(target-edge.from)/(edge.to-edge.from);nights.push({name:`約${Math.round(target/1000)}km地点（宿を探す目安）`,lng:edge.a[0]+(edge.b[0]-edge.a[0])*t,lat:edge.a[1]+(edge.b[1]-edge.a[1])*t});}
 const end=edges.at(-1).b;nights.push({name:'京都・三条大橋（到着）',lng:end[0],lat:end[1]});return nights;
}
