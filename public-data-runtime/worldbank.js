/* Canonical keyless WDI reader. Embedded verbatim by scripts/embed_worldbank_runtime.py. */
(function(root){
 'use strict';
 const BASE='https://api.worldbank.org/v2',MAX_PAGES=20,TIMEOUT=15000;
 function finite(value){return typeof value==='number'&&Number.isFinite(value);}
 function yearRange(start,end){return Array.from({length:end-start+1},(_,i)=>String(start+i));}
 async function json(url){const c=new AbortController(),timer=setTimeout(()=>c.abort(),TIMEOUT);try{const r=await fetch(url,{signal:c.signal});if(!r.ok)throw Error('World Bank HTTP '+r.status);return await r.json();}catch(e){throw Error(e.name==='AbortError'?'World Bank request timed out':e.message);}finally{clearTimeout(timer);}}
 async function fetchRows(options){
  const codes=options.codes,indicator=options.indicator,start=options.startYear??2000,end=options.endYear??new Date().getUTCFullYear();
  if(!Array.isArray(codes)||!codes.length||!Number.isInteger(start)||!Number.isInteger(end)||start>end||end>new Date().getUTCFullYear())throw Error('Invalid public annual-data request');
  const expected=new Set(codes),rows=[],seen=new Set();let total=null,pages=null,updated=null;
  for(let page=1;page<=(pages??1);page++){
   const u=new URL(BASE+'/country/'+codes.join(';')+'/indicator/'+indicator);u.searchParams.set('format','json');u.searchParams.set('date',start+':'+end);u.searchParams.set('per_page','20000');u.searchParams.set('page',String(page));
   const d=await json(u),m=Array.isArray(d)&&d[0],items=Array.isArray(d)&&d[1];
   if(!m||!Array.isArray(items)||!Number.isInteger(+m.pages)||+m.pages<1||+m.pages>MAX_PAGES||+m.page!==page||!Number.isInteger(+m.total)||+m.total<1)throw Error('Incomplete World Bank response');
   if(total!=null&&(total!==+m.total||pages!==+m.pages||updated!==m.lastupdated))throw Error('World Bank pagination changed during retrieval');total=+m.total;pages=+m.pages;updated=m.lastupdated;if(typeof updated!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(updated)||!Number.isFinite(Date.parse(updated+'T00:00:00Z'))||new Date(updated+'T00:00:00Z').toISOString().slice(0,10)!==updated||Date.parse(updated+'T00:00:00Z')>Date.now()+864e5)throw Error('Invalid World Bank source-update date');
   for(const row of items){const code=row.countryiso3code||row.country?.id,y=String(row.date),key=code+'|'+y;
    if(!expected.has(code)||row.indicator?.id!==indicator||!/^\d{4}$/.test(y)||+y<start||+y>end||seen.has(key)||(row.value!==null&&!finite(row.value)))throw Error('Invalid World Bank country/indicator/year/value');seen.add(key);rows.push(row);
   }
  }
  if(rows.length!==total||!rows.some(r=>finite(r.value)))throw Error('World Bank series is empty or truncated');
  for(const code of codes)if(!rows.some(r=>(r.countryiso3code||r.country?.id)===code))throw Error('World Bank country coverage missing');
  return {rows,sourceUpdatedAt:updated,checkedAt:new Date().toISOString()};
 }
 async function pool(tasks,limit){let next=0,failed=false;const out=[],results=await Promise.allSettled(Array.from({length:Math.min(limit,tasks.length)},async()=>{while(!failed&&next<tasks.length){const i=next++;try{out[i]=await tasks[i]();}catch(error){failed=true;throw error;}}}));const bad=results.find(r=>r.status==='rejected');if(bad)throw bad.reason;return out;}
 async function refreshSnapshot(options){
  const current=options.snapshot,start=Math.min(...current.years.map(Number)),end=new Date().getUTCFullYear(),years=yearRange(start,end),index=Object.fromEntries(years.map((y,i)=>[y,i])),map=options.indicatorMap,keys=Object.keys(map),tasks=[];
  for(const indicator of keys){tasks.push(()=>fetchRows({codes:options.aggregateCodes,indicator,startYear:start,endYear:end}));tasks.push(()=>fetchRows({codes:options.countryCodes,indicator,startYear:start,endYear:end}));}
  const replies=await pool(tasks,4),agg={},cty={},sourceUpdates={};
  for(const code of options.aggregateCodes){const id=options.aggregateRemap?.[code]||code;agg[id]={...current.agg[id],s:{}};}
  for(const code of options.countryCodes){cty[code]={...current.cty[code],latest:{}};for(const field of Object.values(options.seriesFields))cty[code][field]=years.map(()=>null);}
  let latest=null;
  keys.forEach((indicator,i)=>{const k=map[indicator],ar=replies[i*2],cr=replies[i*2+1];if(ar.sourceUpdatedAt!==cr.sourceUpdatedAt)throw Error('World Bank source edition changed during retrieval');if(current.responseSourceUpdatedAt?.[indicator]&&ar.sourceUpdatedAt<current.responseSourceUpdatedAt[indicator])throw Error('World Bank source edition regressed; last good data retained');sourceUpdates[indicator]=ar.sourceUpdatedAt;
   for(const row of ar.rows){const code=options.aggregateRemap?.[row.countryiso3code||row.country.id]||row.countryiso3code||row.country.id;if(!agg[code])throw Error('Unknown aggregate');if(!agg[code].s[k])agg[code].s[k]=years.map(()=>null);if(row.value!==null){agg[code].s[k][index[row.date]]=row.value;if(latest===null||row.date>latest)latest=row.date;}}
   for(const row of cr.rows){const code=row.countryiso3code||row.country.id;if(row.value===null)continue;const record=cty[code],prior=record.latest[k];if(!prior||row.date>prior.y)record.latest[k]={v:row.value,y:row.date};const field=options.seriesFields[k];if(field)record[field][index[row.date]]=row.value;if(latest===null||row.date>latest)latest=row.date;}
  });
  if(!latest)throw Error('No finite annual observations');
  const retained=[];function last(series,axis){for(let i=(series||[]).length-1;i>=0;i--)if(finite(series[i]))return {year:axis[i],value:series[i]};return null;}function align(series){const out=years.map(()=>null);current.years.forEach((y,i)=>{if(index[y]!=null&&finite(series?.[i]))out[index[y]]=series[i];});return out;}
  for(const code of options.countryCodes)for(const k of Object.values(map)){const prior=current.cty[code]?.latest?.[k],next=cty[code].latest[k];if(prior&&finite(prior.v)&&/^\d{4}$/.test(prior.y)&&(!next||next.y<prior.y)){cty[code].latest[k]={...prior};const field=options.seriesFields[k];if(field)cty[code][field]=align(current.cty[code][field]);retained.push({scope:'country',code,indicator:k,keptYear:prior.y,returnedYear:next?.y||null});if(prior.y>latest)latest=prior.y;}}
  for(const code of Object.keys(agg))for(const k of Object.values(map)){const prior=last(current.agg[code]?.s?.[k],current.years),next=last(agg[code].s[k],years);if(prior&&(!next||next.year<prior.year)){agg[code].s[k]=align(current.agg[code].s[k]);retained.push({scope:'aggregate',code,indicator:k,keptYear:prior.year,returnedYear:next?.year||null});if(prior.year>latest)latest=prior.year;}}

  return {...current,years,agg,cty,vintage:latest,responseDownloadedAt:new Date().toISOString(),responseCheckedAt:new Date().toISOString(),responseSourceUpdatedAt:sourceUpdates,responseRetainedSeries:retained,responseError:null};
 }
 function escape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 function sourceChip(snapshot){const downloaded=snapshot.responseDownloadedAt,date=downloaded||snapshot.embedded,age=(Date.now()-Date.parse(date))/864e5;return '<span class="badge '+(downloaded?'b-meas':'b-mod')+'">'+(downloaded?'downloaded':'snapshot')+'</span> World Bank annual data'+(date?' · '+escape(downloaded?'retrieved '+date:'embedded '+date):'')+(snapshot.responseError?' · refresh unavailable; last good retained':'')+(snapshot.responseRetainedSeries?.length?' · partial refresh; '+snapshot.responseRetainedSeries.length+' prior series retained (latest source observation missing/older)':'')+(age>=30?' · snapshot '+Math.floor(age)+' days old':'');}
 function vintageText(snapshot){return 'Latest reported year '+snapshot.vintage+(snapshot.responseDownloadedAt?' · downloaded '+snapshot.responseDownloadedAt:' · embedded '+snapshot.embedded)+'. Individual observation years differ.';}
 function installRefresh(run,options={}){const cadence=options.cadenceMs??6*3600e3;let inflight=null,checked=0;function refresh(){if(inflight)return inflight;checked=Date.now();inflight=Promise.resolve().then(run).finally(()=>{inflight=null;});return inflight;}setInterval(()=>{if(!document.hidden)refresh();},cadence);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-checked>=cadence)refresh();});return refresh;}
 root.WorldBankPublicData={fetchRows,refreshSnapshot,sourceChip,vintageText,installRefresh};
})(globalThis);
