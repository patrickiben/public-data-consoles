import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import http from 'node:http';
import {chromium} from 'playwright';

// Actual standalone entrypoint and native loaders. All providers are routed
// fixtures; the only real HTTP server is this portable loopback body-stall fixture.
const html=await readFile(new URL('../consoles/resilience-telemetry/index.html',import.meta.url),'utf8');
const sockets=new Set();
const server=http.createServer((req,res)=>{
 if(req.url==='/slow-body'){res.writeHead(200,{'Content-Type':'application/json'});res.write('{"unfinished":');req.on('close',()=>res.destroy());return;}
 if(req.url==='/http-error'){res.writeHead(503);res.end('unavailable');return;}
 if(req.url==='/bad-json'){res.writeHead(200,{'Content-Type':'application/json'});res.end('<html>not JSON</html>');return;}
 if(req.url==='/large-body'){res.writeHead(200,{'Content-Type':'application/json','Content-Length':3*1024*1024});res.flushHeaders();req.on('close',()=>res.destroy());return;}
 res.writeHead(200,{'Content-Type':'text/html'});res.end(html);
});
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,channel:process.env.CHROME_CHANNEL||undefined});
let count=0;
const book=(id=100)=>({lastUpdateId:id,bids:[['100','2'],['99','1']],asks:[['101','1'],['102','2']]});
async function scenario(name,run){
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 const state={market:'offline',books:'offline',book:book(),factor:1.01,baselines:{},requests:[],held:[],holdMarket:false,holdBooks:false};
 page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date()});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin===origin)return route.continue();
  const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)}).catch(()=>{});
  if(u.pathname==='/api/v3/depth'){
   state.requests.push({type:'book',symbol:u.searchParams.get('symbol')});if(state.books==='offline')return route.abort();
   const body=structuredClone(state.book),status=state.books==='error'?503:200;
   if(state.holdBooks)await new Promise(resolve=>state.held.push({type:'book',resolve}));return json(body,status);
  }
  let type,id,symbol;
  if(u.pathname==='/api/v3/klines'){type='crypto';id={BTCUSDT:'BTC',ETHUSDT:'ETH',SOLUSDT:'SOL'}[u.searchParams.get('symbol')];}
  else if(u.hostname==='api.frankfurter.dev'){type='fx';id='FX';}
  else if(u.hostname==='api.allorigins.win'){type='equity';symbol=decodeURIComponent(new URL(u.searchParams.get('url')).pathname.split('/').at(-1));id=symbol==='^VIX'?'VIX':symbol;}
  else return route.abort();
  state.requests.push({type,id});if(state.market==='offline')return route.abort();
  let body;
  if(type==='fx'){
   const ids=['USDEUR','USDJPY','USDCHF','USDAUD'],day=Math.max(...ids.map(id=>state.baselines[id].last))+1,values={};
   for(const [code,codeId]of [['EUR','USDEUR'],['JPY','USDJPY'],['CHF','USDCHF'],['AUD','USDAUD']])values[code]=state.baselines[codeId].close*state.factor;
   if(state.market==='bad-fx')delete values.CHF;
   body={base:'USD',rates:{[new Date(Date.UTC(2000,0,1)+day*86400000).toISOString().slice(0,10)]:values}};
  }else{
   const b=state.baselines[id],times=[b.ms,b.ms+86400000],closes=[b.close,b.close*state.factor];
   if(state.market==='empty'){times.length=0;closes.length=0;}
   if(state.market==='zero')closes[1]=0;
   if(state.market==='negative')closes[1]=-1;
   if(state.market==='null')closes.fill(null);
   if(state.market==='duplicate')times[1]=times[0];
   if(type==='crypto')body=times.map((ms,i)=>[ms,'1','1','1',state.market==='bad-crypto'?'12oops':String(closes[i]),'1',ms+86400000-1]);
   else{
    const response={chart:{error:null,result:[{meta:{symbol:state.market==='wrong-symbol'?'WRONG':symbol},timestamp:times.map(t=>t/1000),indicators:{quote:[{close:closes}]}}]}};
    if(state.market==='length')response.chart.result[0].indicators.quote[0].close.pop();
    body={contents:JSON.stringify(response)};
   }
  }
  if(state.holdMarket&&id==='SPY')await new Promise(resolve=>state.held.push({type:'market',resolve}));
  return json(body);
 });
 try{
  await page.goto(origin,{waitUntil:'load'});await page.waitForFunction(()=>document.getElementById('splash').style.display==='none',null,{timeout:60000});await page.waitForFunction(()=>marketRun===null&&obiRun===null);
  state.baselines=await page.evaluate(()=>Object.fromEntries(ASSET_IDS.map(id=>[id,{last:STORE[id].dayk.at(-1),ms:dayToMs(STORE[id].dayk.at(-1)),close:STORE[id].close.at(-1)}])));
  // Keep synthetic extensions/gap fixtures in the past, independent of when the
  // embedded market history was refreshed. No live provider date is asserted.
  await page.clock.setSystemTime(new Date(Math.max(Date.now(),...Object.values(state.baselines).map(x=>x.ms))+9*86400000));
  await run(page,state);assert.deepEqual(errors,[]);count++;console.log('PASS native market: '+name);
 }finally{state.held.forEach(x=>x.resolve());await context.close();}
}
const store=(page,id='SPY')=>page.evaluate(id=>JSON.stringify(STORE[id]),id);
const release=(state,type)=>{const rows=state.held.filter(x=>x.type===type);state.held=state.held.filter(x=>x.type!==type);rows.forEach(x=>x.resolve());};
const waitHeld=async(state,type,count=1)=>{for(let i=0;i<100;i++){if(state.held.filter(x=>x.type===type).length>=count)return;await new Promise(r=>setTimeout(r,10));}throw Error('Expected held '+type+' request');};
try{
 await scenario('invalid, duplicate, empty, future and regressed updates retain the complete history and source',async page=>{
  const results=await page.evaluate(()=>{
   const original=JSON.stringify(STORE.SPY),A=STORE.SPY,last=dayToMs(A.vintage),valid=A.close.at(-1),cases=[[[last+86400000,0]],[[last+86400000,-1]],[[last+86400000,Infinity]],[[last+86400000,NaN]],[[NaN,100]],[[Date.now()+86400000,100]],[[last,valid],[last,valid]],[[last,valid],[last+3600000,valid]],[[last,valid],[last+86400000,null]],[[last-86400000,100]]];
   const out=cases.map(pairs=>{let rejected=false;try{mergeSeries('SPY',pairs,'Bad fixture');}catch{rejected=true;}return {rejected,unchanged:JSON.stringify(STORE.SPY)===original};});
   return {out,empty:mergeSeries('SPY',[],'Empty fixture'),gap:mergeSeries('SPY',[[last+8*86400000,100]],'Gap fixture'),unchanged:JSON.stringify(STORE.SPY)===original};
  });assert.ok(results.out.every(x=>x.rejected&&x.unchanged));assert.equal(results.empty,'empty');assert.equal(results.gap,'gap');assert.equal(results.unchanged,true);
 });
 await scenario('valid correction/extension preserves history and ordinary return arithmetic',async page=>{
  const result=await page.evaluate(()=>{const prior=structuredClone(STORE.SPY),last=dayToMs(prior.vintage),value=prior.close.at(-1);const status=mergeSeries('SPY',[[last,value*1.01],[last+86400000,value*1.02]],'Validated fixture'),after=STORE.SPY;return {status,oldStart:prior.dayk[0],start:after.dayk[0],oldLength:prior.close.length,length:after.close.length,prefix:JSON.stringify(prior.close.slice(0,-1))===JSON.stringify(after.close.slice(0,-2)),returns:after.ret.every(Number.isFinite),unchangedReturnPrefix:JSON.stringify(prior.ret.slice(0,-1))===JSON.stringify(after.ret.slice(0,-2)),received:after.retrievedAt,source:after.src};});
  assert.equal(result.status,'live');assert.equal(result.start,result.oldStart);assert.equal(result.length,result.oldLength+1);assert.equal(result.prefix,true);assert.equal(result.returns,true);assert.equal(result.unchangedReturnPrefix,true);assert.ok(result.received);assert.equal(result.source,'Validated fixture');
 });
 await scenario('actual equity loader rejects bad identity/shape/prices and labels empty responses honestly',async(page,state)=>{
  const good=await store(page);
  for(const mode of ['zero','negative','duplicate','length','wrong-symbol','null','empty']){state.market=mode;await page.evaluate(()=>loadEquity('SPY'));assert.equal(await store(page),good,mode);const status=await page.evaluate(()=>MARKET_STATE.results.SPY.status);assert.equal(status,['null','empty'].includes(mode)?'empty':'unavailable');}
  state.market='valid';await page.evaluate(()=>loadEquity('SPY'));assert.notEqual(await store(page),good);assert.match(await page.locator('#feeds').textContent(),/partial download|validated download/);assert.doesNotMatch(await page.locator('#feeds').textContent(),/Yahoo via proxy\) live/);
 });
 await scenario('actual crypto and four-currency loaders validate atomically',async(page,state)=>{
  const btc=await store(page,'BTC');state.market='bad-crypto';await page.evaluate(()=>loadBinance('BTCUSDT','BTC'));assert.equal(await store(page,'BTC'),btc);
  const before=await page.evaluate(()=>JSON.stringify(['USDEUR','USDJPY','USDCHF','USDAUD'].map(id=>STORE[id])));state.market='bad-fx';await page.evaluate(()=>loadFX());assert.equal(await page.evaluate(()=>JSON.stringify(['USDEUR','USDJPY','USDCHF','USDAUD'].map(id=>STORE[id]))),before);
  state.market='valid';await page.evaluate(()=>loadBinance('BTCUSDT','BTC'));assert.notEqual(await store(page,'BTC'),btc);await page.evaluate(()=>loadFX());assert.notEqual(await page.evaluate(()=>JSON.stringify(['USDEUR','USDJPY','USDCHF','USDAUD'].map(id=>STORE[id]))),before);assert.equal(await page.evaluate(()=>Object.values(STORE).every(s=>s.ret.every(Number.isFinite))),true);
 });
 await scenario('full HTTP body deadline and response limits settle actual stalled streams',async page=>{
  for(const path of ['/http-error','/bad-json','/large-body']){const result=await page.evaluate(async path=>{try{await fetchMarketJSON(path,500);return 'accepted';}catch(e){return e.message;}},path);assert.notEqual(result,'accepted');}
  await page.evaluate(()=>{window.bodyCheck=fetchMarketJSON('/slow-body',100).then(()=>({accepted:true}),e=>({error:e.message}));});await page.clock.fastForward(101);const result=await page.evaluate(()=>bodyCheck);assert.match(result.error,/timed out/);
 });
 await scenario('concurrent refreshes share one cycle and stage histories until it finishes',async(page,state)=>{
  state.market='valid';state.holdMarket=true;const before=await page.evaluate(()=>JSON.stringify(STORE)),version=await page.evaluate(()=>DATA_VER),calls=state.requests.length;
  assert.equal(await page.evaluate(()=>{window.firstMarket=liveRefresh();window.secondMarket=liveRefresh();return firstMarket===secondMarket;}),true);await waitHeld(state,'market');assert.equal(await page.evaluate(()=>JSON.stringify(STORE)),before);
  release(state,'market');assert.equal(await page.evaluate(()=>firstMarket),true);assert.equal(await page.evaluate(()=>secondMarket),true);assert.equal(await page.evaluate(()=>DATA_VER),version+1);
  const nativeCalls=state.requests.slice(calls).filter(x=>x.type!=='book'),expected=await page.evaluate(()=>ASSET_IDS.filter(id=>!['crypto','fx','vol'].includes(STORE[id].cls)).length+5);assert.equal(nativeCalls.length,expected);
 });
 await scenario('superseded or mode-canceled cycles cannot commit late source data',async(page,state)=>{
  state.market='valid';state.holdMarket=true;state.factor=1.01;await page.evaluate(()=>{window.oldCycle=liveRefresh();});await waitHeld(state,'market');
  state.holdMarket=false;state.factor=1.02;await page.evaluate(()=>{window.newCycle=liveRefresh({supersede:true});});assert.equal(await page.evaluate(()=>newCycle),true);assert.equal(await page.evaluate(()=>oldCycle),false);
  const current=await store(page),generation=await page.evaluate(()=>MARKET_STATE.generation);release(state,'market');await page.evaluate(()=>new Promise(r=>setTimeout(r,10)));assert.equal(await store(page),current);assert.equal(await page.evaluate(()=>MARKET_STATE.generation),generation);
  assert.equal(await page.evaluate(()=>STORE.SPY.close.at(-1)),state.baselines.SPY.close*1.02);
  state.holdMarket=true;await page.evaluate(()=>{window.canceledCycle=liveRefresh();});await waitHeld(state,'market');await page.locator('#modeseg button[data-mode="backtest"]').click();assert.equal(await page.evaluate(()=>canceledCycle),false);release(state,'market');assert.equal(await store(page),current);
 });
 await scenario('order-book zero balance has a dated receipt and failure/regression withholds old numbers',async(page,state)=>{
  state.books='valid';assert.equal(await page.evaluate(()=>pollOBI()),true);const initial=await page.evaluate(()=>structuredClone(OBI.BTC));assert.equal(initial.obi,0);assert.equal(initial.lastUpdateId,100);assert.ok(initial.receivedAt);assert.match(await page.locator('#obi-body').textContent(),/received \d+s ago/);
  for(const mode of ['error','lower','conflict','empty','invalid']){
   state.books=mode==='error'?'error':'valid';state.book=book(mode==='lower'?99:100);if(mode==='conflict')state.book.bids[0][1]='4';if(mode==='empty')state.book.bids=[];if(mode==='invalid')state.book.asks[0][1]='1bad';
   assert.equal(await page.evaluate(()=>pollOBI()),false,mode);const after=await page.evaluate(()=>structuredClone(OBI.BTC));assert.equal(after.ok,false);assert.equal(after.receivedAt,initial.receivedAt);assert.match(await page.locator('#obi-body').textContent(),/Unavailable.*current ratio unavailable/);assert.doesNotMatch(await page.locator('#obi-body').textContent(),/of ±100 · balanced/);
  }
 });
 await scenario('order-book freshness expires without a response, and hidden/backtest checks do not poll',async(page,state)=>{
  state.books='valid';await page.evaluate(()=>pollOBI());const received=await page.evaluate(()=>OBI.BTC.receivedAt);await page.clock.setSystemTime(new Date(received+15001));await page.evaluate(()=>drawOBI());assert.match(await page.locator('#obi-body').textContent(),/Stale.*current ratio unavailable/);assert.doesNotMatch(await page.locator('#obi-body').textContent(),/of ±100 · balanced/);
  const calls=state.requests.length;await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});});assert.equal(await page.evaluate(()=>pollOBI()),false);assert.equal(state.requests.length,calls);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});MODE='backtest';});assert.equal(await page.evaluate(()=>pollOBI()),false);assert.equal(state.requests.length,calls);assert.match(await page.locator('#obi-body').textContent(),/no historical order book/);
 });
 await scenario('order-book polling coalesces and ignores superseded late responses',async(page,state)=>{
  state.books='valid';state.holdBooks=true;const calls=state.requests.length;assert.equal(await page.evaluate(()=>{window.oldBook=pollOBI();return oldBook===pollOBI();}),true);await waitHeld(state,'book',3);assert.equal(state.requests.slice(calls).filter(x=>x.type==='book').length,3);
  state.holdBooks=false;state.book=book(101);await page.evaluate(()=>{window.newBook=pollOBI({supersede:true});});assert.equal(await page.evaluate(()=>newBook),true);assert.equal(await page.evaluate(()=>oldBook),false);release(state,'book');await page.evaluate(()=>new Promise(r=>setTimeout(r,10)));assert.equal(await page.evaluate(()=>OBI.BTC.lastUpdateId),101);
 });
 console.log('PASS '+count+' actual native market reliability groups');
}finally{await browser.close();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
