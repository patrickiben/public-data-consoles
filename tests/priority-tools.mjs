import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const core=await read('response-plans/core.js'),priority=await read('response-plans/priorities/tools.js'),helpers=await read('response-plans/domain-helpers.js'),series=await read('response-plans/observed-series.js');
const slugs=['us-grid-strain','resilience-telemetry','usaid-consequence','prescription-savings','medical-cost-abroad','medical-debt-assistant','human-trafficking','va-strain','food-desert-oases'];
const adapters=Object.fromEntries(await Promise.all(slugs.map(async s=>[s,await read('response-plans/adapters/'+s+'.js')])));
const source=await read('consoles/usaid-consequence/index.html'),agency=JSON.parse(source.match(/const SNAP = (\{[^\n]+\});/)[1]);
let now=Math.max(Date.parse('2026-10-24T00:00:00Z'),Date.parse(agency.publicFinance.capturedAt)+3600000);
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const hour=new Date(now-2*3600000).toISOString(),checked=new Date(now-3600000).toISOString(),old=new Date(now-4*3600000).toISOString();
function load(){
 const context=vm.createContext({Date:Clock,URL,console});vm.runInContext('window=globalThis;',context);vm.runInContext(core,context);vm.runInContext(helpers,context);vm.runInContext(series,context);
 const handlers=new Map(),register=context.ConsoleResponse.registerPrioritizer;
 context.ConsoleResponse.registerPrioritizer=(slug,fn)=>{handlers.set(slug,fn);return register(slug,fn);};
 return {context,handlers,install(){vm.runInContext(priority,context,{filename:'priorities/tools.js'});},evaluate(input){return context.ConsoleResponse.evaluate(input);}};
}
const fact=(id,value,options={})=>({id,label:id,value,unit:'MW',measuredAt:hour,checkedAt:checked,quality:'current',basis:'measured',source:'https://www.eia.gov/electricity/gridmonitor/',...options});
const base=(slug,evidence=[])=>({slug,context:'Public selection',evidence,diagnostics:Array.from({length:10},(_,i)=>({id:'d'+(i+1),metricId:i+1,status:'unknown',scope:'planning',evidenceIds:[],requiredInputs:['Applicable public observations'],analyticalMitigation:'Verify coverage and definitions.'})),actions:[],impacts:{items:[],records:[]}});
function ba(code,gap,ti=-5,at=hour){return [fact('demand-'+code,100,{measuredAt:at}),fact('forecast-'+code,100-gap,{measuredAt:at,basis:'modeled'}),fact('gap-'+code,gap,{measuredAt:at,basis:'interpretive'}),fact('interchange-'+code,ti,{measuredAt:at})];}
const featured=(p,track='public')=>p.actions.filter(a=>a.featured&&a.selected&&a.track===track);
const plain=x=>JSON.parse(JSON.stringify(x));
function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}
function raw(f,slug,input){return plain(f.handlers.get(slug)(input));}
function foodBridge(){
 return {version:1,slug:'food-desert-oases',selectionId:1,state:'settled',context:'Census tract 12103024500 (2025 SNAP-authorized Retailer Access Map)',
  tract:{status:'ok',geoid:'12103024500',urban:1,vintage:'2025 SNAP-authorized Retailer Access Map, released July 2026',flags:{lowIncome:1,la1and10:1,lila1and10:1,urban:1},checkedAt:checked},
  tract2019:{status:'ok',geoid:'12103024500',flags:{lila1and10:0},checkedAt:checked},
  sources:{snap:{status:'ok',count:3,nearestMi:0.8,radiusMi:5,dataDate:'October 21, 2026',partial:false,checkedAt:checked},markets:{status:'failed',count:null,reason:'HTTP 503',partial:false,checkedAt:checked},foodbanks:{status:'empty',count:0,radiusMi:31,nearestMi:null,dataDate:'2026-10-23T08:00:00Z',partial:false,checkedAt:checked}}};
}
function publicPayload(f,slug){
 const context=f.context;
 const globals={
  'us-grid-strain':{STATE:{capturedAt:checked,demandThrough:hour.slice(0,13),ba:{A:{code:'A',name:'Public A',D:100,DF:90,TI:-5,period:hour.slice(0,13)}}},AGG:new Set(),GridResponseSelection:'A'},
  'resilience-telemetry':{NETSTATE:null,ASSET_IDS:[],STORE:{},L_LAG:4,SCEN:'none',SURR:false,DATA_VER:1,MODE:'live',SEL:'SPY',W_IND:252,MACRO:{UNRATE:{name:'Unemployment rate',unit:'pct',d:[Math.floor((now-86400000-Date.UTC(2000,0,1))/86400000)],v:[0]}},FRED_META:{capturedAt:checked,retrieved_on:checked.slice(0,10)}},
  'usaid-consequence':{DATA:structuredClone(agency),budgetPublicRecords:structuredClone(agency.publicFinance.records),budgetPublicStatus:structuredClone(agency.publicFinance.status),budgetDownloadedAt:null,budgetCheckedAt:null,feedStatus:{USAspending:'unavailable'}},
  'prescription-savings':{NADAC_DS:'public-dataset'},
  'medical-cost-abroad':{},'medical-debt-assistant':{},'human-trafficking':{},
  'food-desert-oases':{FoodAccessResponse:foodBridge()},
  'va-strain':{STATUS_OVERRIDE:{},FACILITY:'Synthetic training facility',SCEN:'baseline',deepUnits:()=>({u:[{cap:10,census:10,rnAct:1,rnTgt:2},{cap:10,census:9,rnAct:2,rnTgt:2}]})}
 }[slug];
 Object.assign(context,globals);context.ConsoleResponse.connect=reader=>{context.publicReader=reader;};vm.runInContext(adapters[slug],context,{filename:slug+'.js'});return plain(context.publicReader());
}
test('registers exactly the eight owned consoles without DOM, provider or native-state access',()=>{
 const f=load();for(const key of ['document','fetch','localStorage','location','STATE','NETSTATE','MACRO','DATA','STATUS_OVERRIDE','A','PROC','DEST','NADAC_RESULTS'])Object.defineProperty(f.context,key,{configurable:true,get(){throw Error('Unexpected ambient access: '+key);}});
 f.install();assert.deepEqual([...f.handlers.keys()].sort(),[...slugs].sort());
 for(const slug of slugs){const p=base(slug),rows=raw(f,slug,p);for(const track of ['public','operator'])assert.ok(rows.filter(a=>a.track===track).length>=2);}
});
for(const slug of slugs)test(slug+': actual public adapter payload produces complete ranked tracks and preserves all ten dimensions',()=>{
 const f=load(),input=publicPayload(f,slug),before=f.evaluate(input),serialized=JSON.stringify(input);freeze(input);f.install();const after=f.evaluate(input);
 assert.deepEqual(plain(after.diagnostics),plain(before.diagnostics));assert.equal(after.diagnostics.filter(d=>d.metricId).length,10);assert.equal(JSON.stringify(input),serialized);
 for(const track of ['public','operator']){
  const rows=featured(after,track);assert.ok(rows.length>=2&&rows.length<=5,slug+' '+track+' count');assert.deepEqual(rows.map(a=>a.position),Array.from({length:rows.length},(_,i)=>i+1));
  for(const a of rows){for(const key of ['id','title','target','reason','nextStep','timing','escalateWhen','escalateTo','authorityUrl','reviewAfter'])assert.ok(typeof a[key]==='string'&&a[key].trim(),key);assert.ok(Number.isInteger(a.rank)&&a.rank>0);assert.notEqual(a.priority,'immediate');assert.notEqual(a.phase,'respond');assert.equal(a.withheldReasons.length,0);assert.match(a.authorityUrl,/^https:\/\//);}
 }
 assert.notEqual(featured(after,'public')[0].nextStep,featured(after,'operator')[0].nextStep,'audiences need different responsibilities');
});
test('food: a failed source is a data gap first, a successful zero stays zero, and the tract step needs usable tract evidence',()=>{
 const f=load(),input=publicPayload(f,'food-desert-oases');f.install();
 assert.doesNotMatch(JSON.stringify(input),/"(lat|lon|q|address|displayName)"/);
 let p=f.evaluate(input),rows=featured(p);
 assert.equal(rows[0].signal,'data-gap');assert.match(rows[0].id,/food-gap/);assert.match(rows[0].reason,/SNAP-authorized farmers markets/);assert.deepEqual(plain(rows[0].evidenceIds),['markets-count']);
 for(const track of ['public','operator'])for(const a of featured(p,track)){assert.doesNotMatch(a.reason,/\bnone\b/i);assert.match(a.authorityUrl,/^https:\/\//);}
 const zero=input.evidence.find(x=>x.id==='foodbanks-count');assert.equal(zero.value,0);assert.equal(zero.quality,'current');
 const confirm=rows.find(a=>a.id.includes('food-confirm'));assert.match(confirm.reason,/OpenStreetMap food banks: 0 listed within 31 mi/);assert.match(confirm.reason,/SNAP-authorized farmers markets: unavailable/);assert.match(confirm.reason,/SNAP-authorized stores: 3 listed within 5 mi, data 2026-10-21/);
 const item=id=>p.impacts.items.find(x=>x.id===id);
 assert.equal(item('foodbanks-listed').value,0);assert.equal(item('foodbanks-listed').status,'available');
 assert.equal(item('markets-listed').value,null);assert.equal(item('markets-listed').status,'unknown');
 assert.equal(item('snap-listed').value,3);assert.equal(item('snap-nearest-distance').value,0.8);
 assert.equal(p.diagnostics.find(d=>d.metricId===3).status,'triggered');assert.equal(p.diagnostics.find(d=>d.metricId===9).status,'clear');
 assert.ok(rows.some(a=>a.id.includes('food-tract')));
 rows=featured(f.evaluate({...input,evidence:input.evidence.map(x=>x.id==='tract-lila'?{...x,quality:'missing'}:x)}));
 assert.ok(!rows.some(a=>a.id.includes('food-tract')));assert.match(rows[0].reason,/2025 Atlas tract flag/);
 const ok=input.evidence.map(x=>x.id==='markets-count'?{...x,value:2,quality:'current',measuredAt:'2026-10-21'}:x);
 rows=featured(f.evaluate({...input,evidence:ok}));assert.ok(!rows.some(a=>a.signal==='data-gap'),'all sources usable: no gap step');
 rows=featured(f.evaluate({...input,evidence:ok.map(x=>x.id==='snap-count'?{...x,partial:true}:x)}));assert.equal(rows[0].signal,'data-gap');assert.deepEqual(plain(rows[0].evidenceIds),['snap-count']);
 const startRows=featured(f.evaluate({...base('food-desert-oases'),context:'No search yet'}));assert.match(startRows[0].id,/food-start/);assert.ok(!startRows.some(a=>a.id.includes('food-gap')),'no source gap before a search');
 const territory=input.evidence.map(x=>x.id==='tract-lila'?{...x,value:null,quality:'missing',sourceStatus:'not-covered'}:x);rows=featured(f.evaluate({...input,evidence:territory}));
 assert.ok(rows.some(a=>a.id.includes('food-coverage')));assert.doesNotMatch(rows.find(a=>a.id.includes('food-gap')).reason,/2025 Atlas tract flag/);assert.match(rows.find(a=>a.id.includes('food-gap')).reason,/SNAP-authorized farmers markets \(failed\)/);
 const idle=f.evaluate(base('food-desert-oases'));for(const track of ['public','operator']){const r=featured(idle,track);assert.ok(r.length>=2);assert.equal(r[0].signal,'data-gap');assert.ok(!r.some(a=>a.id.includes('food-tract')));}
});
test('grid ranks signed forecast differences by absolute MW within one exact source hour and responds to selection',()=>{
 const f=load();f.install();let input=base('us-grid-strain',[...ba('A',-30),...ba('B',20),...ba('OLD',95,-90,old)]),p=f.evaluate(input);
 assert.match(featured(p)[0].title,/ A$/);assert.match(featured(p)[0].reason,/-30 MW/);assert.doesNotMatch(featured(p)[0].reason,/OLD/);assert.match(featured(p)[0].reason,/2 complete reports/);assert.equal(featured(p)[0].signal,'observed-condition');assert.equal(featured(p)[0].priority,'next');
 input.evidence=input.evidence.map(x=>x.id==='gap-B'?{...x,value:40}:x.id==='forecast-B'?{...x,value:60}:x);p=f.evaluate(input);assert.match(featured(p)[0].title,/ B$/);
 input={...input,context:'A selected',evidence:input.evidence.filter(x=>x.id.endsWith('-A'))};p=f.evaluate(input);assert.match(featured(p)[0].target,/^A ·/);assert.match(featured(p)[0].reason,/selected\/latest/);
});
test('grid preserves exact zero agreement, verifies missing inputs first and never invents an outage or dispatch instruction',()=>{
 const f=load();f.install();const input=base('us-grid-strain',ba('ZERO',0,0));let rows=featured(f.evaluate(input));assert.match(rows[0].title,/agreement/);assert.match(rows[0].reason,/0 MW/);assert.ok(rows.every(a=>a.signal!=='official-warning'&&a.signal!=='forecast'));
 input.evidence[1].value=null;input.evidence[1].quality='missing';rows=featured(f.evaluate(input));assert.equal(rows[0].signal,'data-gap');assert.match(rows[0].title,/missing or delayed/);assert.ok(!rows.some(a=>a.id.includes('grid-gap-')));assert.ok(rows.some(a=>a.id.includes('interchange')&&a.requiresCurrent));
 assert.doesNotMatch(rows.map(a=>a.nextStep).join(' '),/\b(dispatch now|switch now|conserve now|outage imminent)\b/i);
});
test('grid stale, ambiguous, inconsistent, future and expired comparisons cannot become a current featured condition',()=>{
 const f=load();f.install();
 for(const alter of [e=>e.map(x=>({...x,quality:'stale'})),e=>[...e,{...e[2]}],e=>e.map(x=>x.id.startsWith('gap-')?{...x,value:999}:x),e=>e.map(x=>({...x,measuredAt:new Date(now+3600000).toISOString()}))]){
  const p=f.evaluate(base('us-grid-strain',alter(ba('A',10))));assert.ok(!featured(p).some(a=>a.id.includes('grid-gap-')));assert.equal(featured(p)[0].signal,'data-gap');
 }
 const p=base('us-grid-strain',ba('A',10));p.evidence=p.evidence.map(x=>({...x,checkedAt:new Date(now-49*3600000).toISOString()}));assert.ok(!featured(f.evaluate(p)).some(a=>a.requiresCurrent));
});
test('grid import review uses the sign and exact report hour, with no mixed-hour netting',()=>{
 const f=load();f.install();const p=f.evaluate(base('us-grid-strain',[...ba('A',20,-10),...ba('B',10,-40),...ba('OLD',15,-900,old)]));const row=featured(p).find(a=>a.id.includes('interchange'));
 assert.match(row.target,/^B ·/);assert.match(row.reason,/-40 MW/);assert.match(row.reason,/not a failure/);assert.doesNotMatch(row.reason,/-900|net sum|total import/);
});
test('actual ISO-offset capture enforces the earlier48h cutoff without waiting for an adapter reread',()=>{
 const f=load();f.install();const start=now,capture=new Date(start-47*3600000).toISOString().replace('Z','+00:00'),report=new Date(start-48*3600000).toISOString(),input=base('us-grid-strain',ba('OFFSET',10,-5,report).map(x=>({...x,checkedAt:capture})));
 let rows=featured(f.evaluate(input));const gap=rows.find(a=>a.id.includes('grid-gap-'));assert.ok(gap);assert.equal(gap.validUntil,new Date(start+3600000).toISOString());
 try{now=start+2*3600000;rows=featured(f.evaluate(input));assert.ok(!rows.some(a=>a.requiresCurrent),'capture48h expires before report72h even if payload quality has not been re-read');}finally{now=start;}
 const rx=base('prescription-savings',[fact('cms-release','2026-02-30',{measuredAt:'2026-02-30',quality:'historical'})]);assert.match(raw(f,rx.slug,rx)[0].title,/Obtain dated/);
});
test('grid missing forecast does not erase an independently supported same-hour interchange report',()=>{
 const f=load();f.install();const input=base('us-grid-strain',[...ba('A',20,-10),...ba('B',10,-40)]);input.evidence.find(x=>x.id==='forecast-B').value=null;input.evidence.find(x=>x.id==='forecast-B').quality='missing';
 const rows=featured(f.evaluate(input));assert.equal(rows[0].signal,'data-gap');assert.match(rows.find(a=>a.id.includes('grid-gap')).target,/^A ·/);assert.match(rows.find(a=>a.id.includes('interchange')).target,/^B ·/);
});
test('market reviews source gaps and natural observation lags before associations, never producing a trade',()=>{
 const f=load();f.install();const e=[fact('macro-GINI',41.8,{label:'Annual Gini',unit:'index',quality:'historical',measuredAt:'2024-01-01',source:'https://fred.stlouisfed.org/series/SIPOVGINIUSA'}),fact('macro-UNRATE',0,{label:'Unemployment rate',unit:'percent',quality:'historical',measuredAt:'2026-09-01',source:'https://fred.stlouisfed.org/series/UNRATE'}),fact('shape',.1,{basis:'modeled',unit:'log return'})];let input=base('resilience-telemetry',e),p=f.evaluate(input),rows=featured(p);
 assert.match(rows[0].target,/Annual Gini.*2024-01-01/);assert.match(rows[0].reason,/not a failed feed/);assert.match(rows.at(-1).title,/model assumptions/);assert.ok(rows.every(a=>a.priority==='planned'));
 input.evidence.push(fact('density',null,{quality:'missing',basis:'modeled'}));p=f.evaluate(input);assert.match(featured(p)[0].title,/source gaps/);assert.equal(featured(p)[0].signal,'data-gap');
 input.scenario=true;input.context='SPY versus TLT · stress';rows=featured(f.evaluate(input));assert.ok(rows.every(a=>a.practice));assert.match(rows.at(-1).title,/practice assumptions/);
 assert.doesNotMatch(rows.map(a=>a.nextStep).join(' '),/\b(buy|sell|exit|liquidate)\b/i);
});
test('USAID finance periods and missing records precede archived service assumptions without mortality conversion',()=>{
 const f=load(),input=publicPayload(f,'usaid-consequence');f.install();let rows=featured(f.evaluate(input));assert.match(rows[0].reason,/2026-08-31/);assert.match(rows[0].reason,/2026-09-30/);assert.match(rows[0].reason,/Different endpoint windows/);assert.match(rows[1].title,/service continuity independently/);assert.ok(rows.every(a=>a.priority==='planned'));
 input.evidence.find(x=>x.id==='agency-latest-outlaysUSD').value=null;input.evidence.find(x=>x.id==='agency-latest-outlaysUSD').quality='missing';rows=featured(f.evaluate(input));assert.equal(rows[0].signal,'data-gap');assert.match(rows[0].title,/missing fiscal fields/);assert.match(rows[1].reason,/none identifies/);assert.doesNotMatch(rows.map(a=>a.nextStep).join(' '),/\b\d+ deaths\b|mortality forecast/i);
});
test('USAID absent fields and mixed accounting dates are explicit gaps rather than a single inferred period',()=>{
 const f=load(),input=publicPayload(f,'usaid-consequence');f.install();input.evidence=input.evidence.filter(x=>x.id!=='agency-latest-outlaysUSD');let rows=featured(f.evaluate(input));assert.equal(rows[0].signal,'data-gap');
 input.evidence.find(x=>x.id==='agency-latest-budgetaryResourcesUSD').measuredAt='2026-07-31';rows=featured(f.evaluate(input));assert.match(rows[0].reason,/2026-07-31/);assert.match(rows[0].reason,/2026-08-31/);assert.match(rows[0].reason,/fields themselves have different dates/);
});
test('market method-review target follows applicable triggered diagnostics without comparing incompatible units',()=>{
 const f=load();f.install();const input=base('resilience-telemetry',[fact('macro-UNRATE',0,{quality:'historical',measuredAt:'2026-09-01'}),fact('scale',2,{basis:'modeled',unit:'components'}),fact('density',.4,{basis:'modeled',unit:'probability mass'})]);
 input.diagnostics[5]={...input.diagnostics[5],label:'Threshold sensitivity',status:'triggered',evidenceIds:['scale']};input.diagnostics[2]={...input.diagnostics[2],label:'Density comparison',status:'triggered',evidenceIds:['density']};
 let row=featured(f.evaluate(input)).find(a=>a.id.includes('market-model'));assert.match(row.target,/Threshold sensitivity/);assert.match(row.reason,/not ranked as a financial threat/);
 input.diagnostics[5].status='clear';row=featured(f.evaluate(input)).find(a=>a.id.includes('market-model'));assert.match(row.target,/Density comparison/);
});
test('reference metadata changes the first action while private inputs and ambient clocks remain untouched',()=>{
 const f=load();f.install();const input=base('prescription-savings',[fact('cms-method','CMS acquisition reference',{unit:'reference',quality:'historical',basis:'interpretive',measuredAt:'Reference reviewed 2026-10-23; not a price observation',source:'https://www.medicaid.gov/medicaid/nadac'}),fact('cms-release',null,{quality:'missing',unit:'date',measuredAt:null})]);
 const first=raw(f,input.slug,input);assert.match(first[0].title,/Obtain dated/);input.evidence[1]={...input.evidence[1],value:'2026-10-21',measuredAt:'2026-10-21',quality:'historical'};assert.match(raw(f,input.slug,input)[0].title,/2026-10-21/);
 for(const key of ['A','PROC','DEST','RESULTS','NADAC_RESULTS','STATUS_OVERRIDE','document','fetch','localStorage'])Object.defineProperty(f.context,key,{configurable:true,get(){throw Error('Private/ambient read: '+key);}});
 Object.defineProperty(input,'privateBill',{get(){throw Error('Private payload read');}});
 const previous=Clock.now;Clock.now=()=>{throw Error('Prioritizer read ambient time');};
 try{for(const slug of slugs){const publicOnly={...base(slug),evidence:input.evidence};Object.defineProperty(publicOnly,'privateBill',{get(){throw Error('Private payload read');}});raw(f,slug,publicOnly);}}finally{Clock.now=previous;}
});
test('guidance steps remain reference-only, avoid invented deadlines and differ between public and operator roles',()=>{
 const f=load();f.install();for(const slug of ['medical-cost-abroad','medical-debt-assistant','human-trafficking']){
  const input=publicPayload(f,slug),p=f.evaluate(input),rows=featured(p);assert.ok(rows.every(a=>a.priority==='planned'&&a.signal==='reference'&&!a.requiresCurrent));assert.equal(rows.length,3);
  assert.doesNotMatch(rows.map(a=>a.timing+' '+a.nextStep).join(' '),/within \d+ (hours|days)|by midnight|in \d+ days|guaranteed/i);
  if(slug==='medical-debt-assistant')assert.match(rows[0].reason,/only one part.*no individual eligibility or deadline/);
  if(slug==='human-trafficking')assert.match(rows[0].reason,/cannot identify a person/);
  input.evidence=input.evidence.map(x=>x.id==='official-guidance'?{...x,value:null,quality:'missing'}:x);assert.match(featured(f.evaluate(input))[0].title,/Verify the current official guidance/);
 }
});
test('VA numerical targets remain drills and disappear with withheld local overrides',()=>{
 const f=load(),input=publicPayload(f,'va-strain');f.install();let p=f.evaluate(input),rows=featured(p,'operator');assert.ok(rows.every(a=>a.practice&&a.priority==='planned'&&a.signal==='scenario'));assert.match(rows[1].reason,/Synthetic value/);assert.match(rows[1].target,/within 5 points/);
 input.evidence=input.evidence.map(x=>['balance','margin','scale'].includes(x.id)?{...x,value:null,quality:'missing'}:x);p=f.evaluate(input);rows=featured(p,'operator');assert.match(rows[0].reason,/overrides are withheld/);assert.match(rows[1].title,/authorized inputs needed/);assert.doesNotMatch(JSON.stringify(rows),/secret census|987654/);
});
