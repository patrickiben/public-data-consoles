import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const root=new URL('../',import.meta.url),capture=JSON.parse(await readFile(new URL('consoles/us-overdose-surveillance/data/cdc-context.json',root),'utf8')).capturedAt;
const now=Math.max(Date.now(),Date.parse(capture)+3600000),browser=await chromium.launch({headless:true,...(process.env.CHROME_CHANNEL?{channel:process.env.CHROME_CHANNEL}:{})});
let count=0;const evidence=[];
async function check(name,fn){await fn();count++;console.log('PASS native health reliability: '+name);}
async function fixture(slug,run){
 const context=await browser.newContext({serviceWorkers:'block'}),origin='https://native-health.invalid/'+slug+'/',html=await readFile(new URL('consoles/'+slug+'/index.html',root),'utf8'),errors=[];
 try{
  await context.route('**/*',route=>route.request().url()===origin?route.fulfill({contentType:'text/html',body:html}):route.fulfill({status:503,body:'Offline native-page fixture'}));
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.clock.install({time:new Date(now)});await page.goto(origin);
  await page.waitForFunction(()=>document.querySelector('#splash').style.display==='none');await run(page);
  assert.deepEqual(errors,[],slug+' runtime errors');
 }finally{await context.close();}
}
try{
 await fixture('us-overdose-surveillance',async page=>{
  await page.waitForFunction(()=>!!SNAP.responseError);
  const baseline=await page.evaluate(()=>JSON.stringify(SNAP));
  const setup=async body=>page.evaluate(({baseline,body})=>{SNAP=JSON.parse(baseline);(new Function(body))();render();return {total:document.querySelector('#tots').textContent,synthetic:document.querySelector('#syns').textContent,value:document.querySelector('#synv').textContent};},{baseline,body});
  await check('missing newest synthetic count cannot become a zero share',async()=>{
   const r=await setup('SNAP.nat.syn[SNAP.nat.syn.length-1]=null;');assert.match(r.synthetic,/share unavailable/);assert.doesNotMatch(r.synthetic,/~0%/);evidence.push({case:'overdose missing newest',...r});
  });
  await check('genuine same-month zero numerator remains a valid zero percent',async()=>{
   const r=await setup('SNAP.nat.total[SNAP.nat.total.length-1]=100;SNAP.nat.syn[SNAP.nat.syn.length-1]=0;');assert.match(r.synthetic,/~0%.*same ending month/);assert.match(r.value,/^0 predicted/);
  });
  await check('zero/missing denominator and entirely missing synthetic series stay unavailable',async()=>{
   for(const body of ['SNAP.nat.total=SNAP.nat.total.map(()=>null);','SNAP.nat.total[SNAP.nat.total.length-1]=0;','SNAP.nat.syn=SNAP.nat.syn.map(()=>null);']){
    const r=await setup(body);assert.match(r.synthetic,/share unavailable/);assert.doesNotMatch(r.synthetic,/NaN|Infinity|~0%/);
   }
  });
  await check('reported and predicted counts retain separate ending months',async()=>{
   const r=await setup("SNAP.reportedPeriods.syn='2024-01';");assert.match(r.synthetic,/reported:.*12-mo ending Jan 2024/);assert.doesNotMatch(r.synthetic,/reported so far/);
   const unknown=await setup('delete SNAP.reportedPeriods.syn;');assert.match(unknown.synthetic,/ending month unavailable/);
  });
  await check('missing exact prior-year observation is not called flat or replaced by an array offset',async()=>{
   const r=await page.evaluate(baseline=>{SNAP=JSON.parse(baseline);const last=SNAP.periods.at(-1),prior=(+last.slice(0,4)-1)+last.slice(4),i=SNAP.periods.indexOf(prior);SNAP.nat.total[i]=null;render();return document.querySelector('#natcaveat').textContent;},baseline);
   assert.match(r,/matched-year comparison.*unavailable/);assert.doesNotMatch(r,/roughly flat|was unchanged/);
  });
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overdose mobile overflow');
 });
 await fixture('global-maternal-child-health',async page=>{
  const baseline=await page.evaluate(()=>JSON.stringify(SNAP));
  await check('actual regional survey average displays its complete year range and coverage',async()=>{
   const r=await page.evaluate(()=>{INEQMODE='reg';document.querySelector('#ineqind').value='stnt';renderIneq();const rows=COUNTRIES.map(iso=>SNAP.cty[iso]).filter(c=>c?.region==='EAS').map(c=>c.latest?.stnt).filter(d=>d&&Number.isFinite(d.v)&&d.v>=0&&d.v<=100&&/^\d{4}$/.test(String(d.y))&&+d.y<=new Date().getUTCFullYear()),years=rows.map(d=>String(d.y)).sort();return {result:regionStuntMean('EAS'),years,text:document.querySelector('#ineqlist').textContent,desc:document.querySelector('#ineqdesc').textContent};});
   assert.equal(r.result.yearStart,r.years[0]);assert.equal(r.result.yearEnd,r.years.at(-1));assert.equal(r.result.n,r.years.length);assert.ok(r.text.includes(r.result.y));assert.match(r.desc,/full year range.*n of eligible/);evidence.push({case:'stunting current baseline',...r});
  });
  await check('same-year surveys keep one year; invalid/missing records are excluded, never zero',async()=>{
   const r=await page.evaluate(baseline=>{SNAP=JSON.parse(baseline);const codes=COUNTRIES.filter(iso=>SNAP.cty[iso]?.region==='EAS');for(const iso of codes)SNAP.cty[iso].latest.stnt=null;
    SNAP.cty[codes[0]].latest.stnt={v:0,y:'2024'};SNAP.cty[codes[1]].latest.stnt={v:20,y:'2024'};SNAP.cty[codes[2]].latest.stnt={v:null,y:'2024'};SNAP.cty[codes[3]].latest.stnt={v:50,y:'not-a-year'};SNAP.cty[codes[4]].latest.stnt={v:101,y:'2024'};SNAP.cty[codes[5]].latest.stnt={v:50,y:String(new Date().getUTCFullYear()+1)};return regionStuntMean('EAS');},baseline);
   assert.equal(r.v,10);assert.equal(r.n,2);assert.equal(r.y,'2024');assert.equal(r.mixedVintage,false);assert.ok(r.eligible>=r.n);
  });
  await check('a region with no valid surveys remains unknown',async()=>{
   assert.equal(await page.evaluate(()=>{for(const iso of COUNTRIES)if(SNAP.cty[iso]?.region==='EAS')SNAP.cty[iso].latest.stnt={v:null,y:'2024'};return regionStuntMean('EAS');}),null);
  });
  await page.evaluate(baseline=>{SNAP=JSON.parse(baseline);INEQMODE='reg';document.querySelector('#ineqind').value='stnt';renderIneq();},baseline);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'stunting mobile overflow');
 });
 await fixture('global-outbreak-tracker',async page=>{
  await page.waitForFunction(()=>!outbreakRefreshInFlight&&Object.values(OUTBREAK_STATUS).every(s=>s.state==='unavailable'));
  await check('blocked feeds keep each embedded dataset under its own snapshot date',async()=>{
   const r=await page.evaluate(()=>({source:document.querySelector('#srcchip').textContent,dates:EMBEDDED_AT,keys:Object.keys(OUTBREAK_STATUS)}));
   assert.deepEqual(r.keys,['mpox','measles','covid']);
   for(const key of r.keys)assert.match(r.source,new RegExp(key+': unavailable \\([^)]*\\); retaining embedded snapshot '+r.dates[key]));
  });
  await page.evaluate(now=>{
   window.__outbreakBaseline=JSON.stringify(SNAP);
   // WHO table fixture: every retained country reported before 2024 and again on its retained date.
   const who=mpox=>({'@odata.context':'fixture',value:mpox.countries.flatMap(c=>[{ISO3:c.iso,COUNTRY:c.n,DATE:'2023-12-01',TOTAL_CONF_CASES:Math.floor(c.cases/2),TOTAL_CONF_DEATHS:0},{ISO3:c.iso,COUNTRY:c.n,DATE:c.asof,TOTAL_CONF_CASES:c.cases,TOTAL_CONF_DEATHS:c.deaths}])});
   // NNDSS fixture: the retained year at the week before and at its retained week (7 more cases than retained).
   const r=SNAP.measles.nndss.at(-1),nn=(week,ind,imp)=>[{year:r.y,week:String(week),label:'Measles, Indigenous',m3:ind.toFixed(1)},{year:r.y,week:String(week),label:'Measles, Imported',m3:imp.toFixed(1)}];
   window.__mpox=who(SNAP.mpox);window.__validMpox=structuredClone(__mpox);
   window.__measles=[...nn(r.week-1,r.cases-40,12),...nn(r.week,r.cases+7-12,12)];window.__validMeasles=structuredClone(__measles);
   window.__covidAll={...SNAP.covid.all,updated:now-1000,affectedCountries:SNAP.covid.countries.length};window.__covidCountries=SNAP.covid.countries.map(c=>({country:c.n,cases:c.cases,deaths:c.deaths,updated:now-1000}));
   window.__validCovidAll=structuredClone(__covidAll);window.__validCovidCountries=structuredClone(__covidCountries);window.__requestCount=0;window.__failure=null;
   window.fetch=async url=>{__requestCount++;if(__failure==='hang')return new Promise(()=>{});if(__failure==='http')return {ok:false,status:503};const u=String(url);if(u===WHO_MPOX)return {ok:true,json:async()=>structuredClone(__mpox)};if(u===NNDSS_MEASLES)return {ok:true,json:async()=>structuredClone(__measles)};return {ok:true,json:async()=>structuredClone(u===COVID_ALL?__covidAll:__covidCountries)};};
  },now);
  const state=()=>page.evaluate(()=>({snapshot:JSON.stringify(SNAP),status:structuredClone(OUTBREAK_STATUS),source:document.querySelector('#srcchip').textContent}));
  await check('complete valid public responses commit only after validation with distinct source status',async()=>{
   await page.evaluate(()=>refresh());const r=await state();assert.ok(Object.values(r.status).every(s=>s.state==='downloaded'&&s.downloadedAt&&!s.error));assert.match(r.source,/mpox: downloaded.*measles: downloaded.*covid: downloaded/);evidence.push({case:'outbreak valid refresh',status:r.status});
   const shown=await page.evaluate(()=>{const r=SNAP.measles.nndss.at(-1);return {r,base:JSON.parse(__outbreakBaseline).measles.nndss.at(-1).cases,text:document.querySelector('#msCtxSub').textContent,bars:document.querySelector('#msBars').textContent};});
   assert.equal(shown.r.cases,shown.base+7);
   assert.ok(shown.text.includes(shown.r.cases.toLocaleString()+' reported through MMWR week '+shown.r.week+' (week ending '+shown.r.weekEnding+'), CDC NNDSS provisional'),shown.text);
   assert.ok(shown.bars.includes(shown.r.cases.toLocaleString()));
  });
  const good=await state();
  async function reset(){await page.evaluate(good=>{SNAP=JSON.parse(good.snapshot);window.__mpox=structuredClone(__validMpox);window.__measles=structuredClone(__validMeasles);window.__covidAll=structuredClone(__validCovidAll);window.__covidCountries=structuredClone(__validCovidCountries);window.__failure=null;},good);}
  await check('future/invalid calendar dates and per-country date regression retain last good mpox',async()=>{
   for(const mode of ['future','calendar','country-regression']){
    await reset();const before=await page.evaluate(()=>JSON.stringify(SNAP.mpox));
    await page.evaluate(mode=>{const iso=SNAP.mpox.countries[0].iso;__mpox.value=__mpox.value.map(r=>mode==='future'&&r.DATE===SNAP.mpox.asof?{...r,DATE:'2099-01-01'}:mode==='calendar'&&r.DATE===SNAP.mpox.asof?{...r,DATE:'2026-02-30'}:mode==='country-regression'&&r.ISO3===iso&&r.DATE!=='2023-12-01'?{...r,DATE:'2022-01-01'}:r);},mode);
    await page.evaluate(()=>refresh());assert.equal(await page.evaluate(()=>JSON.stringify(SNAP.mpox)),before);assert.equal((await state()).status.mpox.state,'unavailable');
   }
  });
  await check('missing country coverage, duplicate identities, paging and truncated history fail atomically',async()=>{
   for(const mode of ['coverage','duplicate','history','paged']){
    await reset();const before=await page.evaluate(()=>JSON.stringify(SNAP.mpox));
    await page.evaluate(mode=>{const rows=__mpox.value;if(mode==='coverage'){const iso=rows.at(-1).ISO3;__mpox.value=rows.filter(r=>r.ISO3!==iso);}if(mode==='duplicate')rows.push({...rows.at(-1)});if(mode==='history')__mpox.value=rows.filter(r=>r.DATE>='2024-01-01');if(mode==='paged')__mpox['@odata.nextLink']='next';},mode);
    await page.evaluate(()=>refresh());assert.equal(await page.evaluate(()=>JSON.stringify(SNAP.mpox)),before);assert.equal((await state()).status.mpox.state,'unavailable');
   }
  });
  await check('invalid, fractional and overflow counts fail; blank deaths remain unknown and zero remains zero',async()=>{
   for(const value of [-1,1.5,Infinity,9007199254740992,'1.5','x',null]){
    await reset();const before=await page.evaluate(()=>JSON.stringify(SNAP.mpox));
    await page.evaluate(value=>{__mpox.value.at(-1).TOTAL_CONF_CASES=value;},value);
    await page.evaluate(()=>refresh());assert.equal(await page.evaluate(()=>JSON.stringify(SNAP.mpox)),before);
   }
   await reset();const r=await page.evaluate(()=>{const prior=JSON.parse(__outbreakBaseline).mpox,data=structuredClone(__validMpox),last=data.value.at(-1);last.TOTAL_CONF_CASES=0;last.TOTAL_CONF_DEATHS=null;const parsed=parseMpoxSnapshot(data,prior);return {count:parsed.sourceCountryCount,date:parsed.sourceCountryDates[last.ISO3],allFinite:parsed.countries.every(c=>Number.isFinite(c.cases)),worldDeaths:parsed.worldDeaths,zero:outbreakCount('0'),blank:outbreakCount('',true)};});
   assert.equal(r.zero,0);assert.equal(r.blank,null);assert.equal(r.worldDeaths,null);assert.ok(r.allFinite&&r.count>0&&r.date);
  });
  await check('retrospective count revisions are allowed without weakening period and identity guards',async()=>{
   await reset();const r=await page.evaluate(()=>{const prior=SNAP.mpox,data=structuredClone(__validMpox);data.value.at(-1).TOTAL_CONF_CASES-=1;return parseMpoxSnapshot(data,prior).worldCases;});assert.equal(r,JSON.parse(good.snapshot).mpox.worldCases-1);
  });
  await check('flagged, incomplete, regressed, duplicate and malformed NNDSS responses retain last good measles',async()=>{
   for(const mode of ['flagged','incomplete','regressed','duplicate','malformed','negative']){
    await reset();const before=await page.evaluate(()=>JSON.stringify(SNAP.measles));
    await page.evaluate(mode=>{const top=String(SNAP.measles.nndss.at(-1).week),last=__measles.filter(r=>r.week===top);if(mode==='flagged'){delete last[0].m3;last[0].m3_flag='U';}if(mode==='incomplete')__measles=__measles.filter(r=>r!==last[1]);if(mode==='regressed')__measles=__measles.filter(r=>r.week!==top);if(mode==='duplicate')__measles.push({...last[1]});if(mode==='malformed')__measles={};if(mode==='negative')last[1].m3='-1.0';},mode);
    await page.evaluate(()=>refresh());assert.equal(await page.evaluate(()=>JSON.stringify(SNAP.measles)),before,mode);assert.equal((await state()).status.measles.state,'unavailable',mode);
   }
  });
  await check('malformed/truncated COVID response and timestamp regression cannot erase last good data',async()=>{
   for(const mode of ['missing-count','boolean','duplicate','coverage','future','regression']){
    await reset();const before=await page.evaluate(()=>JSON.stringify(SNAP.covid));
    await page.evaluate(({mode,now})=>{if(mode==='missing-count')delete __covidAll.cases;if(mode==='boolean')__covidCountries[0].cases=false;if(mode==='duplicate')__covidCountries.push({...__covidCountries[0]});if(mode==='coverage')__covidCountries.pop();if(mode==='future')__covidAll.updated=now+86400000;if(mode==='regression')__covidCountries[0].updated=now-86400000;},{mode,now});
    await page.evaluate(()=>refresh());assert.equal(await page.evaluate(()=>JSON.stringify(SNAP.covid)),before);assert.equal((await state()).status.covid.state,'unavailable');
   }
  });
  await check('simultaneous Refresh calls share one transaction and cannot race a newer result',async()=>{
   await reset();const r=await page.evaluate(async()=>{__requestCount=0;const first=refresh(),second=refresh(),same=first===second;await Promise.all([first,second]);return {same,requests:__requestCount};});assert.equal(r.same,true);assert.equal(r.requests,4);
  });
  await check('HTTP failure retains successful downloads and labels their retained vintage',async()=>{
   await reset();const before=(await state()).snapshot;await page.evaluate(()=>{__failure='http';return refresh();});const r=await state();assert.equal(r.snapshot,before);assert.match(r.source,/unavailable.*retaining download/);assert.ok(Object.values(r.status).every(s=>s.error.includes('HTTP503')||s.error.includes('HTTP 503')));
  });
  await check('never-settling requests stop at bounded timeout and retain last good records',async()=>{
   await reset();const before=(await state()).snapshot;await page.evaluate(()=>{__failure='hang';refresh();});await page.clock.fastForward(16000);await page.waitForFunction(()=>!outbreakRefreshInFlight);const r=await state();assert.equal(r.snapshot,before);assert.ok(Object.values(r.status).every(s=>s.state==='unavailable'&&s.error.includes('timed out')));evidence.push({case:'outbreak timeout',status:r.status});
  });
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'outbreak mobile overflow');
 });
 if(process.env.NATIVE_HEALTH_QA){await mkdir(process.env.NATIVE_HEALTH_QA,{recursive:true});await writeFile(process.env.NATIVE_HEALTH_QA+'/results.json',JSON.stringify({checks:count,evidence},null,2)+'\n');}
 console.log('PASS '+count+' native health reliability groups');
}finally{await browser.close();}
