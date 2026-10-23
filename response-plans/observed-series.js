/* Domain-specific observation diagnostics. Pure calculations; no network or imports.
   Hourly resampling is descriptive and never supplies continuous flood duration. */
(function(root){
 'use strict';
 const HOUR=3600000,finite=v=>typeof v==='number'&&Number.isFinite(v);
 const time=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)?Date.parse(v):NaN;
 const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
 function empiricalW1(left,right){
  if(!left.length||left.length!==right.length||[...left,...right].some(v=>!finite(v)))return null;
  const a=left.slice().sort((x,y)=>x-y),b=right.slice().sort((x,y)=>x-y);
  const value=mean(a.map((x,i)=>Math.abs(x-b[i])));return finite(value)?value:null;
 }
 function hourly(records,{now=Date.now(),mode='observed',end,maxAgeHours=6}={}){
  const result={bins:new Map(),invalidRows:0,duplicateRows:0,conflictHours:new Set(),futureRows:0,latestAt:null,reason:null};
  if(!Array.isArray(records)||!records.length||records.length>200000||!finite(now)||!['observed','hourly'].includes(mode)){result.reason='A bounded finite observation series is required';return result;}
  const byTimestamp=new Map();let latest=-Infinity;
  for(const row of records){
   const stamp=time(row?.time),value=row?.value;
   if(!finite(stamp)||!finite(value)||value===-9999||mode==='hourly'&&stamp%HOUR!==0){result.invalidRows++;continue;}
   if(stamp>now){result.futureRows++;continue;}
   const hour=Math.floor(stamp/HOUR)*HOUR;
   if(byTimestamp.has(stamp)){result.duplicateRows++;if(byTimestamp.get(stamp)!==value)result.conflictHours.add(hour);continue;}
   byTimestamp.set(stamp,value);latest=Math.max(latest,stamp);
   if(!result.bins.has(hour)||stamp>result.bins.get(hour).stamp)result.bins.set(hour,{stamp,value});
  }
  for(const hour of result.conflictHours)result.bins.delete(hour);
  result.latestAt=finite(latest)?new Date(latest).toISOString():null;
  if(result.futureRows){result.reason='Future observations are present';return result;}
  if(!finite(latest)||now-latest>maxAgeHours*HOUR){result.reason='Observation series is missing or stale';return result;}
  let endpoint=end==null?Math.floor(latest/HOUR)*HOUR:time(end);
  if(!finite(endpoint)||endpoint%HOUR!==0||endpoint>now){result.reason='The declared hourly endpoint is invalid';return result;}
  if(mode==='observed')endpoint=Math.min(endpoint,(Math.floor(now/HOUR)-1)*HOUR);
  result.end=endpoint;return result;
 }
 function windowValues(series,hours){
  if(series.reason||!finite(series.end)||!Number.isInteger(hours)||hours<1)return null;
  const values=[];
  for(let i=hours-1;i>=0;i--){const row=series.bins.get(series.end-i*HOUR);if(!row)return null;values.push(row.value);}
  return values;
 }
 function analyze(records,options={}){
  const series=hourly(records,options),day=windowValues(series,24),pair=windowValues(series,48);
  const result={latestAt:series.latestAt,end:finite(series.end)?new Date(series.end).toISOString():null,
   method:options.mode==='hourly'?'Source-reported UTC hourly values':'Last valid observation in each completed UTC hour; no interpolation or duration estimate',
   invalidRows:series.invalidRows,duplicateRows:series.duplicateRows,conflictingHours:series.conflictHours.size,futureRows:series.futureRows,
   reason:series.reason,dayW1:null,persistence:null,thresholdAuc:null,scale:null,completeWindows:[]};
  if(pair){const value=empiricalW1(pair.slice(0,24),pair.slice(24));if(value!=null)result.dayW1={value,points:48,comparison:'latest24 complete hourly bins versus preceding24',start:new Date(series.end-47*HOUR).toISOString(),end:result.end};}
  const thresholds=options.thresholds;
  if(day&&Array.isArray(thresholds)&&thresholds.length===4&&thresholds.every(v=>finite(v)&&v!==-9999)&&thresholds.every((v,i)=>!i||v>thresholds[i-1])&&finite(thresholds[3]-thresholds[0])){
   const [action,,,major]=thresholds,above=day.filter(v=>v>=action).length;
   result.persistence={value:100*above/day.length,above,total:day.length,threshold:action};
   // Exact integral of the empirical exceedance curve over the action→major axis.
   // Each observation contributes clamp((value-action)/(major-action),0,1).
   const value=100*mean(day.map(v=>Math.max(0,Math.min(1,(v-action)/(major-action)))));
   if(finite(value))result.thresholdAuc={value,points:day.length,thresholds:thresholds.slice(),method:'Integral of hourly-sample exceedance fraction across official action→major thresholds, divided by their physical-unit range'};
  }else if(day&&Array.isArray(thresholds)&&thresholds.length&&finite(thresholds[0])&&thresholds[0]!==-9999){
   // Persistence only needs action; threshold-AUC needs the entire ordered ladder.
   const above=day.filter(v=>v>=thresholds[0]).length;result.persistence={value:100*above/day.length,above,total:day.length,threshold:thresholds[0]};
  }
  if(options.mode==='hourly'){
   const current=options.currentValue,latest=series.bins.get(series.end)?.value,ratios=[];
   for(const hours of [24,72,168]){const values=windowValues(series,hours);if(!values)continue;result.completeWindows.push(hours);const peak=Math.max(...values);if(finite(current)&&current>=0&&current===latest&&peak>0&&values.every(v=>v>=0))ratios.push({hours,peak,ratio:100*(current/peak)});}
   if(ratios.length>=2){const value=Math.max(...ratios.map(r=>r.ratio))-Math.min(...ratios.map(r=>r.ratio));if(finite(value))result.scale={value,windows:ratios};}
  }
  return result;
 }
 function populationBalance(exposure){
  const failure=reason=>({value:null,reason,countries:[],baselinePopulation:null,higherPopulation:null});
  if(!exposure||!Array.isArray(exposure.bands)||!exposure.bands.length||!Array.isArray(exposure.countries)||!exposure.countries.length)return failure('Complete PAGER country and aggregate intensity bands are required');
  const bands=exposure.bands,seenBands=new Set(),seenCountries=new Set();
  if(bands.some(b=>!Number.isInteger(b.mmi)||b.mmi<1||b.mmi>12||!finite(b.population)||b.population<0||seenBands.has(b.mmi)||(seenBands.add(b.mmi),false)))return failure('Invalid aggregate PAGER intensity bands');
  const countries=[];
  for(const c of exposure.countries){
   if(typeof c.code!=='string'||!/^[A-Z]{2}$/.test(c.code)||seenCountries.has(c.code)||!Array.isArray(c.populations)||c.populations.length!==bands.length||c.populations.some(v=>!finite(v)||v<0))return failure('Missing, duplicate or invalid country intensity bands');
   seenCountries.add(c.code);let baseline=0,higher=0;
   c.populations.forEach((value,i)=>{if(bands[i].mmi>=4)baseline+=value;if(bands[i].mmi>=7)higher+=value;});
   countries.push({code:c.code,baselinePopulation:baseline,higherPopulation:higher});
  }
  // USGS exposure counts are integer populations. Allow a one-person rounding
  // difference per country, never a percentage tolerance that conceals coverage loss.
  if(bands.some((b,i)=>Math.abs(exposure.countries.reduce((sum,c)=>sum+c.populations[i],0)-b.population)>exposure.countries.length))return failure('Country totals do not reconcile with aggregate PAGER bands');
  const baselinePopulation=countries.reduce((sum,c)=>sum+c.baselinePopulation,0),higherPopulation=countries.reduce((sum,c)=>sum+c.higherPopulation,0);
  if(!finite(baselinePopulation)||!finite(higherPopulation)||baselinePopulation<=0||higherPopulation<=0)return failure('Both MMI4+ baseline and MMI7+ population totals must be positive; zero higher exposure is not a composition distribution');
  for(const c of countries){c.baselineShare=c.baselinePopulation/baselinePopulation;c.higherShare=c.higherPopulation/higherPopulation;c.differencePercentagePoints=100*(c.higherShare-c.baselineShare);}
  const value=50*countries.reduce((sum,c)=>sum+Math.abs(c.higherShare-c.baselineShare),0);
  return finite(value)?{value,countries,baselinePopulation,higherPopulation,reason:null,method:'Total variation of country population-share distributions:0.5×sum|share(MMI7+)−share(MMI4+)|; nested modeled exposure groups, not independent populations'}:failure('Population-share arithmetic is not finite');
 }
 root.ConsoleResponse=root.ConsoleResponse||{};
 root.ConsoleResponse.observedSeries={hourly,windowValues,analyze,empiricalW1,populationBalance};
})(window);
