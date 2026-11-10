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

// Match the anchor onto the route and split the remaining mapped road geometry.
function redistributeUnlocked(route,nights,index,spacing=25000){
 const anchor=nights[index];if(!anchor)throw Error('Missing anchor');
 const points=route.legs.flatMap(l=>l.steps.flatMap(s=>s.geometry.coordinates));
 let best=Infinity,match;
 for(let i=0;i<points.length-1;i++){
  const a=points[i],b=points[i+1],scale=Math.cos(radians(anchor.lat));
  const dx=(b[0]-a[0])*scale,dy=b[1]-a[1],x=(anchor.lng-a[0])*scale,y=anchor.lat-a[1];
  const t=Math.max(0,Math.min(1,(x*dx+y*dy)/(dx*dx+dy*dy||1)));
  const projected=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];const d=meters([anchor.lng,anchor.lat],projected);
  if(d<best){best=d;match={i,projected};}
 }
 if(!match||best>5000)throw Error('Anchor too far from route');
 const suffix=[match.projected,...points.slice(match.i+1)];const distance=suffix.slice(1).reduce((sum,p,i)=>sum+meters(suffix[i],p),0);
 if(distance<100)return nights.slice(0,index+1);
 const tail=makeDefaultPlan({legs:[{distance,steps:[{distance,geometry:{type:'LineString',coordinates:suffix}}]}]},spacing);
 return [...nights.slice(0,index+1),...tail];
}

export function redistributeAfter(route,nights,index,spacing=25000){
 const locks=nights.map((n,i)=>n.locked===true&&i>index?i:-1).filter(i=>i>=0);
 if(!locks.length)return redistributeUnlocked(route,nights,index,spacing);
 const pts=route.legs.flatMap(l=>l.steps.flatMap(s=>s.geometry.coordinates));
 const cumulative=[0];for(let i=1;i<pts.length;i++)cumulative.push(cumulative[i-1]+meters(pts[i-1],pts[i]));
 function position(n){let best=Infinity,result=0;for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],c=Math.cos(radians(n.lat)),dx=(b[0]-a[0])*c,dy=b[1]-a[1],x=(n.lng-a[0])*c,y=n.lat-a[1];const t=Math.max(0,Math.min(1,(x*dx+y*dy)/(dx*dx+dy*dy||1)));const point=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];const d=meters([n.lng,n.lat],point);if(d<best){best=d;result=cumulative[i]+t*(cumulative[i+1]-cumulative[i]);}}if(best>5000)throw Error('Locked anchor off route');return result;}
 function at(distance){let j=1;while(j<cumulative.length-1&&cumulative[j]<distance)j++;const a=pts[j-1],b=pts[j],t=(distance-cumulative[j-1])/(cumulative[j]-cumulative[j-1]||1);return {name:'ロック地点の間の宿泊候補',lng:a[0]+t*(b[0]-a[0]),lat:a[1]+t*(b[1]-a[1])};}
 let output=nights.slice(0,index+1),previous=index,from=position(nights[index]);
 for(const lock of locks){const to=position(nights[lock]);if(to<from)throw Error('Locked anchors out of route order');for(let i=previous+1;i<lock;i++)output.push(at(from+(to-from)*(i-previous)/(lock-previous)));output.push({...nights[lock]});previous=lock;from=to;}
 return redistributeUnlocked(route,output,output.length-1,spacing);
}

export function smoothUnlocked(route,nights,start){
 if(!nights.length)return [];
 const end=route.legs.at(-1).steps.at(-1).geometry.coordinates.at(-1);
 const last=nights.at(-1),endsAtGoal=meters([last.lng,last.lat],end)<100;
 const points=nights.map(n=>({...n}));
 if(endsAtGoal)points[points.length-1].locked=true;
 else points.push({name:'京都・三条大橋（到着）',lng:end[0],lat:end[1],locked:true});
 const result=redistributeAfter(route,[start,...points],0).slice(1);
 if(!endsAtGoal)result.pop();else result[result.length-1]={...last};
 return result;
}
