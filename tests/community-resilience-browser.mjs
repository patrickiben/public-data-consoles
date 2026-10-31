// Community Resilience browser regressions: the actual page in Chrome, every public host answered by fixtures, no live network.
// Fixtures: trimmed real responses recorded on 2026-10-30 (tests/fixtures/community-resilience/recorded.json), FEMA NRI rows
// (browser-nri.json) and small synthetic geography for the places below. Unknown ArcGIS queries answer with no features.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFile(path.join(root,p),'utf8');
const RECORDED=JSON.parse(await read('tests/fixtures/community-resilience/recorded.json'));
const NRI=JSON.parse(await read('tests/fixtures/community-resilience/browser-nri.json'));
const STATIONS=JSON.parse(await read('consoles/coastal-water-resilience/data/public-stations.json'));
const CONTEXT=JSON.parse(await read('consoles/coastal-water-resilience/data/impact-context.json'));
const PLACE_CONFIG=JSON.parse(await read('consoles/community-resilience/places/st-petersburg-fl.json'));
const leaflet={js:await readFile(path.join(root,'node_modules/leaflet/dist/leaflet.js')),css:await readFile(path.join(root,'node_modules/leaflet/dist/leaflet.css'))};
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5f8AAAAASUVORK5CYII=','base64');
const ORIGIN='https://community-fixture.invalid/',PAGE=ORIGIN+'consoles/community-resilience/index.html';
const CORS={'access-control-allow-origin':'*'};
const DETERMINISTIC=new Set(['api.tidesandcurrents.noaa.gov','api.weather.gov','nominatim.openstreetmap.org','unpkg.com','tile.openstreetmap.org']);

