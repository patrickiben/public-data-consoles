import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const core=fs.readFileSync(path.join(root,'response-plans/core.js'),'utf8');
const wb=['global-health-atlas','global-hiv-tb-malaria','global-ncd-burden','global-mental-health','global-nutrition','global-immunization','global-maternal-child-health','global-demographic-transition','global-health-systems','global-road-safety','global-air-pollution','global-wash'];
const refs=['prescription-savings','medical-cost-abroad','medical-debt-assistant','human-trafficking'];
const all=[...wb,'us-overdose-surveillance','us-respiratory-surveillance','global-cancer','global-ntds','antimicrobial-resistance',...refs];
const now=Date.parse('2026-10-23T12:00:00Z');
class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
function element(tag='div') {
  const e={tag,style:{},children:[],textContent:'',id:'',value:'',appendChild(child){this.children.push(child);if(this.tag==='select' && this.children.length===1)this.value=child.value;return child;}};
  Object.defineProperty(e,'selectedOptions',{get(){return this.children.filter(o=>o.value===this.value);}});
  return e;
}
function fixtureDocument(iso='AAA') {
  const ids=new Map([['cysel',{value:iso}]]),host=element();
  return {ids,host,body:host,createElement:element,querySelector(selector){assert.equal(selector,'header');return host;},getElementById(id){if(ids.has(id))return ids.get(id);const walk=e=>e.id===id?e:e.children?.map(walk).find(Boolean);return walk(host)||null;}};
}
function load(slug,globals={},doc=fixtureDocument()) {
  const context=vm.createContext({Date:Clock});
  Object.defineProperties(context,Object.getOwnPropertyDescriptors(globals));
  vm.runInContext(core,context,{filename:'core.js'});
  context.document=doc;
  let reader,raw;
  context.ConsoleResponse.connect=(read)=>{reader=read;raw=read();};
  vm.runInContext(fs.readFileSync(path.join(root,'response-plans/adapters',slug+'.js'),'utf8'),context,{filename:slug+'.js'});
  return {context,doc,get raw(){return raw;},get plan(){return context.ConsoleResponse.evaluate(raw);},read(){raw=reader();return raw;}};
}
function embedded(slug) {
  const html=fs.readFileSync(path.join(root,'consoles',slug,'index.html'),'utf8');
  const snap=html.match(/let SNAP=(.*?);\s*\n/);
  if(snap){const SNAP=JSON.parse(snap[1]),CMPK=html.match(/let CMPK='([^']+)'/)?.[1];return {SNAP,CMPK,GLSEL:'flu'};}
  const key={'global-cancer':'INC','global-ntds':'BURDEN','antimicrobial-resistance':'PATHO'}[slug];
  if(key){const expr=html.match(new RegExp('const '+key+'=([\\s\\S]*?);'))[1];const result={[key]:vm.runInNewContext(expr)};if(slug==='global-cancer')result.MORT=vm.runInNewContext(html.match(/const MORT=([\s\S]*?);/)[1]);return result;}
  return {NADAC_DS:'public-dataset-id'};
}
function sampleWB() {
  return {embedded:'2026-06-27',years:['2023','2024'],indMeta:{x:{name:'Example rate',unit:'per 100,000',ind:'EXAMPLE'}},
    agg:{WLD:{s:{x:[4,4]}},HIC:{s:{x:[8,8]}}},
    cty:{AAA:{name:'Alpha',income:'HIC',incomeName:'High income',latest:{x:{v:6,y:'2024'}}},BBB:{name:'Beta',income:'HIC',latest:{x:{v:8,y:'2024'}}},CCC:{name:'Gamma',income:'LIC',latest:{x:{v:0,y:'2024'}}},DDD:{name:'Delta',income:'LIC',latest:{x:{v:2,y:'2024'}}},OLD:{name:'Old observation',income:'LIC',latest:{x:{v:900,y:'2023'}}},UNK:{name:'Unclassified',income:'INX',latest:{x:{v:999,y:'2024'}}}}};
}
const metric=(p,n)=>p.diagnostics.find(d=>d.metricId===n);
const fact=(p,id)=>p.evidence.find(f=>f.id===id);

