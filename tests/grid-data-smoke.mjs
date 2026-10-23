// Real browser regressions for data integrity. Every request is fulfilled locally;
// no API keys, external services, CDN files, or map tiles are contacted.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Optional candidate HTML lets maintainers test a freshly refreshed dataset before publishing it.
const html = await readFile(process.env.GRID_HTML || new URL('../consoles/us-grid-strain/index.html', import.meta.url), 'utf8');
const origin = 'https://grid-data-smoke.invalid/';
const embedded = JSON.parse(html.match(/<script type="application\/json" id="grid-snapshot">(.*?)<\/script>/s)[1]);
const shiftedPeriod = (p, hours) => new Date(Date.parse(p + ':00:00Z') + hours * 3600000).toISOString().slice(0, 13);
const period = shiftedPeriod(embedded.demandThrough, 24);
const previousPeriod = shiftedPeriod(period, -1);
const nextPeriod = shiftedPeriod(period, 1);
const aggregatePeriod = shiftedPeriod(period, -2);
const displayPeriod = p => p.replace('T', ' ') + ':00 UTC';
const row = (respondent, type, value, stamp = period) => ({ respondent, type, value, period: stamp });
const demand = [row('PJM', 'D', '100'), row('PJM', 'DF', '80'), row('PJM', 'NG', '110'), row('PJM', 'TI', '10')];
const history = [row('PJM', 'D', '100'), row('PJM', 'D', '120', previousPeriod)];
const interchange = [{ fromba: 'PJM', toba: 'NYIS', value: '10', period }];
const fuel = [{ fueltype: 'NG', value: '100', period }];
let passed = 0;
const browser = await chromium.launch({ headless: true, channel: process.env.CHROME_CHANNEL || undefined });

async function scenario(name, overrides, verify) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const errors = [], apiCalls = [];
  try {
    const source = overrides.html || html;
    const metadata = JSON.parse(source.match(/<script type="application\/json" id="grid-snapshot">(.*?)<\/script>/s)[1]);
    const expectedCount = new Set(metadata.snap.filter(r => r[1] === 'D').map(r => r[0])).size;
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.href === origin) return route.fulfill({ contentType: 'text/html', body: source });
      if (url.origin === new URL(origin).origin && url.pathname.endsWith('/data/latest.json')) return route.fulfill({ status: 404, body: 'Fixture: publisher unavailable' });
      if (url.hostname === 'api.eia.gov') {
        apiCalls.push(url.pathname);
        if (overrides.rejectAPI) return route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"fixture key rejected"}' });
        let data;
        if (url.pathname.endsWith('/fuel-type-data/data/')) data = overrides.fuel || fuel;
        else if (url.pathname.endsWith('/interchange-data/data/')) data = interchange;
        else if (url.pathname.endsWith('/region-data/data/')) {
          data = url.searchParams.getAll('facets[type][]').length === 1 ? (overrides.history ?? history) : (overrides.demand || demand);
        } else throw new Error('Unexpected EIA path: ' + url.pathname);
        return route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify({ response: { data } }) });
      }
      return route.fulfill({ status: 503, body: 'Offline fixture: dependency unavailable' });
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin, { waitUntil: 'load' });
    await page.waitForFunction(expected => document.querySelectorAll('#lead .row2').length === expected, expectedCount);
    assert.equal(apiCalls.length, 0, 'Public snapshot must not request EIA API access');
    if (!overrides.skipAPI) {
      await page.locator('#changekey').click();
      await page.locator('#keyin').fill('fixture-personal-key-not-real-123456');
      await page.locator('#savekey').click();
      if (overrides.rejectAPI) await page.waitForFunction(() => document.querySelector('#upd').textContent.includes('Refresh failed'));
      else await page.waitForFunction(() => STATE.mode === 'api');
      await page.locator('#lead .row2[data-c="PJM"]').click();
      await page.waitForFunction(() => !document.getElementById('dfleg').textContent.includes('loading'));
    }
    await verify(page, metadata, expectedCount);
    assert.deepEqual(errors, [], 'No browser runtime errors');
    console.log('PASS grid data: ' + name);
    passed++;
  } finally {
    await context.close();
  }
}