/* Recorded responses, keyed the way the sources test keys them (method, normalized URL, body hash). */
const sha1=s=>crypto.createHash('sha1').update(String(s)).digest('hex');
const normal=u=>{try{return new URL(u).href;}catch(e){return u;}};
const recorded=new Map(RECORDED.responses.map(e=>{const m=/^(\w+) (\S+)(?: #(\w+))?$/.exec(e.key);return [m[1]+' '+normal(m[2])+(m[3]?' #'+m[3]:''),e];}));

/* Synthetic Census geography: the area that contains a point decides every TIGERweb point answer. */
const AREAS=[
 {id:'stpete',lat:27.77,lon:-82.66,km:20,state:['12','FL','Florida'],county:['12103','Pinellas County'],place:['1263000','St. Petersburg city'],sub:['1210391976','St. Petersburg CCD'],tract:'12103021900'},
 {id:'springfield-il',lat:39.79,lon:-89.65,km:25,state:['17','IL','Illinois'],county:['17167','Sangamon County'],place:['1772000','Springfield city'],sub:['1716772013','Capital township'],tract:'17167000100'},
 {id:'tucson',lat:32.22,lon:-110.95,km:30,state:['04','AZ','Arizona'],county:['04019','Pima County'],place:['0477000','Tucson city'],sub:['0401991845','Tucson CCD'],tract:'04019001100'},
 {id:'jordan',lat:47.3205,lon:-106.911,km:80,state:['30','MT','Montana'],county:['30033','Garfield County'],place:null,sub:['3003390820','Jordan CCD'],tract:'30033000100'},
 {id:'sanjuan',lat:18.45,lon:-66.08,km:15,state:['72','PR','Puerto Rico'],county:['72127','San Juan Municipio'],place:null,sub:null,tract:'72127000600'}
];
const ZIPS={'59337':{lat:47.3205,lon:-106.911}};
const PLACES_BY_NAME={TUCSON:{28:[{GEOID:'0477000',NAME:'Tucson city',BASENAME:'Tucson',STATE:'04',INTPTLAT:'+32.1545',INTPTLON:'-110.8782'}],22:[{GEOID:'0401991845',NAME:'Tucson CCD',BASENAME:'Tucson',STATE:'04',INTPTLAT:'+32.2600',INTPTLON:'-110.9500'}]}};
const ADDRESSES={'1200 N Stone Ave, Tucson, AZ':{lat:'32.2366',lon:'-110.9690',display_name:'1200, North Stone Avenue, Tucson, Pima County, Arizona, 85705, United States',addresstype:'building'},
 '175 5th St N, St. Petersburg, FL':{lat:'27.7746',lon:'-82.6386',display_name:'175, 5th Street North, St. Petersburg, Pinellas County, Florida, 33701, United States',addresstype:'building'}};
const km=(a,b)=>{const r=Math.PI/180,x=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lon-a.lon)*r/2)**2;return 12742*Math.asin(Math.sqrt(x));};
const areaAt=(lat,lon)=>AREAS.find(a=>km(a,{lat,lon})<=a.km)||null;
const pointOf=u=>{const g=(u.searchParams.get('geometry')||'').split(',').map(Number);return g.length===2&&g.every(Number.isFinite)?{lon:g[0],lat:g[1]}:null;};

/* NOAA CO-OPS for the pinned St. Petersburg station, relative to the request time: a 6.00 ft MLLW OFS peak 12 hours out. */
const coopsTime=ms=>new Date(ms).toISOString().slice(0,16).replace('T',' ');
function coops(u){
 const p=u.searchParams,hour=3600000,now=Math.floor(Date.now()/hour)*hour;
 if(u.pathname.endsWith('/stations.json'))return {stations:[{id:'8726520',name:'St. Petersburg',state:'FL',lat:27.7606,lng:-82.6269}]};
 if(u.pathname.endsWith('/floodlevels.json'))return {nos_minor:4.9,nos_moderate:5.7,nos_major:6.9,nws_minor:null,nws_moderate:null,nws_major:null};
 if(u.pathname.endsWith('/datums.json'))return {datums:[{name:'MLLW',value:3.3},{name:'NAVD88',value:4.85}]};
 if(p.get('product')==='water_level')return {data:[{t:coopsTime(now-hour),v:'1.912'}]};
 if(p.get('product')==='ofs_water_level')return {data:Array.from({length:49},(_,i)=>({t:coopsTime(now+i*hour),v:(i===12?6:2+Math.abs(Math.sin(i/4))).toFixed(3)}))};
 return null;
}

/* Active NWS alerts answered by the fixture for the current scenario (none unless a scenario sets them). */
let ALERTS=[];
/* One synthetic answer per public host, or null to fall through. */
function synthetic(u,method,body){
 const host=u.hostname,p=u.pathname;
 if(host==='unpkg.com')return p.endsWith('.css')?{type:'text/css',body:leaflet.css}:{type:'application/javascript',body:leaflet.js};
 if(host==='tile.openstreetmap.org')return {type:'image/png',body:PNG};
 if(host==='nominatim.openstreetmap.org'){const hit=ADDRESSES[u.searchParams.get('q')];return {json:hit?[hit]:[]};}
 if(host==='tigerweb.geo.census.gov'&&p.endsWith('/query')){
  const layer=+p.split('/').at(-2),params=method==='POST'?new URLSearchParams(body||''):u.searchParams,where=params.get('where')||'';
  const zip=/ZCTA5='(\d{5})'/.exec(where);
  if(zip){const z=ZIPS[zip[1]];if(!z)return {json:{features:[]}};
   if(params.get('returnGeometry')==='true')return {json:{features:[{attributes:{ZCTA5:zip[1]},geometry:{rings:[[[z.lon-.2,z.lat-.2],[z.lon+.2,z.lat-.2],[z.lon+.2,z.lat+.2],[z.lon-.2,z.lat+.2],[z.lon-.2,z.lat-.2]]]}}]}};
   return {json:{features:[{attributes:{ZCTA5:zip[1],GEOID:zip[1],INTPTLAT:String(z.lat),INTPTLON:String(z.lon)}}]}};}
  const names=/UPPER\(BASENAME\) IN \(([^)]*)\)/.exec(where);
  if(names){const rows=[];for(const n of names[1].split(',').map(s=>s.replace(/'/g,'').trim()))rows.push(...((PLACES_BY_NAME[n]||{})[layer]||[]));return {json:{features:rows.map(attributes=>({attributes}))}};}
  let pt=pointOf({searchParams:params});
  if(!pt&&params.get('geometryType')==='esriGeometryPolygon'){const g=JSON.parse(params.get('geometry')),ring=g.rings[0];pt={lon:ring.reduce((s,c)=>s+c[0],0)/ring.length,lat:ring.reduce((s,c)=>s+c[1],0)/ring.length};}
  const a=pt&&areaAt(pt.lat,pt.lon);if(!a)return {json:{features:[]}};
  const row={80:{GEOID:a.state[0],STUSAB:a.state[1],NAME:a.state[2]},82:{GEOID:a.county[0],NAME:a.county[1]},28:a.place&&{GEOID:a.place[0],NAME:a.place[1]},30:null,22:a.sub&&{GEOID:a.sub[0],NAME:a.sub[1]},8:{GEOID:a.tract}}[layer];
  return {json:{features:row?[{attributes:row}]:[]}};
 }
 if(p.includes('/National_Risk_Index_Counties/')&&p.endsWith('/query')){const f=/STCOFIPS='(\d{5})'/.exec(u.searchParams.get('where')||'');const row=f&&NRI.counties[f[1]];return {json:{features:row?[{attributes:row}]:[]}};}
 if(p.includes('/National_Risk_Index_Census_Tracts/')&&p.endsWith('/query')){const pt=pointOf(u),a=pt&&areaAt(pt.lat,pt.lon),row=a&&NRI.tracts[a.tract];return {json:{features:row?[{attributes:row}]:[]}};}
 if(p.includes('National_Risk_Index')&&!p.endsWith('/query'))return {json:{editingInfo:{dataLastEditDate:Date.parse('2025-12-16T07:37:01.340Z')}}};
 if(host==='api.tidesandcurrents.noaa.gov'){const j=coops(u);if(j)return {json:j};}
 if(host==='api.weather.gov'&&p==='/alerts/active')return {json:{type:'FeatureCollection',features:ALERTS.map(a=>({type:'Feature',id:a.id,geometry:null,properties:{id:a.id,senderName:'NWS Tucson AZ',sent:new Date(Date.now()-3600000).toISOString(),effective:new Date(Date.now()-3600000).toISOString(),ends:new Date(Date.now()+86400000).toISOString(),expires:new Date(Date.now()+86400000).toISOString(),severity:'Minor',certainty:'Likely',urgency:'Expected',areaDesc:'Eastern Pima County',headline:a.event+' issued for Eastern Pima County',...a}})),updated:new Date().toISOString()}};
 if(/\/(MapServer|FeatureServer|ImageServer)(\/\d+)?\/query$/.test(p))return {json:{features:[]}};
 if(/\/(MapServer|FeatureServer|ImageServer)(\/\d+)?$/.test(p))return {json:{}};
 return null;
}

const browser=await chromium.launch({headless:true,channel:process.env.CHROME_CHANNEL||undefined});
let passed=0;
/* mode: 'fixtures' (recorded, then synthetic), 'feeds-down' (geography answers, every other source fails), 'offline' (everything fails). */
async function scenario(name,{mode='fixtures',width=1280,colorScheme='light',alerts=[],down=[]}={},verify){
 ALERTS=alerts;
 const context=await browser.newContext({viewport:{width,height:900},colorScheme,acceptDownloads:true,serviceWorkers:'block',timezoneId:'America/New_York',locale:'en-US'});
 const log=[],errors=[],html=await read('consoles/community-resilience/index.html');
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),method=req.method(),body=req.postData();
  if(method==='OPTIONS')return route.fulfill({status:204,headers:{...CORS,'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST'}});
  if(u.origin+'/'===ORIGIN){
   if(u.href===PAGE)return route.fulfill({contentType:'text/html',body:html});
   try{return route.fulfill({contentType:'application/json',body:await readFile(path.join(root,decodeURIComponent(u.pathname)))});}catch(e){return route.fulfill({status:404,body:'not found'});}
  }
  log.push({host:u.hostname,url:u.href,method,at:Date.now()});
  const geo=u.hostname==='tigerweb.geo.census.gov'||u.hostname==='nominatim.openstreetmap.org';
  if(down.includes(u.hostname))return route.fulfill({status:503,headers:CORS,contentType:'text/plain',body:'fixture: host down'});
  if(mode==='offline'||(mode==='feeds-down'&&!geo&&u.hostname!=='unpkg.com'&&u.hostname!=='tile.openstreetmap.org'))return route.fulfill({status:503,headers:CORS,contentType:'text/plain',body:'fixture: source down'});
  // Time-relative hosts (CO-OPS, NWS alerts), Nominatim and the map are always synthetic, so the test does not depend on the day it runs.
  const fixed=DETERMINISTIC.has(u.hostname)&&synthetic(u,method,body);
  if(fixed)return route.fulfill({status:200,headers:CORS,contentType:fixed.type||'application/json',body:fixed.json!==undefined?JSON.stringify(fixed.json):fixed.body});
  const hit=recorded.get(method+' '+normal(u.href)+(body?' #'+sha1(body):''));
  if(hit)return route.fulfill({status:hit.status,headers:{...CORS,...(hit.lastModified?{'last-modified':hit.lastModified}:{})},contentType:'application/json',body:hit.text});
  const s=synthetic(u,method,body);
  if(s)return route.fulfill({status:200,headers:CORS,contentType:s.type||'application/json',body:s.json!==undefined?JSON.stringify(s.json):s.body});
  return route.fulfill({status:503,headers:CORS,contentType:'text/plain',body:'fixture: not stubbed'});
 });
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(m.text());});
 try{
  await page.goto(PAGE,{waitUntil:'load'});
  await page.waitForFunction(()=>window.CRPage);
  await verify(page,log);
  assert.deepEqual(errors,[],name+': page errors');
  console.log('PASS Community Resilience browser: '+name);passed++;
 }catch(e){
  console.error('FAIL Community Resilience browser: '+name);
  console.error(await page.locator('#rs-place').textContent().catch(()=>''));
  throw e;
 }finally{await context.close();}
}

