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
  const context=vm.createContext({Date:Clock,URL});
  Object.defineProperties(context,Object.getOwnPropertyDescriptors(globals));
  vm.runInContext(core,context,{filename:'core.js'});
  context.document=doc;
  vm.runInContext(fs.readFileSync(path.join(root,'public-data-runtime/worldbank.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'public-data-runtime/health-feeds.js'),'utf8'),context);
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

function contextFixture(){return {schemaVersion:1,capturedAt:'2026-10-23T10:00:00Z',sourceUpdatedAt:{population:'2026-10-08',landArea:'2026-10-08'},sources:[{id:'population',indicator:'SP.POP.TOTL',url:'https://api.worldbank.org/v2/country/AAA/indicator/SP.POP.TOTL'},{id:'landArea',indicator:'AG.LND.TOTL.K2',url:'https://api.worldbank.org/v2/country/AAA/indicator/AG.LND.TOTL.K2'}],countries:Object.fromEntries(['AAA','BBB','CCC','DDD'].map((c,i)=>[c,{population:{'2023':100,'2024':[100,300,200,200][i]},landArea:{'2023':10,'2024':[10,30,10,10][i]}}]))};}
function geographicFixture(){const s=sampleWB();s.responseAnnualContext=contextFixture();return s;}
for(const slug of wb)test(slug+': real aligned population and area fill only the two geographic context dimensions',()=>{const f=load(slug,{SNAP:geographicFixture(),CMPK:'x'}),p=f.plan;assert.equal(metric(p,1).status,'clear');assert.equal(metric(p,1).value,1);assert.equal(fact(p,'population-a').value,400);assert.equal(fact(p,'population-b').value,400);assert.equal(metric(p,3).status,'triggered');assert.equal(metric(p,3).value,0.666667);assert.equal(fact(p,'land-a').value,40);assert.equal(fact(p,'land-b').value,20);assert.equal(fact(p,'density-a').value,10);assert.equal(fact(p,'density-b').value,20);for(const n of [4,7,9,10])assert.equal(metric(p,n).status,'unknown');assert.match(metric(p,3).explanation,/identical comparator/);assert.ok(p.actions.every(a=>a.phase!=='respond'));});
test('WDI context: missing or wrong-year denominators never borrow another year or turn into zero',()=>{const s=geographicFixture(),f=load(wb[0],{SNAP:s,CMPK:'x'});s.responseAnnualContext.countries.DDD.population['2024']=null;f.read();assert.equal(metric(f.plan,1).status,'unknown');assert.equal(metric(f.plan,3).status,'unknown');s.responseAnnualContext.countries.DDD.population['2024']=200;delete s.responseAnnualContext.countries.DDD.landArea['2024'];f.read();assert.equal(metric(f.plan,1).status,'clear');assert.equal(metric(f.plan,3).status,'unknown');s.responseAnnualContext.countries.DDD.landArea['2024']=0;f.read();assert.equal(metric(f.plan,3).status,'unknown');});
test('WDI context: cohort membership is the indicator comparison; unsafe totals/densities unavailable',()=>{const s=geographicFixture(),f=load(wb[0],{SNAP:s,CMPK:'x'});s.cty.DDD.latest.x.y='2023';f.read();assert.equal(metric(f.plan,1).status,'unknown');assert.equal(metric(f.plan,3).status,'unknown');s.cty.DDD.latest.x.y='2024';for(const c of Object.values(s.responseAnnualContext.countries))c.population['2024']=Number.MAX_SAFE_INTEGER;f.read();assert.equal(metric(f.plan,1).status,'unknown');for(const c of Object.values(s.responseAnnualContext.countries)){c.population['2024']=100;c.landArea['2024']=1e-308;}f.read();assert.equal(metric(f.plan,1).status,'clear');assert.equal(metric(f.plan,3).status,'unknown');});
test('WDI context: invalid dates, duplicate sources, regressions and truncated prior values rejected atomically',()=>{const f=load(wb[0],{SNAP:geographicFixture(),CMPK:'x'}),W=f.context.WorldBankPublicData,base=contextFixture(),codes=Object.keys(base.countries);assert.equal(W.validateContext(base,null,codes),base);for(const change of [x=>{x.capturedAt='2026-02-30T00:00:00Z';},x=>{x.capturedAt='2027-01-01T00:00:00Z';},x=>{x.sources.push(x.sources[0]);},x=>{x.sourceUpdatedAt.population='2026-10-07';},x=>{x.countries.AAA.population['2024']=null;},x=>{x.countries.AAA.population['2024']='100';},x=>{delete x.countries.AAA;}]){const next=structuredClone(base);change(next);assert.throws(()=>W.validateContext(next,base,codes));}assert.equal(base.countries.AAA.population['2024'],100);});
test('Air: exact five-year annual-step excess integral; no imputation, cohort dose or outcome extrapolation',()=>{const s=geographicFixture();s.years=['2020','2021','2022','2023','2024'];s.cty.AAA.pm25=[4,5,6,7,8];const f=load('global-air-pollution',{SNAP:s,CMPK:'x'});assert.equal(metric(f.plan,8).value,6);assert.equal(metric(f.plan,8).status,'triggered');assert.equal(fact(f.plan,'pm25-excess-auc').measuredAt,'2020–2024');assert.match(fact(f.plan,'pm25-excess-auc').note,/not a fixed person cohort/);s.cty.AAA.pm25[1]=null;f.read();assert.equal(metric(f.plan,8).status,'unknown');s.cty.AAA.pm25=[4,5,6,7,8];s.years[2]='2021';f.read();assert.equal(metric(f.plan,8).status,'unknown');s.years=['2020','2021','2022','2023','2024'];s.cty.AAA.pm25=[0,0,0,0,0];f.read();assert.equal(metric(f.plan,8).value,0);assert.equal(metric(f.plan,8).status,'clear');assert.match(metric(f.plan,8).rule,/not zero exposure/);});
test('CDC directions: exact endpoints, observed disagreement, partial coverage and stale dependencies',()=>{const s=respiratory([1,1,1,1,2,2,2,2]),start='2026-09-25',end='2026-10-23';s.wval_nat={flu:[[start,2],[end,3]]};s.wval_state_series={A:{flu:[[start,2],[end,4]]},B:{flu:[[start,4],[end,2]]},C:{flu:[[end,2]]}};s.wval_state_site_counts={A:{flu:{[start]:2,[end]:3}},B:{flu:{[start]:1,[end]:1}}};const f=load('us-respiratory-surveillance',{SNAP:s,GLSEL:'flu'});assert.equal(metric(f.plan,6).value,50);assert.equal(metric(f.plan,6).status,'triggered');assert.match(fact(f.plan,'scale-disagreement').note,/Paired 2 of 3/);s.wval_state_series.B.flu=[[start,2],[end,4]];f.read();assert.equal(metric(f.plan,6).status,'unknown');delete s.wval_state_series.C;f.read();assert.equal(metric(f.plan,6).status,'clear');s.wval_nat.flu=[['2025-09-25',2],['2025-10-23',3]];f.read();assert.equal(metric(f.plan,6).status,'unknown');});
test('CDC categories: grouping preserves observed counts and rejects duplicates/unsafe/missing values',()=>{const f=load('us-respiratory-surveillance',{SNAP:respiratory([1,2]),GLSEL:'flu'}),H=f.context.HealthPublicData,rows=[{week_end:'2026-10-17',state_territory:'A',site_wval_category:'Low',n:'2'},{week_end:'2026-10-17',state_territory:'A',site_wval_category:'High',n:'1'}];assert.equal(H.wastewaterGroups(rows,true).A.series[0][1],8/3);assert.equal(H.wastewaterGroups(rows,true).A.counts['2026-10-17'],3);assert.throws(()=>H.wastewaterGroups([...rows,rows[0]],true));for(const n of ['bad','0',String(Number.MAX_SAFE_INTEGER)])assert.throws(()=>H.wastewaterGroups([{...rows[1],n}],true));});
test('Overdose scale: same ending-month/year and category, source history rather than retained display values',()=>{const s=overdose(),end=s.periods.at(-1),start=String(+end.slice(0,4)-1)+end.slice(4);s.stateMonthly={NY:{total:[[start,10],[end,20]]},YC:{total:[[start,20],[end,10]]}};s.stateHistoryExpectedJurisdictions=['NY','YC','OR'];s.states={OR:{tot:999}};const f=load('us-overdose-surveillance',{SNAP:s});assert.equal(metric(f.plan,6).value,50);assert.equal(metric(f.plan,6).status,'triggered');assert.match(fact(f.plan,'scale-disagreement').note,/missing pairs: OR/);s.stateMonthly.YC.total=[[start,10],[end,20]];f.read();assert.equal(metric(f.plan,6).status,'unknown');f.doc.getElementById('response-public-focus').value='coc';f.read();assert.equal(metric(f.plan,6).status,'unknown');});
