// Offline native Coastal regressions: actual maintained HTML, no generated response panel.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const root=new URL('../',import.meta.url),now=Date.parse('2026-10-23T16:00:00Z');
const browser=await chromium.launch({headless:true,channel:process.env.CHROME_CHANNEL||undefined});
let passed=0;
async function scenario(slug,options,verify){
 const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:true});
 const html=await readFile(new URL('consoles/coastal-water-resilience/index.html',root),'utf8'),origin='https://coastal-fixture.invalid/';
 const errors=[];
 try{
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url()),json=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   if(u.href===origin)return route.fulfill({contentType:'text/html',body:html});
   if(options.contextFixtures&&u.hostname==='ornl.opendatasoft.com')return json({results:[]});
   if(options.contextFixtures&&u.pathname.includes('/HAB_Current_Web_Layer/'))return json({features:[{attributes:{SampleDate_t:'2026-10-22',LOCATION:'Offline public sample',Abundance:'Not Present'},geometry:{x:-82.64,y:27.77}}]});
   if(options.ofs&&u.hostname==='api.tidesandcurrents.noaa.gov'&&u.searchParams.get('product')==='ofs_water_level')return json({data:[{t:'2026-10-23 18:00',v:'7.5'},{t:'2026-10-24 02:00',v:'8.25'}]});
   if(u.hostname==='api.weather.gov'&&u.pathname.includes('/alerts/active'))return json({features:[]});
   if(u.pathname.endsWith('.js')||u.pathname.endsWith('.css'))return route.fulfill({status:503,body:'fixture CDN blocked'});
   return json({features:[],data:[],results:[]});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date(now)});await page.goto(origin,{waitUntil:'load'});
  await page.waitForFunction(()=>window.CWR);await verify(page);assert.deepEqual(errors,[],'native Coastal runtime errors');console.log('PASS Coastal native: '+JSON.stringify(options));passed++;
 }finally{await context.close();}
}
try{
 await scenario('coastal-water-resilience',{},async page=>{
  await page.evaluate(()=>CWR.setPage('plan'));assert.equal(await page.locator('#console-response').count(),0);
  const zone=await page.evaluate(()=>CWR.exportPlan().zoneModel);assert.deepEqual(zone.counts,{A:72,B:10,C:2,D:4,E:4,M:1,unassigned:37});assert.equal(zone.officialAddressLookup,'https://pinellas.gov/services/find-your-evacuation-zone');
  await page.evaluate(()=>{CWR.setPage('monitor');document.querySelector('#stn-pick').value='LS-098';document.querySelector('#stn-pick').dispatchEvent(new Event('change'));});assert.match(await page.locator('#stn-detail').textContent(),/Not assigned in public synthetic model/);assert.equal(await page.locator('#stn-detail a').getAttribute('href'),zone.officialAddressLookup);await page.evaluate(()=>CWR.setPage('plan'));
  assert.equal(await page.locator('#cwr-public-track').getAttribute('aria-pressed'),'true');
  await page.locator('#cwr-operator-track').click();assert.match(await page.locator('#check').textContent(),/Operator SOP review/);
  const checks=page.locator('#check input[type=checkbox]');assert.ok(await checks.count()>0);await checks.first().check();assert.ok((await page.evaluate(()=>CWR.exportPlan().acknowledgments)).length);
  await page.evaluate(()=>CWR.setSurge(8,true));assert.deepEqual(await page.evaluate(()=>CWR.exportPlan().acknowledgments),[]);assert.match(await page.locator('#cwr-plan-revision').textContent(),/reset/);
  const metric=await page.evaluate(()=>{const saved=stations.map(s=>s.elev);stations.forEach(s=>s.elev=-100);const values=CWR.tenMetrics();stations.forEach((s,i)=>s.elev=saved[i]);return values.find(r=>r.n===2);});assert.equal(metric.bad,null);
  const download=page.waitForEvent('download');await page.locator('#cwr-export-plan').click();assert.equal((await download).suggestedFilename(),'coastal-response-plan.json');
 });

 await scenario('coastal-water-resilience',{publicInventory:true},async page=>{
  await page.evaluate(()=>CWR.setPage('inventory'));
  assert.match(await page.locator('#public-inventory-summary').textContent(),/^82 stations/);
  assert.equal(await page.locator('#public-station-pick option').count(),82);
  await page.locator('#public-ownership').selectOption('all');assert.equal(await page.locator('#public-station-pick option').count(),131);
  const inventory=await page.evaluate(()=>({n:CWR.publicInventory.stations.length,unknown:CWR.publicInventory.stations.filter(s=>s.officialZone==null).length,zero:CWR.publicInventory.stations.filter(s=>s.groundElevationFt===0).length}));assert.equal(inventory.n,131);assert.equal(inventory.unknown,28);
  const unknownId=await page.evaluate(()=>CWR.publicInventory.stations.find(s=>s.officialZone==null).id);await page.locator('#public-station-pick').selectOption(unknownId);
  assert.match(await page.locator('#public-station-detail').textContent(),/does not mean non-evacuation/);assert.match(await page.locator('#public-station-detail').textContent(),/no connections inferred/);
  await page.clock.setSystemTime(new Date('2026-11-24T16:00:00Z'));await page.evaluate(()=>CWR.renderPublicInventory());assert.match(await page.locator('#public-inventory-summary').textContent(),/AGING PUBLIC SNAPSHOT/);await page.clock.setSystemTime(new Date(now));
  await page.evaluate(()=>CWR.setPage('plan'));await page.locator('#plan-data-scope').selectOption('city');
  const plan=await page.evaluate(()=>CWR.exportPlan());assert.equal(plan.dataset,'city');assert.equal(plan.metrics.length,10);for(const id of [1,7,10])assert.equal(plan.metrics.find(m=>m.metricId===id).status,'unknown');assert.equal(await page.locator('[data-cwr-metric]').count(),10);
  await page.locator('#cwr-ten-register summary').click();assert.match(await page.locator('[data-cwr-metric="7"]').textContent(),/verified station flow edges/);
  await page.locator('#check input[type=checkbox]').first().check();await page.locator('#plan-data-scope').selectOption('all');assert.deepEqual(await page.evaluate(()=>CWR.exportPlan().acknowledgments),[]);
 });
 await scenario('coastal-water-resilience',{impact:true},async page=>{
  await page.evaluate(()=>{CWR.setPage('impact');CWR.setSurge(6,true);});await page.locator('#impact-scope').selectOption('city');
  let result=await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()));assert.equal(result.assetsInScope,82);assert.equal(result.planeFtNAVD88,4.52);assert.equal(result.terrainKnown,82);assert.equal(result.population,null);assert.equal(result.hypotheticalLocalUSD,null);assert.equal(result.upstreamCount,null);
  await page.locator('#impact-scope').selectOption('all');result=await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()));assert.equal(result.assetsInScope,131);
  const initial=result.directCount;await page.evaluate(()=>CWR.setSurge(12,true));const higher=await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()));assert.ok(higher.directCount>initial);
  const invalidCounts=await page.evaluate(()=>[10000,1.5].map(n=>CWR.computeProjectedImpact({...CWR.impactOptions(),scenario:'power',affectedCount:n}).directCount));assert.deepEqual(invalidCounts,[null,null]);
  const missing=await page.evaluate(()=>{const saved=CWR.publicInventory.stations.map(s=>s.groundElevationFt);try{CWR.publicInventory.stations.forEach((s,i)=>s.groundElevationFt=i===0?0:i===1?null:100);return CWR.computeProjectedImpact(CWR.impactOptions());}finally{CWR.publicInventory.stations.forEach((s,i)=>s.groundElevationFt=saved[i]);}});assert.equal(missing.terrainKnown,130);assert.equal(missing.terrainUnknown,1);assert.equal(missing.directCount,1);
  const wrongDatum=await page.evaluate(()=>{const s=CWR.publicInventory.stations[0],old=s.elevationVerticalDatum;try{s.elevationVerticalDatum='NGVD29';return CWR.computeProjectedImpact(CWR.impactOptions());}finally{s.elevationVerticalDatum=old;}});assert.equal(wrongDatum.terrainKnown,130);assert.equal(wrongDatum.terrainUnknown,1);
  await page.locator('#impact-example').click();result=await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()));assert.equal(result.population,result.directCount*2000);assert.deepEqual(result.grossRepairUSD,[result.directCount*100000,result.directCount*500000]);assert.equal(result.hypotheticalLocalUSD,null);assert.match(await page.locator('#projected-impact').textContent(),/if every screened\/assumed asset needed repair/);assert.match(await page.locator('#projected-impact').textContent(),/overlap/);
  await page.locator('#impact-duration').fill('48');const duration=await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()));assert.equal(duration.wastewaterGallons[0],result.wastewaterGallons[0]*2);
  await page.locator('#impact-scenario').selectOption('power');assert.match(await page.locator('#projected-impact').textContent(),/Not applicable \/ not assessed/);assert.equal(await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()).directCount),null);
  await page.locator('#impact-affected-count').fill('3');result=await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()));assert.equal(result.directCount,3);assert.equal(result.population,6000);
  await page.locator('#impact-eligible').locator('xpath=ancestor::details').locator('summary').click();await page.locator('#impact-eligible').fill('50');await page.locator('#impact-share').fill('75');result=await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()));assert.equal(result.hypotheticalLocalUSD[0],187500);
  const download=page.waitForEvent('download');await page.locator('#impact-export').click();assert.equal((await download).suggestedFilename(),'coastal-impact-scenario.json');
  if(process.env.CAPTURE_QA){await mkdir(new URL('../keyless-audit/',root),{recursive:true});await page.screenshot({path:new URL('../keyless-audit/coastal-impact.png',root).pathname,fullPage:true});}
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile impact overflow');assert.ok((await page.locator('#impact-duration').boundingBox()).width>250);assert.ok((await page.locator('#impact-example').boundingBox()).height>=44);
  if(process.env.CAPTURE_QA){await mkdir(new URL('../keyless-audit/',root),{recursive:true});await page.screenshot({path:new URL('../keyless-audit/coastal-impact-mobile.png',root).pathname,fullPage:true});}
  await page.locator('#impact-clear').click();assert.equal(await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()).population),null);
  await page.locator('#impact-scenario').selectOption('surge');await page.locator('#impact-water-source').selectOption('ofs');assert.equal(await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()).directCount),null);assert.match(await page.locator('#projected-impact').textContent(),/forecast is unavailable or stale/);
 });
 await scenario('coastal-water-resilience',{ofs:true,contextFixtures:true},async page=>{
  await page.waitForFunction(()=>CWR.FEEDS.ofs.state==='live');await page.evaluate(()=>CWR.setPage('impact'));await page.locator('#impact-scope').selectOption('all');await page.locator('#impact-water-source').selectOption('ofs');
  const result=await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()));assert.equal(result.levelFtMLLW,8.25);assert.equal(result.planeFtNAVD88,6.77);assert.equal(result.forecastValidAt,'2026-10-24T02:00:00.000Z');
  await page.clock.setSystemTime(new Date('2026-10-24T03:00:00Z'));assert.equal(await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()).directCount),null);await page.clock.setSystemTime(new Date(now));
  await page.evaluate(()=>CWR.setPage('context'));await page.evaluate(()=>CWR.loadContext('red-tide'));assert.match(await page.locator('#context-result').textContent(),/Offline public sample/);assert.equal(await page.locator('#context-map circle').count(),1);
  await page.route('**/HAB_Current_Web_Layer/**',route=>route.fulfill({status:503,body:'fixture failed retry'}));await page.evaluate(()=>CWR.loadContext('red-tide'));assert.match(await page.locator('#context-result').textContent(),/last successful retrieval/);assert.equal(await page.locator('#context-map circle').count(),1);await page.unroute('**/HAB_Current_Web_Layer/**');await page.evaluate(()=>CWR.loadContext('red-tide'));assert.doesNotMatch(await page.locator('#context-status').textContent(),/HTTP 503/);
  await page.evaluate(()=>CWR.loadContext('power'));assert.match(await page.locator('#context-status').textContent(),/unavailable, not zero outages/);
  await page.evaluate(()=>CWR.loadContext('beach-sites'));assert.match(await page.locator('#context-status').textContent(),/No key is requested/);
 });
 console.log('PASS '+passed+' native Coastal browser scenarios');
}finally{await browser.close();}
