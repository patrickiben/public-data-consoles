// Maintained river adapters + real shared evaluator. No providers or browser needed.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const NOW=Date.parse('2026-10-23T16:00:00Z'),HOUR=3600000,iso=t=>new Date(t).toISOString(),root=new URL('../',import.meta.url);
const scripts=await Promise.all(['core','domain-helpers','observed-series','priorities/hazards'].map(name=>readFile(new URL('response-plans/'+name+'.js',root),'utf8')));
let count=0;
function check(name,run){run();count++;console.log('PASS hazard evidence dates: '+name);}
for(const slug of ['river-flood-network','river-flood-propagation']){
 const c=vm.createContext({URL,Date:class extends Date{static now(){return NOW;}}});c.window=c;for(const js of scripts)vm.runInContext(js,c);
 let raw,read;c.ConsoleResponse.connect=reader=>{read=reader;};
 const nodes=[{lid:'REAL1',name:'First real gauge',unit:'ft',stage:2,cat:'action',obs:'action',sev:1,observedAt:iso(NOW-HOUR),forecastAt:iso(NOW-HOUR),crest:3,crestTime:iso(NOW+HOUR),actionThreshold:1,fcst:'minor',dn:'REAL2',headwater:true,trib:true,metadataAvailable:true,_crest:{stage:3,unit:'ft',time:iso(NOW+HOUR),issuedAt:iso(NOW-HOUR)}},{lid:'REAL2',name:'Second real gauge',unit:'ft',stage:0,cat:'no_flooding',obs:'no_flooding',sev:0,observedAt:iso(NOW),forecastAt:iso(NOW),crest:0,crestTime:iso(NOW+HOUR),actionThreshold:1,fcst:'no_flooding',up:'REAL1',metadataAvailable:true,_crest:{stage:0,unit:'ft',time:iso(NOW+HOUR),issuedAt:iso(NOW)}}];
 const state={context:'Complete public fixture corridor',checkedAt:iso(NOW),nodes,focusLid:'REAL1',topologyComplete:true,directedReachability:[]};c.RiverNetworkResponse=state;c.RiverPropagationResponse=state;
 vm.runInContext(await readFile(new URL('response-plans/adapters/'+slug+'.js',root),'utf8'),c);
 const evaluate=()=>{raw=read();return c.ConsoleResponse.evaluate(raw);},aggregate=slug.endsWith('propagation')?'ten-screen':'ten-branches';
 check(slug+' complete linked current reports retain supported #4/#10 and source time',()=>{const p=evaluate(),f=p.evidence.find(f=>f.id===aggregate);assert.equal(f.measuredAt,iso(NOW-HOUR));assert.equal(f.checkedAt,iso(NOW));assert.equal(f.quality,'current');for(const metricId of [4,10])assert.notEqual(p.diagnostics.find(d=>d.metricId===metricId).status,'unknown');});
 check(slug+' current issue and future validity retain forecast impacts and priorities',()=>{const p=evaluate(),forecasts=p.impacts.items.filter(i=>i.kind==='forecast');assert.equal(forecasts.length,2);assert.ok(forecasts.every(i=>i.status==='available'));assert.equal(forecasts.find(i=>i.id.includes('REAL2')).value,0);const a=p.actions.filter(a=>a.featured&&a.selected&&a.signal==='forecast');assert.ok(a.length>=2);assert.ok(a.every(a=>Date.parse(a.validUntil)>NOW));});
 for(const mode of ['missing','stale','future'])check(slug+' '+mode+' observation cannot become aggregate healthy context',()=>{const prior=nodes[0].observedAt;nodes[0].observedAt=mode==='missing'?null:iso(mode==='stale'?NOW-7*HOUR:NOW+HOUR/2);try{const p=evaluate();for(const metricId of [4,10])assert.equal(p.diagnostics.find(d=>d.metricId===metricId).status,'unknown');assert.equal(p.evidence.find(f=>f.id===aggregate).quality,'missing');assert.ok(p.impacts.items.filter(i=>i.kind==='forecast').every(i=>i.status==='available'),'independent usable forecasts remain available');}finally{nodes[0].observedAt=prior;}});
 check(slug+' missing or future forecast issue withholds forecast independently',()=>{for(const stamp of [null,iso(NOW+HOUR/2)]){const prior=nodes[0].forecastAt;nodes[0].forecastAt=stamp;if(nodes[0]._crest)nodes[0]._crest.issuedAt=stamp;try{const p=evaluate();assert.equal(p.impacts.items.find(i=>i.kind==='forecast'&&i.id.includes('REAL1')).status,'unknown');assert.equal(p.impacts.items.find(i=>i.kind==='forecast'&&i.id.includes('REAL2')).status,'available');}finally{nodes[0].forecastAt=prior;if(nodes[0]._crest)nodes[0]._crest.issuedAt=prior;}}});
}
console.log('PASS '+count+' maintained river/core evidence-date regression groups');