/* Helpers */
async function search(page,text){await page.locator('#rs-q').fill(text);await page.locator('#rs-search').click();}
async function settled(page,timeout=30000){
 await page.waitForFunction(()=>{const s=window.CRPage.state;return s.phase!=='geocoding'&&s.phase!=='locating'&&Object.keys(s.pending).length===0&&!document.querySelector('[data-status="loading"],.rs-spin');},null,{timeout});
 await page.waitForTimeout(120);
}
const text=(page,sel)=>page.locator(sel).innerText();
const SECTIONS=['rs-geo','rs-ranking','rs-live','rs-modules','rs-local','rs-lifelines','rs-context','rs-metrics','rs-plan','rs-sources'];
const STATUS_WORDS=/Source: |Unavailable|Not available|None listed|Not covered|Not applicable|Not run|Waiting|OK|Computed|Leading|Rated|None added/;
async function everyPanelHasStatus(page){
 for(const id of SECTIONS){
  const body=(await text(page,'#'+id)).trim();
  assert.ok(body.length>40,id+' is blank');
  assert.match(body,STATUS_WORDS,id+' shows no status');
  if(id!=='rs-geo')assert.ok(await page.locator('#'+id+' [data-status], #'+id+' .rs-badge').count()>0,id+' has no status element');
 }
}
async function noOverflow(page,w){
 await page.setViewportSize({width:w,height:844});await page.waitForTimeout(150);
 const extent=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
 assert.ok(extent.document<=extent.viewport+1,'horizontal overflow at '+w+' px: '+JSON.stringify(extent));
}
const nominatimCalls=log=>log.filter(r=>r.host==='nominatim.openstreetmap.org');
const fmt=n=>n.toLocaleString('en-US');

