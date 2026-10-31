import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Exercise maintained adapters through the actual shared helper/evaluator. No
// native page, private form, clock timer, provider or generated block is read.
const root=new URL('../',import.meta.url),read=p=>readFile(new URL(p,root),'utf8');
const core=await read('response-plans/core.js'),helpers=await read('response-plans/domain-helpers.js');
const slugs=['us-grid-strain','resilience-telemetry','usaid-consequence','prescription-savings','medical-cost-abroad','medical-debt-assistant','human-trafficking','va-strain','food-desert-oases'];
const adapters=Object.fromEntries(await Promise.all(slugs.map(async slug=>[slug,await read('response-plans/adapters/'+slug+'.js')])));
const now=Date.parse('2026-10-23T16:00:00Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
let passed=0;
function pass(name){passed++;console.log('PASS public tools selection: '+name);}
function fixture(slug,globals={}){
 const ctx=vm.createContext({Date:Clock,URL,console});Object.defineProperties(ctx,Object.getOwnPropertyDescriptors(globals));
 vm.runInContext('window=globalThis;',ctx);vm.runInContext(core,ctx);vm.runInContext(helpers,ctx);
 ctx.ConsoleResponse.connect=read=>{ctx.reader=read;};vm.runInContext(adapters[slug],ctx,{filename:slug+'.js'});
 return {ctx,get plan(){const p=ctx.ConsoleResponse.evaluate(ctx.reader());assert.equal(p.diagnostics.filter(d=>d.metricId).length,10);assert.ok(typeof p.selectionKey==='string'&&p.selectionKey.length>0);return p;}};
}
{
 const f=fixture('us-grid-strain',{STATE:{capturedAt:'2026-10-23T15:00:00Z',demandThrough:'2026-10-23T14',ba:{A:{code:'A',name:'Authority A',D:1,period:'2026-10-23T14'}}},AGG:new Set(),GridResponseSelection:'A'});
 const key=f.plan.selectionKey;
 f.ctx.STATE.capturedAt='2026-10-23T15:30:00Z';f.ctx.STATE.demandThrough=f.ctx.STATE.ba.A.period='2026-10-23T15';f.ctx.STATE.ba.A.name='Revised public authority label';
 assert.equal(f.plan.selectionKey,key);delete f.ctx.STATE.ba.A;assert.equal(f.plan.selectionKey,key,'Losing data does not silently change the requested authority');
 f.ctx.GridResponseSelection='B';assert.notEqual(f.plan.selectionKey,key);const second=f.plan.selectionKey;f.ctx.GridResponseSelection=null;assert.notEqual(f.plan.selectionKey,second);
 pass('grid reporting periods, coverage loss and names retain the requested BA; BA/overview selections differ');
}
{
 const f=fixture('resilience-telemetry',{NETSTATE:{n:20,asOf:9000,scenario:'none',dataVersion:1,A:{},thrPair:{}},ASSET_IDS:[],STORE:{},L_LAG:2,SCEN:'none',SURR:false,DATA_VER:1,MODE:'live',SEL:'SPY',W_IND:90,CURSOR:null,MACRO:{},FRED_META:{},dayToMs:d=>Date.UTC(2000,0,1)+d*86400000,msToDateStr:ms=>new Date(ms).toISOString().slice(0,10),alignedReturns:()=>({mat:{SPY:Array(20).fill(0),TLT:Array(20).fill(1)}})});
 const p=f.plan;f.ctx.NETSTATE.asOf++;f.ctx.DATA_VER=f.ctx.NETSTATE.dataVersion=2;f.ctx.FRED_META.capturedAt='2026-10-23T16:00:00Z';
 assert.notEqual(f.plan.context,p.context);assert.equal(f.plan.selectionKey,p.selectionKey);
 for(const [name,value]of [['SEL','TLT'],['MODE','backtest'],['SCEN','vol'],['SURR',true]]){const before=f.plan.selectionKey;f.ctx[name]=value;assert.notEqual(f.plan.selectionKey,before,name+' is an actual public selection');}
 f.ctx.CURSOR=9000;const cursor=f.plan.selectionKey;f.ctx.CURSOR=9001;assert.notEqual(f.plan.selectionKey,cursor,'A chosen backtest cursor is an explicit selection, not a live report date');
 f.ctx.MODE='live';const live=f.plan.selectionKey;f.ctx.CURSOR=8000;assert.equal(f.plan.selectionKey,live,'Inactive cursor does not alter live selection');
 pass('market public instrument/mode/scenario controls differ while live observation/download dates stay stable');
}
{
 const f=fixture('usaid-consequence',{DATA:{vintage:'2026-01-01',countries:[],status:{}},feedStatus:{USAspending:'unavailable'},budgetPublicRecords:[],budgetPublicStatus:null});
 const p=f.plan;f.ctx.DATA.vintage='2026-10-23';f.ctx.feedStatus.USAspending='live';
 assert.notEqual(f.plan.context,p.context);assert.equal(f.plan.selectionKey,p.selectionKey);
 pass('USAID reporting vintage and download status remain one public agency context');
}
for(const slug of ['prescription-savings','medical-cost-abroad','medical-debt-assistant','human-trafficking']){
 const globals={NADAC_DS:'public-dataset-a',NADAC_RELEASE:{dataset:'public-dataset-a',day:'2026-10-21',checked:now}};
 for(const name of ['A','PROC','DEST','INPUT','ANSWERS','RESULTS','NADAC_QUERY','NADAC_RESULTS'])Object.defineProperty(globals,name,{get(){throw Error('Private input read: '+name);},enumerable:true});
 const f=fixture(slug,globals),key=f.plan.selectionKey;
 Object.defineProperty(f.ctx,'document',{get(){throw Error('Private DOM read');},configurable:true});
 f.ctx.NADAC_RELEASE.day='2026-10-22';f.ctx.NADAC_RELEASE.checked=now+1000;assert.equal(f.plan.selectionKey,key);
 if(slug==='prescription-savings'){f.ctx.NADAC_DS='public-dataset-b';assert.notEqual(f.plan.selectionKey,key);}
 pass(slug+' keeps public-only resource selection separate from release dates and private inputs');
}
{
 const override={};Object.defineProperty(override,'census',{get(){throw Error('Private override value read');}});
 const f=fixture('va-strain',{STATUS_OVERRIDE:{},FACILITY:'Public drill label',SCEN:'none',deepUnits:()=>({u:[]})});
 const p=f.plan;f.ctx.STATUS_OVERRIDE.private=override;f.ctx.FACILITY='Different local display label';assert.notEqual(f.plan.context,p.context);assert.equal(f.plan.selectionKey,p.selectionKey);
 f.ctx.SCEN='flu';assert.notEqual(f.plan.selectionKey,p.selectionKey);
 assert.ok(!f.plan.selectionKey.includes('Different local')&&!f.plan.selectionKey.includes('census'));
 pass('VA keys identify only the public synthetic scenario and exclude local labels/override values');
}
{
 const at='2026-10-23T15:00:00Z',bridge={version:1,slug:'food-desert-oases',selectionId:1,state:'settled',context:'Census tract 39035107701 (2025 SNAP-authorized Retailer Access Map)',
  tract:{status:'ok',geoid:'39035107701',urban:1,vintage:'2025 SNAP-authorized Retailer Access Map, released July 2026',flags:{lowIncome:1,la1and10:0,lila1and10:0},checkedAt:at},
  sources:{snap:{status:'ok',count:52,radiusMi:2,nearestMi:0.1,dataDate:'October 21, 2026',partial:false,checkedAt:at},markets:{status:'ok',count:14,radiusMi:5,nearestMi:0.1,dataDate:'October 21, 2026',partial:false,checkedAt:at},foodbanks:{status:'failed',count:null,partial:false,reason:'HTTP 504',checkedAt:at}}};
 for(const name of ['q','query','address','displayName','name','lat','lon','point','coords'])Object.defineProperty(bridge,name,{get(){throw Error('Private location read: '+name);}});
 const globals={FoodAccessResponse:bridge};
 for(const name of ['Q','QUERY','ADDRESS','POINT','current'])Object.defineProperty(globals,name,{get(){throw Error('Private page state read: '+name);},enumerable:true});
 const f=fixture('food-desert-oases',globals),p=f.plan,key=p.selectionKey;
 Object.defineProperty(f.ctx,'document',{get(){throw Error('Private DOM read');},configurable:true});
 assert.equal(key,JSON.stringify(['food-desert-oases','search',1]));assert.equal(p.context,'Census tract 39035107701 (2025 SNAP-authorized Retailer Access Map)');
 assert.equal(p.impacts.items.find(x=>x.id==='foodbanks-listed').status,'unknown');assert.equal(p.impacts.items.find(x=>x.id==='foodbanks-listed').value,null);
 bridge.sources.snap.count=53;bridge.sources.snap.dataDate='October 22, 2026';bridge.sources.snap.checkedAt='2026-10-23T15:30:00Z';bridge.sources.foodbanks={status:'empty',count:0,radiusMi:31,dataDate:'2026-10-23T14:00:00Z',partial:false,checkedAt:'2026-10-23T15:30:00Z'};
 const refreshed=f.plan;assert.equal(refreshed.selectionKey,key,'a source refresh or new data date keeps the same search');
 assert.equal(refreshed.impacts.items.find(x=>x.id==='foodbanks-listed').value,0);assert.equal(refreshed.impacts.items.find(x=>x.id==='foodbanks-listed').status,'available');
 bridge.selectionId=2;assert.notEqual(f.plan.selectionKey,key,'a new search is a new selection');
 bridge.selectionId=0;bridge.state='idle';bridge.tract={status:'idle',vintage:bridge.tract.vintage,flags:null};const idle=f.plan;
 assert.equal(idle.selectionKey,JSON.stringify(['food-desert-oases','search','unselected']));assert.equal(idle.context,'No search yet');
 for(const plan of [p,refreshed,idle])assert.doesNotMatch(plan.selectionKey+' '+plan.context+' '+JSON.stringify(plan.evidence),/41\.5|-81\.6|Euclid|Cleveland/);
 pass('food search identity follows selectionId only; refreshes keep it, and no address or coordinates are read');
}
console.log('PASS '+passed+' public tools selection regression groups');
