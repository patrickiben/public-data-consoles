// Offline test for public-data-runtime/community-resilience-sources.js. Nothing touches the network: a stub fetch
// replays trimmed real responses recorded on 2026-10-30 (tests/fixtures/community-resilience/recorded.json) or
// returns small hand-made answers for the empty, failure and not-covered cases. Prints PASS or exits non-zero.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtimeFile=path.join(repo,'public-data-runtime/community-resilience-sources.js');
await import(runtimeFile);
const S=globalThis.CRSources;
const FX=JSON.parse(fs.readFileSync(path.join(repo,'tests/fixtures/community-resilience/recorded.json'),'utf8'));
const P=FX.places,NOW=FX.recordedNow;
const STATUSES=['ok','empty','unavailable','not-covered','not-applicable','skipped'];

const key=(url,o={})=>(o.method||'GET')+' '+url+(o.body?' #'+crypto.createHash('sha1').update(String(o.body)).digest('hex'):'');
const respond=(status,text,lastModified)=>({ok:status>=200&&status<300,status,text:async()=>text,headers:{get:n=>n.toLowerCase()==='last-modified'?lastModified||null:null}});
const recorded=new Map(FX.responses.map(e=>[e.key,e]));
const byUrl=part=>FX.responses.find(e=>e.key.includes(part));
function replay(override,log){
 return async(url,o={})=>{
  if(log)log.push({url,at:Date.now()});
  const r=override&&override(url,o);if(r)return r;
  const e=recorded.get(key(url,o));if(!e)throw new Error('unrecorded '+key(url,o).slice(0,140));
  return respond(e.status,e.text,e.lastModified);
 };
}
const make=(fetch,extra)=>S.create({fetch,now:()=>NOW,...extra});
const noNetwork=async url=>{throw new Error('unexpected request '+url);};

const failures=[];let passed=0;
async function check(name,fn){try{await fn();passed++;}catch(e){failures.push(name+': '+(e&&e.message||e));}}
function shape(r,label){
 for(const k of ['id','title','owner','hostedBy','experimental','status','message','dataDate','dataDateText','dataDateBasis','fetchedAt','link','coverage','data','error'])assert.ok(k in r,label+' missing '+k);
 assert.ok(STATUSES.includes(r.status),label+' bad status '+r.status);
 assert.equal(typeof r.message,'string');assert.ok(r.message.length>0,label+' empty message');
 assert.equal(typeof r.dataDateText,'string');assert.ok(r.dataDateText.length>0,label+' empty dataDateText');
 assert.ok(r.dataDate===null||!Number.isNaN(Date.parse(r.dataDate)),label+' bad dataDate');
 assert.ok(!Number.isNaN(Date.parse(r.fetchedAt)),label+' bad fetchedAt');
 assert.ok(r.coverage&&r.link&&r.owner,label+' missing coverage, link or owner');
 assert.ok(!/—/.test(r.message+r.coverage+r.dataDateText+r.title),label+' has an em dash');
 if(r.status==='unavailable'){assert.ok(r.error,label+' unavailable without error');assert.equal(r.data,null);assert.equal(r.dataDate,null);}
 if(r.status==='ok')assert.ok(r.dataDate||r.dataDateText===S.NO_DATE||/^(Elevation source acquired|Boundaries vintage)/.test(r.dataDateText),label+' ok without a data date statement');
 return r;
}
const sortedNear=items=>items.every((x,i)=>typeof x.distanceKm==='number'&&(i===0||items[i-1].distanceKm<=x.distanceKm));

