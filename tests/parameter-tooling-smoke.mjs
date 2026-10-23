import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const root=new URL('../',import.meta.url),read=p=>readFile(new URL(p,root),'utf8');
const core=await read('response-plans/core.js'),helpers=await read('response-plans/domain-helpers.js');
const nhs=JSON.parse(await read('consoles/nhs-scotland-strain/data/latest.json'));
const browser=await chromium.launch({headless:true,channel:process.env.CHROME_CHANNEL||undefined});
let passed=0;
const plan=p=>p.evaluate(()=>ConsoleResponse.exportPlan().plan),metric=(p,id)=>p.diagnostics.find(d=>d.metricId===id);
async function scenario(slug,name,setup,verify){
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>r.abort());
 try{
  await page.clock.install({time:new Date(Date.parse(nhs.capturedAt)+3600000)});
  await page.setContent('<!doctype html><section id="console-response"></section>');
  await page.addScriptTag({content:core});await page.addScriptTag({content:helpers});
  await setup(page);await page.evaluate(()=>{ConsoleResponse.connect=read=>{window.refreshResponse=()=>ConsoleResponse.set(read());refreshResponse();};});
  await page.addScriptTag({content:await read('response-plans/adapters/'+slug+'.js')});
  await verify(page);assert.deepEqual(errors,[]);passed++;console.log('PASS parameter data: '+name);
 }finally{await context.close();}
}
const setupNHS=page=>page.evaluate(data=>{window.SNAP=data;window.SCEN='none';},nhs);
async function setupMarket(page){await page.evaluate(()=>{
 window.ASSET_IDS=['SPY','TLT','QQQ'];window.STORE={SPY:{},TLT:{},QQQ:{}};window.COMP={SPY:{F:[62]},TLT:{F:[40]},QQQ:{F:[70]}};
 window.L_LAG=2;window.SCEN='none';window.SURR=false;window.DATA_VER=1;window.MODE='live';window.SEL='SPY';window.W_IND=90;
 window.NETSTATE={n:30,asOf:0,scenario:'none',dataVersion:1,A:{SPY:{TLT:.8},TLT:{QQQ:.4},QQQ:{SPY:.2}},thrPair:{SPY:{TLT:.1},TLT:{QQQ:.1},QQQ:{SPY:.1}}};
 window.fixtureReturns={SPY:Array(20).fill(0),TLT:Array(20).fill(1),QQQ:Array(20).fill(2)};
 window.alignedReturns=()=>({mat:fixtureReturns});window.compAt=()=>0;
 window.dayToMs=()=>Date.parse('2026-10-20T00:00:00Z');window.msToDateStr=ms=>new Date(ms).toISOString().slice(0,10);
});}
try{
 await scenario('nhs-scotland-strain','real dated matrix, reported denominator and unsupported dimensions',setupNHS,async page=>{
  const p=await plan(page);assert.equal(metric(p,4).value,1);assert.equal(metric(p,4).status,'clear');
  assert.equal(metric(p,10).value,Math.round(1e6*nhs.careUse.outsideBoardStays/nhs.careUse.totalStays)/1e4);
  assert.equal(metric(p,10).status,'triggered');assert.equal(metric(p,3).status,'unknown');assert.equal(metric(p,7).status,'unknown');assert.equal(metric(p,9).status,'unknown');
  const e=p.evidence.find(e=>e.id==='care-outside');assert.equal(e.quality,'historical');assert.match(e.note,/not unique patients/);assert.match(e.note,/wording contradicts/);assert.match(p.network.semantics,/not observed patient transfers/);
  assert.ok(p.actions.filter(a=>a.selected).every(a=>a.phase!=='respond'));
 });
 await scenario('nhs-scotland-strain','unpublished cells cannot establish disconnected service pathways',setupNHS,async page=>{
  await page.evaluate(()=>{const f=SNAP.careUse;f.cells=f.cells.filter(r=>r.residence===r.treatment);f.totalStays=f.cells.reduce((s,r)=>s+r.stays,0);f.outsideBoardStays=0;f.cohortCellCount=f.publishedCellCount=f.cells.length;f.unreportedCohortCells=f.residenceBoards.length*f.providerCodes.length-f.cells.length;refreshResponse();});
  const p=await plan(page);assert.equal(metric(p,4).value,null,'Unsupported derived component estimate is withheld');assert.equal(metric(p,4).status,'unknown');assert.equal(p.evidence.find(e=>e.id==='care-components').value,14,'Raw partial-graph computation retains its historical provenance');assert.match(p.network.coverage,/unreported cells remain unknown/);
  const absent=p.network.roles.filter(r=>!nhs.careUse.residenceBoards.includes(r.id));assert.ok(absent.length);assert.ok(absent.every(r=>r.inbound===null&&r.outbound===null));
  await page.evaluate(()=>{const f=SNAP.careUse;f.cells.push({residence:f.residenceBoards[0],treatment:f.providerCodes.find(id=>!f.residenceBoards.includes(id)),stays:0,episodes:0,crossBoundary:true,sourceBoundaryFlag:1});refreshResponse();});
  const reportedZero=(await plan(page)).network.roles.find(r=>absent[0].id===r.id);assert.equal(reportedZero.inbound,0);assert.equal(reportedZero.outbound,null);
 });
 await scenario('nhs-scotland-strain','explicit zero matrix differs from missing matrix',setupNHS,async page=>{
  await page.evaluate(()=>{const f=SNAP.careUse;f.providerCodes=[...f.residenceBoards];f.cells=f.residenceBoards.flatMap(a=>f.residenceBoards.map(b=>({residence:a,treatment:b,stays:a===b?10:0,episodes:a===b?10:0,crossBoundary:a!==b,sourceBoundaryFlag:a===b?0:1})));f.totalStays=140;f.outsideBoardStays=0;f.cohortCellCount=f.publishedCellCount=196;f.unreportedCohortCells=0;refreshResponse();});
  let p=await plan(page);assert.equal(metric(p,4).status,'triggered');assert.equal(metric(p,4).value,14);assert.equal(metric(p,10).value,0);
  await page.evaluate(()=>{delete SNAP.careUse;refreshResponse();});p=await plan(page);assert.equal(metric(p,4).status,'unknown');assert.equal(metric(p,10).status,'unknown');
 });
 await scenario('resilience-telemetry','disjoint return masses have density TV one on the common date',setupMarket,async page=>{
  const p=await plan(page);assert.equal(metric(p,3).value,1);assert.equal(metric(p,3).status,'triggered');assert.equal(metric(p,1).status,'unknown');assert.equal(metric(p,7).status,'unknown');
  const e=p.evidence.find(e=>e.id==='density');assert.match(e.note,/20 paired.*2 right-closed bins/);assert.equal(e.measuredAt,'2026-10-20');
 });
 await scenario('resilience-telemetry','identical, tied and reordered empirical distributions are symmetric',setupMarket,async page=>{
  for(const values of [Array(20).fill(0),Array.from({length:20},(_,i)=>i%2),Array.from({length:20},(_,i)=>i)]){
   await page.evaluate(v=>{fixtureReturns.SPY=v;fixtureReturns.TLT=[...v].reverse();refreshResponse();},values);
   const p=await plan(page);assert.equal(metric(p,3).value,0);assert.equal(metric(p,3).status,'clear');
  }
 });
 await scenario('resilience-telemetry','missing, short or nonfinite paired returns never become symmetry',setupMarket,async page=>{
  for(const value of [null,Array(19).fill(0),[...Array(19).fill(0),null]]){
   await page.evaluate(v=>{fixtureReturns.SPY=v;refreshResponse();},value);const p=await plan(page);assert.equal(metric(p,3).status,'unknown');
  }
 });
 await scenario('resilience-telemetry','pending scenarios and backtest keep actual evidence meaning',setupMarket,async page=>{
  await page.evaluate(()=>{MODE='backtest';refreshResponse();});assert.equal((await plan(page)).evidence.find(e=>e.id==='density').quality,'historical');
  await page.evaluate(()=>{SCEN='stress';refreshResponse();});assert.equal(metric(await plan(page),3).status,'unknown');
  await page.evaluate(()=>{NETSTATE.scenario='stress';refreshResponse();});assert.equal((await plan(page)).evidence.find(e=>e.id==='density').basis,'demo');
 });
 // Integrate the maintained adapter into the actual standalone market console,
 // without writing generated HTML or contacting any live provider.
 {
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>r.abort());
  try{
   const html=(await read('consoles/resilience-telemetry/index.html')).replace(/<!-- CONSOLE_RESPONSE_ADAPTER_START -->[\s\S]*?<!-- CONSOLE_RESPONSE_ADAPTER_END -->/,'');
   await page.goto('about:blank');await page.setContent(html,{waitUntil:'load'});
   await page.waitForFunction(()=>document.getElementById('splash').style.display==='none',null,{timeout:60000});
   await page.addScriptTag({content:await read('response-plans/adapters/resilience-telemetry.js')});
   await page.waitForFunction(()=>ConsoleResponse.exportPlan().plan?.diagnostics.find(d=>d.metricId===3)?.status!=='unknown');
   const p=await plan(page),d=metric(p,3);assert.ok(Number.isFinite(d.value)&&d.value>=0&&d.value<=1);
   const source=p.evidence.find(e=>e.id==='density');assert.match(source.note,/paired common-calendar daily log returns/);assert.equal(source.measuredAt,await page.evaluate(()=>msToDateStr(dayToMs(NETSTATE.asOf))));
   console.log('COVERAGE real resilience '+JSON.stringify({supported:p.diagnostics.filter(d=>d.status!=='unknown').map(d=>d.metricId),densityTV:d.value,measuredAt:source.measuredAt,note:source.note}));
   assert.deepEqual(errors,[]);passed++;console.log('PASS parameter data: actual offline market console density integration');
  }finally{await context.close();}
 }
 console.log(`PASS ${passed} tooling parameter-data browser scenarios`);
}finally{await browser.close();}
