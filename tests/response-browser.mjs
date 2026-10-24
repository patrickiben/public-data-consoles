import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const core = await readFile(resolve(root,'response-plans/core.js'),'utf8');
const style = await readFile(resolve(root,'response-plans/style.css'),'utf8');
const manifest = JSON.parse(await readFile(resolve(root,'response-plans/manifest.json'),'utf8'));
const browser = await chromium.launch({headless:true,channel:process.env.CHROME_CHANNEL||undefined});
let passed=0;
function plan(value=80, quality='current') {
  return {slug:'test',title:'Test response plan',context:'Public fixture A',
    evidence:[{id:'load',label:'Verified workload',value,unit:'MW',basis:'measured',quality,measuredAt:'2026-10-23T12:00:00Z',checkedAt:'2026-10-23T13:00:00Z',source:'https://www.eia.gov/'}],
    diagnostics:[{id:'balance',metricId:1,label:'Declared workload proxy',status:value>70?'triggered':'clear',evidenceIds:['load'],rule:'Workload >70 in this fixture.',requiredInputs:'Same-hour workload and verified capacity.',analyticalMitigation:'Check source, denominator and period.'}],
    actions:[
      {id:'verify',track:'public',phase:'verify',when:'always',title:'Verify local official information',nextStep:'Open the official source.',authorityUrl:'https://www.eia.gov/'},
      {id:'watch',track:'public',phase:'prepare',when:'triggered',metricIds:[1],title:'Review the workload trigger',nextStep:'Review the measured report and local instructions.',escalateWhen:'If the responsible authority issues instructions.',authorityUrl:'https://www.eia.gov/'},
      {id:'unknown',track:'public',phase:'verify',when:'unknown',metricIds:[1],title:'Acquire missing workload evidence',nextStep:'Check the source and reporting time.'},
      {id:'operator',track:'operator',phase:'prepare',when:'triggered',metricIds:[1],title:'Review operator capacity',nextStep:'Confirm telemetry against the approved SOP.',authorityUrl:'https://www.eia.gov/'},
    ],limitations:['Fixture conditions are not a validated CRT transfer.']};
}
async function offline(context){
  await context.route('**/*', async route=>{
    const u=new URL(route.request().url());
    if(u.protocol==='file:'||u.protocol==='data:'||u.protocol==='blob:')return route.continue();
    // No provider, OSM tile, CDN or other external request leaves the browser.
    return route.fulfill({status:503,contentType:'text/plain',body:'Offline response fixture'});
  });
}
async function fixture(name, verify){
  const context=await browser.newContext({acceptDownloads:true});await offline(context);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  try{
    await page.setContent('<!doctype html><html><head><style>'+style+'</style><script>'+core+'</script></head><body><div id="source">80</div><section id="console-response"></section><a id="console-response-shortcut" href="#console-response">Response plan</a></body></html>');
    await page.evaluate(p=>ConsoleResponse.set(p),plan());
    await page.waitForSelector('#console-response [data-cr-metric="10"]',{state:'attached'});
    await page.locator('#console-response-shortcut').click();
    await verify(page);
    assert.deepEqual(errors,[]);console.log('PASS response browser: '+name);passed++;
  }finally{await context.close();}
}
try{
  await fixture('shortcut opens the compact checklist and mobile panel fits the viewport',async page=>{
    assert.equal(await page.locator('[data-cr-section="actions"]').getAttribute('open'),'');
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await page.locator('[data-cr-section="actions"]').evaluate(el=>el.open=false);
    await page.locator('#console-response-shortcut').click();
    assert.equal(await page.locator('[data-cr-section="actions"]').getAttribute('open'),'');
  });
  await fixture('condition changes select different rendered plans and preserve ten dimensions',async page=>{
    assert.equal(await page.locator('[data-cr-metric]').count(),10);
    assert.equal(await page.locator('[data-cr-action="watch"]').count(),1);
    await page.evaluate(p=>ConsoleResponse.set(p),plan(20));
    assert.equal(await page.locator('[data-cr-action="watch"]').count(),0);
    assert.equal(await page.locator('[data-cr-action="verify"]').count(),1);
    assert.equal(await page.locator('[data-cr-metric="1"].cr-clear').count(),1);
    await page.evaluate(p=>ConsoleResponse.set(p),plan(null));
    assert.equal(await page.locator('[data-cr-metric="1"].cr-unknown').count(),1);
    assert.equal(await page.locator('[data-cr-action="unknown"]').count(),1);
  });
  await fixture('audience, ten-metric chain and self-reported review remain explicit',async page=>{
    await page.locator('#cr-track-operator').click();
    assert.equal(await page.locator('[data-cr-action="operator"]').count(),1);
    assert.equal(await page.locator('[data-cr-action="watch"]').count(),0);
    await page.locator('details[data-cr-section="diagnostics"]').evaluate(el=>el.open=true);
    await page.locator('#cr-assess-2').selectOption('review');
    assert.match(await page.locator('[data-cr-action="manual-review-2"]').textContent(),/SELF-REPORTED/);
    assert.equal(await page.locator('[data-cr-metric="2"].cr-unknown').count(),1,'Manual review never rewrites machine evidence');
    const exported=await page.evaluate(()=>ConsoleResponse.exportPlan());
    assert.equal(exported.plan.manualAssessments[0].metricId,2);
    assert.equal(exported.plan.actions.find(a=>a.id==='manual-review-2').phase,'verify');
    assert.match(await page.locator('[data-cr-metric="2"]').textContent(),/Required inputs:.*Analytical mitigation:.*How this parameter informs the plan.*Verify inputs.*Next:/s);
  });
  await fixture('acknowledgments survive check-only updates and reset for evidence/context changes',async page=>{
    await page.locator('[data-cr-ack="watch"]').check();
    const checked=plan();checked.evidence[0].checkedAt='2026-10-23T14:00:00Z';
    await page.evaluate(p=>ConsoleResponse.set(p),checked);
    assert.equal(await page.locator('[data-cr-ack="watch"]').isChecked(),true);
    checked.evidence[0].value=90;
    await page.evaluate(p=>ConsoleResponse.set(p),checked);
    assert.equal(await page.locator('[data-cr-ack="watch"]').isChecked(),false);
    await page.locator('[data-cr-ack="watch"]').check();checked.context='Public fixture B';
    await page.evaluate(p=>ConsoleResponse.set(p),checked);
    assert.equal(await page.locator('[data-cr-ack="watch"]').isChecked(),false);
  });
  await fixture('export downloads local structured evidence and print remains accessible',async page=>{
    await page.locator('[data-cr-ack="watch"]').check();
    const download=page.waitForEvent('download');await page.locator('#cr-export').click();
    const result=await download;assert.equal(result.suggestedFilename(),'console-response-plan.json');
    const exported=JSON.parse(await readFile(await result.path(),'utf8'));
    assert.equal(exported.plan.slug,'test');assert.deepEqual(exported.acknowledgments,['watch']);
    assert.equal(exported.plan.diagnostics.filter(d=>d.metricId).length,10);
    await page.evaluate(()=>{window.print=()=>{window.fixturePrinted=true;};});
    await page.locator('#cr-print').click();assert.equal(await page.evaluate(()=>window.fixturePrinted),true);
    await page.emulateMedia({media:'print'});
    await page.locator('[data-cr-metric="10"]').waitFor({state:'visible',timeout:3000});
    await page.emulateMedia({media:'screen'});
    await page.waitForFunction(()=>!document.querySelector('[data-cr-section="diagnostics"]').open);
  });
  await fixture('connect observes real source changes without feeding back on its own render',async page=>{
    await page.evaluate(p=>{
      window.fixturePayload=p;window.fixtureReads=0;
      ConsoleResponse.connect(()=>{window.fixtureReads++;return window.fixturePayload;},['#source']);
    },plan());
    const changed=plan(20);
    await page.evaluate(p=>{window.fixturePayload=p;document.querySelector('#source').textContent='20';},changed);
    await page.waitForFunction(()=>!document.querySelector('[data-cr-action="watch"]'));
    const reads=await page.evaluate(()=>window.fixtureReads);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>window.fixtureReads),reads,'Response writes must not create an observer loop');
    await page.evaluate(()=>{window.fixturePayload.evidence[0].quality='stale';document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await page.locator('[data-cr-metric="1"].cr-unknown').count(),1);
  });
  await fixture('scenario, missing network and hostile text cannot become operational authority',async page=>{
    const p=plan();p.scenario=true;p.title='<img src=x onerror=alert(1)>';p.evidence[0].source='javascript:alert(1)';
    await page.evaluate(input=>ConsoleResponse.set(input),p);
    assert.equal(await page.locator('#console-response img').count(),0);
    assert.equal(await page.locator('[data-cr-action="watch"]').count(),0,'Unsafe evidence cannot support a conditional action, even in practice');
    assert.match(await page.locator('[data-cr-action="unknown"]').textContent(),/PRACTICE ONLY/);
    assert.match(await page.locator('details[data-cr-section="network"]').textContent(),/network information is unavailable.*No source\/sink/s);
    assert.equal(await page.locator('#console-response a[href^="javascript:"]').count(),0);
  });
  if(!process.argv.includes('--fixtures-only')){
    const only=process.argv.find(arg=>arg.startsWith('--console='))?.slice('--console='.length);
    for(const entry of manifest.consoles.filter(entry=>!only||entry.slug===only)){
      const context=await browser.newContext({acceptDownloads:true});await offline(context);
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
      try{
        await page.goto(pathToFileURL(resolve(root,'consoles',entry.slug,'index.html')).href,{waitUntil:'domcontentloaded',timeout:90000});
        if(entry.native){
          await page.waitForFunction(()=>document.querySelector('#tm')?.textContent.includes('Mobility Network Leakage'),{timeout:45000});
          assert.equal(await page.locator('#console-response').count(),0,'Native Coastal must not have a duplicate panel');
          assert.equal(await page.locator('#tm [data-metric-help]').count(),10,'All ten native exercise labels offer help');
          await page.locator('[data-tab="plan"]').click();
          await page.locator('#cwr-operator-track').click();assert.equal(await page.locator('#cwr-operator-track').getAttribute('aria-pressed'),'true');
          assert.equal(await page.locator('#cwr-export-plan').count(),1);
        }else{
          await page.waitForFunction(slug=>window.ConsoleResponse?.exportPlan().plan.slug===slug,entry.slug,{timeout:45000});
          assert.equal(await page.locator('#console-response').count(),1);
          assert.equal(await page.locator('[data-cr-metric]').count(),10,entry.slug+' needs all ten canonical dimensions');
          for(let metric=1;metric<=10;metric++)assert.equal(await page.locator('[data-cr-metric="'+metric+'"] [data-metric-help="'+metric+'"]').count(),1,entry.slug+' offers help for parameter '+metric);
          assert.equal(await page.locator('#console-response-shortcut').count(),1);
          const exported=await page.evaluate(()=>ConsoleResponse.exportPlan());
          assert.equal(exported.plan.diagnostics.filter(d=>d.metricId).length,10);
          assert.ok(exported.plan.limitations.length>0,'Domain limits must be supplied: '+entry.slug);
          assert.ok(exported.plan.actions.some(a=>a.track==='public'),'Public actions: '+entry.slug);
          assert.ok(exported.plan.actions.some(a=>a.track==='operator'),'Operator actions: '+entry.slug);
          assert.match(entry.prioritySource,/^priorities\/(hazards|health|tools)\.js$/);
          const prioritized=exported.plan.actions.filter(a=>a.featured&&a.selected);
          for(const audience of ['public','operator']){
            const list=prioritized.filter(a=>a.track===audience);
            assert.ok(list.length>=2,entry.slug+' prioritized '+audience+' actions: '+JSON.stringify(exported.plan.actions.filter(a=>a.featured).map(a=>({id:a.id,selected:a.selected,reasons:a.withheldReasons}))));
            assert.deepEqual(list.map(a=>a.position),list.map((_,i)=>i+1));
            for(const a of list){for(const field of ['target','reason','timing','nextStep','escalateWhen','escalateTo','reviewAfter'])assert.ok(a[field],entry.slug+' '+field);}
          }
          assert.ok(prioritized.every(a=>!a.id.startsWith('priority-reader-')),entry.slug+' must use its domain priorities');
          await page.setViewportSize({width:390,height:844});
          const layout=await page.evaluate(()=>{const h=document.querySelector('h1'),p=document.querySelector('#console-response');return {heading:h.getBoundingClientRect().top,panel:p.getBoundingClientRect().top,height:p.getBoundingClientRect().height,right:p.getBoundingClientRect().right,width:innerWidth};});
          assert.ok(layout.heading<layout.panel,entry.slug+' keeps its native heading before the response plan');
          assert.ok(layout.height<600,entry.slug+' compact mobile summary: '+layout.height);
          assert.ok(layout.right<=layout.width+1,entry.slug+' response panel fits mobile');
          await page.setViewportSize({width:1280,height:900});
          await page.locator('#cr-open-priorities').click();
          assert.ok(await page.locator('[data-cr-priority]').count()>=2);
          if(process.env.PRIORITY_PROOF&&['nhs-scotland-strain','river-flood-propagation','us-grid-strain','global-wash'].includes(entry.slug))await page.screenshot({path:process.env.PRIORITY_PROOF+'/'+entry.slug+'-offline-priorities.png'});
          const impacts=exported.plan.impacts;
          assert.ok(impacts.items.length+impacts.records.length>0,'Explicit public-data impact/reference coverage: '+entry.slug);
          assert.ok(impacts.limitations.length>0,'Impact limits: '+entry.slug);
          for(const item of impacts.items.concat(impacts.records).filter(item=>item.status==='available')){
            assert.ok(item.sources.length>0,entry.slug+' impact must retain its public evidence');
            for(const source of item.sources){assert.match(source.source,/^https?:\/\//);assert.ok(source.measuredAt);}
            assert.ok(['observed','forecast','context','scenario'].includes(item.kind));
            if(item.kind==='observed'||item.kind==='forecast')assert.equal(item.quality,'current');
            if(item.practice)assert.equal(item.kind,'scenario');
          }
          await page.locator('#cr-open-impacts').click();
          assert.equal(await page.locator('[data-cr-section="impacts"]').getAttribute('open'),'');
          await page.locator('#console-response-shortcut').click();
          await page.locator('#cr-track-operator').click({timeout:60000});
          assert.equal(await page.locator('#cr-track-operator').getAttribute('aria-pressed'),'true');
          assert.equal(await page.locator('#cr-export').count(),1);
        }
        for(const width of [320,390]){
          await page.setViewportSize({width,height:844});
          const extent=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
          assert.ok(extent.document<=extent.viewport+1,entry.slug+' full page reflows at '+width+'px: '+JSON.stringify(extent));
        }
        assert.deepEqual(errors,[],entry.slug+' offline runtime errors');
        console.log('PASS response offline: '+entry.slug);passed++;
      }catch(error){
        console.error('FAIL response offline: '+entry.slug,errors);
        console.error(await page.evaluate(()=>({context:window.ConsoleResponse?.exportPlan().plan.context,slug:window.ConsoleResponse?.exportPlan().plan.slug,stage:document.querySelector('#splashmsg')?.textContent})).catch(()=>({state:'unavailable'})));
        throw error;
      }finally{await context.close();}
    }
  }
  console.log('PASS '+passed+' response browser/offline cases');
}finally{await browser.close();}