// ---------- parseQuery ----------
await check('parseQuery',()=>{
 const q=S.parseQuery;
 assert.deepEqual([q('33701').kind,q('33701').zip],['zip','33701']);
 assert.deepEqual([q('33701-1234').kind,q('33701-1234').zip],['zip','33701']);
 assert.equal(q('1234').kind,'zip-invalid');assert.equal(q('1234').message,'A ZIP code has 5 digits');
 assert.equal(q('123-45').kind,'zip-invalid');
 assert.deepEqual([q('00000').kind,q('00000').zip],['zip','00000']);
 assert.deepEqual([q('Springfield').kind,q('Springfield').name,q('Springfield').stateAbbr],['name','Springfield',undefined]);
 assert.deepEqual([q('Springfield, IL').kind,q('Springfield, IL').name,q('Springfield, IL').stateAbbr],['name','Springfield','IL']);
 assert.deepEqual([q('Springfield, Illinois').stateAbbr,q('springfield,il').stateAbbr],['IL','IL']);
 assert.equal(q('175 5th St N, St. Petersburg, FL').kind,'address');
 assert.deepEqual([q('San Juan, Puerto Rico').kind,q('San Juan, Puerto Rico').name,q('San Juan, Puerto Rico').stateAbbr],['name','San Juan','PR']);
 assert.equal(q('   ').kind,'empty');
 assert.equal(q('Paris, France').stateAbbr,undefined);
});

// ---------- replay of every recorded live call ----------
const live=make(replay());
const results=[];
for(const c of FX.calls){
 const label=c.method+' '+JSON.stringify(c.args).slice(0,60);
 const r=await live[c.method](...c.args);results.push(r);
 await check('replay '+label,()=>{shape(r,label);assert.equal(r.status,c.status,label+': '+r.message+(r.error?' ('+r.error+')':''));});
}
const res=(method,i=0)=>results.filter((_,k)=>FX.calls[k].method===method)[i];

