import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {chromium} from 'playwright';

// Maintained sources are integrated in memory: this test never regenerates HTML
// and never contacts a provider, including basemap tile servers.
const root=new URL('../',import.meta.url),read=p=>readFile(new URL(p,root),'utf8');
const slugs=['us-grid-strain','resilience-telemetry','usaid-consequence','prescription-savings','medical-cost-abroad','medical-debt-assistant','human-trafficking','va-strain','food-desert-oases'];
const core=await read('response-plans/core.js'),helpers=await read('response-plans/domain-helpers.js'),series=await read('response-plans/observed-series.js'),style=await read('response-plans/style.css');
const htmls=Object.fromEntries(await Promise.all(slugs.map(async s=>[s,await read('consoles/'+s+'/index.html')])));
const adapters=Object.fromEntries(await Promise.all(slugs.map(async s=>[s,await read('response-plans/adapters/'+s+'.js')])));
const agency=JSON.parse(htmls['usaid-consequence'].match(/const SNAP = (\{[^\n]+\});/)[1]);
const now=Math.max(Date.now(),Date.parse(agency.publicFinance.capturedAt))+3600000;
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
let count=0;
function pass(name){count++;console.log('PASS public tools impacts: '+name);}
function fixture(slug,globals={}){
 const ctx=vm.createContext({Date:Clock,URL,console});Object.defineProperties(ctx,Object.getOwnPropertyDescriptors(globals));
 vm.runInContext('window=globalThis;',ctx);vm.runInContext(core,ctx);vm.runInContext(helpers,ctx);vm.runInContext(series,ctx);
 ctx.ConsoleResponse.connect=read=>{ctx.reader=read;};vm.runInContext(adapters[slug],ctx,{filename:slug+'.js'});
 return {ctx,get plan(){return ctx.ConsoleResponse.evaluate(ctx.reader());}};
}
const item=(p,id)=>p.impacts.items.find(x=>x.id===id),metric=(p,id)=>p.diagnostics.find(x=>x.metricId===id);
const hour=new Date(now-7200000).toISOString().slice(0,13);
{
 const f=fixture('us-grid-strain',{STATE:{capturedAt:new Date(now-1000).toISOString(),demandThrough:hour,ba:{A:{code:'A',name:'Authority A',D:0,DF:0,TI:0,period:hour}}},AGG:new Set(),GridResponseSelection:'A'});
 for(const id of ['demand','forecast','gap','interchange']){const x=item(f.plan,'public-'+id+'-A');assert.equal(x.value,0);assert.equal(x.status,'available');assert.equal(x.unit,'MW');}
 assert.equal(item(f.plan,'public-forecast-A').kind,'context');assert.equal(item(f.plan,'public-forecast-A').basis,'modeled');
 f.ctx.STATE.ba.A.DF=null;assert.equal(item(f.plan,'public-forecast-A').status,'unknown');assert.equal(item(f.plan,'public-gap-A').status,'unknown');assert.equal(item(f.plan,'public-demand-A').value,0);
 f.ctx.STATE.ba.A.period=new Date(now+3600000).toISOString().slice(0,13);assert.equal(item(f.plan,'public-demand-A').status,'unknown');
 pass('grid actual/forecast/interchange zeros survive; missing and future reports do not become zero');
}
{
 const f=fixture('us-grid-strain',{STATE:{capturedAt:new Date(now-1000).toISOString(),demandThrough:hour,ba:{A:{code:'A',D:0,DF:0,TI:0,period:hour},B:{code:'B',D:0,DF:0,TI:0,period:new Date(now-10800000).toISOString().slice(0,13)}}},AGG:new Set()});
 assert.equal(metric(f.plan,1).status,'unknown');f.ctx.STATE.ba.B.period=hour;assert.equal(metric(f.plan,1).status,'clear');
 f.ctx.STATE.ba.B.D=null;assert.equal(metric(f.plan,1).status,'unknown');
 pass('grid mixed-hour and missing-demand cohorts cannot establish balanced exposure');
}
{
 const epoch=Date.UTC(2000,0,1),day=Math.floor((now-86400000-epoch)/86400000);
 const f=fixture('resilience-telemetry',{NETSTATE:null,ASSET_IDS:[],STORE:{},L_LAG:4,SCEN:'none',SURR:false,DATA_VER:1,MODE:'live',SEL:'SPY',W_IND:252,MACRO:{ZERO:{name:'Zero reference',unit:'pct',d:[day],v:[0]},NFCI:{name:'Financial conditions',unit:'idx0',d:[day],v:[-.5]},RECPROUSM156N:{name:'Recession probability',unit:'pct',d:[day],v:[.62]},BAD:{d:[day],v:[null]},FUTURE:{d:[day+10],v:[100]}},FRED_META:{capturedAt:new Date(now-1000).toISOString(),retrieved_on:new Date(now).toISOString().slice(0,10)}});
 assert.equal(item(f.plan,'macro-ZERO').value,0);assert.equal(item(f.plan,'macro-NFCI').value,-.5);
 assert.equal(item(f.plan,'macro-RECPROUSM156N').basis,'modeled');assert.equal(item(f.plan,'macro-RECPROUSM156N').kind,'context');assert.match(item(f.plan,'macro-RECPROUSM156N').method,/no forecast/);
 for(const id of ['BAD','FUTURE'])assert.equal(item(f.plan,'macro-'+id).status,'unknown');assert.equal(metric(f.plan,1).status,'unknown');assert.equal(metric(f.plan,7).status,'unknown');
 pass('FRED dates, signed/zero units and smoothed-nowcast meaning are independent of market returns');
}
for(const slug of ['prescription-savings','medical-cost-abroad','medical-debt-assistant','human-trafficking']){
 const globals={NADAC_DS:'official-dataset-id'};
 for(const key of ['A','PROC','DEST','INPUT','ANSWERS','RESULTS','NADAC_QUERY','NADAC_RESULTS'])Object.defineProperty(globals,key,{get(){throw Error('Private value read: '+key);},enumerable:true});
 const f=fixture(slug,globals),p=f.plan;assert.equal(p.diagnostics.length,10);assert.ok(p.diagnostics.every(d=>d.status==='unknown'));
 assert.ok(p.impacts.items.some(x=>x.status==='available'));assert.ok(p.impacts.items.some(x=>x.status==='unknown'&&x.value===null));assert.ok(p.impacts.records.some(x=>x.status==='available'));
 if(slug==='medical-cost-abroad'){assert.equal(item(p,'guidance-reference').unit,'public guidance');assert.equal(item(p,'private-outcome-unavailable').unit,'USD');assert.equal(p.evidence.find(x=>x.id==='official-guidance').measuredAt,'2025-04-23');}
 if(slug==='prescription-savings'){assert.match(p.evidence.find(x=>x.id==='cms-method').measuredAt,/reviewed.*not a price observation/);assert.equal(item(p,'release-age').status,'unknown');}
 if(slug==='medical-debt-assistant'){assert.equal(item(p,'guidance-reference').value,400);assert.equal(item(p,'guidance-reference').unit,'USD above a provider’s good-faith estimate');}
 pass(slug+' public reference works without reading any private form or result');
}
{
 const f=fixture('usaid-consequence',{DATA:structuredClone(agency),budgetPublicRecords:[],budgetPublicStatus:null,feedStatus:{USAspending:'unavailable'}});
 const p=f.plan,window=p.evidence.find(e=>e.id==='budget-window');
 assert.equal(window.measuredAt,'FY'+agency.status.fy+' Q'+agency.status.q);assert.equal(window.quality,'historical');assert.match(window.source,/references\/toptier_agencies/);assert.match(window.note,/not an exact observation date/);
 assert.equal(metric(p,5).status,'triggered');assert.equal(metric(p,5).current,false);assert.ok(p.actions.filter(a=>a.diagnosticIds.includes('metric-5')&&a.selected).every(a=>a.phase==='review'));
 for(const status of [{fy:2026},{fy:2026,q:0},{fy:2026,q:5},{fy:2099,q:1},{fy:2026,q:true}]){f.ctx.DATA.status=status;assert.equal(metric(f.plan,5).status,'unknown');assert.equal(f.plan.evidence.find(e=>e.id==='budget-window').measuredAt,null);}
 f.ctx.DATA.status={fy:'2026',q:'3'};assert.equal(f.plan.evidence.find(e=>e.id==='budget-window').measuredAt,'FY2026 Q3');assert.equal(metric(f.plan,5).status,'triggered');
 pass('USAID reported fiscal quarter supports historical comparability review without invented observation/retrieval dates');
}
{
 const f=fixture('prescription-savings',{NADAC_DS:'dataset',NADAC_RELEASE:{dataset:'dataset',day:new Date(now).toISOString().slice(0,10),checked:now}});
 assert.equal(item(f.plan,'release-age').value,0);f.ctx.NADAC_RELEASE.day='2099-01-01';assert.equal(item(f.plan,'release-age').status,'unknown');f.ctx.NADAC_RELEASE={dataset:'other',day:'2026-10-01'};assert.equal(item(f.plan,'release-age').status,'unknown');
 pass('NADAC release age requires valid universal metadata, not a query result or future date');
}
{
 let calls=0;const privateRow={};Object.defineProperty(privateRow,'census',{get(){throw Error('Private census read');}});
 const f=fixture('va-strain',{STATUS_OVERRIDE:{private:privateRow},FACILITY:'Training template',SCEN:'baseline',deepUnits(){calls++;throw Error('Private override must not be evaluated');}});
 const p=f.plan;assert.equal(calls,0);assert.ok(p.impacts.items.every(x=>x.value===null));assert.ok(p.diagnostics.every(d=>d.status==='unknown'));assert.ok(p.impacts.records.some(x=>x.status==='available'&&x.kind==='scenario'));
 pass('VA private overrides are withheld while official guidance remains a dated drill reference');
}

