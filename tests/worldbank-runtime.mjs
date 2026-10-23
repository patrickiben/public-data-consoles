import assert from 'node:assert/strict';
import '../public-data-runtime/worldbank.js';
const W=globalThis.WorldBankPublicData,year=new Date().getUTCFullYear(),ind='TEST.IND',realFetch=globalThis.fetch;
let passed=0;
const row=(code,y,value)=>({countryiso3code:code,country:{id:code,value:code},indicator:{id:ind},date:String(y),value});
const reply=(rows,page=1,pages=1,total=rows.length)=>[{page,pages,total,lastupdated:'2026-10-08'},rows];
async function rejects(name,data,pattern){globalThis.fetch=async()=>({ok:true,json:async()=>data});await assert.rejects(()=>W.fetchRows({codes:['USA'],indicator:ind,startYear:2000}),pattern);passed++;console.log('PASS WDI '+name);}
try{
 let calls=0;globalThis.fetch=async url=>{calls++;const page=+new URL(url).searchParams.get('page');return {ok:true,json:async()=>reply(page===1?[row('USA',year,null)]:[row('USA',year-1,0)],page,2,2)};};
 const paged=await W.fetchRows({codes:['USA'],indicator:ind,startYear:2000});assert.equal(calls,2);assert.equal(paged.rows[1].value,0);passed++;
 await rejects('provider error envelope',{message:'invalid indicator'},/Incomplete/);
 await rejects('empty series',reply([]),/Incomplete/);
 await rejects('string numeric',reply([row('USA',year-1,'5')]),/Invalid/);
 await rejects('nonfinite numeric',reply([row('USA',year-1,Infinity)]),/Invalid/);
 await rejects('wrong country',reply([row('CAN',year-1,5)]),/Invalid/);
 await rejects('wrong indicator',reply([{...row('USA',year-1,5),indicator:{id:'OTHER'}}]),/Invalid/);
 await rejects('future year',reply([row('USA',year+1,5)]),/Invalid/);
 await rejects('duplicate country/year',reply([row('USA',year-1,5),row('USA',year-1,6)]),/Invalid/);
 await rejects('truncated response',reply([row('USA',year-1,5)],1,1,2),/truncated/);
 await rejects('all null series',reply([row('USA',year-1,null)]),/empty/);
 await rejects('excessive pagination',reply([row('USA',year-1,5)],1,999,999),/Incomplete/);
 await rejects('future source edition',[{page:1,pages:1,total:1,lastupdated:String(year+1)+'-01-01'},[row('USA',year-1,5)]],/source-update/);
 await rejects('impossible source date',[{page:1,pages:1,total:1,lastupdated:'2026-02-30'},[row('USA',year-1,5)]],/source-update/);
 const snapshot={years:['2000','2001'],vintage:'2001',embedded:'2026-06-27',agg:{WLD:{name:'World',s:{test:[1,2]}}},cty:{USA:{name:'US',income:'HIC',latest:{test:{v:2,y:'2001'}},test:[1,2]}}};
 globalThis.fetch=async url=>{const u=new URL(url),code=u.pathname.split('/country/')[1].split('/')[0];assert.equal(u.searchParams.get('date'),'2000:'+year);return {ok:true,json:async()=>reply([row(code,year,null),row(code,year-1,8),row(code,2000,0)])};};
 const updated=await W.refreshSnapshot({snapshot,indicatorMap:{[ind]:'test'},aggregateCodes:['WLD'],countryCodes:['USA'],aggregateRemap:{},seriesFields:{test:'test'}});assert.equal(updated.vintage,String(year-1));assert.equal(updated.years.at(-1),String(year));assert.deepEqual(updated.cty.USA.latest.test,{v:8,y:String(year-1)});assert.equal(updated.cty.USA.test[0],0);assert.equal(updated.cty.USA.test.at(-1),null);assert.deepEqual(snapshot.cty.USA.test,[1,2]);passed++;
 const oldYear=String(year-1),prior={...snapshot,years:['2000',oldYear],vintage:oldYear,agg:{WLD:{name:'World',s:{test:[1,20]}}},cty:{USA:{name:'US',latest:{test:{v:25,y:oldYear}},test:[1,25]},CAN:{name:'Canada',latest:{test:{v:5,y:'2000'}},test:[5,null]}}};
 globalThis.fetch=async url=>{const codes=new URL(url).pathname.split('/country/')[1].split('/')[0].split(';');return {ok:true,json:async()=>reply(codes.flatMap(code=>[row(code,year,code==='CAN'?7:null),row(code,2000,code==='WLD'?3:2)]))};};
 const kept=await W.refreshSnapshot({snapshot:prior,indicatorMap:{[ind]:'test'},aggregateCodes:['WLD'],countryCodes:['USA','CAN'],seriesFields:{test:'test'}});assert.deepEqual(kept.cty.USA.latest.test,{v:25,y:oldYear});assert.equal(kept.cty.USA.test[kept.years.indexOf(oldYear)],25);assert.equal(kept.agg.WLD.s.test[kept.years.indexOf(oldYear)],20);assert.equal(kept.cty.CAN.latest.test.y,String(year));assert.equal(kept.responseRetainedSeries.length,2);assert.match(W.sourceChip(kept),/2 prior series retained/);assert.equal(prior.cty.USA.test[1],25);passed++;
 await assert.rejects(()=>W.refreshSnapshot({snapshot:{...prior,responseSourceUpdatedAt:{[ind]:'2026-10-23'}},indicatorMap:{[ind]:'test'},aggregateCodes:['WLD'],countryCodes:['USA','CAN'],seriesFields:{test:'test'}}),/source edition regressed/);passed++;
 console.log('PASS '+passed+' WDI runtime checks');
}finally{globalThis.fetch=realFetch;}