await check('zcta values',()=>{
 const a=res('zcta',0),pr=res('zcta',1),bad=res('zcta',2);
 assert.equal(a.data.zip,'33701');assert.ok(Math.abs(a.data.lat-27.77)<0.05&&Math.abs(a.data.lon+82.64)<0.05);
 assert.equal(pr.data.zip,'00901');assert.equal(bad.status,'empty');assert.match(bad.message,/Not a valid or known ZIP code/);
 assert.match(a.dataDateText,/^Boundaries vintage/);
});
await check('zctaOverlap values',()=>{
 const moore=res('zctaOverlap',1).data;
 assert.deepEqual(moore.counties.map(c=>c.fips),['40027']);assert.equal(moore.edgeTouching,false);
 assert.ok(moore.places.some(p=>p.name==='Moore city'&&p.type==='incorporated'));
});
await check('placesByName values',()=>{
 const sp=res('placesByName',0).data.items,pr=res('placesByName',1).data.items,stp=res('placesByName',2).data.items;
 assert.ok(sp.length>=22&&new Set(sp.map(i=>i.stateAbbr)).size>=20,'Springfield needs a chooser across many states');
 const order={incorporated:0,municipio:1,cdp:2,'county-subdivision':3};
 assert.ok(sp.every((x,i)=>i===0||order[sp[i-1].type]<=order[x.type]));
 assert.ok(sp.every(i=>typeof i.lat==='number'&&typeof i.lon==='number'&&i.basename==='Springfield'));
 assert.ok(pr.some(i=>i.geoid==='72127'&&i.type==='municipio'));
 assert.ok(stp.some(i=>i.geoid==='1263000'),'Saint matches St.');
});
await check('geocodeAddress values',()=>{
 const r=res('geocodeAddress',0);
 assert.ok(r.data.items.length>0);assert.ok(Math.abs(r.data.items[0].lat-27.77)<0.05);
 assert.equal(r.data.attribution,'Address search: © OpenStreetMap contributors, via Nominatim');
 assert.equal(r.data.policy,'https://operations.osmfoundation.org/policies/nominatim/');
});
await check('pointGeography values',()=>{
 const a=res('pointGeography',0).data,b=res('pointGeography',1).data;
 assert.deepEqual(a.state,{fips:'12',abbr:'FL',name:'Florida'});assert.equal(a.county.fips,'12103');
 assert.deepEqual(a.place,{geoid:'1263000',name:'St. Petersburg city',type:'incorporated'});assert.equal(a.tract.geoid,'12103021900');
 assert.equal(b.county.fips,'72127');assert.equal(b.place.type,'cdp');assert.equal(b.state.abbr,'PR');
});
await check('NRI values',()=>{
 const c=res('nriCounty',0),pr=res('nriCounty',1),t=res('nriTract',0);
 for(const h of S.NRI_HAZARDS)for(const s of ['_EALT','_RISKS','_RISKR'])assert.ok(h+s in c.data.attrs,'missing '+h+s);
 assert.ok(c.data.attrs.HRCN_EALT>1e8);assert.equal(c.dataDate.slice(0,10),'2025-12-16');assert.match(c.dataDateText,/NRI version December 2025/);
 assert.equal(pr.data.attrs.RISK_SCORE,null);assert.match(pr.message,/Puerto Rico/);
 assert.equal(t.data.attrs.TRACTFIPS,'12103021900');
});
await check('FEMA declarations values',()=>{
 const r=res('femaDeclarations',0).data;
 assert.equal(Object.values(r.byType).reduce((a,b)=>a+b,0),r.total);assert.ok(r.latest&&r.latest.number&&r.latest.date);
 assert.match(res('femaDeclarations',0).dataDateText,/^Data refreshed/);
});
await check('NWS values',()=>{
 assert.equal(res('nwsAlerts',0).status,'empty');assert.match(res('nwsAlerts',0).message,/does not establish safety/);
 const items=res('nwsAlerts',1).data.items;
 assert.ok(items.length>0&&items.every(i=>i.event&&'ends' in i&&'expires' in i&&'geometry' in i));
 const p=res('nwsPoint',0).data;assert.equal(p.office,'TBW');assert.match(p.forecastZone,/^FLZ\d+$/);assert.match(p.countyZone,/^FLC103$/);
});
await check('SPC values',()=>{
 const r=res('spcOutlook',0);assert.ok(r.data.issued&&r.data.expires);assert.ok(r.data.features.every(f=>f.rank>=1&&f.rank<=6));
 const at=S.spcCategoryAt(r.data,P.tucson[0],P.tucson[1]);assert.ok(at.rank>=0&&at.rank<=6);
 const sq=[[0,0],[10,0],[10,10],[0,10],[0,0]],hole=[[4,4],[6,4],[6,6],[4,6],[4,4]];
 const data={features:[{label:'TSTM',rank:1,geometry:{type:'Polygon',coordinates:[sq]}},{label:'SLGT',rank:3,geometry:{type:'MultiPolygon',coordinates:[[[[2,2],[8,2],[8,8],[2,8],[2,2]],hole]]}}]};
 assert.deepEqual(S.spcCategoryAt(data,3,3),{label:'SLGT',rank:3});
 assert.deepEqual(S.spcCategoryAt(data,5,5),{label:'TSTM',rank:1});
 assert.deepEqual(S.spcCategoryAt(data,20,20),{label:null,rank:0});
});
await check('HeatRisk values',()=>{
 const r=res('heatRisk',0);assert.equal(r.experimental,true);
 assert.ok(r.data.days.length>=5&&r.data.days.every(d=>d.levels.length===2&&d.levels.every(v=>v===null||(Number.isInteger(v)&&v>=0&&v<=4))));
 assert.match(r.dataDateText,/^Forecast issued/);
});
await check('drought values',()=>{
 const r=res('drought',0),d=r.data;assert.equal(r.hostedBy,'Esri');
 assert.ok(d.d0>=d.d1&&d.d1>=d.d2&&d.d2>=d.d3&&d.d3>=d.d4);assert.ok(Math.abs(d.none+d.d0-100)<0.01);
 assert.match(d.mapDate,/^\d{4}-\d{2}-\d{2}$/);assert.match(r.dataDateText,/^U\.S\. Drought Monitor map of/);
});
await check('wildfire values',()=>{
 const r=res('wildfires',0).data;
 assert.ok(r.incidents.every(i=>i.type==='WF'));assert.ok(sortedNear(r.incidents));assert.ok(r.prescribedCount>0,'prescribed burns are counted, not listed');
});
await check('AirNow values',()=>{
 const a=res('airQuality',0).data,b=res('airQuality',1).data;
 assert.ok(a.distanceKm<100&&a.items.length>0&&a.items.every(i=>typeof i.aqi==='number'&&i.parameter));
 assert.equal(b.state,'AK');assert.equal(b.stale,false,'Alaska ADT rows are Alaska time');
});
await check('tropical values',()=>{
 const r=res('tropical',0);assert.equal(r.hostedBy,'Esri');assert.equal(r.owner,'NOAA NHC and JTWC');
 assert.ok(sortedNear(r.data.storms));
});
await check('earthquake values',()=>{
 const r=res('earthquakes',0).data;assert.ok(r.count>=r.items.length&&r.countExact);
 assert.ok(r.items.every((x,i)=>i===0||r.items[i-1].time>=x.time),'newest first');
 assert.ok(r.items.every(i=>typeof i.distanceKm==='number'&&i.distanceKm<=251));
});
await check('volcano values',()=>{
 const r=res('volcanoes',0).data;assert.equal(r.located,false);assert.ok(r.items.length>0&&r.items.every(i=>/Alaska/.test(i.observatory)));
});
await check('river gauge values',()=>{
 const items=res('riverGauges',0).data.items;
 assert.ok(sortedNear(items)&&items.every(i=>i.distanceKm<=25));
 assert.ok(items.every(i=>i.observedFt!==-999&&i.forecastFt!==-999&&i.forecastTime!=='0001-01-01T00:00:00.000Z'));
 assert.ok(items.some(i=>i.minor!=null),'thresholds joined from riv_gauges');
});
await check('tide station values',()=>{
 const d=res('tideStation',0).data;assert.equal(d.station.id,'8726520');assert.equal(d.latest.datum,'MLLW');
 assert.equal(typeof d.floodLevels.mllwInStationDatum,'number');assert.match(d.floodLevels.datumNote,/without naming a datum/);
 assert.equal(res('tideStation',2).status,'not-applicable');
});
await check('OFS values',()=>{
 const rows=res('ofsForecast',0).data.rows;
 assert.ok(rows.length>24&&rows.every((r,i)=>typeof r.t==='number'&&r.unit==='ft'&&r.datum==='MLLW'&&typeof r.v==='number'&&(i===0||rows[i-1].t<r.t)));
});
await check('flood zone values',()=>{
 const g=res('floodZone',0);assert.equal(g.data.zone,'AE');assert.equal(g.data.sfha,true);assert.ok(g.data.panel&&g.dataDate);
 const rural=res('floodZone',1);assert.equal(rural.status,'empty');assert.deepEqual(rural.data,{unmapped:true});assert.match(rural.message,/does not mean safe/);
});
await check('elevation values',()=>{
 const r=res('elevation',0);if(r.status==='ok'){assert.ok(r.data.feet>0);assert.match(r.dataDateText,/^Elevation source acquired/);}
});
await check('surge values',()=>{
 const g=res('surge',0).data.byCategory;assert.ok(g[1]!=null&&g[5]!=null);
 assert.ok(Object.values(res('surge',1).data.byCategory).every(v=>v===null));
});
await check('seismic values',()=>{assert.equal(res('seismicDesign',0).data.sdc,'D');assert.equal(res('seismicDesign',1).data.sdc,'B');});
await check('water system values',()=>{
 const r=res('waterSystems',0);assert.equal(r.dataDateText,S.NO_DATE);
 const items=r.data.items;assert.ok(items.every((x,i)=>i===0||(items[i-1].populationServed||0)>=(x.populationServed||0)));
 assert.ok(res('waterSystems',1).data.items.length>0,'PR municipio name matched');
});
await check('outage values',()=>{
 const tx=res('outages',0);assert.equal(tx.data.reporting,true);assert.ok(tx.data.items[0].utility&&!/,\s*\d+$/.test(tx.data.items[0].utility));
 assert.match(tx.coverage,/states/);assert.equal(res('outages',1).status,'empty');
});
await check('lifeline lists are nearest first',()=>{
 for(const m of ['powerPlants','hospitalsUSGS','hospitalsCMS','healthCenters','shelters','bridges'])for(const r of results.filter((_,k)=>FX.calls[k].method===m))if(r.status==='ok')assert.ok(sortedNear(r.data.items),m);
 assert.equal(res('powerPlants',0).hostedBy,'Esri');assert.equal(res('powerPlants',0).owner,'EIA');assert.equal(res('hospitalsCMS',0).hostedBy,'Esri');
 const b=res('bridges',0).data;assert.ok(b.total>=b.good+b.fair+b.poor-1&&b.poor>0);
});
await check('community context values',()=>{
 const a=res('communityContext',0),b=res('communityContext',1);
 assert.ok(a.data.sviPercentile>=0&&a.data.sviPercentile<=100&&typeof a.data.pctPoverty150==='number');assert.ok(a.data.tract&&a.data.tract.geoid==='12103021900');
 assert.equal(b.hostedBy,'Esri');assert.equal(b.data.pctPoverty150,null);assert.equal(b.data.sviPercentile,null);assert.match(b.message,/150% of the poverty level/);
 assert.match(b.data.vintage,/ACS/);
});
await check('screen values',()=>{
 const f=res('screenFloodZones',0).data;assert.equal(f.values.length,3);assert.equal(f.values.find(v=>v.id==='rural').reason,'unmapped');
 assert.ok(res('screenSeismic',0).data.values.every(v=>typeof v.value==='number'));
 assert.ok(res('screenNriTract',0).data.values.every(v=>v.rating&&v.tract));
 const h=res('screenHeatRisk',0).data.values;assert.equal(h.find(v=>v.id==='anchorage').value,null);assert.ok(Number.isInteger(h.find(v=>v.id==='stpete').value));
});

