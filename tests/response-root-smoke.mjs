// Domain regressions against the real adapter and shared evaluator. Provider-free.
// Actual maintained HTML/closure integration is covered by response-browser.mjs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const root=new URL('../',import.meta.url);
const core=await readFile(new URL('response-plans/core.js',root),'utf8');
const helper=await readFile(new URL('response-plans/domain-helpers.js',root),'utf8');
const browser=await chromium.launch({headless:true,channel:process.env.CHROME_CHANNEL||undefined});
let passed=0;
async function scenario(slug,setup,verify){
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>route.abort());
 try{
  await page.clock.install({time:new Date('2026-10-23T16:00:00Z')});
  await page.setContent('<!doctype html><section id="console-response"></section>');
  await page.addScriptTag({content:core});await page.addScriptTag({content:helper});
  await page.evaluate(setup);
  await page.evaluate(()=>{ConsoleResponse.connect=read=>{window.refreshResponse=()=>ConsoleResponse.set(read());refreshResponse();};});
  await page.addScriptTag({content:await readFile(new URL('response-plans/adapters/'+slug+'.js',root),'utf8')});
  await verify(page);assert.deepEqual(errors,[]);passed++;console.log('PASS root response: '+slug);
 }finally{await context.close();}
}
const plan=page=>page.evaluate(()=>ConsoleResponse.exportPlan().plan);
const metric=(p,id)=>p.diagnostics.find(d=>d.metricId===id);
function ten(p){assert.deepEqual(p.diagnostics.map(d=>d.metricId),[1,2,3,4,5,6,7,8,9,10]);}
try{
 await scenario('nhs-scotland-strain',()=>{
  window.SNAP={meta:{aeWeek:20260104,fetched:'2026-01-06'},sites:[{pct4:60,att:10},{pct4:80,att:30},{pct4:92,att:90},{pct4:96,att:110}],national:[{pct4:95},{pct4:85},{pct4:75}]};window.SCEN='none';
 },async page=>{
  let p=await plan(page);ten(p);
  assert.equal(metric(p,2).value,80,'W1 uses entire empirical distributions');
  assert.equal(metric(p,5).value,2);assert.equal(metric(p,6).value,1);
  assert.equal(metric(p,8).value,10.53,'normalized trapezoidal historical gap');
  assert.ok(p.evidence.every(e=>e.quality==='historical'));
  assert.ok(p.actions.filter(a=>a.selected).every(a=>a.phase!=='respond'));
  await page.evaluate(()=>{SNAP.sites=[];SNAP.national=[];refreshResponse();});
  p=await plan(page);assert.ok(p.diagnostics.every(d=>d.status==='unknown'),'empty cohorts cannot become healthy zeros');
 });
 await scenario('va-strain',()=>{
  window.STATUS_OVERRIDE={};window.FACILITY='Synthetic facility';window.SCEN='baseline';
  window.deepUnits=()=>({u:[{cap:100,census:95,rnAct:4,rnTgt:5},{cap:100,census:70,rnAct:5,rnTgt:5}]});
 },async page=>{
  let p=await plan(page);ten(p);assert.equal(metric(p,5).value,1);assert.equal(metric(p,6).value,1);
  assert.ok(p.evidence.every(e=>e.basis==='demo'));assert.ok(p.actions.every(a=>a.practice));
  await page.evaluate(()=>{STATUS_OVERRIDE={secret:{census:987654321}};refreshResponse();});
  p=await plan(page);assert.ok(p.evidence.every(e=>e.value===null));assert.doesNotMatch(JSON.stringify(p),/987654321/);
  await page.evaluate(()=>{STATUS_OVERRIDE={};deepUnits=()=>({u:[]});refreshResponse();});
  p=await plan(page);assert.ok(p.diagnostics.every(d=>d.status==='unknown'));
 });
 await scenario('quake-consequence',()=>{
  window.fixture={event:{id:'fixture-event',properties:{time:Date.now()-3600000,place:'test place',url:'https://earthquake.usgs.gov/earthquakes/eventpage/fixture-event'}},graph:{hasShakeMap:true,nodes:[{id:'a',type:'hospital',mmi:7.2,screened:true},{id:'b',type:'power',mmi:6.2,screened:true},{id:'c',type:'water',mmi:5.8,screened:false}],edges:[['a','b'],['b','c']],supplied:false}};
  window.QuakeResponse={read:()=>structuredClone(fixture)};
 },async page=>{
  let p=await plan(page);ten(p);assert.equal(metric(p,2).value,1.2);
  assert.ok(p.evidence.every(e=>e.basis==='modeled'));assert.match(p.network.semantics,/not observed utility connections/);
  assert.equal(metric(p,9).status,'triggered');
  await page.evaluate(()=>{fixture.graph.hasShakeMap=false;refreshResponse();});
  p=await plan(page);assert.ok(p.diagnostics.every(d=>d.status==='unknown'),'distance fallback cannot become an authoritative shaking contour');
  await page.evaluate(()=>{fixture.graph.hasShakeMap=true;fixture.event.properties.time=Date.now()+86400000;refreshResponse();});
  p=await plan(page);assert.ok(p.diagnostics.every(d=>d.status==='unknown'),'future event time invalidates current evidence');
  await page.evaluate(()=>{fixture={event:null,graph:null};refreshResponse();});
  p=await plan(page);assert.ok(p.evidence.every(e=>e.value===null),'event switch discards prior graph');
 });
 await scenario('resilience-telemetry',()=>{
  window.ASSET_IDS=['SPY','TLT','QQQ'];window.STORE={SPY:{},TLT:{},QQQ:{}};window.COMP={SPY:{F:[62]},TLT:{F:[40]},QQQ:{F:[70]}};
  window.L_LAG=2;window.SCEN='none';window.SURR=false;window.DATA_VER=1;window.MODE='live';window.SEL='SPY';window.W_IND=90;
  window.NETSTATE={n:30,asOf:0,scenario:'none',dataVersion:1,A:{SPY:{TLT:.8},TLT:{QQQ:.4},QQQ:{SPY:.2}},thrPair:{SPY:{TLT:.1},TLT:{QQQ:.1},QQQ:{SPY:.1}}};
  window.alignedReturns=()=>({mat:{SPY:[0,0],TLT:[2,4],QQQ:[1,1]}});window.compAt=()=>0;
  window.dayToMs=()=>Date.parse('2026-10-20T00:00:00Z');window.msToDateStr=ms=>new Date(ms).toISOString().slice(0,10);
 },async page=>{
  let p=await plan(page);ten(p);assert.equal(metric(p,2).value,3);
  assert.ok(p.evidence.every(e=>e.measuredAt==='2026-10-20'),'all diagnostics share actual aligned network date');
  assert.match(p.network.semantics,/not money flow or causal contagion/);
  await page.evaluate(()=>{MODE='backtest';refreshResponse();});
  p=await plan(page);assert.ok(p.evidence.every(e=>e.quality==='historical'));
  await page.evaluate(()=>{SCEN='stress';refreshResponse();});
  p=await plan(page);assert.ok(p.evidence.every(e=>e.value===null),'pending scenario cannot mix a previous network with new state');
  await page.evaluate(()=>{NETSTATE.scenario='stress';refreshResponse();});
  p=await plan(page);assert.ok(p.evidence.every(e=>e.basis==='demo'));assert.ok(p.actions.every(a=>a.practice));
  await page.evaluate(()=>{DATA_VER=2;refreshResponse();});
  p=await plan(page);assert.ok(p.evidence.every(e=>e.value===null),'pending data refresh cannot reuse old network estimates');
 });
 // A delayed first A request must not overwrite a newer A after A -> B -> A.
 // Matching event ids alone cannot protect this case; the application generation must match.
 {
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  const html=await readFile(new URL('consoles/quake-consequence/index.html',root),'utf8');
  const origin='https://response-fixture.invalid/quake/?event=A';
  let releaseOld,oldHeld=false,overpassCalls=0;
  const oldGate=new Promise(resolve=>{releaseOld=resolve;});
  const event=id=>({id,type:'Feature',geometry:{type:'Point',coordinates:[-90,id==='B'?30:20,9]},properties:{mag:5.6,place:'Fixture '+id,time:Date.parse('2026-10-23T15:00:00Z'),products:{},url:'https://earthquake.usgs.gov/earthquakes/eventpage/'+id}});
  const nodes=count=>Array.from({length:count},(_,i)=>({id:i+1,lat:20+i*.01,lon:-90,tags:i===0?{amenity:'hospital',name:'Current fixture hospital'}:i===1?{power:'substation'}:{man_made:'water_works'}}));
  try{
   await page.clock.install({time:new Date('2026-10-23T16:00:00Z')});page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',async route=>{
    const u=new URL(route.request().url()),json=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    if(u.href===origin)return route.fulfill({contentType:'text/html',body:html});
    if(u.hostname==='earthquake.usgs.gov')return json(u.searchParams.has('eventid')?event(u.searchParams.get('eventid')):{features:['A','B','us6000t7zp'].map(event)});
    if(u.hostname==='overpass-api.de'){
     const n=++overpassCalls;if(n===1){oldHeld=true;await oldGate;return json({elements:nodes(1)});}
     return json({elements:nodes(n===2?2:3)});
    }
    if(/\.(js|css)$/.test(u.pathname))return route.fulfill({status:503,body:'offline fixture'});
    return json({features:[],elements:[],data:[],geonames:{features:[]}});
   });
   await page.goto(origin,{waitUntil:'load'});
   await page.waitForFunction(()=>window.QuakeResponse?.read().event?.id==='A');
   assert.equal(oldHeld,true);
   await page.selectOption('#evsel','B');await page.waitForFunction(()=>QuakeResponse.read().graph?.eventId==='B');
   await page.selectOption('#evsel','A');await page.waitForFunction(()=>QuakeResponse.read().graph?.nodes.length===3);
   const oldResponse=page.waitForResponse(r=>r.url().includes('overpass-api.de'));
   releaseOld();await (await oldResponse).finished();await page.waitForLoadState('networkidle');
   await page.waitForFunction(()=>ConsoleResponse.exportPlan().plan.context.includes('USGS A'));
   const current=await page.evaluate(()=>QuakeResponse.read());
   assert.equal(current.event.id,'A');assert.equal(current.graph.nodes.length,3,'late old A inventory cannot replace newer A');
   assert.deepEqual(errors,[]);console.log('PASS root response: actual Quake closure and A-B-A request race');passed++;
  }finally{releaseOld();await context.close();}
 }
 console.log('PASS: '+passed+' domain response regressions');
}finally{await browser.close();}
