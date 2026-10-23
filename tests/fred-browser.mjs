import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

// Load the real standalone console. Every HTTP response is local fixture data;
// no public market endpoint or FRED download is contacted by this suite.
const root=new URL('../',import.meta.url);
const html=await readFile(new URL('consoles/resilience-telemetry/index.html',root),'utf8');
const original=JSON.parse(await readFile(new URL('consoles/resilience-telemetry/data/fred_snapshot.json',root),'utf8'));
const browser=await chromium.launch({headless:true,channel:process.env.CHROME_CHANNEL||undefined});
let passed=0;
async function scenario(name,fn,file=false){
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  const state={payload:structuredClone(original),status:200,requests:0,delay:0};
  page.on('pageerror',error=>errors.push(String(error)));
  await page.clock.install({time:new Date(Date.parse(original.capturedAt)+7200000)});
  await context.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.protocol==='file:')return route.continue();
    if(u.hostname==='fred-fixture.invalid'&&u.pathname==='/data/fred_snapshot.json'){
      state.requests++;
      if(state.delay)await new Promise(resolve=>setTimeout(resolve,state.delay));
      return route.fulfill({status:state.status,contentType:'application/json',body:JSON.stringify(state.payload)}).catch(()=>{});
    }
    if(u.hostname==='fred-fixture.invalid')return route.fulfill({contentType:'text/html',body:html});
    return route.abort();
  });
  try{
    await page.goto(file?new URL('consoles/resilience-telemetry/index.html',root).href:'https://fred-fixture.invalid/',{waitUntil:'load'});
    await page.waitForFunction(()=>document.getElementById('splash').style.display==='none',null,{timeout:60000});
    await page.waitForFunction(()=>!['embedded','checking'].includes(ResilienceMacro.state.mode));
    await fn(page,state);assert.deepEqual(errors,[]);passed++;console.log('PASS FRED '+name);
  }finally{await context.close();}
}
const snapshot=page=>page.evaluate(()=>ResilienceMacro.snapshot());
const refresh=page=>page.evaluate(()=>ResilienceMacro.refresh());
const newer=()=>{const p=structuredClone(original);p.capturedAt=new Date(Date.parse(p.capturedAt)+60000).toISOString();return p;};
try{
  await scenario('automatic complete update, official revision and zero values',async(page,state)=>{
    assert.equal((await snapshot(page)).series.UNRATE.v.at(-1),original.series.UNRATE.v.at(-1));
    assert.equal(await page.evaluate(()=>ResilienceMacro.state.mode),'published');
    assert.equal(state.requests,1);
    const unrelated=await page.evaluate(()=>JSON.stringify({cape:VAL,markets:SNAP,calendar:DAYS}));
    const next=newer();next.series.UNRATE.v[next.series.UNRATE.v.length-1]=0;
    next.sources.find(s=>s.series==='UNRATE').csv_sha256='1'.repeat(64);state.payload=next;
    assert.equal(await refresh(page),true);
    assert.equal((await snapshot(page)).series.UNRATE.v.at(-1),0);
    assert.match(await page.locator('#macro-refresh-status').textContent(),/Published public macro data.*Observation periods differ/);
    assert.equal(await page.evaluate(()=>JSON.stringify({cape:VAL,markets:SNAP,calendar:DAYS})),unrelated);
    assert.equal((await snapshot(page)).metadata.capturedAt,next.capturedAt);
  });
  await scenario('malformed, incomplete, future and regressed updates retain last good',async(page,state)=>{
    const good=await snapshot(page);
    const invalid=[
      ['missing series',p=>{delete p.series.UNRATE;}],
      ['missing source',p=>p.sources.pop()],
      ['duplicate source',p=>p.sources[1]=p.sources[0]],
      ['nonfinite observation',p=>p.series.UNRATE.v[0]=null],
      ['unit mismatch',p=>p.series.UNRATE.unit='fraction'],
      ['history hole',p=>{p.series.UNRATE.d.splice(2,1);p.series.UNRATE.v.splice(2,1);}],
      ['latest regression',p=>{p.series.UNRATE.d.pop();p.series.UNRATE.v.pop();}],
      ['future capture',p=>{p.capturedAt='2099-01-01T00:00:00Z';p.retrieved_on='2099-01-01';}],
      ['older capture',p=>p.capturedAt=new Date(Date.parse(original.capturedAt)-60000).toISOString()],
      ['wrong source origin',p=>p.sources[0].url='https://example.com/macro.csv'],
      ['invalid schema',p=>p.schemaVersion=true],
      ['source count mismatch',p=>p.sources[0].embedded_points++],
      ['source ends before embedded observations',p=>p.sources.find(s=>s.series==='UNRATE').source_last=p.sources.find(s=>s.series==='UNRATE').source_first],
    ];
    for(const [label,mutate] of invalid){state.payload=newer();mutate(state.payload);assert.equal(await refresh(page),false,label);assert.deepEqual(await snapshot(page),good,label);}
    state.status=503;assert.equal(await refresh(page),false);assert.deepEqual(await snapshot(page),good);
    assert.match(await page.locator('#macro-refresh-status').textContent(),/unavailable; retaining last good data/);
  });
  await scenario('single-flight requests and visible hourly refresh',async(page,state)=>{
    state.delay=50;const before=state.requests;
    assert.deepEqual(await page.evaluate(()=>Promise.all([ResilienceMacro.refresh(),ResilienceMacro.refresh()])),[true,true]);
    assert.equal(state.requests,before+1);
    state.delay=0;const hourly=state.requests;await page.clock.fastForward(3600001);
    await page.waitForFunction(()=>ResilienceMacro.state.mode!=='checking');
    assert.ok(state.requests>hourly);
  });
  await scenario('a stalled response times out without replacing the macro history',async(page,state)=>{
    const before=await snapshot(page);state.delay=1500;
    await page.evaluate(()=>{window.fixtureFredResult=ResilienceMacro.refresh();});
    await page.waitForFunction(()=>ResilienceMacro.state.mode==='checking');
    await page.clock.fastForward(12001);
    assert.equal(await page.evaluate(()=>window.fixtureFredResult),false);
    assert.deepEqual(await snapshot(page),before);
    assert.match(await page.evaluate(()=>ResilienceMacro.state.error),/timed out/);
  });
  await scenario('standalone offline fallback makes no macro request',async(page,state)=>{
    assert.equal(state.requests,0);assert.equal(await page.evaluate(()=>ResilienceMacro.state.mode),'offline');
    assert.deepEqual((await snapshot(page)).series,original.series);
    assert.match(await page.locator('#macro-refresh-status').textContent(),/Local-file view: embedded macro history/);
  },true);
  console.log(`PASS ${passed} FRED automatic browser scenarios`);
}finally{await browser.close();}