function integrate(slug){
 const head='<style>'+style+'</style><script>'+core+'\n'+helpers+'\n'+series+'</script><script>const toolsConnect=ConsoleResponse.connect;ConsoleResponse.connect=(read,selectors)=>{window.toolsRead=read;return toolsConnect(read,selectors);};</script>';
 return htmls[slug].replace(/<!-- CONSOLE_RESPONSE_HEAD_START -->[\s\S]*?<!-- CONSOLE_RESPONSE_HEAD_END -->/,head).replace(/<!-- CONSOLE_RESPONSE_ADAPTER_START -->[\s\S]*?<!-- CONSOLE_RESPONSE_ADAPTER_END -->/,'<script>'+adapters[slug]+'</script>');
}
const browser=await chromium.launch({headless:true,channel:process.env.CHROME_CHANNEL||undefined});
async function pageCase(name,slug,route,verify){
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route||((r)=>r.abort()));
 try{await page.clock.install({time:new Date(now)});await page.setContent(integrate(slug),{waitUntil:'load'});await page.waitForFunction(()=>typeof window.toolsRead==='function');
  if(slug==='resilience-telemetry')await page.waitForFunction(()=>document.getElementById('splash').style.display==='none',null,{timeout:60000});
  await page.evaluate(()=>ConsoleResponse.set(toolsRead()));await verify(page);assert.deepEqual(errors,[]);pass(name);
 }finally{await context.close();}
}
try{
 for(const slug of slugs)await pageCase('actual standalone offline '+slug,slug,null,async page=>{
  const p=await page.evaluate(()=>ConsoleResponse.exportPlan().plan);assert.equal(p.slug,slug);assert.equal(p.diagnostics.filter(x=>x.metricId).length,10);
  console.log('COVERAGE public tools '+JSON.stringify({slug,supportedDimensions:p.diagnostics.filter(x=>x.status!=='unknown').map(x=>x.metricId),items:p.impacts.items.length,availableItems:p.impacts.items.filter(x=>x.status==='available').length,records:p.impacts.records.length,availableRecords:p.impacts.records.filter(x=>x.status==='available').length}));
  assert.ok(p.impacts.items.length>0);assert.ok(p.impacts.records.some(x=>x.status==='available'),slug+' needs a valid public/scenario record');
  if(slug!=='va-strain')assert.ok(p.impacts.items.some(x=>x.status==='available'),slug+' needs applicable public reference context');
  for(const row of [...p.impacts.items,...p.impacts.records].filter(x=>x.status==='available')){assert.ok(row.sources.every(s=>s.source?.startsWith('https://')&&s.measuredAt));if(typeof row.value==='number')assert.ok(Number.isFinite(row.value)&&row.unit);}
  assert.ok(p.impacts.items.every(x=>x.kind!=='forecast'),'No future forecast is supplied by these reference records');
  if(['medical-cost-abroad','medical-debt-assistant','human-trafficking','prescription-savings'].includes(slug))assert.ok(p.diagnostics.every(x=>x.status==='unknown'));
  if(slug==='usaid-consequence')assert.equal(metric(p,5).status,'triggered','Actual supported fiscal-period review must survive shared evidence validation');
  await page.locator('#cr-open-impacts').click();assert.equal(await page.locator('[data-cr-metric]').count(),10);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#console-response').evaluate(e=>e.scrollWidth<=e.clientWidth),true,'response panel fits mobile');
 });
 let mode='valid';
 const raw=()=>({agency_data_by_year:[{fiscal_year:2027,agency_total_obligated:null,agency_budgetary_resources:null,agency_total_outlayed:null,agency_obligation_by_period:[]},...agency.publicFinance.records.map(x=>({fiscal_year:x.fy,agency_total_obligated:0,agency_budgetary_resources:0,agency_total_outlayed:0,agency_obligation_by_period:[{period:x.lastPeriod,obligated:0}]}))]});
 const route=async r=>{const url=r.request().url();if(url.includes('/agency/072/budgetary_resources/')){const body=raw();if(mode==='empty')body.agency_data_by_year=[];if(mode==='duplicate')body.agency_data_by_year.push(body.agency_data_by_year[1]);if(mode==='older')body.agency_data_by_year.at(-1).agency_obligation_by_period[0].period=10;if(mode==='missing')body.agency_data_by_year.at(-1).agency_budgetary_resources=null;await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});}else if(url.includes('/references/toptier_agencies/'))await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({results:[{abbreviation:'USAID',active_fy:'2026',active_fq:'4',obligated_amount:0,budget_authority_amount:0,outlay_amount:0}]})});else await r.abort();};
 await pageCase('USAID actual refresh excludes future placeholders, preserves zero and rejects lost fiscal coverage','usaid-consequence',route,async page=>{
  await page.waitForFunction(()=>feedStatus.USAspending==='live');await page.evaluate(()=>ConsoleResponse.set(toolsRead()));
  const good=await page.evaluate(()=>JSON.stringify({records:budgetPublicRecords,status:budgetPublicStatus,country:DATA.countries,vintage:DATA.vintage}));let p=await page.evaluate(()=>ConsoleResponse.exportPlan().plan);
  assert.equal(p.impacts.items.length,3);assert.ok(p.impacts.items.every(x=>x.value===0&&x.status==='available'&&x.kind==='context'));
  assert.equal(await page.evaluate(()=>budgetPublicRecords.length),8);assert.equal(await page.evaluate(()=>document.getElementById('fundchart').innerHTML.includes('NaN')),false);
  for(const failure of ['empty','duplicate','older','missing']){mode=failure;await page.evaluate(()=>refreshAgencyOnce());assert.equal(await page.evaluate(()=>feedStatus.USAspending),'unavailable');assert.equal(await page.evaluate(()=>JSON.stringify({records:budgetPublicRecords,status:budgetPublicStatus,country:DATA.countries,vintage:DATA.vintage})),good);}
 });
 console.log('PASS '+count+' public-tools impact regression groups');
}finally{await browser.close();}