async function missingBaseline(page) {
  const pjm = page.locator('#lead .row2[data-c="PJM"]');
  assert.equal((await pjm.locator('.pct').textContent()).trim(), '—');
  assert.match(await pjm.textContent(), /baseline unavailable/);
  assert.match(await page.locator('#dkpis').textContent(), /baseline unavailable/);
  assert.doesNotMatch(await page.locator('#dkpis').textContent(), /0%\s*normal/);
  assert.equal(await page.evaluate(() => CATCOL(STATE.ba.PJM.pct)), '#7e93ad');
  assert.equal(await page.evaluate(() => CATLAB(STATE.ba.PJM.pct)), 'baseline unavailable');
  assert.equal(await page.evaluate(() => STATE.ba.PJM.D), 100, 'Measured demand survives unavailable history');
}

function publicPayload(hours=0) {
  const data=structuredClone(embedded);
  data.schemaVersion=1;data.refreshEveryHours=6;
  data.capturedAt=new Date(Date.parse(data.capturedAt)+hours*3600000).toISOString();
  for(const key of ['demandThrough','interchangeThrough','historyStart'])data[key]=shiftedPeriod(data[key],hours);
  data.snap=data.snap.map(r=>[r[0],r[1],shiftedPeriod(r[2],hours),r[3]]);
  for(const rows of Object.values(data.history))for(const row of rows)row[0]=shiftedPeriod(row[0],hours);
  for(const mix of Object.values(data.fuel))mix[0]=shiftedPeriod(mix[0],hours);
  data.interchange=data.interchange.map(r=>[r[0],r[1],r[2],shiftedPeriod(r[3],hours)]);
  return data;
}
async function publishedScenario(name,options,verify){
 const context=await browser.newContext({serviceWorkers:'block'});const errors=[],requests=[];let calls=0;
 const now=options.now??Math.max(Date.now(),Date.parse(embedded.capturedAt)+2*3600000);
 try{
  if(options.savedKey)await context.addInitScript(()=>localStorage.setItem('eia_key','old-saved-fixture-key-no-auto-API'));
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());requests.push(url.href);
   if(url.href===origin)return route.fulfill({contentType:'text/html',body:html});
   if(url.origin===new URL(origin).origin&&url.pathname.endsWith('/data/latest.json')){
    const response=options.responses[Math.min(calls++,options.responses.length-1)];
    if(response.hang)return;
    return route.fulfill({status:response.status||200,contentType:'application/json',body:response.raw??JSON.stringify(response.data)});
   }
   if(url.hostname==='api.eia.gov'){
    const apiPeriod=shiftedPeriod(embedded.demandThrough,4);
    const apiRow=(type,value)=>({respondent:'PJM',type,value,period:options.apiOlderBA?embedded.snap.find(r=>r[0]==='PJM'&&r[1]==='D')[2]:apiPeriod});
    const newBA=options.apiOlderBA?[{respondent:'ZZZ',type:'D',value:'125',period:apiPeriod}]:[];
    const data=url.pathname.includes('interchange-data')?[{fromba:'PJM',toba:'NYIS',value:'10',period:apiPeriod}]:url.searchParams.getAll('facets[type][]').length===1?[apiRow('D','400'),...newBA]:[apiRow('D','400'),apiRow('DF','380'),apiRow('NG','410'),apiRow('TI','10'),...newBA];
    return route.fulfill({contentType:'application/json',body:JSON.stringify({response:{data}})});
   }
   return route.fulfill({status:503,body:'Fixture: optional map unavailable'});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date(now)});
  await page.goto(origin,{waitUntil:'load'});
  if(!options.responses[0].hang)await page.waitForFunction(()=>!publicRequest);
  await verify(page,{requests,get calls(){return calls;},now});
  assert.deepEqual(errors,[],name);console.log('PASS grid public updates: '+name);passed++;
 }finally{await context.close();}
}

