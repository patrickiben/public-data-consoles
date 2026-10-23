import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const root=new URL('../',import.meta.url),wb=['global-air-pollution','global-demographic-transition','global-health-atlas','global-health-systems','global-hiv-tb-malaria','global-immunization','global-maternal-child-health','global-mental-health','global-ncd-burden','global-nutrition','global-road-safety','global-wash'];
const slugs=[...wb,'antimicrobial-resistance','global-cancer','global-ntds','global-outbreak-tracker','us-respiratory-surveillance','us-overdose-surveillance','nhs-scotland-strain'];
const sources=Object.fromEntries(await Promise.all(['response-plans/core.js','response-plans/domain-helpers.js','response-plans/observed-series.js','response-plans/style.css','public-data-runtime/worldbank.js'].map(async path=>[path,await readFile(new URL(path,root),'utf8')])));
const captures=await Promise.all(['consoles/global-health-atlas/data/population-area.json','consoles/us-respiratory-surveillance/data/cdc-context.json','consoles/us-overdose-surveillance/data/cdc-context.json','consoles/nhs-scotland-strain/data/latest.json'].map(async p=>Date.parse(JSON.parse(await readFile(new URL(p,root),'utf8')).capturedAt)));
const now=Math.max(Date.now(),...captures)+3600000,browser=await chromium.launch({headless:true,...(process.env.CHROME_CHANNEL?{channel:process.env.CHROME_CHANNEL}:{})});let passed=0;const coverage=[];
try{for(const slug of slugs){
 const context=await browser.newContext({serviceWorkers:'block'}),origin='https://health-impacts.invalid/'+slug+'/',adapter=await readFile(new URL('response-plans/adapters/'+slug+'.js',root),'utf8');let html=await readFile(new URL('consoles/'+slug+'/index.html',root),'utf8');
 // No production generated block is edited: tests exercise current canonical sources.
 const head='<style>'+sources['response-plans/style.css']+'</style><script>'+sources['response-plans/core.js']+'\n'+sources['response-plans/domain-helpers.js']+'\n'+sources['response-plans/observed-series.js']+'</script>';
 html=html.replace(/<!-- CONSOLE_RESPONSE_HEAD_START -->[\s\S]*?<!-- CONSOLE_RESPONSE_HEAD_END -->/,()=>head).replace(/<!-- CONSOLE_RESPONSE_ADAPTER_START -->[\s\S]*?<!-- CONSOLE_RESPONSE_ADAPTER_END -->/,()=>'<script>'+adapter+'</script>');
 if(wb.includes(slug))html=html.replace(/<!-- WORLD_BANK_PUBLIC_RUNTIME_START -->[\s\S]*?<!-- WORLD_BANK_PUBLIC_RUNTIME_END -->/,()=>'<script>'+sources['public-data-runtime/worldbank.js']+'</script>');
 const errors=[];
 try{await context.route('**/*',route=>route.request().url()===origin?route.fulfill({contentType:'text/html',body:html}):route.fulfill({status:503,body:'Offline fixture retains public snapshots'}));const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date(now)});await page.goto(origin);
  await page.waitForFunction(()=>window.ConsoleResponse?.exportPlan().plan.impacts?.items?.length>0);
  if(wb.includes(slug))await page.waitForFunction(()=>!!SNAP.responseAnnualContext);
  const read=()=>page.evaluate(()=>ConsoleResponse.exportPlan().plan);let plan=await read();
  assert.ok(plan.impacts.records.length>0,slug+' public records');assert.ok(plan.impacts.limitations.length>0);assert.equal(plan.diagnostics.length,10);
  for(const row of [...plan.impacts.items,...plan.impacts.records]){if(row.status==='available'){assert.ok(row.sources.length);assert.ok(row.sources.every(s=>s.source&&s.measuredAt));assert.equal(row.kind,'context');}}
  assert.ok(plan.impacts.items.some(row=>row.status==='available'),slug+' must preserve supported source quantities');
  coverage.push({slug,assessedDimensions:plan.diagnostics.filter(d=>d.status!=='unknown').map(d=>d.metricId),beforeImpactRows:0,availableItems:plan.impacts.items.filter(r=>r.status==='available').length,unknownItems:plan.impacts.items.filter(r=>r.status==='unknown').length,availableRecords:plan.impacts.records.filter(r=>r.status==='available').length,unknownRecords:plan.impacts.records.filter(r=>r.status==='unknown').length,items:plan.impacts.items.map(r=>({id:r.id,value:r.value,unit:r.unit,status:r.status,periods:r.sources.map(s=>s.measuredAt)}))});
  if(wb.includes(slug)){
   const expected=await page.evaluate(()=>WorldBankPublicData.countryImpacts(SNAP,document.querySelector('#cysel').value));
   for(const value of expected.impacts.items){const row=plan.impacts.items.find(r=>r.id===value.id);assert.equal(row.value,value.value);}
   const options=await page.locator('#cysel option').evaluateAll(o=>o.map(x=>x.value));if(options.length>1){await page.locator('#cysel').selectOption(options[1]);await page.waitForFunction(()=>ConsoleResponse.exportPlan().plan.impacts.scope.includes(SNAP.cty[document.querySelector('#cysel').value].name));}
   if(slug==='global-wash'){await page.evaluate(()=>{const code=document.querySelector('#cysel').value;for(const year of Object.keys(SNAP.responseAnnualContext.countries[code].population))SNAP.responseAnnualContext.countries[code].population[year]=null;document.querySelector('#cysel').dispatchEvent(new Event('change'));});await page.waitForFunction(()=>ConsoleResponse.exportPlan().plan.impacts.items.find(r=>r.id==='quantity-smss').status==='unknown');}
   if(slug==='global-air-pollution'){const row=(await read()).impacts.items.find(r=>r.id==='quantity-airmort');assert.match(row.note,/age.standardized/i);assert.match(row.method,/no count conversion/);}
   if(slug==='global-immunization')assert.ok((await read()).impacts.items.every(r=>!/people|children$/.test(r.unit)),'child-cohort percentages are not resident counts');
   if(slug==='global-ncd-burden')assert.match((await read()).impacts.items.find(r=>r.id==='quantity-ncd').note,/not an annual/);
  }
  if(slug==='us-respiratory-surveillance'){
   const expected=await page.evaluate(()=>{const key=GLSEL,w=SNAP.wval_nat[key].at(-1)[0];return SNAP.wval_site_counts[key][w];});assert.equal(plan.impacts.items.find(r=>r.id==='wastewater-sites').value,expected);
   const state=await page.evaluate(()=>{const state=Object.keys(SNAP.wval_state_series)[0];SNAP.wval_state_series[state][GLSEL]=[];document.querySelector('#srcchip').textContent+=' · fixture missing exact week';return state;});await page.waitForFunction(state=>ConsoleResponse.exportPlan().plan.impacts.records.find(r=>r.id===state).status==='unknown',state);
   assert.equal((await read()).impacts.items.find(r=>r.id==='health-loss-forecast').status,'unknown');
  }
  if(slug==='us-overdose-surveillance'){
   assert.equal(plan.impacts.items.find(r=>r.id==='predicted-burden').value,await page.evaluate(()=>{const key=document.querySelector('#response-public-focus').value;return SNAP.nat[key].filter(Number.isFinite).at(-1);}));
   const code=await page.evaluate(()=>{const code=Object.keys(SNAP.states)[0],key=document.querySelector('#response-public-focus').value;SNAP.stateMonthly[code][key]=[];document.querySelector('#srcchip').textContent+=' · fixture missing national ending month';return code;});await page.waitForFunction(code=>ConsoleResponse.exportPlan().plan.impacts.records.find(r=>r.id===code).status==='unknown',code);assert.equal((await read()).impacts.items.find(r=>r.id==='future-deaths').status,'unknown');
  }
  if(slug==='nhs-scotland-strain'){
   const attendanceURL=await page.evaluate(()=>SNAP.sources.find(s=>s.id==='ae').url);assert.ok(plan.evidence.filter(e=>e.id.startsWith('impact-ae-')||e.id.startsWith('impact-site-')).every(e=>e.source===attendanceURL),'attendance counts must cite the attendance data, not the site directory');
   const expected=await page.evaluate(()=>({att:SNAP.sites.reduce((s,r)=>s+r.att,0),o8:SNAP.sites.reduce((s,r)=>s+r.o8,0),o12:SNAP.sites.reduce((s,r)=>s+r.o12,0),delay:SNAP.delayed.reduce((s,r)=>s+r.n,0),outside:SNAP.careUse.outsideBoardStays}));
   for(const key of ['att','o8','o12'])assert.equal(plan.impacts.items.find(r=>r.id==='impact-ae-'+key).value,expected[key]);assert.equal(plan.impacts.items.find(r=>r.id==='delayed-census').value,expected.delay);assert.equal(plan.impacts.items.find(r=>r.id==='care-outside-count').value,expected.outside);
   await page.evaluate(()=>{SNAP.sites[0].o8=null;document.querySelector('#eds').textContent+=' · missing published count';});await page.waitForFunction(()=>ConsoleResponse.exportPlan().plan.impacts.items.find(r=>r.id==='impact-ae-o8').status==='unknown');assert.equal((await read()).impacts.items.find(r=>r.id==='impact-ae-att').status,'available');
  }
  if(slug==='global-cancer'){assert.equal(plan.impacts.items.find(r=>r.id==='new-cases').value,await page.evaluate(()=>INC[0][1]));assert.equal(plan.impacts.items.find(r=>r.id==='benefit').status,'unknown');}
  if(slug==='global-ntds'){assert.equal(plan.impacts.items.find(r=>r.id==='interventions').value,1400000000);assert.equal(plan.impacts.items.find(r=>r.id==='disease-projection').status,'unknown');assert.equal(plan.impacts.records[0].status,'unknown');}
  if(slug==='antimicrobial-resistance'){assert.equal(plan.impacts.items.find(r=>r.id==='published-2050-reference').kind,'context');assert.equal(plan.impacts.items.find(r=>r.id==='global-attributable').value,1270000);}
  if(slug==='global-outbreak-tracker'){
   for(const record of plan.impacts.records){const date=await page.evaluate(id=>SNAP.mpox.countries.find(c=>'mpox-'+c.iso===id).asof,record.id);assert.ok(record.sources.every(s=>s.measuredAt===date));}
   const id=await page.evaluate(()=>{const c=SNAP.mpox.countries[0];c.asof='2099-01-01';document.querySelector('#mpCases').textContent+=' · invalid future date';return 'mpox-'+c.iso;});await page.waitForFunction(id=>ConsoleResponse.exportPlan().plan.impacts.records.find(r=>r.id===id).status==='unknown',id);
  }
  if(['us-respiratory-surveillance','us-overdose-surveillance'].includes(slug)){await page.clock.setSystemTime(new Date(now+400*86400000));await page.evaluate(()=>{document.querySelector('#srcchip').textContent+=' · fixture stale source dates';});await page.waitForFunction(()=>ConsoleResponse.exportPlan().plan.impacts.items.every(r=>r.status==='unknown'));}
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),slug+' mobile overflow');
  await page.locator('#console-response-shortcut').click();await page.locator('[data-cr-section="impacts"] summary').click();assert.ok(await page.locator('[data-cr-section="impacts"]').isVisible());
  if(process.env.HEALTH_IMPACT_QA&&['global-wash','nhs-scotland-strain'].includes(slug)){await mkdir(process.env.HEALTH_IMPACT_QA,{recursive:true});await page.screenshot({path:process.env.HEALTH_IMPACT_QA+'/'+slug+'-impacts-mobile.png',fullPage:true});}
  assert.deepEqual(errors,[],slug+' runtime errors');console.log('PASS health public impacts: '+slug);passed++;
 }finally{await context.close();}
}if(process.env.HEALTH_IMPACT_QA){await mkdir(process.env.HEALTH_IMPACT_QA,{recursive:true});await writeFile(process.env.HEALTH_IMPACT_QA+'/coverage.json',JSON.stringify(coverage,null,2)+'\n');}console.log(passed+' health impact entrypoints passed');}finally{await browser.close();}
