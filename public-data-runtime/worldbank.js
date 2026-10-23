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
 const CONTEXT_INDICATORS={population:'SP.POP.TOTL',landArea:'AG.LND.TOTL.K2'};
 function validISO(value){const t=Date.parse(value);return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)&&Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===value.slice(0,10)&&t<=Date.now()+864e5;}
 function validateContext(data,previous,codes){
  if(data?.schemaVersion!==1||!validISO(data.capturedAt)||!data.countries||(!Array.isArray(data.sources)||data.sources.length!==2||new Set(data.sources.map(s=>s.id)).size!==2))throw Error('Invalid population/land context');
  for(const [key,indicator]of Object.entries(CONTEXT_INDICATORS)){
   const edition=data.sourceUpdatedAt?.[key],source=data.sources.find(s=>s.id===key);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(edition||'')||!validISO(edition+'T00:00:00Z')||new Date(edition+'T00:00:00Z').toISOString().slice(0,10)!==edition||source?.indicator!==indicator||!/^https:\/\/api\.worldbank\.org\//.test(source.url||'')||!new URL(source.url).pathname.endsWith('/indicator/'+indicator))throw Error('Invalid denominator source provenance');
   if(previous?.sourceUpdatedAt?.[key]&&edition<previous.sourceUpdatedAt[key])throw Error('Denominator source edition regressed');
  }
  if(previous&&data.capturedAt<previous.capturedAt)throw Error('Denominator capture regressed');
  for(const code of codes){const record=data.countries[code];if(!record)throw Error('Denominator country coverage missing');
   for(const key of Object.keys(CONTEXT_INDICATORS)){const series=record[key];if(!series||!Object.keys(series).length||!Object.values(series).some(finite))throw Error('Missing denominator series');
    for(const [year,value]of Object.entries(series)){if(!/^\d{4}$/.test(year)||+year<2000||+year>new Date().getUTCFullYear()||(value!==null&&(!finite(value)||value<0||key==='population'&&value>Number.MAX_SAFE_INTEGER)))throw Error('Invalid population/land observation');}
    for(const [year,value]of Object.entries(previous?.countries?.[code]?.[key]||{}))if(finite(value)&&!finite(series[year]))throw Error('Prior denominator missing from refresh; last good retained');
   }
  }
  return data;
 }
 async function refreshContext(previous,codes){
  const replies=await Promise.all(Object.entries(CONTEXT_INDICATORS).map(async([key,indicator])=>({key,indicator,...await fetchRows({codes,indicator,startYear:2000})}))),now=new Date().toISOString(),countries=Object.fromEntries(codes.map(c=>[c,{population:{},landArea:{}}])),sources=[],sourceUpdatedAt={};
  for(const reply of replies){sourceUpdatedAt[reply.key]=reply.sourceUpdatedAt;sources.push({id:reply.key,indicator:reply.indicator,url:BASE+'/country/'+codes.join(';')+'/indicator/'+reply.indicator+'?format=json&date=2000:'+new Date().getUTCFullYear(),retrievedAt:now});for(const row of reply.rows)countries[row.countryiso3code||row.country.id][reply.key][row.date]=row.value;}
  return validateContext({schemaVersion:1,capturedAt:now,sourceUpdatedAt,sources,countries},previous,codes);
 }
 function comparisonContext(snapshot,key,year,group){
  const context=snapshot.responseAnnualContext,known=['HIC','UMC','LMC','LIC'],all=Object.entries(snapshot.cty||{}),rows=all.filter(([,c])=>known.includes(c.income)&&finite(c.latest?.[key]?.v)&&String(c.latest[key].y)===year),a=rows.filter(([,c])=>c.income===group),b=rows.filter(([,c])=>c.income!==group),result={year,eligible:rows.length,displayed:all.length,aCodes:a.map(([c])=>c),bCodes:b.map(([c])=>c),aCount:a.length,bCount:b.length,context,population:null,density:null,missingPopulation:[],missingLand:[]};
  if(!context||!/^\d{4}$/.test(year||'')||+year>new Date().getUTCFullYear()||!known.includes(group)||a.length<2||b.length<2)return result;
  function totals(groupRows){let population=0,area=0;for(const [code]of groupRows){const p=context.countries?.[code]?.population?.[year],land=context.countries?.[code]?.landArea?.[year];if(!finite(p)||p<0||p>Number.MAX_SAFE_INTEGER)result.missingPopulation.push(code);else population+=p;if(!finite(land)||land<=0)result.missingLand.push(code);else area+=land;}return {population,area};}
  const ta=totals(a),tb=totals(b),den=ta.population+tb.population;if(!result.missingPopulation.length&&Number.isSafeInteger(den)&&den>0){const score=2*Math.min(ta.population/den,tb.population/den);result.population={score,a:ta.population,b:tb.population,total:den};}
  if(result.population&&!result.missingLand.length&&finite(ta.area)&&finite(tb.area)&&ta.area>0&&tb.area>0){const da=ta.population/ta.area,db=tb.population/tb.area,ds=da+db,score=2*Math.min(da/ds,db/ds);if(finite(da)&&finite(db)&&finite(ds)&&ds>0&&finite(score))result.density={score,a:da,b:db,aArea:ta.area,bArea:tb.area};}
  return result;
 }
 function airExposureContext(snapshot,iso){
  const c=snapshot.cty?.[iso],years=snapshot.years||[],values=c?.pm25||[];if(values.length!==years.length)return null;let last=-1;for(let i=0;i<values.length;i++)if(finite(values[i])&&values[i]>=0)last=i;if(last<4)return null;const rows=[];
  for(let i=last-4;i<=last;i++){const y=years[i],v=values[i];if(!/^\d{4}$/.test(y)||+y>new Date().getUTCFullYear()||!finite(v)||v<0||rows.length&&+y!==+rows.at(-1)[0]+1)return null;rows.push([y,v]);}
  const total=rows.reduce((sum,[,v])=>sum+Math.max(0,v-5),0);if(!finite(total))return null;return {value:total,reference:5,start:rows[0][0],end:rows.at(-1)[0],rows};
 }
 function installContext(options){
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',()=>installContext(options),{once:true});return null;}
  const codes=options.countries,element=document.getElementById('worldbank-population-area');
  if(element)try{const snapshot=options.getSnapshot(),data=validateContext(JSON.parse(element.textContent),null,codes);options.setSnapshot({...snapshot,responseAnnualContext:data,responseContextEmbedded:true});}catch(error){const snapshot=options.getSnapshot();options.setSnapshot({...snapshot,responseContextError:error.message});}
  const refresh=installRefresh(async()=>{const previous=options.getSnapshot().responseAnnualContext;try{const context=await refreshContext(previous,codes),snapshot=options.getSnapshot();options.setSnapshot({...snapshot,responseAnnualContext:context,responseContextEmbedded:false,responseContextCheckedAt:new Date().toISOString(),responseContextError:null});}catch(error){const snapshot=options.getSnapshot();options.setSnapshot({...snapshot,responseContextCheckedAt:new Date().toISOString(),responseContextError:error.message});}});
  if(location.protocol!=='file:')refresh();return refresh;
 }

 function escape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 function sourceChip(snapshot){const downloaded=snapshot.responseDownloadedAt,date=downloaded||snapshot.embedded,age=(Date.now()-Date.parse(date))/864e5;return '<span class="badge '+(downloaded?'b-meas':'b-mod')+'">'+(downloaded?'downloaded':'snapshot')+'</span> World Bank annual data'+(date?' · '+escape(downloaded?'retrieved '+date:'embedded '+date):'')+(snapshot.responseError?' · refresh unavailable; last good retained':'')+(snapshot.responseRetainedSeries?.length?' · partial refresh; '+snapshot.responseRetainedSeries.length+' prior series retained (latest source observation missing/older)':'')+(snapshot.responseAnnualContext?' · population/land '+(snapshot.responseContextEmbedded?'snapshot ':'retrieved ')+escape(snapshot.responseAnnualContext.capturedAt):'')+(snapshot.responseContextError?' · population/land refresh unavailable; last good retained':'')+(snapshot.responseAnnualContext&&(Date.now()-Date.parse(snapshot.responseAnnualContext.capturedAt))/864e5>=30?' · population/land snapshot '+Math.floor((Date.now()-Date.parse(snapshot.responseAnnualContext.capturedAt))/864e5)+' days old':'')+(age>=30?' · snapshot '+Math.floor(age)+' days old':'');}
 function vintageText(snapshot){return 'Latest reported year '+snapshot.vintage+(snapshot.responseDownloadedAt?' · downloaded '+snapshot.responseDownloadedAt:' · embedded '+snapshot.embedded)+'. Individual observation years differ.';}
 function installRefresh(run,options={}){const cadence=options.cadenceMs??6*3600e3;let inflight=null,checked=0;function refresh(){if(inflight)return inflight;checked=Date.now();inflight=Promise.resolve().then(run).finally(()=>{inflight=null;});return inflight;}setInterval(()=>{if(!document.hidden)refresh();},cadence);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-checked>=cadence)refresh();});return refresh;}
 // Definitions were checked against the official indicator metadata. Only
 // total-resident denominators can use SP.POP.TOTL; age-standardized rates,
 // birth/cohort rates and multiyear/censored percentages are not converted.
 const IMPACT_RULES={
  'SH.TBS.INCD':{scale:1e5,label:'Approximate new and relapse TB episodes',unit:'episodes/year',note:'Estimated new and relapse episodes, all forms; not unique people or observed notifications.'},
  'SH.STA.TRAF.P5':{scale:1e5,label:'Approximate road-traffic injury deaths',unit:'deaths/year',note:'Population-scaled annual fatal-injury estimate; not a future accident forecast.'},
  'SH.STA.SUIC.P5':{scale:1e5,label:'Approximate suicide deaths',unit:'deaths/year',note:'The source defines this overall rate as crude, not age adjusted. No individual risk is inferred.'},
  'SP.POP.65UP.TO.ZS':{scale:100,label:'Approximate residents aged 65+',unit:'people',percent:true},
  'SP.POP.0014.TO.ZS':{scale:100,label:'Approximate residents aged 0–14',unit:'people',percent:true},
  'SH.H2O.SMDW.ZS':{scale:100,label:'Approximate residents without safely managed drinking water',unit:'people',percent:true,complement:true},
  'SH.H2O.BASW.ZS':{scale:100,label:'Approximate residents without at least basic drinking water',unit:'people',percent:true,complement:true},
  'SH.STA.SMSS.ZS':{scale:100,label:'Approximate residents without safely managed sanitation',unit:'people',percent:true,complement:true},
  'SH.STA.BASS.ZS':{scale:100,label:'Approximate residents without at least basic sanitation',unit:'people',percent:true,complement:true},
  'SH.STA.HYGN.ZS':{scale:100,label:'Approximate residents without basic handwashing facilities',unit:'people',percent:true,complement:true},
  'SH.STA.ODFC.ZS':{scale:100,label:'Approximate residents practicing open defecation',unit:'people',percent:true},
  'EG.CFT.ACCS.ZS':{scale:100,label:'Approximate residents without clean cooking fuels/technologies',unit:'people',percent:true,complement:true},
  'EN.ATM.PM25.MC.ZS':{scale:100,label:'Approximate residents above the indicator’s 10 µg/m³ PM2.5 reference',unit:'people',percent:true,note:'The source indicator uses 10 µg/m³, not the WHO 2021 annual 5 µg/m³ guideline. Not personal dose or attributable deaths.'},
  'SH.MED.PHYS.ZS':{scale:1000,label:'Approximate source-defined physician inventory',unit:'physicians',note:'Rate-derived inventory, not available staff, full-time equivalents or spare capacity; reporting definitions vary.'},
  'SH.MED.NUMW.P3':{scale:1000,label:'Approximate source-defined nursing/midwifery inventory',unit:'personnel',note:'Includes the source’s professional/auxiliary/enrolled categories; not available staff or full-time equivalents.'},
  'SH.MED.BEDS.ZS':{scale:1000,label:'Approximate source-defined inpatient bed inventory',unit:'beds',note:'Includes reported public/private/general/specialist inpatient beds; not occupied, staffed, functional or available beds.'},
  'SH.XPD.CHEX.PC.CD':{scale:1,label:'Population-scaled current health expenditure',unit:'current US$/year',note:'Reported per-capita expenditure scaled by same-year residents; not a budget, available funds or future cost forecast.'},
  'SH.HIV.INCD':{direct:true,label:'Published estimated new HIV infections, ages 15–49',unit:'people/year'},
  'SH.HIV.0014':{direct:true,label:'Published estimated children aged 0–14 living with HIV',unit:'people'}
 };
 const IMPACT_LIMITS={
  'SH.STA.AIRP.P5':'Age-standardized mortality cannot be multiplied by a crude resident population to recover deaths.',
  'SN.ITK.DEFC.ZS':'No count is recovered: 2.5 may mean below 2.5%; reported prevalence/averaging definitions are retained.',
  'SN.ITK.SVFI.ZS':'No annual count is recovered without the exact source reporting/averaging population.',
  'SH.DYN.NCOM.ZS':'The 30–70 lifetime probability is not an annual mortality rate or annual deaths.',
  'SH.DYN.AIDS.ZS':'A matched ages 15–49population is not supplied; total residents are not substituted.',
  'SH.MLR.INCD.P3':'The population-at-risk denominator is not supplied; total residents are not substituted.'
 };
 function countryImpacts(snapshot,iso){
  const country=snapshot.cty?.[iso],annual=snapshot.responseAnnualContext,facts=[],items=[],records=[],seen=new Set(),checked=snapshot.responseCheckedAt||snapshot.embedded||null;
  function fact(id,label,value,unit,year,source,note,at=checked){if(seen.has(id))return;seen.add(id);facts.push({id,label,value,unit,measuredAt:year||null,checkedAt:at,basis:'modeled',quality:value==null?'missing':'historical',source,note});}
  if(!country)return {evidence:[],impacts:{title:'Public annual health context',scope:'No country selected',summary:'Select a country to inspect source-backed annual quantities.',items:[],records:[],limitations:['No population or patient outcome is invented for missing records.']}};
  for(const [key,meta]of Object.entries(snapshot.indMeta||{})){
   const point=country.latest?.[key],year=String(point?.y||''),validYear=/^\d{4}$/.test(year)&&+year<=new Date().getUTCFullYear(),good=finite(point?.v)&&point.v>=0&&(!/^%/.test(meta.unit||'')||point.v<=100)&&validYear,value=good?point.v:null,source='https://data.worldbank.org/indicator/'+encodeURIComponent(meta.ind||''),id='impact-source-'+key,rule=IMPACT_RULES[meta.ind],definition=IMPACT_LIMITS[meta.ind]||'Keep the published source population/period. No patient outcome, eligible-cohort count or intervention effect is inferred.';
   fact(id,country.name+' · '+meta.name,value,meta.unit||'',good?year:null,source,definition+' Source edition: '+(snapshot.responseSourceUpdatedAt?.[meta.ind]||'embedded source vintage; see observation year')+'.');
   let quantity=value,unit=meta.unit||'source-defined units',label=meta.name,note=definition,method='Published country-level indicator; no count conversion.',ids=[id];
   if(rule){label=rule.label;unit=rule.unit;note=(rule.note||'A total-resident population-scaled planning estimate; not an independently reported headcount.')+' Rounded source indicators and population-source revisions limit precision.';
    if(rule.direct){if(!finite(quantity)||quantity>Number.MAX_SAFE_INTEGER)quantity=null;method='Use the source’s published count directly; no population multiplier.';}
    else{const pop=annual?.countries?.[iso]?.population?.[year],popGood=finite(pop)&&Number.isSafeInteger(pop)&&pop>0,popId='impact-population-'+year,rateGood=value!=null&&(!rule.percent||value<=100),rate=rateGood?(rule.complement?100-value:value):null,raw=popGood&&rate!=null?pop*rate/rule.scale:null;
     quantity=finite(raw)&&raw>=0&&raw<=Number.MAX_SAFE_INTEGER?Math.round(raw):null;
     fact(popId,country.name+' · same-year resident denominator',popGood?pop:null,'residents',validYear?year:null,'https://data.worldbank.org/indicator/SP.POP.TOTL','Midyear total residents for the exact indicator year; not an eligible age cohort, live births, people at risk or service users.',annual?.capturedAt);
     ids.push(popId);method=(rule.complement?'(100 − source percentage)':'Source value')+' × same-year resident population / '+rule.scale+'. '+(quantity==null?'Missing/invalid exact-year denominator or source value; no nearest-year substitution.':'Inputs: '+value+'; residents '+pop+'; year '+year+'.');
    }
   }
   items.push({id:'quantity-'+key,label,value:quantity,unit,kind:'context',evidenceIds:ids,method,note});
   records.push({id:iso+'-'+key,label:country.name+' · '+meta.name,kind:'context',evidenceIds:[id],summary:good?year+' · '+value+' '+(meta.unit||'')+'. '+definition:'Published observation unavailable; no prior/neighboring-year value is invented.'});
  }
  return {evidence:facts,impacts:{title:'Source-backed annual burden and capacity context',scope:country.name+' · each record retains its own observation year',summary:'Official annual indicators and compatible same-year population estimates populate this view. These are dated planning quantities, not forecasts of health losses or benefits.',items,records,limitations:['Different indicator years remain separate; do not sum overlapping conditions, service gaps or age groups.','Population-scaled counts use only indicators defined over total residents. Birth, child, at-risk, age-standardized and lifetime-risk measures retain their original units.','Annual model estimates are not present incidence, service availability, individual prognosis, causal effects or an intervention-benefit forecast.']}};
 }
 root.WorldBankPublicData={fetchRows,refreshSnapshot,sourceChip,vintageText,installRefresh,validateContext,refreshContext,comparisonContext,airExposureContext,installContext,countryImpacts};
})(globalThis);
