import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const root=new URL('../',import.meta.url);
const html=await readFile(new URL('consoles/nhs-scotland-strain/index.html',root),'utf8');
const original=JSON.parse(await readFile(new URL('consoles/nhs-scotland-strain/data/latest.json',root),'utf8'));
const browser=await chromium.launch({headless:true,channel:process.env.CHROME_CHANNEL||undefined});
let passed=0;
async function scenario(name,fn,file=false){
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 const state={payload:structuredClone(original),status:200,requests:0};
 page.on('pageerror',e=>errors.push(String(e)));
 await page.clock.install({time:new Date(Date.parse(original.capturedAt)+7200000)});
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.protocol==='file:')return route.continue();
  if(u.pathname.endsWith('/data/latest.json')){state.requests++;return route.fulfill({status:state.status,contentType:'application/json',body:JSON.stringify(state.payload)});}
  if(u.hostname==='nhs-fixture.invalid')return route.fulfill({contentType:'text/html',body:html});
  return route.abort();
 });
 try{
  await page.goto(file?new URL('consoles/nhs-scotland-strain/index.html',root).href:'https://nhs-fixture.invalid/',{waitUntil:'load'});
  await page.waitForFunction(()=>!nhsBusy);
  await fn(page,state);assert.deepEqual(errors,[]);passed++;console.log('PASS NHS '+name);
 }finally{await context.close();}
}
try{
 await scenario('automatic real reports, periods and no assumptions',async(page,state)=>{
  assert.equal(await page.locator('#scen').inputValue(),'none');
  assert.match(await page.locator('#nhs-update-status').textContent(),/Published reports loaded/);
  assert.equal(await page.locator('#eds .rank').count(),original.sites.length);
  assert.equal(await page.evaluate(()=>SNAP.national.at(-1).att),original.national.at(-1).att);
  assert.match(await page.locator('#beds-period').textContent(),new RegExp(original.meta.bedsQuarter));
  assert.ok(state.requests>=1);
  const next=structuredClone(original);next.capturedAt=new Date(Date.parse(original.capturedAt)+60000).toISOString();
  next.delayed[0].n+=10;state.payload=next;
  await page.locator('#nhs-refresh').click();await page.waitForFunction(()=>!nhsBusy);
  assert.equal(await page.evaluate(()=>SNAP.delayed[0].n),next.delayed[0].n);
  const response=await page.evaluate(()=>ConsoleResponse.getPlan?.()??null);
  assert.ok(response===null||response.slug==='nhs-scotland-strain');
 });
 await scenario('partial, duplicate, future and failed updates keep last good',async(page,state)=>{
  for(const mutate of [d=>d.occupancy.pop(),d=>d.sources.pop(),d=>d.sites.push(d.sites[0]),d=>d.national.at(-1).att++,d=>d.sites[0].pct8=99,d=>d.national.at(-1).pct4=1,d=>d.capturedAt='2099-01-01T00:00:00Z',d=>d.sites[0].name='<svg/onload=alert(1)>']){
   state.payload=structuredClone(original);mutate(state.payload);
   await page.locator('#nhs-refresh').click();await page.waitForFunction(()=>!nhsBusy);
   assert.equal(await page.evaluate(()=>SNAP.national.at(-1).att),original.national.at(-1).att);
   assert.match(await page.locator('#nhs-update-status').textContent(),/retained last good/);
  }
  state.status=503;await page.locator('#nhs-refresh').click();await page.waitForFunction(()=>!nhsBusy);
  assert.match(await page.locator('#nhs-update-status').textContent(),/retained last good/);
 });
 await scenario('care-use matrix validates coverage, timestamps, counts and raw flag ambiguity',async(page,state)=>{
  for(const change of [d=>delete d.careUse,d=>d.careUse.cells.push(d.careUse.cells[0]),
    d=>d.careUse.totalStays++,d=>d.careUse.cells[0].stays=null,
    d=>d.careUse.cells[0].sourceBoundaryFlag=true,d=>d.careUse.quarterQualifier='p',
    d=>d.careUse.quarter='2099Q1',d=>d.careUse.quarter='2020Q1',
    d=>{const f=d.careUse,i=f.cells.findIndex(r=>f.residenceBoards.includes(r.residence)&&r.crossBoundary),r=f.cells.splice(i,1)[0];f.publishedCellCount--;f.cohortCellCount--;f.unreportedCohortCells++;f.totalStays-=r.stays;f.outsideBoardStays-=r.stays;}]){
   state.payload=structuredClone(original);change(state.payload);
   await page.locator('#nhs-refresh').click();await page.waitForFunction(()=>!nhsBusy);
   assert.equal(await page.evaluate(()=>SNAP.careUse.totalStays),original.careUse.totalStays);
   assert.match(await page.locator('#nhs-update-status').textContent(),/retained last good/);
  }
  const next=structuredClone(original);next.capturedAt=new Date(Date.parse(original.capturedAt)+60000).toISOString();
  next.careUse.cells.forEach(r=>r.sourceBoundaryFlag=1-r.sourceBoundaryFlag);state.payload=next;
  await page.locator('#nhs-refresh').click();await page.waitForFunction(()=>!nhsBusy);
  assert.match(await page.locator('#nhs-update-status').textContent(),/Published reports loaded/);
  assert.equal(await page.evaluate(()=>SNAP.careUse.outsideBoardStays),original.careUse.outsideBoardStays,'paired IDs define outside-board stays, independently of source flag wording');
 });
 await scenario('six-hour automatic refresh and preserved scenario selection',async(page,state)=>{
  await page.locator('#scen').selectOption('staff');const before=state.requests;
  await page.clock.fastForward(21600001);await page.waitForFunction(()=>!nhsBusy);
  assert.ok(state.requests>before);assert.equal(await page.locator('#scen').inputValue(),'staff');
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 });
 await scenario('offline report package remains usable',async(page,state)=>{
  assert.equal(state.requests,0);assert.match(await page.locator('#nhs-update-status').textContent(),/Offline file/);
  assert.equal(await page.locator('#eds .rank').count(),original.sites.length);
 },true);
 console.log(`PASS ${passed} NHS automatic browser scenarios`);
}finally{await browser.close();}