// ---------- not covered, not applicable, refused: no request is made ----------
await check('not-covered without network',async()=>{
 const s=make(noNetwork);
 assert.equal(shape(await s.heatRisk([{lat:P.anchorage[0],lon:P.anchorage[1]}]),'heat AK').status,'not-covered');
 assert.equal(shape(await s.airQuality(...P.sanjuan),'air PR').status,'not-covered');
 assert.equal(shape(await s.surge(...P.anchorage),'surge AK').status,'not-covered');
 assert.equal(shape(await s.spcOutlook({isConus:false}),'spc AK').status,'not-covered');
 assert.equal(shape(await s.volcanoes('FL'),'volcano FL').status,'not-applicable');
 assert.equal(shape(await s.communityContext({county:{fips:'66010'},isPR:false}),'svi GU').status,'not-covered');
 assert.equal(shape(await s.loadLocal({},'https://example.test/'),'no local').status,'not-applicable');
 const h=await s.screenHeatRisk([{id:'a',lat:P.sanjuan[0],lon:P.sanjuan[1]}]);assert.equal(h.status,'not-covered');assert.equal(h.data.values[0].value,null);
});
await check('nwsPoint 404 is not-covered',async()=>{
 const r=await make(async()=>respond(404,'{"title":"Not Found"}')).nwsPoint(10,-140);assert.equal(shape(r,'nws404').status,'not-covered');
});
await check('outages outside ODIN reporting states are not-covered',async()=>{
 const s=make(replay(url=>url.includes('/records?')&&url.includes('where')?respond(200,'{"total_count":0,"results":[]}'):null));
 const r=shape(await s.outages('Alaska','Anchorage Municipality','02020'),'odin AK');assert.equal(r.status,'not-covered');assert.equal(r.data.reporting,false);
});