try {
  await scenario('rejected optional API connection retains the complete public snapshot', { rejectAPI: true }, async (page, metadata, expectedCount) => {
    assert.equal(await page.locator('#lead .row2').count(), expectedCount);
    assert.equal(await page.locator('#connection-panel').isVisible(), false);
    assert.match(await page.locator('#data-note').textContent(), /embedded EIA snapshot.*Not live.*API refresh failed/);
    assert.equal(await page.evaluate(() => STATE.mode), 'snapshot');
    assert.ok(await page.locator('#dramp b').count() > 0, 'Public demand details remain available');
  });
  await scenario('empty HTTP 200 history is unavailable', { history: [] }, missingBaseline);
  await scenario('partial HTTP 200 history does not give missing BA a green zero', {
    demand: [...demand, row('NYIS', 'D', '50')], history: [row('NYIS', 'D', '60')],
  }, async page => {
    await missingBaseline(page);
    assert.equal(await page.locator('#lead .row2[data-c="NYIS"] .pct').textContent(), '83%');
  });
  await scenario('zero peak is unavailable', { history: [row('PJM', 'D', '0')] }, missingBaseline);
  await scenario('fuel bar uses one hour and discloses unreported categories', {
    fuel: [
      { fueltype: 'NG', value: '100', period },
      { fueltype: 'COL', value: '50', period: previousPeriod },
      { fueltype: 'SUN', value: null, period },
    ],
  }, async page => {
    const legend = await page.locator('#dfleg').textContent();
    assert.match(legend, /Natural gas 100%/);
    assert.doesNotMatch(legend, /Coal/);
    assert.match(legend, /Missing categories are unreported, not zero/);
    assert.ok((await page.locator('#dfuelhd').textContent()).includes(displayPeriod(period)));
    assert.equal(await page.locator('#dfuel span').count(), 1);
  });
  await scenario('forecast-only US48 does not relabel the BA sum', {
    demand: [...demand, row('US48', 'DF', '99999', nextPeriod)],
  }, async page => {
    assert.match(await page.locator('#natdemand').textContent(), /Reported BA demand\s+0\.1 GW/);
    assert.match(await page.locator('#kpis .kpi').first().textContent(), /Sum of latest BA demand/);
    assert.doesNotMatch(await page.locator('#kpis').textContent(), /Total U\.S\. demand/);
    assert.equal(await page.locator('#lead .row2').count(), 1, 'US48 aggregate excluded from BA leaderboard');
  });
  await scenario('actual US48 aggregate has its own timestamp', {
    demand: [...demand, row('US48', 'D', '250', aggregatePeriod)],
  }, async page => {
    assert.match(await page.locator('#natdemand').textContent(), /U\.S\. demand\s+0\.3 GW/);
    assert.ok((await page.locator('#natdemand').textContent()).includes(displayPeriod(aggregatePeriod)));
    assert.match(await page.locator('#kpis .kpi').first().textContent(), /Total U\.S\. demand/);
    assert.ok((await page.locator('#data-note').textContent()).includes('US48 aggregate as of ' + displayPeriod(aggregatePeriod)));
  });
  const snapshotPattern = /(<script type="application\/json" id="grid-snapshot">)(.*?)(<\/script>)/s;
  const snapshot = JSON.parse(html.match(snapshotPattern)[2]);
  snapshot.capturedAt = '2027-01-15T12:00:00+00:00';
  snapshot.sources = snapshot.sources.map(source => ({ ...source, url: source.url.replace('2026_Jul_Dec', '2027_Jan_Jun') }));
  const futureHTML = html.replace(snapshotPattern, (_, before, unused, after) => before + JSON.stringify(snapshot) + after);
  await scenario('future capture updates visible source links and date', { html: futureHTML, skipAPI: true }, async page => {
    assert.equal(await page.locator('#snapshot-capture').textContent(), '15 January 2027');
    assert.match(await page.locator('#balance-source').getAttribute('href'), /EIA930_BALANCE_2027_Jan_Jun\.csv$/);
    assert.match(await page.locator('#interchange-source').getAttribute('href'), /EIA930_INTERCHANGE_2027_Jan_Jun\.csv$/);
    assert.match(await page.locator('#data-note').textContent(), /captured 2027-01-15/);
  });
  await publishedScenario('published data loads anonymously and fuel stays keyless',{responses:[{data:publicPayload(1)}],savedKey:true},async(page,probe)=>{
    assert.equal(await page.evaluate(()=>STATE.mode),'published');
    assert.equal(await page.evaluate(()=>STATE.demandThrough),publicPayload(1).demandThrough);
    assert.match(await page.locator('#data-note').textContent(),/automatically updated public EIA reports/);
    assert.match(await page.locator('#public-check-status').textContent(),/Published reports checked/);
    await page.locator('#lead .row2[data-c="PJM"]').click();
    assert.match(await page.locator('#dfleg').textContent(),/Natural gas/);
    assert.equal(probe.requests.some(u=>new URL(u).hostname==='api.eia.gov'),false,'Saved key does not auto-connect or gate fuel');
  });
  for(const failure of [{status:404},{status:503},{raw:'truncated JSON'},{data:{schemaVersion:1}}]){
    await publishedScenario('bad/unavailable publisher keeps embedded data '+JSON.stringify(failure),{responses:[failure]},async page=>{
      assert.equal(await page.evaluate(()=>STATE.mode),'snapshot');
      assert.equal(await page.evaluate(()=>STATE.demandThrough),embedded.demandThrough);
      assert.match(await page.locator('#public-check-status').textContent(),/keeping the last good/);
    });
  }
  const malformed=publicPayload(2);malformed.snap[0][3]=null;
  const regressed=publicPayload(-1);
  const missingBA=publicPayload(2);missingBA.snap=missingBA.snap.filter(r=>r[0]!=='PJM');delete missingBA.history.PJM;delete missingBA.fuel.PJM;
  const missingPair=publicPayload(2);missingPair.interchange.shift();
  const olderBA=publicPayload(2),pjmDemand=embedded.snap.find(r=>r[0]==='PJM'&&r[1]==='D');
  for(const row of olderBA.snap)if(row[0]==='PJM')row[2]=pjmDemand[2];
  olderBA.history.PJM=olderBA.history.PJM.filter(r=>r[0]!==pjmDemand[2]);olderBA.history.PJM.push([pjmDemand[2],pjmDemand[3]]);
  const olderPair=publicPayload(2);olderPair.interchange[0][3]=embedded.interchange[0][3];
  for(const [label,data]of [['malformed partial update',malformed],['regressed capture/measurements',regressed],['missing still-current BA',missingBA],['missing still-current interchange pair',missingPair],['one regressed BA amid newer reports',olderBA],['one regressed pair amid newer reports',olderPair]]){
    await publishedScenario(label+' cannot replace a good published state',{responses:[{data:publicPayload(1)},{data}]},async page=>{
      const previous=await page.evaluate(()=>JSON.stringify(STATE));
      await page.locator('#refresh').click();await page.waitForFunction(()=>!publicRequest);
      assert.equal(await page.evaluate(()=>JSON.stringify(STATE)),previous);
      assert.match(await page.locator('#public-check-status').textContent(),/keeping the last good/);
    });
  }
  const differentPopulation=publicPayload(1);
  differentPopulation.snap.push(['ZZZ','D',differentPopulation.demandThrough,125]);differentPopulation.history.ZZZ=[[differentPopulation.demandThrough,125]];
  await publishedScenario('a new BA is accepted without a fixed population count',{responses:[{data:differentPopulation}]},async page=>{
    assert.equal(await page.evaluate(()=>STATE.mode),'published');
    assert.equal(await page.locator('#lead .row2[data-c="ZZZ"]').count(),1);
    assert.equal(await page.locator('#lead .row2').count(),new Set(embedded.snap.filter(r=>r[1]==='D').map(r=>r[0])).size+1);
  });
  // Advance the complete seven-day window beyond the previous reports. Narrowing
  // it around a particular BA can strand unrelated fuel records outside the window.
  const expiredPopulation=publicPayload(8*24),expiredCode=embedded.snap.find(r=>r[1]==='D')[0];
  expiredPopulation.snap=expiredPopulation.snap.filter(r=>r[0]!==expiredCode);
  delete expiredPopulation.history[expiredCode];delete expiredPopulation.fuel[expiredCode];
  await publishedScenario('reports outside the rolling window may expire',{responses:[{data:expiredPopulation}],now:Date.parse(expiredPopulation.capturedAt)+3600000},async page=>{
    assert.equal(await page.evaluate(()=>STATE.mode),'published');
    assert.equal(await page.locator('#lead .row2[data-c="'+expiredCode+'"]').count(),0);
    assert.equal(await page.evaluate(()=>STATE.interchangeThrough),expiredPopulation.interchangeThrough);
  });
  await publishedScenario('public checks preserve newer explicitly connected personal reports',{responses:[{data:publicPayload(1)},{data:publicPayload(2)}]},async page=>{
    await page.locator('#changekey').click();await page.locator('#keyin').fill('explicit-fixture-personal-key-123456');await page.locator('#savekey').click();
    await page.waitForFunction(()=>STATE.mode==='api');const through=await page.evaluate(()=>STATE.demandThrough);
    await page.locator('#refresh').click();await page.waitForFunction(()=>!publicRequest);
    assert.equal(await page.evaluate(()=>STATE.mode),'api');assert.equal(await page.evaluate(()=>STATE.demandThrough),through);
    assert.match(await page.locator('#public-check-status').textContent(),/personal API reports remain displayed/);
  });
  await publishedScenario('personal API cannot regress one BA behind a newer global maximum',{responses:[{data:publicPayload(1)}],apiOlderBA:true},async page=>{
    const previous=await page.evaluate(()=>JSON.stringify(STATE));
    await page.locator('#changekey').click();await page.locator('#keyin').fill('explicit-fixture-personal-key-123456');await page.locator('#savekey').click();
    await page.waitForFunction(()=>!loading);
    assert.equal(await page.evaluate(()=>JSON.stringify(STATE)),previous);
    assert.match(await page.locator('#data-note').textContent(),/personal API response is older/);
  });
  await publishedScenario('visible polling, hidden pause and visibility recheck',{responses:[{data:publicPayload(1)}]},async(page,probe)=>{
    await page.evaluate(()=>{window.fixtureHidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.fixtureHidden});});
    const before=probe.calls;await page.clock.runFor(15*60000+10);assert.equal(probe.calls,before);
    await page.evaluate(()=>{window.fixtureHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>!publicRequest);assert.equal(probe.calls,before+1);
    await page.clock.runFor(15*60000+10);await page.waitForFunction(()=>!publicRequest);assert.equal(probe.calls,before+2);
  });
  await publishedScenario('published fetch timeout preserves fallback',{responses:[{hang:true}]},async page=>{
    await page.clock.runFor(12001);await page.waitForFunction(()=>!publicRequest);
    assert.equal(await page.evaluate(()=>STATE.mode),'snapshot');
    assert.match(await page.locator('#public-check-status').textContent(),/keeping the last good/);
  });
  await publishedScenario('successful checks do not hide aging measurements',{responses:[{data:publicPayload(1)}]},async page=>{
    await page.clock.setSystemTime(Date.parse(embedded.capturedAt)+96*3600000);
    await page.locator('#refresh').click();await page.waitForFunction(()=>!publicRequest);
    assert.match(await page.locator('#data-note').textContent(),/DATA AGE.*72 hours/);
    assert.match(await page.locator('#data-note').textContent(),/UPDATE AGE.*48 hours/);
    assert.equal(await page.evaluate(()=>STATE.capturedAt),publicPayload(1).capturedAt,'A check does not become a new capture');
  });
  await publishedScenario('failed checks update age warnings without changing measurements',{responses:[{data:publicPayload(1)},{status:503}]},async page=>{
    await page.clock.setSystemTime(Date.parse(embedded.capturedAt)+96*3600000);
    await page.locator('#refresh').click();await page.waitForFunction(()=>!publicRequest);
    assert.match(await page.locator('#data-note').textContent(),/DATA AGE.*72 hours/);
    assert.match(await page.locator('#data-note').textContent(),/UPDATE AGE.*48 hours/);
    assert.match(await page.locator('#public-check-status').textContent(),/keeping the last good/);
    assert.equal(await page.evaluate(()=>STATE.capturedAt),publicPayload(1).capturedAt);
  });
  {
    const context=await browser.newContext({serviceWorkers:'block'}),requests=[],errors=[];
    try{
      await context.route('**/*',route=>{const url=new URL(route.request().url());requests.push(url.href);return url.protocol==='file:'?route.continue():route.fulfill({status:503,body:'Offline fixture'});});
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.goto(new URL('../consoles/us-grid-strain/index.html',import.meta.url).href,{waitUntil:'load'});
      await page.locator('#refresh').click();
      assert.equal(await page.evaluate(()=>STATE.mode),'snapshot');
      assert.match(await page.locator('#public-check-status').textContent(),/Local-file view/);
      assert.equal(requests.some(u=>u.includes('/data/latest.json')||new URL(u).hostname==='api.eia.gov'),false);
      assert.deepEqual(errors,[]);passed++;console.log('PASS grid public updates: local-file view keeps embedded data without public/API fetches');
    }finally{await context.close();}
  }
  console.log(`PASS ${passed} grid data regression cases`);
} finally {
  await browser.close();
}
