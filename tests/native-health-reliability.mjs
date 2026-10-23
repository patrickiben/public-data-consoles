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
  await page.evaluate(now=>{
   window.__outbreakBaseline=JSON.stringify(SNAP);
   const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
   const csv=(mpox)=>[['location','date','iso_code','total_cases','total_deaths'],...mpox.monthsLabels.map((m,i)=>['World',i===mpox.monthsLabels.length-1?mpox.asof:m+'-01','',mpox.monthsCases[i],mpox.worldDeaths]),...mpox.countries.map(c=>[c.n,c.asof,c.iso,c.cases,c.deaths])].map(row=>row.map(quote).join(',')).join('\n');
   window.__mpoxCSV=csv(SNAP.mpox);window.__validMpoxCSV=__mpoxCSV;
   window.__covidAll={...SNAP.covid.all,updated:now-1000,affectedCountries:SNAP.covid.countries.length};window.__covidCountries=SNAP.covid.countries.map(c=>({country:c.n,cases:c.cases,deaths:c.deaths,updated:now-1000}));
   window.__validCovidAll=structuredClone(__covidAll);window.__validCovidCountries=structuredClone(__covidCountries);window.__requestCount=0;window.__failure=null;
   window.fetch=async url=>{__requestCount++;if(__failure==='hang')return new Promise(()=>{});if(__failure==='http')return {ok:false,status:503};if(String(url)===OWID_CSV)return {ok:true,text:async()=>__mpoxCSV};return {ok:true,json:async()=>structuredClone(String(url)===COVID_ALL?__covidAll:__covidCountries)};};
  },now);
  const state=()=>page.evaluate(()=>({snapshot:JSON.stringify(SNAP),status:structuredClone(OUTBREAK_STATUS),source:document.querySelector('#srcchip').textContent}));
  await check('complete valid public responses commit only after validation with distinct source status',async()=>{
   await page.evaluate(()=>refresh());const r=await state();assert.ok(Object.values(r.status).every(s=>s.state==='downloaded'&&s.downloadedAt&&!s.error));assert.match(r.source,/mpox: downloaded.*covid: downloaded/);evidence.push({case:'outbreak valid refresh',status:r.status});
  });
  const good=await state();
  async function reset(){await page.evaluate(good=>{SNAP=JSON.parse(good.snapshot);window.__mpoxCSV=__validMpoxCSV;window.__covidAll=structuredClone(__validCovidAll);window.__covidCountries=structuredClone(__validCovidCountries);window.__failure=null;},good);}
  await check('future/invalid calendar dates and per-country date regression retain last good mpox',async()=>{
   for(const mode of ['future','calendar','country-regression']){
    await reset();const before=await page.evaluate(()=>JSON.stringify(SNAP.mpox));
    await page.evaluate(mode=>{if(mode==='future')__mpoxCSV=__validMpoxCSV.replaceAll(SNAP.mpox.asof,'2099-01-01');if(mode==='calendar')__mpoxCSV=__validMpoxCSV.replaceAll(SNAP.mpox.asof,'2026-02-30');if(mode==='country-regression'){const c=SNAP.mpox.countries[0];__mpoxCSV=__validMpoxCSV.split('\n').map(line=>line.includes('"'+c.iso+'"')?line.replace(c.asof,'2022-01-01'):line).join('\n');}},mode);
    await page.evaluate(()=>refresh());assert.equal(await page.evaluate(()=>JSON.stringify(SNAP.mpox)),before);assert.equal((await state()).status.mpox.state,'unavailable');
   }
  });
  await check('missing country coverage, duplicate identities and truncated history fail atomically',async()=>{
   for(const mode of ['coverage','duplicate','history']){
    await reset();const before=await page.evaluate(()=>JSON.stringify(SNAP.mpox));
    await page.evaluate(mode=>{const lines=__validMpoxCSV.split('\n');if(mode==='coverage')lines.pop();if(mode==='duplicate')lines.push(lines.at(-1));if(mode==='history')lines.splice(1,1);__mpoxCSV=lines.join('\n');},mode);
    await page.evaluate(()=>refresh());assert.equal(await page.evaluate(()=>JSON.stringify(SNAP.mpox)),before);assert.equal((await state()).status.mpox.state,'unavailable');
   }
  });
  await check('invalid, fractional and overflow counts fail; blank deaths remain unknown and zero remains zero',async()=>{
   for(const value of ['-1','1.5','Infinity','9007199254740992']){
    await reset();const before=await page.evaluate(()=>JSON.stringify(SNAP.mpox));
    await page.evaluate(value=>{const lines=__validMpoxCSV.split('\n'),parts=splitCSVLine(lines.at(-1));parts[3]=value;lines[lines.length-1]=parts.map(v=>'"'+v+'"').join(',');__mpoxCSV=lines.join('\n');},value);
    await page.evaluate(()=>refresh());assert.equal(await page.evaluate(()=>JSON.stringify(SNAP.mpox)),before);
   }
   await reset();const r=await page.evaluate(()=>{const prior=JSON.parse(__outbreakBaseline).mpox,lines=__validMpoxCSV.split('\n'),parts=splitCSVLine(lines.at(-1));parts[3]='0';parts[4]='';lines[lines.length-1]=parts.map(v=>'"'+v+'"').join(',');const parsed=parseMpoxSnapshot(lines.join('\n'),prior);return {count:parsed.sourceCountryCount,date:parsed.sourceCountryDates[parts[2]],allFinite:parsed.countries.every(c=>Number.isFinite(c.cases)),zero:outbreakCount('0'),blank:outbreakCount('',true)};});
   assert.equal(r.zero,0);assert.equal(r.blank,null);assert.ok(r.allFinite&&r.count>0&&r.date);
  });
  await check('retrospective count revisions are allowed without weakening period and identity guards',async()=>{
   await reset();const r=await page.evaluate(()=>{const prior=SNAP.mpox,lines=__validMpoxCSV.split('\n'),parts=splitCSVLine(lines[prior.monthsLabels.length]);parts[3]=String(prior.worldCases-1);lines[prior.monthsLabels.length]=parts.map(v=>'"'+v+'"').join(',');return parseMpoxSnapshot(lines.join('\n'),prior).worldCases;});assert.equal(r,JSON.parse(good.snapshot).mpox.worldCases-1);
  });
  await check('malformed/truncated COVID response and timestamp regression cannot erase last good data',async()=>{
   for(const mode of ['missing-count','boolean','duplicate','coverage','future','regression']){
    await reset();const before=await page.evaluate(()=>JSON.stringify(SNAP.covid));
    await page.evaluate(({mode,now})=>{if(mode==='missing-count')delete __covidAll.cases;if(mode==='boolean')__covidCountries[0].cases=false;if(mode==='duplicate')__covidCountries.push({...__covidCountries[0]});if(mode==='coverage')__covidCountries.pop();if(mode==='future')__covidAll.updated=now+86400000;if(mode==='regression')__covidCountries[0].updated=now-86400000;},{mode,now});
    await page.evaluate(()=>refresh());assert.equal(await page.evaluate(()=>JSON.stringify(SNAP.covid)),before);assert.equal((await state()).status.covid.state,'unavailable');
   }
  });
  await check('simultaneous Refresh calls share one transaction and cannot race a newer result',async()=>{
   await reset();const r=await page.evaluate(async()=>{__requestCount=0;const first=refresh(),second=refresh(),same=first===second;await Promise.all([first,second]);return {same,requests:__requestCount};});assert.equal(r.same,true);assert.equal(r.requests,3);
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