// ---------- Nominatim: refusal and the one-request-per-second gate ----------
await check('Nominatim refuses ZIP-only and non-address text',async()=>{
 const s=make(noNetwork);
 for(const t of ['33701','33701-1234','1234','00000','','Springfield, IL']){const r=shape(await s.geocodeAddress(t),'geocode '+t);assert.equal(r.status,'not-applicable',t);assert.equal(r.error,null);}
});
await check('Nominatim gate waits at least 1000 ms',async()=>{
 const starts=[];const s=make(async url=>{starts.push(Date.now());assert.ok(url.startsWith('https://nominatim.openstreetmap.org/search?'));assert.ok(url.includes('countrycodes=us%2Cpr%2Cgu%2Cvi%2Cas%2Cmp')&&url.includes('limit=5'));return respond(200,'[]');});
 await new Promise(r=>setTimeout(r,S.NOMINATIM_GAP_MS));
 const t0=Date.now();
 const [a,b]=await Promise.all([s.geocodeAddress('1 Main St, Springfield, IL'),s.geocodeAddress('2 Main St, Springfield, IL')]);
 assert.equal(a.status,'empty');assert.equal(b.status,'empty');assert.equal(starts.length,2,'both requests were sent, none dropped');
 assert.ok(starts[1]-starts[0]>=1000,'gap '+(starts[1]-starts[0])+' ms');
 const other=make(async()=>{starts.push(Date.now());return respond(200,'[]');});
 await other.geocodeAddress('3 Main St, Springfield, IL');
 assert.ok(starts[2]-starts[1]>=1000,'the gate is module-wide, gap '+(starts[2]-starts[1])+' ms');
 assert.ok(Date.now()-t0>=2000);
});