for(const slug of all)test(slug+': ten explicit dimensions and both action tracks from embedded public context',()=>{
  const globals=embedded(slug),iso=Object.keys(globals.SNAP?.cty||{})[0]||'AAA',f=load(slug,globals,fixtureDocument(iso)),p=f.plan;
  assert.equal(p.slug,slug);assert.deepEqual(Array.from(p.diagnostics,d=>d.metricId),[1,2,3,4,5,6,7,8,9,10]);
  for(const d of p.diagnostics){
    assert.ok(d.requiredInputs?.length && d.analyticalMitigation?.length,`specific mitigations for ${d.metricId}`);
    for(const track of ['public','operator'])assert.equal(p.actions.filter(a=>a.track===track && a.diagnosticIds.includes(d.id) && a.selected).length,1,`one applicable ${track} action for ${d.metricId}`);
  }
  for(const a of p.actions){assert.match(a.authorityUrl,/^https:\/\/(www\.)?(who\.int|cdc\.gov|medicaid\.gov|consumerfinance\.gov|transportation\.gov)\//);assert.ok(a.nextStep && a.escalateWhen);assert.notEqual(a.phase,'respond');}
  assert.equal(p.network,null);
});
test('WB: exact same-year empirical W1, declared income strata and reference-direction sensitivity',()=>{
  const f=load(wb[0],{SNAP:sampleWB(),CMPK:'x'}),p=f.plan;
  assert.equal(fact(p,'shape-w1').value,6);assert.equal(metric(p,2).status,'triggered');assert.equal(metric(p,5).status,'clear');assert.equal(metric(p,6).status,'triggered');
  assert.match(fact(p,'shape-w1').label,/n=2.*n=2/);assert.match(metric(p,2).explanation,/equally weighted/);
  assert.equal(metric(p,1).status,'unknown');assert.equal(metric(p,7).status,'unknown');
});
test('WB: zero is measured; null and mismatched years do not become comparable zeroes',()=>{
  const snap=sampleWB();snap.cty.AAA.latest.x.v=0;
  const f=load(wb[0],{SNAP:snap,CMPK:'x'});assert.equal(fact(f.plan,'selected-value').value,0);assert.notEqual(metric(f.plan,2).status,'unknown');
  snap.cty.BBB.latest.x.y='2023';f.read();assert.equal(metric(f.plan,2).status,'unknown');
  snap.cty.AAA.latest.x.v=null;f.read();assert.equal(fact(f.plan,'selected-value').quality,'missing');assert.equal(metric(f.plan,6).status,'unknown');
});
test('WB: vintage mismatch is a planning condition, never a current incident',()=>{
  const snap=sampleWB();snap.cty.AAA.latest.x.y='2023';const p=load(wb[0],{SNAP:snap,CMPK:'x'}).plan;
  assert.equal(fact(p,'year-gap').value,1);assert.equal(metric(p,5).status,'triggered');assert.equal(metric(p,5).scope,'planning');assert.equal(metric(p,5).current,false);
});
test('WB: selecting a new public country/indicator changes the evidence revision',()=>{
  const doc=fixtureDocument(),f=load(wb[0],{SNAP:sampleWB(),CMPK:'x'},doc);const old=f.raw.context;
  doc.ids.get('cysel').value='CCC';f.read();assert.notEqual(f.raw.context,old);assert.equal(fact(f.plan,'selected-value').value,0);
  f.context.CMPK='unavailable';f.read();assert.equal(metric(f.plan,2).status,'unknown');assert.equal(fact(f.plan,'selected-value').quality,'missing');
});
function respiratory(values,dates) {return {embedded:'2026-06-27',nssp:{flu:values.map((v,i)=>[dates?.[i]||new Date(now-7*(values.length-1-i)*86400000).toISOString().slice(0,10),v])},resp:{flu:[]},wval_nat:{flu:[]}};}
test('Respiratory: two declared four-week windows; stale dependencies still expose input-collection actions',()=>{
  const snap=respiratory([0,0,0,0,2,2,2,2]),f=load('us-respiratory-surveillance',{SNAP:snap,GLSEL:'flu'});
  assert.equal(fact(f.plan,'shape-w1').value,2);assert.equal(metric(f.plan,2).status,'triggered');assert.equal(fact(f.plan,'four-week-change').value,2);
  snap.nssp.flu=snap.nssp.flu.map(([d,v])=>[d.replace('2026','2025'),v]);f.read();assert.equal(metric(f.plan,2).status,'unknown');
  for(const n of [2,5])for(const track of ['public','operator'])assert.ok(f.plan.actions.some(a=>a.track===track && a.selected && a.when==='unknown' && a.diagnosticIds.includes('dimension-'+n)));
});
test('Respiratory: missing weeks and invalid dates cannot supply a W1 or throw the whole reader',()=>{
  const snap=respiratory([1,1,1,1,2,2,2,2]);snap.nssp.flu[3][0]='2026-02-30';
  const f=load('us-respiratory-surveillance',{SNAP:snap,GLSEL:'flu'});assert.equal(metric(f.plan,2).status,'unknown');
  snap.nssp.flu=[];f.read();assert.equal(fact(f.plan,'ed').quality,'missing');assert.equal(metric(f.plan,5).status,'unknown');
});
function overdose() {const periods=Array.from({length:24},(_,i)=>new Date(Date.UTC(2024,9+i,1)).toISOString().slice(0,7));return {periods,nat:{total:periods.map((_,i)=>i<18?100:120)},embedded:'2026-06-27'};}
test('Overdose: rolling totals remain modeled, classes unsummed, exact month comparison and missing-month guard',()=>{
  const snap=overdose(),f=load('us-overdose-surveillance',{SNAP:snap});
  assert.equal(fact(f.plan,'selected-total').basis,'modeled');assert.equal(fact(f.plan,'shape-w1').value,20);assert.ok(Math.abs(fact(f.plan,'year-change').value-20)<1e-6);
  assert.match(fact(f.plan,'shape-w1').note,/overlapping/);assert.equal(metric(f.plan,5).status,'triggered');
  snap.periods.splice(20,1);snap.nat.total.splice(20,1);f.read();assert.equal(metric(f.plan,2).status,'unknown');
  snap.nat.total=[];f.read();assert.equal(metric(f.plan,5).status,'unknown');
});
test('Overdose: zero prior total is unavailable for percent change; future periods cannot trigger current evidence',()=>{
  const snap=overdose();snap.nat.total[11]=0;const f=load('us-overdose-surveillance',{SNAP:snap});assert.equal(fact(f.plan,'year-change').quality,'missing');
  snap.periods=snap.periods.map(p=>p.replace('2026','2027'));f.read();assert.equal(metric(f.plan,5).status,'unknown');
});
for(const slug of refs)test(slug+': strict private-state traps and unrelated user changes leave the public plan identical',()=>{
  const doc={getElementById(){throw new Error('Private DOM must not be inspected');},querySelector(){throw new Error('Private DOM must not be inspected');}};
  const context={NADAC_DS:'public-dataset-id'};
  for(const key of ['A','PROC','DEST','searchQuery','personalResults'])Object.defineProperty(context,key,{get(){throw new Error('Private state read: '+key);},enumerable:false});
  const f=load(slug,context,doc),before=JSON.stringify(f.raw);f.context.privateInput='PRIVATE SENTINEL';f.read();
  assert.equal(JSON.stringify(f.raw),before);assert.ok(!before.includes('PRIVATE SENTINEL'));assert.ok(f.plan.diagnostics.every(d=>d.status==='unknown'));
});
test('Static estimates: focus changes preserve disease-specific qualifiers and never invent scores or survival',()=>{
  for(const slug of ['global-cancer','global-ntds','antimicrobial-resistance']){
    const f=load(slug,embedded(slug)),before=f.raw.context;f.doc.getElementById('response-public-focus').value='1';f.read();
    assert.notEqual(f.raw.context,before);assert.ok(f.plan.diagnostics.every(d=>d.status==='unknown'));assert.equal(fact(f.plan,'published-estimate').quality,'historical');
    if(slug==='global-cancer')assert.match(fact(f.plan,'published-deaths').note,/must not be divided/);
    if(slug==='global-ntds')assert.match(fact(f.plan,'published-estimate').unit,/requiring treatment/);
  }
});

test('WB: future country measurement year cannot support planning comparisons',()=>{
  const snap=sampleWB();snap.cty.AAA.latest.x.y='2035';const p=load(wb[0],{SNAP:snap,CMPK:'x'}).plan;
  assert.equal(fact(p,'selected-value').quality,'missing');assert.equal(metric(p,2).status,'unknown');assert.equal(metric(p,5).status,'unknown');
});