/* Expected St. Petersburg values, from the published Coastal files (not from the page). */
const terrainOk=s=>typeof s.groundElevationFt==='number'&&Number.isFinite(s.groundElevationFt)&&s.groundElevationFt!==-9999&&s.elevationVerticalDatum==='NAVD88';
const cityOwned=s=>s.isCityOwned===true||(s.isCityOwned==null&&s.owner==='City of St. Petersburg');
const water=PLACE_CONFIG.modules.find(m=>m.id===PLACE_CONFIG.leadingLocalModule),offset=water.datum.mllwToNavd88Ft;
const scoped=scope=>STATIONS.stations.filter(s=>scope==='all'||cityOwned(s));
const exposedAt=(scope,level)=>scoped(scope).filter(s=>terrainOk(s)&&s.groundElevationFt<=level-offset).length;
function zoneText(list){
 const order=['A','B','C','D','E','Non Evac','MOBILE HOME'],c={};
 list.forEach(s=>{const z=s.officialZone?String(s.officialZone):'Unknown';c[z]=(c[z]||0)+1;});
 return Object.keys(c).sort((a,b)=>(order.indexOf(a)<0?99:order.indexOf(a))-(order.indexOf(b)<0?99:order.indexOf(b))).map(z=>(z==='Unknown'?'no zone matched':z==='Non Evac'?'non-evacuation':z==='MOBILE HOME'?'mobile home':'zone '+z)+' '+c[z]).join(', ');
}