// ---------- every adapter: unavailable on HTTP 500, timeout, malformed JSON and ArcGIS error objects ----------
const sample=[];{const seen=new Set();for(const c of FX.calls)if(!seen.has(c.method)&&c.status!=='not-applicable'){seen.add(c.method);sample.push(c);}}
sample.push({method:'loadLocal',args:[{files:{stations:'../coastal-water-resilience/data/public-stations.json',context:'../coastal-water-resilience/data/impact-context.json'}},'https://example.test/consoles/community-resilience/']});
const hang=async(url,o={})=>new Promise((_,reject)=>{if(o.signal)o.signal.addEventListener('abort',()=>{const e=new Error('aborted');e.name='AbortError';reject(e);});});
const failing={
 'HTTP 500':async()=>respond(500,'Internal Server Error'),
 'timeout':hang,
 'malformed JSON':async()=>respond(200,'{"features":[ not json'),
 'ArcGIS error object':async()=>respond(200,'{"error":{"code":400,"message":"Failed to execute query.","details":[]}}'),
};
for(const [label,fetch] of Object.entries(failing)){
 const s=make(fetch,{timeoutMs:30});
 for(const c of sample){
  await check(label+' '+c.method,async()=>{const r=shape(await s[c.method](...c.args),label+' '+c.method);assert.equal(r.status,'unavailable',c.method+' under '+label+': '+r.status+' '+r.message);});
 }
}
await check('timeout message and slow surge timeout',async()=>{
 const slow=async()=>{await new Promise(r=>setTimeout(r,45));return respond(200,'{"results":[]}');};
 const s=make(slow,{timeoutMs:30});
 const flood=await s.floodZone(...P.galveston);assert.equal(flood.status,'unavailable');assert.match(flood.error,/Timed out after 0\.03 s/);
 const surge=await s.surge(...P.galveston);assert.equal(surge.status,'empty','surge uses the longer timeout');
});

