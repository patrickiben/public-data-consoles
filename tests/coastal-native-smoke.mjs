// Offline native Coastal regressions: actual maintained HTML, no generated response panel.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const root=new URL('../',import.meta.url),now=Date.parse('2026-10-23T16:00:00Z');
const browser=await chromium.launch({headless:true,channel:process.env.CHROME_CHANNEL||undefined});
let passed=0;
async function scenario(slug,options,verify){
 const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:true});
 let html=await readFile(new URL('consoles/coastal-water-resilience/index.html',root),'utf8'),origin=options.file?new URL('consoles/coastal-water-resilience/index.html',root).href:'https://coastal-fixture.invalid/';
 const errors=[];
 if(options.automatic){
  const match=html.match(/<script type="application\/json" id="public-station-snapshot">([\s\S]*?)<\/script>/),inventory=JSON.parse(match[1]);let index=0;
  inventory.stations.forEach(st=>{st.groundElevationFt=100;if(st.isCityOwned&&index<3){st.groundElevationFt=0;st.basin=['FIXTURE-A','FIXTURE-B','FIXTURE-A'][index++];}});
  const fixture={schemaVersion:1,capturedAt:'2026-10-23T15:00:00Z',populationMethod:'Fixture source-defined basin internal-point assignment',sources:[{id:'census',title:'Offline2020Census fixture',url:'https://fixture.invalid/census',referencePeriod:'2020'},{id:'flow',title:'Offline2025throughput fixture',url:'https://fixture.invalid/flow',referencePeriod:'2024-10-01 / 2025-09-30'}],areas:[{id:'FIXTURE-A',blockIds:['one','shared'],sourceIds:['census']},{id:'FIXTURE-B',blockIds:['shared','two'],sourceIds:['census']}],populationBlocks:[{id:'one',population:100,referenceYear:2020,sourceIds:['census']},{id:'shared',population:50,referenceYear:2020,sourceIds:['census']},{id:'two',population:200,referenceYear:2020,sourceIds:['census']}],flowAggregates:[{id:'plant-one',label:'Fixture plant1',averageDailyFlowMGD:10,period:{start:'2024-10-01',end:'2025-09-30'},areaIds:[],sourceIds:['flow']},{id:'plant-two',label:'Fixture plant2',averageDailyFlowMGD:20,period:{start:'2024-10-01',end:'2025-09-30'},areaIds:[],sourceIds:['flow']}],limitations:[]};
  fixture.sources.forEach(source=>{source.retrievedAt='2026-10-23T15:00:00Z';source.sha256='a'.repeat(64);});
  html=html.replace(/(<script type="application\/json" id="public-station-snapshot">)[\s\S]*?(<\/script>)/,(_,a,b)=>a+JSON.stringify(inventory)+b).replace(/(<script type="application\/json" id="coastal-impact-context">)[\s\S]*?(<\/script>)/,(_,a,b)=>a+JSON.stringify(fixture)+b);
 }

 try{
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url()),json=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   if(u.href===origin)return route.fulfill({contentType:'text/html',body:html});
   if(u.hostname==='tile.openstreetmap.org')return options.mapTiles?route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5f8AAAAASUVORK5CYII=','base64')}):route.abort();
   if(u.pathname.endsWith('/data/impact-context.json'))return route.fulfill({status:404,body:'fixture published update not present'});
   if(options.contextFixtures&&u.hostname==='ornl.opendatasoft.com')return json({results:[]});
   if(options.contextFixtures&&u.pathname.includes('/HAB_Current_Web_Layer/'))return json({features:[{attributes:{SampleDate_t:'2026-10-22',LOCATION:'Offline public sample',Abundance:'Not Present'},geometry:{x:-82.64,y:27.77}}]});
   if((options.ofs||options.advancing)&&u.hostname==='api.tidesandcurrents.noaa.gov'&&u.searchParams.get('product')==='ofs_water_level')return json({data:options.advancing?[{t:'2026-10-23 17:00',v:'10'},{t:'2026-10-24 02:00',v:'8.25'},{t:'2026-10-24 04:00',v:'7'}]:[{t:'2026-10-23 18:00',v:'7.5'},{t:'2026-10-24 02:00',v:'8.25'}]});
   if(u.hostname==='api.weather.gov'&&u.pathname.includes('/alerts/active'))return json({features:[]});
   if(u.pathname.endsWith('.js')||u.pathname.endsWith('.css'))return route.fulfill({status:503,body:'fixture CDN blocked'});
   return json({features:[],data:[],results:[]});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date(now)});await page.goto(origin,{waitUntil:'load'});
  await page.waitForFunction(()=>window.CWR);await verify(page);assert.deepEqual(errors,[],'native Coastal runtime errors');console.log('PASS Coastal native: '+JSON.stringify(options));passed++;
 }finally{await context.close();}
}
try{
 await scenario('coastal-water-resilience',{publicMap:true},async page=>{
  assert.equal(await page.evaluate(()=>location.hash),'#inventory');assert.equal(await page.locator('#plan-data-scope').inputValue(),'city');
  assert.ok(await page.locator('#public-coastline path').count()>0);assert.equal(await page.locator('#public-station-map circle').count(),82);
  await page.waitForFunction(()=>document.querySelector('#public-map-status').textContent.includes('unavailable'));
  assert.equal(await page.locator('#public-station-map image').count(),0,'failed map images removed, coastline retained');
  assert.ok(await page.locator('#public-coastline path').count()>0);
  const point=page.locator('#public-station-map circle').nth(10),id=await point.getAttribute('data-city-id');await point.press('Enter');assert.equal(await page.locator('#public-station-pick').inputValue(),id);
  await page.locator('#public-map-in').click();const center=await page.locator('#public-station-map circle').last().evaluate(el=>[Number(el.getAttribute('cx')),Number(el.getAttribute('cy'))]);assert.deepEqual(center,[360,260]);assert.equal(await page.locator('#public-station-map circle').evaluateAll(points=>points.filter(p=>p.getAttribute('tabindex')==='0').every(p=>+p.getAttribute('cx')>=0&&+p.getAttribute('cx')<=720&&+p.getAttribute('cy')>=0&&+p.getAttribute('cy')<=520)),true);
  await page.locator('#public-map-reset').click();assert.equal(await page.locator('#public-map-out').isDisabled(),true);
  await page.locator('#public-station-search').fill('no-such-station');assert.equal(await page.locator('#public-station-map circle').count(),0);await page.locator('#public-station-search').fill('');
  await page.locator('#tab-monitor').click();assert.equal(await page.locator('#c-net').isVisible(),false);await page.locator('#tab-exercise').click();assert.equal(await page.locator('#c-net').isVisible(),true);assert.match(await page.locator('#c-net').textContent(),/synthetic, no real locations/);
  await page.locator('#tab-inventory').click();await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(process.env.DIMENSION_QA){await page.locator('#public-station-map').screenshot({path:process.env.DIMENSION_QA+'/coastal-offline-map.png'});}
 });
 await scenario('coastal-water-resilience',{mapTiles:true},async page=>{
  await page.waitForFunction(()=>document.querySelector('#public-map-status').textContent.includes('Street map loaded'));
  assert.equal(await page.locator('#public-map-place-labels').isVisible(),false);assert.ok(await page.locator('#public-station-map image').count()>0);const urls=await page.locator('#public-station-map image').evaluateAll(images=>images.map(img=>img.getAttribute('href')));assert.ok(urls.every(url=>/^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(url)));
  const expected=JSON.parse(await readFile(new URL('consoles/coastal-water-resilience/data/basemap-land.json',root),'utf8'));assert.deepEqual(await page.locator('#coastal-basemap-land').evaluate(el=>JSON.parse(el.textContent)),expected);
 });
 await scenario('coastal-water-resilience',{file:true},async page=>{assert.equal(await page.locator('#public-station-map image').count(),0);assert.ok(await page.locator('#public-coastline path').count()>0);assert.match(await page.locator('#public-map-status').textContent(),/Embedded regional coastline/);});
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
  await page.evaluate(()=>{CWR.setPage('impact');CWR.setSurge(6,true);});await page.locator('#impact-mode').selectOption('manual');await page.locator('#impact-water-source').selectOption('selected');await page.locator('#impact-scope').selectOption('city');
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
  await page.locator('#impact-eligible').locator('xpath=ancestor::details[1]').locator('summary').click();await page.locator('#impact-eligible').fill('50');await page.locator('#impact-share').fill('75');result=await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()));assert.equal(result.hypotheticalLocalUSD[0],187500);
  const download=page.waitForEvent('download');await page.locator('#impact-export').click();assert.equal((await download).suggestedFilename(),'coastal-impact-scenario.json');
  if(process.env.CAPTURE_QA){await mkdir(new URL('../keyless-audit/',root),{recursive:true});await page.screenshot({path:new URL('../keyless-audit/coastal-impact.png',root).pathname,fullPage:true});}
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile impact overflow');assert.ok((await page.locator('#impact-duration').boundingBox()).width>250);assert.ok((await page.locator('#impact-example').boundingBox()).height>=44);
  if(process.env.CAPTURE_QA){await mkdir(new URL('../keyless-audit/',root),{recursive:true});await page.screenshot({path:new URL('../keyless-audit/coastal-impact-mobile.png',root).pathname,fullPage:true});}
  await page.locator('#impact-clear').click();assert.equal(await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()).population),null);
  await page.locator('#impact-scenario').selectOption('surge');await page.locator('#impact-water-source').selectOption('ofs');assert.equal(await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()).directCount),null);assert.match(await page.locator('#projected-impact').textContent(),/forecast is unavailable or stale/);
 });
 await scenario('coastal-water-resilience',{ofs:true,contextFixtures:true},async page=>{
  await page.waitForFunction(()=>CWR.FEEDS.ofs.state==='live');await page.evaluate(()=>CWR.setPage('impact'));await page.locator('#impact-mode').selectOption('manual');await page.locator('#impact-water-source').selectOption('selected');await page.locator('#impact-scope').selectOption('all');await page.locator('#impact-water-source').selectOption('ofs');
  const result=await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()));assert.equal(result.levelFtMLLW,8.25);assert.equal(result.planeFtNAVD88,6.77);assert.equal(result.forecastValidAt,'2026-10-24T02:00:00.000Z');
  await page.clock.setSystemTime(new Date('2026-10-24T03:00:00Z'));assert.equal(await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()).directCount),null);await page.clock.setSystemTime(new Date(now));
  await page.evaluate(()=>CWR.setPage('context'));await page.evaluate(()=>CWR.loadContext('red-tide'));assert.match(await page.locator('#context-result').textContent(),/Offline public sample/);assert.equal(await page.locator('#context-map circle').count(),1);
  await page.route('**/HAB_Current_Web_Layer/**',route=>route.fulfill({status:503,body:'fixture failed retry'}));await page.evaluate(()=>CWR.loadContext('red-tide'));assert.match(await page.locator('#context-result').textContent(),/last successful retrieval/);assert.equal(await page.locator('#context-map circle').count(),1);await page.unroute('**/HAB_Current_Web_Layer/**');await page.evaluate(()=>CWR.loadContext('red-tide'));assert.doesNotMatch(await page.locator('#context-status').textContent(),/HTTP 503/);
  await page.evaluate(()=>CWR.loadContext('power'));assert.match(await page.locator('#context-status').textContent(),/unavailable, not zero outages/);
  await page.evaluate(()=>CWR.loadContext('beach-sites'));assert.match(await page.locator('#context-status').textContent(),/No key is requested/);
 });

 await scenario('coastal-water-resilience',{automatic:true,ofs:true},async page=>{
  await page.waitForFunction(()=>CWR.FEEDS.ofs.state==='live');await page.evaluate(()=>CWR.setPage('impact'));
  assert.equal(await page.locator('#impact-mode').inputValue(),'automatic');assert.equal(await page.locator('#impact-local-overrides').getAttribute('open'),null);
  let result=await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()));assert.equal(result.mode,'automatic');assert.equal(result.directCount,3);assert.equal(result.population,350);assert.equal(result.populationContext.blockCount,3);assert.equal(result.populationContext.basinIds.length,2);assert.equal(result.populationContext.complete,true);assert.equal(result.throughputContext.averageDailyFlowMGD,30);assert.equal(result.throughputContext.equivalentGallons,10000000);assert.equal(result.forecastWindow.hours,8);assert.equal(result.grossRepairUSD,null);assert.equal(result.hypotheticalLocalUSD,null);assert.equal(result.wastewaterGallons,null);
  assert.match(await page.locator('#projected-impact').textContent(),/each block counted once/);assert.match(await page.locator('#projected-impact').textContent(),/not an outage duration/);assert.match(await page.locator('#projected-impact').textContent(),/not flooded residents, customers/);
  await page.evaluate(()=>{document.querySelector('#impact-population').value='99999';document.querySelector('#impact-cost-low').value='100';document.querySelector('#impact-cost-high').value='200';});result=await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()));assert.equal(result.population,350);assert.equal(result.grossRepairUSD,null);
  const partial=await page.evaluate(()=>{const saved=CWR.impactContext.areas;try{CWR.impactContext.areas=saved.filter(a=>a.id!=='FIXTURE-B');return CWR.computeProjectedImpact(CWR.impactOptions()).populationContext;}finally{CWR.impactContext.areas=saved;}});assert.equal(partial.value,150);assert.equal(partial.complete,false);assert.equal(partial.unmatchedStationIds.length,1);
  await page.locator('#impact-water-source').selectOption('selected');result=await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()));assert.equal(result.population,350);assert.equal(result.forecastWindow,undefined);assert.equal(result.throughputContext.equivalentGallons,null);assert.match(await page.locator('#projected-impact').textContent(),/selected scenario level; not a forecast/);
  const noValidBlocks=await page.evaluate(()=>{const saved=CWR.impactContext.populationBlocks;try{CWR.impactContext.populationBlocks=[];return CWR.computeProjectedImpact(CWR.impactOptions()).population;}finally{CWR.impactContext.populationBlocks=saved;}});assert.equal(noValidBlocks,null);
  await page.locator('#impact-mode').selectOption('manual');result=await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()));assert.equal(result.population,99999);assert.ok(result.grossRepairUSD);
 });
 await scenario('coastal-water-resilience',{automatic:true,advancing:true},async page=>{
  await page.waitForFunction(()=>CWR.FEEDS.ofs.state==='live');const compute=()=>page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()));
  assert.equal((await compute()).levelFtMLLW,10);await page.clock.setSystemTime(new Date('2026-10-23T19:00:00Z'));let result=await compute();assert.equal(result.levelFtMLLW,8.25);assert.equal(result.forecastValidAt,'2026-10-24T02:00:00.000Z');assert.equal(result.forecastWindow.hours,2);
  await page.clock.setSystemTime(new Date('2026-10-24T03:00:00Z'));result=await compute();assert.equal(result.levelFtMLLW,7);assert.equal(result.forecastWindow.hours,null);assert.equal(result.throughputContext.equivalentGallons,null);
  await page.clock.setSystemTime(new Date('2026-10-24T05:00:00Z'));result=await compute();assert.equal(result.levelFtMLLW,null);assert.equal(result.directCount,null);assert.equal(result.population,null);assert.equal(result.throughputContext.equivalentGallons,null);
 });

 await scenario('coastal-water-resilience',{automatic:true,ofs:true,refresh:true},async page=>{
  await page.waitForFunction(()=>CWR.impactRefresh.state==='unavailable');await page.evaluate(()=>CWR.setPage('impact'));
  let candidate=await page.evaluate(()=>JSON.parse(JSON.stringify(CWR.impactContext)));candidate.capturedAt='2026-10-23T15:30:00Z';candidate.populationBlocks.find(b=>b.id==='shared').population=60;
  const install=async (payload,status=200)=>{await page.unroute('**/data/impact-context.json');await page.route('**/data/impact-context.json',route=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)}));};
  await install(candidate);assert.equal(await page.evaluate(()=>CWR.refreshImpactContext()),true);assert.equal(await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()).population),360);assert.match(await page.locator('#impact-context-status').textContent(),/Published public context loaded/);
  const good=structuredClone(candidate);
  const failures=[];let bad=structuredClone(good);bad.capturedAt='2026-10-23T15:40:00Z';bad.populationBlocks.push({...bad.populationBlocks[0]});failures.push([bad,/duplicate/]);
  bad=structuredClone(good);bad.capturedAt='2026-10-23T15:40:00Z';bad.areas[0].blockIds.push('missing-block');failures.push([bad,/reference/]);
  bad=structuredClone(good);bad.capturedAt='2026-10-23T15:40:00Z';bad.populationBlocks[0].population=-1;failures.push([bad,/population/]);
  bad=structuredClone(good);bad.capturedAt='2026-10-23T15:00:00Z';failures.push([bad,/regressed/]);
  bad=structuredClone(good);bad.capturedAt='2027-01-01T00:00:00Z';failures.push([bad,/future/]);
  bad=structuredClone(good);bad.capturedAt='2026-10-23T15:40:00Z';bad.areas.forEach(a=>a.blockIds=[]);bad.populationBlocks=[];failures.push([bad,/empty/]);
  bad=structuredClone(good);bad.capturedAt='2026-10-23T15:40:00Z';bad.areas[0].blockIds=['shared'];bad.populationBlocks=bad.populationBlocks.filter(b=>b.id!=='one');failures.push([bad,/coverage decreased/]);
  bad=structuredClone(good);bad.capturedAt='2026-10-23T15:40:00Z';bad.populationBlocks[0].referenceYear=2021;failures.push([bad,/Mixed/]);
  bad=structuredClone(good);bad.capturedAt='2026-10-23T15:40:00Z';bad.populationBlocks[0].population=Number.MAX_SAFE_INTEGER;failures.push([bad,/safe numeric/]);
  bad=structuredClone(good);bad.capturedAt='2026-10-23T15:40:00Z';bad.flowAggregates.forEach(f=>f.averageDailyFlowMGD=1e308);failures.push([bad,/finite numeric/]);
  bad=structuredClone(good);bad.capturedAt='2026-10-23T15:40:00Z';bad.flowAggregates=[];failures.push([bad,/flow coverage/]);
  for(const [payload,error]of failures){await install(payload);assert.equal(await page.evaluate(()=>CWR.refreshImpactContext()),false);assert.equal(await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()).population),360);assert.match(await page.locator('#impact-context-status').textContent(),error);}
  await install({},503);assert.equal(await page.evaluate(()=>CWR.refreshImpactContext()),false);assert.equal(await page.evaluate(()=>CWR.impactContext.capturedAt),good.capturedAt);
  await page.unroute('**/data/impact-context.json');await page.route('**/data/impact-context.json',()=>{});const timeout=page.evaluate(()=>CWR.refreshImpactContext());await page.waitForFunction(()=>CWR.impactRefresh.state==='checking');await page.clock.runFor(12001);assert.equal(await timeout,false);assert.match(await page.locator('#impact-context-status').textContent(),/timed out/);
  candidate=structuredClone(good);candidate.capturedAt='2026-10-23T21:00:00Z';candidate.populationBlocks.find(b=>b.id==='shared').population=70;await install(candidate);await page.clock.setSystemTime(new Date('2026-10-23T22:01:00Z'));await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForFunction(()=>CWR.impactRefresh.state==='published');assert.equal(await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()).population),370);assert.doesNotMatch(await page.locator('#impact-context-status').textContent(),/timed out/);
 });
 await scenario('coastal-water-resilience',{automatic:true,file:true},async page=>{assert.equal(await page.evaluate(()=>CWR.impactRefresh.state),'offline');assert.equal(await page.evaluate(()=>CWR.refreshImpactContext()),false);assert.equal(await page.evaluate(()=>CWR.impactRefresh.checkedAt),null);await page.evaluate(()=>CWR.setPage('impact'));await page.locator('#impact-water-source').selectOption('selected');assert.equal(await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()).population),350);assert.equal(await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()).throughputContext.equivalentGallons),null);});

 await scenario('coastal-water-resilience',{ofs:true,realData:true},async page=>{
  await page.waitForFunction(()=>CWR.FEEDS.ofs.state==='live');const inventory=JSON.parse(await readFile(new URL('consoles/coastal-water-resilience/data/public-stations.json',root),'utf8')),contextData=JSON.parse(await readFile(new URL('consoles/coastal-water-resilience/data/impact-context.json',root),'utf8'));
  const expectedStations=inventory.stations.filter(st=>st.isCityOwned&&st.elevationVerticalDatum==='NAVD88'&&st.groundElevationFt<=6.77),basins=new Set(expectedStations.map(st=>st.basin)),blocks=new Set(contextData.areas.filter(a=>basins.has(a.id)).flatMap(a=>a.blockIds)),population=contextData.populationBlocks.filter(b=>blocks.has(b.id)).reduce((sum,b)=>sum+b.population,0);
  const result=await page.evaluate(()=>CWR.computeProjectedImpact(CWR.impactOptions()));assert.equal(result.directCount,expectedStations.length);assert.equal(result.population,population);assert.equal(result.populationContext.blockCount,blocks.size);assert.equal(result.throughputContext.averageDailyFlowMGD,35.18);assert.equal(result.throughputContext.equivalentGallons,35.18e6*8/24);
  await page.evaluate(()=>CWR.setPage('impact'));if(process.env.CAPTURE_QA){await mkdir(new URL('../keyless-audit/',root),{recursive:true});await page.screenshot({path:new URL('../keyless-audit/coastal-automatic.png',root).pathname,fullPage:true});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile automatic overflow');await page.screenshot({path:new URL('../keyless-audit/coastal-automatic-mobile.png',root).pathname,fullPage:true});}await page.locator('#impact-auto-methods summary').click();assert.match(await page.locator('#impact-auto-methods').textContent(),/2024-10-01 to 2025-09-30/);assert.match(await page.locator('#impact-auto-methods').textContent(),/retrieved/);
  await page.clock.setSystemTime(new Date('2026-10-23T20:00:00Z'));let candidate=structuredClone(contextData);candidate.capturedAt='2026-10-23T19:00:00Z';
  const area=candidate.areas.find(a=>basins.has(a.id)&&a.blockIds.length>1&&a.blockIds.some(id=>candidate.populationBlocks.find(b=>b.id===id).population>0));assert.ok(area,'known populated basin for source-version transition');const removedId=area.blockIds.find(id=>candidate.populationBlocks.find(b=>b.id===id).population>0);area.blockIds=area.blockIds.filter(id=>id!==removedId);area.blockCount=area.blockIds.length;candidate.populationBlocks=candidate.populationBlocks.filter(b=>b.id!==removedId);area.population=candidate.populationBlocks.filter(b=>area.blockIds.includes(b.id)).reduce((sum,b)=>sum+b.population,0);
  candidate.populationCoverage.populationBlockCountInStationLinkedFootprints=candidate.populationBlocks.length;candidate.populationCoverage.deduplicatedPopulationAllRegisterFootprints=candidate.populationBlocks.reduce((sum,b)=>sum+b.population,0);const cityAreas=new Set(inventory.stations.filter(st=>st.isCityOwned).map(st=>st.basin)),cityBlocks=new Set(candidate.areas.filter(a=>cityAreas.has(a.id)).flatMap(a=>a.blockIds));candidate.populationCoverage.deduplicatedPopulationCityOwnedFootprints=candidate.populationBlocks.filter(b=>cityBlocks.has(b.id)).reduce((sum,b)=>sum+b.population,0);
  const validates=payload=>page.evaluate(payload=>{try{CWR.validateImpactContext(payload);return true;}catch(e){return e.message;}},payload);
  assert.match(await validates(candidate),/coverage decreased/);candidate.sources.find(s=>s.id==='city-sewer-subbasins').sha256='b'.repeat(64);assert.equal(await validates(candidate),true);const invalid=structuredClone(candidate);invalid.populationCoverage.deduplicatedPopulationAllRegisterFootprints++;assert.match(await validates(invalid),/do not reconcile/);
 });
 console.log('PASS '+passed+' native Coastal browser scenarios');
}finally{await browser.close();}