try{
 await scenario('plan shell renders before any search',{},async page=>{
  assert.equal(await page.locator('#rs-plan [data-rs-dimension]').count(),10);
  assert.equal(await page.locator('#console-response').count(),0,'No shared response panel on a native page');
  await everyPanelHasStatus(page);
  assert.match(await text(page,'#rs-search-form'),/OpenStreetMap contributors, via Nominatim/);
  assert.equal(await page.locator('a[href="https://operations.osmfoundation.org/policies/nominatim/"]').count()>0,true);
  assert.match(await text(page,'#rs-privacy'),/stays in this browser/);
 });

 await scenario('ZIP 33701 finds St. Petersburg with the local tier, matching the published files',{},async(page,log)=>{
  await search(page,'33701');
  await page.waitForFunction(()=>/St\. Petersburg city, Pinellas County, Florida/.test(document.querySelector('#rs-place').textContent));
  await page.locator('#rs-local [data-rs-local="st-petersburg-fl"][data-status="ok"]').waitFor({timeout:20000});
  await settled(page);
  assert.equal(nominatimCalls(log).length,0,'ZIP searches never call Nominatim');
  const all=STATIONS.stations.length,city=scoped('city').length;
  let local=await text(page,'#rs-local');
  assert.ok(local.includes(all+' current records ('+city+' City-owned, '+(all-city)+' private); showing City-owned: '+city),local.slice(0,400));
  assert.ok(local.includes(zoneText(scoped('city'))),'City-owned zone counts');
  const fc=CONTEXT.populationCoverage;
  assert.ok(local.includes(fmt(fc.deduplicatedPopulationCityOwnedFootprints)+' people in the city-owned sewer basin footprint'),'City-owned footprint population');
  assert.ok(local.includes('county total '+fmt(fc.countyPopulation)));
  assert.ok(local.includes(exposedAt('city',water.defaultLevelFtMLLW)+' of '+city+' city-owned lift stations at or below the plane of '+(water.defaultLevelFtMLLW-offset).toFixed(2)+' ft NAVD88'),'default level screen');
  assert.ok(local.includes('Across the ladder (city-owned): '+water.ladderFtMLLW.map(v=>v+' ft: '+exposedAt('city',v)).join('; ')),'City-owned ladder');
  assert.match(local,/Peak 6\.00 ft MLLW/);
  assert.ok(local.includes(exposedAt('city',6)+' of '+city+' city-owned lift stations at or below the plane of 4.52 ft NAVD88'),'OFS peak screen');
  await page.locator('#rs-local [data-scope="all"]').click();
  await page.waitForFunction(()=>/showing All register records/.test(document.querySelector('#rs-local').innerText));
  local=await text(page,'#rs-local');
  assert.ok(local.includes(zoneText(scoped('all'))),'All-record zone counts');
  assert.ok(local.includes(fmt(fc.deduplicatedPopulationAllRegisterFootprints)+' people in the all register records sewer basin footprint'),'All-record footprint population');
  assert.ok(local.includes('Across the ladder (all register records): '+water.ladderFtMLLW.map(v=>v+' ft: '+exposedAt('all',v)).join('; ')),'All-record ladder');
  // Ranking and plan
  assert.match(await text(page,'#rs-ranking'),/December 2025/);
  assert.equal(await page.locator('#rs-plan [data-rs-dimension]').count(),10);
  for(const audience of ['operator','public']){await page.locator('#rs-track-'+audience).click();await page.waitForFunction(id=>document.getElementById(id).getAttribute('aria-pressed')==='true','rs-track-'+audience);}
  const download=page.waitForEvent('download');await page.locator('#rs-export-plan').click();
  const file=await download,exported=JSON.parse(await readFile(await file.path(),'utf8'));
  assert.match(file.suggestedFilename(),/^community-resilience-plan-12103-public\.json$/);
  assert.equal(exported.dimensions.length,10);
  assert.deepEqual(exported.dimensions.map(d=>d.id),[1,2,3,4,5,6,7,8,9,10]);
  assert.equal(exported.place.label,'St. Petersburg city, Pinellas County, Florida');
  assert.equal(exported.place.localConfiguration,'st-petersburg-fl');
  const raw=JSON.stringify(exported);
  assert.ok(!/"lat"|"lon"|33701|27\.770|82\.632/.test(raw),'The export carries no coordinates or typed text');
  assert.ok(exported.actions.every(a=>a.source),'Every action names its source');
  // Mobile, both themes
  await noOverflow(page,390);
  const colors={};
  for(const want of ['light','dark']){
   while(await page.evaluate(()=>document.documentElement.getAttribute('data-theme'))!==want)await page.locator('#rs-theme').click();
   colors[want]=await page.evaluate(()=>[getComputedStyle(document.body).backgroundColor,getComputedStyle(document.querySelector('.rs-section')).color]);
   await noOverflow(page,390);
   if(process.env.CR_SHOTS)await page.screenshot({path:process.env.CR_SHOTS+'/stpete-390-'+want+'.png',fullPage:false});
  }
  assert.notDeepEqual(colors.light,colors.dark,'Light and dark themes differ');
 });

 await scenario('Springfield opens the chooser, then a pick loads that place',{},async page=>{
  await search(page,'Springfield');
  await page.locator('#rs-chooser:not([hidden]) [data-pick]').first().waitFor();
  assert.ok(await page.locator('#rs-chooser [data-pick]').count()>5,'Many places are named Springfield');
  assert.match(await text(page,'#rs-place'),/places? named Springfield/);
  const pick=page.locator('#rs-chooser [data-pick]').filter({hasText:/Springfield city/}).filter({hasText:/Illinois/}).first();
  await pick.click();
  await page.waitForFunction(()=>/Springfield city, Sangamon County, Illinois/.test(document.querySelector('#rs-place').textContent));
  await page.locator('#rs-chooser').waitFor({state:'hidden'});
  await settled(page);
  const ranking=await text(page,'#rs-ranking');
  assert.ok(!/\$\d/.test(ranking),'No NRI row for Sangamon in the fixtures, so no dollar figures appear');
  assert.match(ranking,/Unavailable|Not available|None listed|No National Risk Index/);
  await everyPanelHasStatus(page);
 });

 await scenario('street addresses use Nominatim, at least 1 s apart, and ZIP searches never do',{},async(page,log)=>{
  await search(page,'1200 N Stone Ave, Tucson, AZ');
  await page.waitForFunction(()=>/Tucson city, Pima County, Arizona/.test(document.querySelector('#rs-place').textContent));
  await search(page,'175 5th St N, St. Petersburg, FL');
  await page.waitForFunction(()=>/St\. Petersburg city, Pinellas County, Florida/.test(document.querySelector('#rs-place').textContent));
  let calls=nominatimCalls(log);
  assert.equal(calls.length,2);
  assert.ok(calls[1].at-calls[0].at>=950,'Nominatim requests '+(calls[1].at-calls[0].at)+' ms apart');
  // Back to back, and repeated: answers are cached for the session, so neither search sends a request.
  await search(page,'1200 N Stone Ave, Tucson, AZ');
  await page.waitForFunction(n=>window.CRPage.state.pending.geocodeAddress||window.CRPage.state.results.geocodeAddress,null);
  await search(page,'175 5th St N, St. Petersburg, FL');
  await page.waitForFunction(()=>/St\. Petersburg city/.test(document.querySelector('#rs-place').textContent)&&window.CRPage.state.phase==='place');
  calls=nominatimCalls(log);
  assert.equal(calls.length,2,'repeated addresses are served from the session cache');
  // Three identical rapid submits of a new address make one request.
  await page.evaluate(()=>{for(let i=0;i<3;i++)window.CRPage.search('100 1st Ave N, St. Petersburg, FL');});
  await page.waitForFunction(()=>/No match for that address/.test(document.querySelector('#rs-place').textContent));
  calls=nominatimCalls(log);
  assert.equal(calls.length,3,'three identical submits sent '+(calls.length-2)+' requests');
  for(let i=1;i<calls.length;i++)assert.ok(calls[i].at-calls[i-1].at>=950,'Nominatim gap '+(calls[i].at-calls[i-1].at)+' ms');
  const before=calls.length;
  await search(page,'33701');
  await page.waitForFunction(()=>/\(ZIP 33701\)/.test(document.querySelector('#rs-place').textContent));
  await settled(page);
  assert.equal(nominatimCalls(log).length,before,'A ZIP search never calls Nominatim');
  assert.match(await text(page,'#rs-sources'),/OpenStreetMap|Nominatim/);
 });

 await scenario('00000 is an invalid ZIP and nothing else is searched',{},async(page,log)=>{
  await search(page,'00000');
  await page.waitForFunction(()=>/Not a valid or known ZIP code/.test(document.querySelector('#rs-place').textContent));
  await settled(page);
  assert.deepEqual([...new Set(log.map(r=>r.host))].filter(h=>h!=='unpkg.com'&&h!=='tile.openstreetmap.org'),['tigerweb.geo.census.gov']);
  assert.equal(nominatimCalls(log).length,0);
  await everyPanelHasStatus(page);
  assert.match(await text(page,'#rs-ranking'),/No place to show/);
 });

 await scenario('59337 is a rural Montana county with no local tier',{},async page=>{
  await search(page,'59337');
  await page.waitForFunction(()=>/Garfield County, Montana/.test(document.querySelector('#rs-place').textContent));
  await settled(page);
  assert.equal(await page.locator('#rs-local [data-rs-local="none"][data-status="not-applicable"]').count(),1);
  assert.ok(await page.locator('#rs-modules [data-rs-module][data-status="leading"]').count()>=1);
  assert.match(await text(page,'#rs-ranking'),/Garfield/);
  assert.equal(await page.locator('#rs-lifelines [data-rs-lifeline]').count(),6);
  for(const el of await page.locator('#rs-lifelines [data-rs-lifeline]').all())assert.ok(await el.getAttribute('data-status'));
  for(const id of ['surge','tsunami','volcanic'])assert.equal(await page.locator('#rs-modules [data-rs-module="'+id+'"]').getAttribute('data-status'),'not-applicable',id);
  await everyPanelHasStatus(page);
 });

 await scenario('00901 Puerto Rico: no NRI ratings, Esri ACS context, AirNow not covered',{},async page=>{
  await search(page,'00901');
  await page.waitForFunction(()=>/San Juan Municipio, Puerto Rico/.test(document.querySelector('#rs-place').textContent));
  await settled(page);
  assert.match(await text(page,'#rs-ranking'),/FEMA does not publish risk scores or ratings/);
  const ctx=await text(page,'#rs-context');
  assert.match(ctx,/Federal dataset hosted by Esri/);
  assert.match(ctx,/ACS/);
  for(const id of ['heat','wildfire'])if(await page.locator('details[data-rs-module="'+id+'"]').count()){const d=page.locator('details[data-rs-module="'+id+'"]');if(!await d.evaluate(el=>el.open))await d.locator('summary').click();}
  await settled(page);
  assert.equal(await page.locator('[data-rs-source="air-quality"]').getAttribute('data-status'),'not-covered');
  assert.equal(await page.locator('[data-rs-source="heatrisk"]').getAttribute('data-status'),'not-covered');
  await everyPanelHasStatus(page);
 });

 await scenario('Tucson, AZ: storm surge is not applicable',{},async page=>{
  await search(page,'Tucson, AZ');
  await page.waitForFunction(()=>/Tucson city, Pima County, Arizona/.test(document.querySelector('#rs-place').textContent));
  await settled(page);
  assert.equal(await page.locator('#rs-chooser').isHidden(),true,'One city plus its CCD is one place');
  assert.equal(await page.locator('#rs-modules [data-rs-module="surge"]').getAttribute('data-status'),'not-applicable');
  assert.match(await text(page,'#rs-modules'),/Coastal Flooding as Not Applicable in Pima/);
  assert.equal(await page.locator('#rs-local [data-rs-local="none"]').count(),1);
 });

 await scenario('every feed failing: every panel shows a status and no figures are made up',{mode:'feeds-down',width:390},async page=>{
  await search(page,'33701');
  await page.waitForFunction(()=>/St\. Petersburg city, Pinellas County, Florida/.test(document.querySelector('#rs-place').textContent));
  await settled(page,60000);
  await everyPanelHasStatus(page);
  assert.ok(!/\$\d/.test(await text(page,'#rs-ranking')),'No dollar figures without NRI');
  assert.match(await text(page,'#rs-ranking'),/Unavailable|not available/i);
  const lifelines=await page.locator('[data-rs-lifeline]').evaluateAll(els=>els.map(e=>e.getAttribute('data-status')));
  assert.equal(lifelines.length,6);
  assert.ok(lifelines.every(st=>st&&st!=='ok'&&st!=='loading'),'No lifeline reads as listed: '+lifelines.join(','));
  const sources=await page.locator('[data-rs-source]').evaluateAll(els=>Object.fromEntries(els.map(e=>[e.getAttribute('data-rs-source'),e.getAttribute('data-status')])));
  assert.ok(Object.values(sources).every(Boolean)&&!Object.values(sources).includes('loading'));
  for(const [id,st] of Object.entries(sources))if(st==='ok')assert.ok(['zcta','zcta-overlap','point-geography','local','map'].includes(id),id+' cannot be ok while its source is down');
  for(const id of ['nri-county','nri-tract','fema-declarations','nws-alerts','community-context','shelters','tide-station','ofs-forecast'])assert.equal(sources[id],'unavailable',id);
  // The published local files are same-origin, so the register loads; the forecast peak is not substituted.
  const local=await text(page,'#rs-local');
  assert.match(local,/NOAA OFS forecast\s*Unavailable/);
  assert.match(local,/No level is substituted/);
  assert.ok(!/Peak \d/.test(local));
  assert.match(await text(page,'#rs-context'),/Unavailable/);
  const plan=await text(page,'#rs-plan');
  assert.match(plan,/Phase not set: hazard ranking unavailable/);assert.doesNotMatch(plan,/Phase: Prepare/);
  assert.match(await text(page,'#rs-lifelines'),/Strain not assessed: hazard ranking unavailable/);
  assert.doesNotMatch(await text(page,'#rs-lifelines'),/Not strained by a leading hazard/);
  await noOverflow(page,390);
 });

 await scenario('everything offline: the search stops with a status in every panel',{mode:'offline'},async page=>{
  await search(page,'33701');
  await page.waitForFunction(()=>/did not answer/.test(document.querySelector('#rs-place').textContent));
  await settled(page);
  await everyPanelHasStatus(page);
  assert.match(await text(page,'#rs-map-status')+await text(page,'#rs-map'),/unavailable/i);
  assert.equal(await page.locator('#rs-plan [data-rs-dimension]').count(),10);
  assert.equal(await page.evaluate(()=>window.CRPage.exportPlan()),null);
 });

 await scenario('a second search loads its own live feeds, and an idle page does not repaint',{},async page=>{
  const feedsOf=()=>page.evaluate(()=>{const st=window.CRPage.state,lead=st.modules.filter(m=>m.status==='leading').map(m=>m.id);
   return {lead,missing:lead.flatMap(id=>{const m=window.CREngine.MODULES.find(x=>x.id===id);return m.liveSources.filter(n=>n!=='nwsAlerts'&&!st.results[n]).map(n=>id+':'+n);})};});
  await search(page,'Tucson, AZ');
  await page.waitForFunction(()=>/Tucson city, Pima County, Arizona/.test(document.querySelector('#rs-place').textContent));
  await settled(page);
  let f=await feedsOf();assert.ok(f.lead.length>0);assert.deepEqual(f.missing,[],'first search');
  await search(page,'33701');
  await page.waitForFunction(()=>/St\. Petersburg city, Pinellas County, Florida/.test(document.querySelector('#rs-place').textContent));
  await settled(page);
  f=await feedsOf();assert.ok(f.lead.includes('tropical'),f.lead.join(','));assert.deepEqual(f.missing,[],'second search loads the feeds of its own leading hazards');
  await search(page,'33701');
  await page.waitForFunction(()=>window.CRPage.state.phase==='place');
  await settled(page);
  f=await feedsOf();assert.deepEqual(f.missing,[],'repeating a search loads its feeds again');
  const open=await page.locator('#rs-modules details[data-rs-module][open]').count();assert.ok(open>0,'leading cards are open');
  const mutations=await page.evaluate(()=>new Promise(done=>{let n=0;const ob=new MutationObserver(list=>{n+=list.length;});ob.observe(document.getElementById('rs-modules-body'),{childList:true,subtree:true});setTimeout(()=>{ob.disconnect();done(n);},2000);}));
  assert.equal(mutations,0,'the hazard cards repainted '+mutations+' times while idle');
  // Closing and opening a card by hand still works.
  const card=page.locator('#rs-modules details[data-rs-module][open]').first(),id=await card.getAttribute('data-rs-module');
  await card.locator('summary').click();await page.waitForFunction(id=>!window.CRPage.state.open.has(id),id);
  await page.locator('#rs-modules details[data-rs-module="'+id+'"] summary').click();await page.waitForFunction(id=>window.CRPage.state.open.has(id),id);
 });

 await scenario('a Flood Advisory is listed but does not set the Watch phase',{alerts:[{id:'fa-1',event:'Flood Advisory'}]},async page=>{
  await search(page,'Tucson, AZ');
  await page.waitForFunction(()=>/Tucson city, Pima County, Arizona/.test(document.querySelector('#rs-place').textContent));
  await settled(page);
  const plan=await text(page,'#rs-plan');
  assert.match(plan,/Phase: Prepare/);assert.doesNotMatch(plan,/Phase: Watch/);assert.match(plan,/Flood Advisory/);
  assert.match(await text(page,'#rs-ranking'),/Flood Advisory/);
  assert.match(await text(page,'#rs-live'),/time zone \(America\/Phoenix\)|your device's time zone/);
 });

 await scenario('NWS alerts down: the ranking never says no alerts',{down:['api.weather.gov']},async page=>{
  await search(page,'Tucson, AZ');
  await page.waitForFunction(()=>/Tucson city, Pima County, Arizona/.test(document.querySelector('#rs-place').textContent));
  await settled(page);
  const ranking=await text(page,'#rs-ranking');
  assert.match(ranking,/Unavailable \(NWS alerts did not answer\)/);assert.doesNotMatch(ranking,/None listed/);
  assert.match(await text(page,'#rs-plan'),/NWS alerts are not available right now/);
 });

 await scenario('keyboard: the chooser takes focus, and the hint uses a listed state',{width:390},async page=>{
  await page.locator('#rs-q').fill('Springfield');await page.locator('#rs-q').press('Enter');
  await page.locator('#rs-chooser:not([hidden]) [data-pick]').first().waitFor();
  await page.waitForFunction(()=>document.activeElement&&document.activeElement.id==='rs-chooser-title');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-pick')),true,'the next Tab reaches the first pick');
  assert.match(await text(page,'#rs-ranking'),/Waiting\s*Waiting for you to pick/);
  assert.match(await text(page,'#rs-chooser'),/for example "Springfield, AR"/);
  assert.equal(await page.locator('#rs-ranking .rs-spin').count(),0,'no spinner while waiting for a pick');
 });

 await scenario('dark color scheme at 390 px',{colorScheme:'dark',width:390},async page=>{
  await search(page,'59337');
  await page.waitForFunction(()=>/Garfield County, Montana/.test(document.querySelector('#rs-place').textContent));
  await settled(page);
  const bg=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  assert.equal(bg,'#0f1b2a','Device dark scheme applies the dark palette');
  await noOverflow(page,390);
  if(process.env.CR_SHOTS)await page.screenshot({path:process.env.CR_SHOTS+'/rural-390-device-dark.png',fullPage:true});
 });
}finally{await browser.close();}
console.log('PASS '+passed+' Community Resilience browser scenarios');