// ---------- every adapter: empty answers mean "None listed in this source" ----------
const stationsEntry=byUrl('stations.json?type=waterlevels'),odinStates=byUrl('group_by=state'),femaMeta=byUrl('/v1/DataSets');
function emptyFetch(url){
 const ok=t=>respond(200,typeof t==='string'?t:JSON.stringify(t));
 if(url.endsWith('?f=json'))return ok({editingInfo:{dataLastEditDate:1765870621340}});
 if(url.includes('stations.json'))return respond(200,stationsEntry.text);
 if(url.includes('group_by=state'))return respond(200,odinStates.text);
 if(url.includes('/v1/DataSets'))return respond(200,femaMeta.text);
 if(url.includes('reportingarea.dat'))return ok('10/30/26|10/30/26|12:00|HST|0|O|Y|Honolulu|HI|21.3069|-157.8583|OZONE|20|Good|No||Hawaii DOH');
 if(url.includes('/query')&&!url.includes('fdsnws'))return ok({features:[]});
 if(url.includes('/identify'))return ok({results:[]});
 if(url.includes('getSamples'))return ok({samples:[]});
 if(url.includes('/alerts/active'))return ok({features:[],updated:'2026-10-31T00:00:00+00:00'});
 if(url.includes('spc.noaa.gov'))return ok({type:'FeatureCollection',features:[]});
 if(url.includes('fdsnws/event/1/count'))return ok({count:0});
 if(url.includes('fdsnws'))return ok({metadata:{generated:NOW},features:[]});
 if(url.includes('getElevatedVolcanoes'))return ok([]);
 if(url.includes('nwps/v1/gauges'))return ok({gauges:[]});
 if(url.includes('datagetter'))return ok({error:{message:'No data was found.'}});
 if(url.includes('floodlevels')||url.includes('datums'))return ok({});
 if(url.includes('epqs'))return ok({value:-1000000});
 if(url.includes('building-codes'))return ok({response:{data:{ss:null,s1:null,sds:null,sd1:null,sdc:null},metadata:{}}});
 if(url.includes('efservice'))return ok([]);
 if(url.includes('odin')&&url.includes('/records'))return ok({total_count:0,results:[]});
 if(url.includes('odin'))return ok({metas:{default:{modified:'2026-10-30T20:00:08+00:00'}}});
 if(url.includes('nominatim'))return ok([]);
 if(url.includes('geo.fcc.gov'))return ok({results:[]});
 if(url.includes('DisasterDeclarationsSummaries'))return ok({DisasterDeclarationsSummaries:[]});
 if(url.includes('api.weather.gov/points'))return respond(404,'{}');
 return null;
}
{
 const s=make(async url=>{const r=emptyFetch(url);if(!r)throw new Error('no empty answer for '+url);return r;});
 for(const c of sample){
  if(['nwsPoint','loadLocal'].includes(c.method))continue;
  await check('empty '+c.method,async()=>{const r=shape(await s[c.method](...c.args),'empty '+c.method);assert.equal(r.status,'empty',c.method+': '+r.status+' '+r.message+(r.error?' ('+r.error+')':''));});
 }
}

// ---------- caching per session ----------
await check('AirNow file, CO-OPS station list and layer metadata are fetched once per session',async()=>{
 const log=[];const s=make(replay(null,log));
 await s.airQuality(...P.stpete);await s.airQuality(...P.anchorage);
 await s.tideStation(...P.stpete);await s.tideStation(...P.galveston);
 await s.nriCounty('12103');await s.nriCounty('72127');
 const count=part=>log.filter(e=>e.url.includes(part)).length;
 assert.equal(count('reportingarea.dat'),1);assert.equal(count('stations.json'),1);assert.equal(count('National_Risk_Index_Counties/FeatureServer/0?f=json'),1);
});

// ---------- local tier ----------
const localConfig={files:{stations:'../coastal-water-resilience/data/public-stations.json',context:'../coastal-water-resilience/data/impact-context.json'}};
const BASE='https://example.test/consoles/community-resilience/';
function fileFetch(mutate){return async url=>{const m=/^https:\/\/example\.test\/(consoles\/coastal-water-resilience\/data\/[\w-]+\.json)$/.exec(url);if(!m)throw new Error('unexpected '+url);let t=fs.readFileSync(path.join(repo,m[1]),'utf8');if(mutate)t=mutate(url,t);return respond(200,t);};}
await check('loadLocal with matching fingerprint',async()=>{
 const r=shape(await make(fileFetch()).loadLocal(localConfig,BASE),'local');
 assert.equal(r.status,'ok');assert.equal(r.data.fingerprintOk,true);assert.ok(r.data.stations.length>100);assert.ok(r.data.context.areas.length>0);assert.ok(r.data.capturedAt);
});
await check('loadLocal flags a changed register',async()=>{
 const r=await make(fileFetch((url,t)=>url.includes('public-stations')?t.replace(/"groundElevationFt": ?(-?\d)/,'"groundElevationFt": 9$1'):t)).loadLocal(localConfig,BASE);
 assert.equal(r.status,'ok');assert.equal(r.data.fingerprintOk,false);assert.match(r.message,/population figures are withheld/);
});
await check('loadLocal from file:// or failing fetch is unavailable with a clear message',async()=>{
 const a=shape(await make(noNetwork).loadLocal(localConfig,'file:///Users/x/consoles/community-resilience/index.html'),'file');
 assert.equal(a.status,'unavailable');assert.match(a.message,/opened from a file/);
 const b=shape(await make(async()=>respond(404,'')).loadLocal(localConfig,BASE),'404');assert.equal(b.status,'unavailable');assert.match(b.message,/could not be loaded/);
});
await check('canonical JSON reproduces the Python fingerprint',()=>{
 const t='{"b": 1.0, "a": [1e-05, "é", true, null], "c": {"z": 0, "y": -2.50}}';
 assert.equal(S.canonicalJson(t),'{"a":[1e-05,"é",true,null],"b":1.0,"c":{"y":-2.50,"z":0}}');
});

// ---------- registry and text rules ----------
await check('registry labels and wording',()=>{
 const src=fs.readFileSync(runtimeFile,'utf8');assert.ok(!/—/.test(src),'no em dashes in the runtime file');
 for(const d of Object.values(S.SOURCES)){assert.ok(d.title&&d.owner&&d.link&&d.coverage,d.id);assert.ok(!/—/.test(JSON.stringify(d)));}
 for(const id of ['drought','tropical','power-plants','hospitals-cms'])assert.equal(S.SOURCES[id].hostedBy,'Esri',id);
 assert.equal(S.SOURCES.heatrisk.experimental,true);assert.equal(S.SOURCES['screen-heatrisk'].experimental,true);
 const methods=Object.keys(make(noNetwork));
 for(const m of ['zcta','zctaOverlap','placesByName','geocodeAddress','pointGeography','nriCounty','nriTract','femaDeclarations','nwsAlerts','nwsPoint','spcOutlook','heatRisk','drought','wildfires','airQuality','tropical','earthquakes','volcanoes','riverGauges','tideStation','ofsForecast','floodZone','elevation','surge','seismicDesign','waterSystems','outages','powerPlants','hospitalsUSGS','hospitalsCMS','healthCenters','shelters','bridges','communityContext','screenFloodZones','screenSeismic','screenNriTract','screenHeatRisk','loadLocal'])assert.ok(methods.includes(m),'missing '+m);
});

if(failures.length){console.error('FAIL ('+failures.length+' of '+(failures.length+passed)+')');for(const f of failures)console.error(' - '+f);process.exit(1);}
console.log('PASS community-resilience-sources ('+passed+' checks)');
