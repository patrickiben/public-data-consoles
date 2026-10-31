/* Community Resilience engine: hazard registries, FEMA NRI ranking, the hazard-neutral ten-metric suite and the
   native response plan. No network, DOM, clock or dependencies; callers pass `now` in milliseconds.
   Asset records and exposure screens are planning context, never live operating condition. */
(function(root){
 'use strict';
 const finite=v=>typeof v==='number'&&Number.isFinite(v),safe=v=>Number.isSafeInteger(v)&&v>=0;
 const mean=a=>a.reduce((s,v)=>s+v,0)/a.length,clamp=v=>Math.max(0,Math.min(1,v));
 const num=v=>finite(v)&&v!==-9999?v:null,text=v=>typeof v==='string'&&v.trim()?v.trim():null;
 const xy=s=>finite(s.lat)&&Math.abs(s.lat)<=90&&finite(s.lon)&&Math.abs(s.lon)<=180;
 const iso=t=>finite(t)?new Date(t).toISOString():null,timeOf=v=>finite(v)?v:typeof v==='string'?Date.parse(v):NaN;
 const assetId=v=>typeof v==='string'&&v.trim()?v:finite(v)?String(v):null;

 /* ---------- registries ---------- */
 const HAZARDS=[['AVLN','Avalanche','avalanche'],['CFLD','Coastal Flooding','surge'],['CWAV','Cold Wave','winter'],['DRGT','Drought','drought'],['ERQK','Earthquake','earthquake'],['HAIL','Hail','severe'],['HWAV','Heat Wave','heat'],['HRCN','Hurricane','tropical'],['ISTM','Ice Storm','winter'],['LNDS','Landslide','landslide'],['LTNG','Lightning','severe'],['IFLD','Inland Flooding','inland-flood'],['SWND','Strong Wind','severe'],['TRND','Tornado','severe'],['TSUN','Tsunami','tsunami'],['VLCN','Volcanic Activity','volcanic'],['WFIR','Wildfire','wildfire'],['WNTW','Winter Weather','winter']].map(([code,name,module])=>({code,name,module}));
 const HAZARD=new Map(HAZARDS.map(h=>[h.code,h]));
 const LIFELINES=[
  {id:'water',name:'Water',sources:['waterSystems'],notAvailable:'Operating condition and boil-water notices: no keyless national source'},
  {id:'power',name:'Power',sources:['outages','powerPlants'],notAvailable:'Substations and transmission lines: no current keyless national source'},
  {id:'health',name:'Health care',sources:['hospitalsCMS','hospitalsUSGS','healthCenters'],notAvailable:'Beds and live capacity: no keyless national source'},
  {id:'shelter',name:'Shelter',sources:['shelters'],notAvailable:'Pre-designated shelter lists and live capacity: no keyless national source'},
  {id:'transport',name:'Transportation',sources:['bridges'],notAvailable:'Live road closures: no keyless national source'},
  {id:'communications',name:'Communications',sources:[],notAvailable:'Network status and coverage: no keyless national source (the FCC map API needs credentials)'}];
 const LOWER48={conusOnly:true};
 const MODULES=[
  {id:'tropical',name:'Hurricane and tropical storm',hazards:['HRCN'],strains:['power','shelter','water','transport','communications','health'],liveSources:['nwsAlerts','tropical'],staticSources:['surge','floodZone'],screens:['screenNriTract'],notCovered:{surge:{states:['AK'],reason:'The NHC storm surge risk maps do not cover Alaska'}}},
  {id:'surge',name:'Storm surge and coastal flooding',hazards:['CFLD'],strains:['water','transport','shelter','power'],liveSources:['nwsAlerts','tideStation','ofsForecast'],staticSources:['surge','floodZone','elevation'],screens:['coastalLevelScreen','screenFloodZones'],notCovered:{surge:{states:['AK'],reason:'The NHC storm surge risk maps do not cover Alaska'}}},
  {id:'inland-flood',name:'Inland and river flooding',hazards:['IFLD'],strains:['water','transport','shelter','power'],liveSources:['nwsAlerts','riverGauges'],staticSources:['floodZone','elevation'],screens:['screenFloodZones'],notCovered:{}},
  {id:'severe',name:'Tornado and severe storms',hazards:['TRND','HAIL','SWND','LTNG'],strains:['power','shelter','communications','transport'],liveSources:['nwsAlerts','spcOutlook'],staticSources:[],screens:['screenNriTract'],notCovered:{spcOutlook:{...LOWER48,reason:'SPC convective outlooks cover the lower 48 states only'}}},
  {id:'heat',name:'Extreme heat',hazards:['HWAV'],strains:['power','health','water'],liveSources:['nwsAlerts','heatRisk','airQuality'],staticSources:[],screens:['screenHeatRisk'],notCovered:{heatRisk:{...LOWER48,reason:'NWS HeatRisk (Experimental) covers the lower 48 states only'},airQuality:{states:['PR'],reason:'AirNow reporting areas do not include Puerto Rico'}}},
  {id:'wildfire',name:'Wildfire and smoke',hazards:['WFIR'],strains:['power','health','transport','communications','shelter'],liveSources:['nwsAlerts','wildfires','airQuality'],staticSources:[],screens:['screenNriTract'],notCovered:{airQuality:{states:['PR'],reason:'AirNow reporting areas do not include Puerto Rico'}}},
  {id:'drought',name:'Drought',hazards:['DRGT'],strains:['water','power'],liveSources:['drought'],staticSources:['waterSystems'],screens:['screenNriTract'],notCovered:{}},
  {id:'earthquake',name:'Earthquake',hazards:['ERQK'],strains:['transport','water','power','health','shelter','communications'],liveSources:['earthquakes'],staticSources:['seismicDesign','bridges'],screens:['screenSeismic'],notCovered:{}},
  {id:'winter',name:'Winter storm, ice and cold',hazards:['WNTW','ISTM','CWAV'],strains:['power','transport','shelter','health'],liveSources:['nwsAlerts'],staticSources:[],screens:['screenNriTract'],notCovered:{}},
  {id:'landslide',name:'Landslide',hazards:['LNDS'],strains:['transport','water'],liveSources:['nwsAlerts'],staticSources:[],screens:['screenNriTract'],notCovered:{}},
  {id:'tsunami',name:'Tsunami',hazards:['TSUN'],strains:['shelter','transport','health'],liveSources:['nwsAlerts'],staticSources:['elevation'],screens:['screenNriTract'],notCovered:{}},
  {id:'volcanic',name:'Volcanic activity',hazards:['VLCN'],strains:['transport','health','water','power'],liveSources:['volcanoes','nwsAlerts'],staticSources:[],screens:[],notCovered:{}},
  {id:'avalanche',name:'Avalanche',hazards:['AVLN'],strains:['transport'],liveSources:['nwsAlerts'],staticSources:[],screens:[],notCovered:{}}];
 const MODULE=new Map(MODULES.map(m=>[m.id,m]));

 /* NWS event names (2025 renames included) to NRI hazard codes. First matching rule wins. */
 const ALERT_RULES=[[/storm surge/i,['CFLD']],[/coastal flood|lakeshore flood/i,['CFLD']],[/extreme wind/i,['HRCN','SWND']],[/hurricane|tropical storm|typhoon/i,['HRCN']],[/flood/i,['IFLD']],[/tsunami/i,['TSUN']],[/avalanche/i,['AVLN']],[/red flag|fire weather|extreme fire/i,['WFIR']],[/heat/i,['HWAV']],[/extreme cold|cold weather|wind chill|hard freeze/i,['CWAV']],[/ice storm|freezing rain/i,['ISTM']],[/winter storm|winter weather|blizzard|lake effect snow|snow squall/i,['WNTW']],[/tornado/i,['TRND']],[/severe thunderstorm/i,['HAIL','SWND']],[/high wind|wind advisory/i,['SWND']],[/ashfall|volcan/i,['VLCN']]];
 function alertHazards(event){const name=text(event);if(!name)return [];const rule=ALERT_RULES.find(([re])=>re.test(name));return rule?rule[1].slice():[];}
 /* Only a Warning or Emergency sets the Warning phase and only a Watch sets the Watch phase; advisories, statements and outlooks do not. */
 const alertLevel=event=>/warning|emergency/i.test(event||'')?'warning':/watch/i.test(event||'')?'watch':'advisory';
 function alertItems(result,now){const items=Array.isArray(result)?result:Array.isArray(result?.data?.items)?result.data.items:[];return items.filter(a=>{if(!text(a?.event))return false;const until=timeOf(a.ends||a.expires);return !finite(now)||!finite(until)||until>now;});}

 /* ---------- geometry ---------- */
 function distance(a,b){const rad=Math.PI/180,dlat=(b.lat-a.lat)*rad,dlon=(b.lon-a.lon)*rad,x=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;return 6371.0088*2*Math.asin(Math.sqrt(clamp(x)));}
 function distanceKm(a,b){return a&&b&&xy(a)&&xy(b)?distance(a,b):null;}
 function nearest(list,origin){const rows=(Array.isArray(list)?list:[]).map(item=>({...item,distanceKm:distanceKm(origin,item)}));return rows.filter(r=>r.distanceKm!=null).sort((a,b)=>a.distanceKm-b.distanceKm).concat(rows.filter(r=>r.distanceKm==null));}

 /* ---------- NRI ranking ---------- */
 const INSUFFICIENT=new Set(['Insufficient Data','Data Unavailable']);
 function nriAttrs(x){if(!x||typeof x!=='object')return null;if(x.data&&x.data.attrs)return x.data.attrs;if(x.attrs)return x.attrs;return 'STCOFIPS' in x?x:null;}
 function rankHazards({county,tract,alerts,now}={}){
  const attrs=nriAttrs(county),version=attrs?text(attrs.NRI_VER):null,dataDate=county?.dataDate||null;
  if(!attrs)return {status:county?.status&&county.status!=='ok'?county.status:'unavailable',message:county?.message||'FEMA National Risk Index county figures are not available; no other place is substituted.',method:'',version:null,dataDate,county:null,tract:null,rows:[],leading:[],notApplicable:[],insufficient:[],noRatings:false};
  let tattrs=nriAttrs(tract),tractNote=null;
  if(tattrs&&String(tattrs.STCOFIPS||'')!==String(attrs.STCOFIPS)){tattrs=null;tractNote='The tract figures belong to another county and are not shown.';}
  const sameAsCounty=!!tattrs&&tattrs.POPULATION===attrs.POPULATION&&tattrs.BUILDVALUE===attrs.BUILDVALUE&&finite(tattrs.EAL_VALT)&&finite(attrs.EAL_VALT)&&Math.abs(tattrs.EAL_VALT-attrs.EAL_VALT)<1;
  if(sameAsCounty){tractNote='This county is a single census tract; county figures are shown because tract ratings use a different percentile base.';tattrs=null;}
  /* A special land use tract (code 9800 to 9899: military base, park, airport) or one with under 100 residents does not describe where people live. */
  if(tattrs){const tf=text(tattrs.TRACTFIPS)||'',code=tf.slice(5),pop=num(tattrs.POPULATION);
   if(/^98\d\d/.test(code)){tractNote='Census tract '+tf+' is a special land use tract (code 9800 to 9899, such as a military base, park or airport), so its figures do not describe where people in this place live and are not shown.';tattrs=null;}
   else if(finite(pop)&&pop<100){tractNote='Census tract '+tf+' has only '+pop+' residents, so its figures do not describe where people in this place live and are not shown.';tattrs=null;}}
  const active=alertItems(alerts,now);
  const rows=HAZARDS.map(h=>{const rating=text(attrs[h.code+'_RISKR']),eal=num(attrs[h.code+'_EALT']),score=num(attrs[h.code+'_RISKS']);
   return {code:h.code,name:h.name,module:h.module,eal,ealRank:null,rating,score,tractEal:tattrs?num(tattrs[h.code+'_EALT']):null,tractRating:tattrs?text(tattrs[h.code+'_RISKR']):null,applicable:rating!=='Not Applicable',insufficient:INSUFFICIENT.has(rating),
    activeAlerts:active.filter(a=>alertHazards(a.event).includes(h.code)).map(a=>({id:a.id||null,event:a.event,severity:a.severity||null,headline:a.headline||null,senderName:a.senderName||null,sent:a.sent||null,onset:a.onset||null,ends:a.ends||null,expires:a.expires||null}))};});
  const ranked=rows.filter(r=>r.applicable&&r.eal>0).sort((a,b)=>b.eal-a.eal);ranked.forEach((r,i)=>r.ealRank=i+1);
  rows.sort((a,b)=>(a.ealRank??99)-(b.ealRank??99)||a.name.localeCompare(b.name));
  const noRatings=num(attrs.RISK_SCORE)==null&&rows.every(r=>r.score==null);
  return {status:'ok',message:'Ranked by expected annual loss for '+(text(attrs.COUNTY)||'this county')+(text(attrs.STATE)?', '+attrs.STATE:'')+'.',
   method:'FEMA National Risk Index'+(version?', version '+version:'')+': hazards ranked by county expected annual loss (dollars per year). The rating beside each is the NRI percentile class among U.S. counties. Tract figures are local detail and never replace county figures.',
   version,dataDate,county:{fips:String(attrs.STCOFIPS),name:text(attrs.COUNTY),state:text(attrs.STATE),population:num(attrs.POPULATION),buildingValue:num(attrs.BUILDVALUE),ealTotal:num(attrs.EAL_VALT),riskScore:num(attrs.RISK_SCORE),riskRating:text(attrs.RISK_RATNG),soviRating:text(attrs.SOVI_RATNG),reslRating:text(attrs.RESL_RATNG)},
   tract:tattrs?{fips:text(tattrs.TRACTFIPS),population:num(tattrs.POPULATION),ealTotal:num(tattrs.EAL_VALT),riskRating:text(tattrs.RISK_RATNG)}:null,tractNote,
   rows,leading:ranked.slice(0,5).map(r=>r.code),notApplicable:rows.filter(r=>!r.applicable).map(r=>r.code),insufficient:rows.filter(r=>r.insufficient).map(r=>r.code),noRatings,
   noRatingsNote:noRatings?'FEMA does not publish risk scores or ratings, social vulnerability or community resilience for this place; hazards are ranked by expected annual loss only.':null};
 }

 function notCoveredReason(rule,place){if(!rule||!place)return null;const abbr=place.state?.abbr;if(rule.conusOnly&&place.isConus===false)return rule.reason;if(rule.states&&(rule.states.includes(abbr)||(place.isPR===true&&rule.states.includes('PR'))))return rule.reason;return null;}
 const LIVE_NAMES={drought:'U.S. Drought Monitor',heatRisk:'NWS HeatRisk',wildfires:'NIFC wildfires',airQuality:'AirNow',tropical:'active tropical cyclones',earthquakes:'USGS earthquakes',volcanoes:'USGS volcano alerts',riverGauges:'NOAA river gauges',tideStation:'NOAA tide station',spcOutlook:'SPC outlook',ofsForecast:'NOAA OFS forecast'};
 function sourceCoverage(module,place,results={}){return [...module.liveSources.map(n=>[n,'live']),...module.staticSources.map(n=>[n,'static']),...module.screens.map(n=>[n,'screen'])].map(([name,kind])=>{const reason=notCoveredReason(module.notCovered[name],place);return {name,kind,status:reason?'not-covered':results?.[name]?.status||'skipped',reason};});}
 function moduleStatus({ranking,place,results}={}){
  const rows=ranking?.status==='ok'?ranking.rows:[],lead=new Set(ranking?.leading||[]),county=ranking?.county?.name||'this county',money=format.money;
  const out=MODULES.map(m=>{
   const mine=rows.filter(r=>m.hazards.includes(r.code)),names=m.hazards.map(c=>HAZARD.get(c).name).join(', '),alerts=[...new Map(mine.flatMap(r=>r.activeAlerts).map(a=>[a.id||a.event,a])).values()];
   const ranks=mine.map(r=>r.ealRank).filter(finite),rank=ranks.length?Math.min(...ranks):null,best=mine.find(r=>r.ealRank===rank);
   let status,reason;
   if(alerts.length){status='leading';reason='Active NWS alert: '+alerts.map(a=>a.event).join(', ')+'.';}
   else if(ranking?.status!=='ok'){status='not-available';reason='FEMA National Risk Index county figures are not available for this place.';}
   else if(mine.some(r=>lead.has(r.code))){status='leading';reason=best.name+' ranks #'+rank+' by expected annual loss in '+county+' ('+money(best.eal)+' a year'+(best.rating&&!best.insufficient?', NRI '+best.rating:'')+').';}
   else if(mine.every(r=>!r.applicable)){status='not-applicable';reason='FEMA NRI rates '+names+' as Not Applicable in '+county+'.';}
   else if(!ranks.length&&mine.some(r=>r.insufficient)){status='not-available';
    /* Name insufficient-data and not-applicable hazards separately, and say when a live feed still covers the place. */
    const nm=list=>list.map(r=>r.name).join(', '),ins=mine.filter(r=>r.insufficient),na=mine.filter(r=>!r.applicable);
    const feeds=sourceCoverage(m,place,results).filter(x=>x.kind==='live'&&x.name!=='nwsAlerts'&&!x.reason).map(x=>LIVE_NAMES[x.name]||x.name);
    reason='FEMA NRI has insufficient data for '+nm(ins)+' in '+county+(na.length?' and rates '+nm(na)+' as Not Applicable':'')+', so the hazard is not ranked here.'+(feeds.length?' The live feed ('+feeds.join(', ')+') still covers this place; open the card to load it.':'');}
   else {status='rated';reason=rank?best.name+' ranks #'+rank+' by expected annual loss ('+money(best.eal)+' a year).':'FEMA NRI lists no expected annual loss for '+names+' in '+county+'.';}
   return {id:m.id,name:m.name,status,rank,reason,hazards:m.hazards.slice(),alerts,sources:sourceCoverage(m,place,results)};});
  const order={leading:0,rated:1,'not-available':2,'not-applicable':3};
  return out.sort((a,b)=>(b.alerts.length>0)-(a.alerts.length>0)||order[a.status]-order[b.status]||(a.rank??99)-(b.rank??99));
 }

 /* ---------- exposure screens ---------- */
 const NFHL_SFHA=/^(A|AE|AH|AO|AR|A99|V|VE)$/;
 function nfhlRank(zone,subtype){const z=String(zone||'').trim().toUpperCase(),s=String(subtype||'').toUpperCase();if(/^VE?$/.test(z))return 3;if(NFHL_SFHA.test(z))return 2;if(z==='X')return /0\.2 PCT|500|REDUCED FLOOD RISK DUE TO LEVEE/.test(s)?1:0;return null;}
 const SPC={TSTM:1,MRGL:2,SLGT:3,ENH:4,MDT:5,HIGH:6},SPC_NAMES={TSTM:'General thunderstorms',MRGL:'Marginal risk',SLGT:'Slight risk',ENH:'Enhanced risk',MDT:'Moderate risk',HIGH:'High risk'};
 function spcRank(label){if(label==null||label==='')return 0;return SPC[String(label).toUpperCase()]??null;}
 function validLadder(levels){return Array.isArray(levels)&&levels.length>=2&&levels.every(v=>finite(v)&&v!==-9999)&&levels.every((v,i)=>!i||v>levels[i-1])&&finite(levels.at(-1)-levels[0])&&levels.at(-1)>levels[0];}
 function screenFrom(spec={}){
  const kind=['ordered','continuous','binary'].includes(spec.kind)?spec.kind:null,direction=spec.direction==='lower'?'lower':'higher',values=new Map(),conflicts=new Set();
  for(const row of Array.isArray(spec.values)?spec.values:[]){const id=assetId(row?.id);if(id==null)continue;let v=row.value;if(kind==='binary'&&typeof v==='boolean')v=v?1:0;v=num(v);if(kind==='binary'&&v!=null&&v!==0&&v!==1)v=null;if(values.has(id)&&values.get(id)!==v)conflicts.add(id);values.set(id,v);}
  for(const id of conflicts)values.set(id,null);
  const threshold=kind==='binary'?1:num(spec.threshold),band=kind==='binary'?null:num(spec.band),worseStep=kind==='binary'?null:num(spec.worseStep),ladder=kind!=='binary'&&validLadder(spec.ladder)?spec.ladder.slice():null;
  const ladderOffset=spec.ladderOffset==null?0:num(spec.ladderOffset);
  return {kind,direction:kind==='binary'?'higher':direction,values,threshold,band,worseStep,ladder,ladderGiven:spec.ladder!=null,ladderOffset,label:text(spec.label)||'screen',unit:text(spec.unit)||'',source:spec.source||null,dataDate:spec.dataDate||null,conflicts:[...conflicts]};
 }
 function exposedBy(screen){const t=screen.threshold;return screen.direction==='lower'?v=>v<=t:v=>v>=t;}
 function inBand(screen){const t=screen.threshold,b=screen.band;if(screen.kind==='continuous')return v=>Math.abs(v-t)<=b;return screen.direction==='lower'?v=>v>t-b&&v<=t+b:v=>v>=t-b&&v<t+b;}
 function worse(screen){const t=screen.threshold,s=screen.worseStep;return screen.direction==='lower'?v=>v<=t+s:v=>v>=t-s;}
 function ladderAuc(screen,rows){const levels=screen.ladder,span=levels.at(-1)-levels[0],off=screen.ladderOffset;return screen.direction==='lower'?mean(rows.map(r=>clamp((levels.at(-1)-(r.value+off))/span))):mean(rows.map(r=>clamp(((r.value+off)-levels[0])/span)));}

 /* ---------- ten metrics (hazard-neutral adaptation of public-data-runtime/coastal-planning.js) ---------- */
 const METRIC_NAMES=['Population balance','Intensity shape gap (Wasserstein)','Density symmetry','Contiguity (Euler characteristic)','Boundary band (persistence gap)','Next-step sensitivity (spatial mixing)','Variational free energy','Exposure AUC','Frontier risk (buffer depth AUC)','Network leakage'];
 const PILLARS=['Statistical Interchangeability','Topological and Spatial Cohesion','Exposure Resilience'],pillarOf=n=>PILLARS[n<=3?0:n<=7?1:2];
 const NEVER_7='a calibrated probabilistic dependence model with verified operating inputs',NEVER_10='a verified directed network with capacities and timestamped operating state';
 function w1(a,b){if(!a.length||!b.length)return null;const x=a.slice().sort((a,b)=>a-b),y=b.slice().sort((a,b)=>a-b),points=[...new Set(x.concat(y))].sort((a,b)=>a-b);let i=0,j=0,total=0;for(let k=0;k<points.length-1;k++){while(i<x.length&&x[i]<=points[k])i++;while(j<y.length&&y[j]<=points[k])j++;total+=Math.abs(i/x.length-j/y.length)*(points[k+1]-points[k]);}return finite(total)?total:null;}
 function nn(rows){if(rows.length<2)return null;const value=mean(rows.map((a,i)=>Math.min(...rows.filter((_,j)=>j!==i).map(b=>distance(a,b)))));return finite(value)&&value>0?value:null;}
 function components(rows,radius){const seen=new Set();let n=0;for(let i=0;i<rows.length;i++){if(seen.has(i))continue;n++;const q=[i];seen.add(i);for(let k=0;k<q.length;k++)for(let j=0;j<rows.length;j++)if(!seen.has(j)&&distance(rows[q[k]],rows[j])<=radius){seen.add(j);q.push(j);}}return n;}
 function population(rows,areasIn,blocksIn,now){
  const method='100 x [population in the areas that contain an exposed asset / population in all in-scope areas, minus the share of distinct in-scope areas that contain an exposed asset]. Each Census block is counted once. No service, customer, outage or affected-population interpretation.';
  const fail=reason=>({value:null,reason,method});
  if(!Array.isArray(areasIn)||!Array.isArray(blocksIn))return fail('service-area or area-unit data with Census block population for these assets');
  if(!finite(now))return fail('a reference time to check Census reference years');
  const areas=new Map(),blocks=new Map(),year=new Date(now).getUTCFullYear();
  for(const a of areasIn){if(a?.id==null||areas.has(String(a.id))||!Array.isArray(a.blockIds)||a.geometryComplete===false||new Set(a.blockIds).size!==a.blockIds.length)return fail('complete area geometry with unique area and block identities');areas.set(String(a.id),a);}
  for(const b of blocksIn){if(typeof b?.id!=='string'||blocks.has(b.id)||!safe(b.population)||(!Number.isInteger(b.referenceYear)||b.referenceYear<1900||b.referenceYear>year))return fail('valid, unique Census block population records');blocks.set(b.id,b);}
  const all=new Set(),selected=new Set();for(const r of rows){const id=r.areaId==null?'':String(r.areaId);if(!id||!areas.has(id))return fail('an exact service-area match for every asset');all.add(id);if(r.exposed)selected.add(id);}
  if(!all.size)return fail('at least one service area in scope');
  const selectedBlocks=new Set(),otherBlocks=new Set(),years=new Set(),sourceIds=new Set();
  for(const id of all){const a=areas.get(id);for(const key of a.blockIds){if(!blocks.has(String(key)))return fail('every Census block the areas reference');(selected.has(id)?selectedBlocks:otherBlocks).add(String(key));}for(const id of a.sourceIds||[])sourceIds.add(id);}
  const overlap=[...selectedBlocks].filter(id=>otherBlocks.has(id));
  if(overlap.length)return {...fail('area footprints that do not share Census blocks between the exposed and other groups (no population is apportioned)'),overlappingBlockIds:overlap};
  const union=new Set([...selectedBlocks,...otherBlocks]);let total=0,selectedPopulation=0;
  for(const id of union){const b=blocks.get(id);years.add(b.referenceYear);if(!safe(total+b.population))return fail('a population sum within exact integer range');total+=b.population;for(const id of b.sourceIds||[])sourceIds.add(id);if(selectedBlocks.has(id))selectedPopulation+=b.population;}
  if(years.size!==1||!total)return fail('one common Census reference year and a positive population total');
  const populationShare=selectedPopulation/total,areaShare=selected.size/all.size;
  return {value:100*(populationShare-areaShare),reason:null,method,referenceYear:[...years][0],selectedPopulation,totalPopulation:total,selectedAreaCount:selected.size,totalAreaCount:all.size,populationShare,areaShare,sourceIds:[...sourceIds],overlappingBlockIds:[]};
 }
 function computeMetrics({assets,screen,config,areas,blocks,now}={}){
  const list=Array.isArray(assets)?assets:[],s=screen&&screen.values instanceof Map?screen:screenFrom(screen||{}),cfg=config||{};
  const radius=cfg.componentRadiusKm==null?1.5:num(cfg.componentRadiusKm),fr=cfg.frontierRadiusKm==null?[.5,5]:cfg.frontierRadiusKm,lo=Array.isArray(fr)?num(fr[0]):null,hi=Array.isArray(fr)?num(fr[1]):null;
  const ids=new Set(),duplicates=new Set();let invalid=0;
  const rows=list.map(a=>{const id=assetId(a?.id);if(id==null)invalid++;else if(ids.has(id))duplicates.add(id);else ids.add(id);return {id,lat:a?.lat,lon:a?.lon,areaId:a?.areaId??null,value:id!=null&&s.values.has(id)?s.values.get(id):null,geometryValid:xy(a||{})};});
  const identityGood=rows.length>0&&!invalid&&!duplicates.size,valued=rows.filter(r=>r.value!=null),missing=rows.length-valued.length,hasThreshold=finite(s.threshold);
  const isExposed=hasThreshold?exposedBy(s):()=>false;for(const r of valued)r.exposed=hasThreshold&&isExposed(r.value);
  const T=hasThreshold?valued.filter(r=>r.exposed):[],C=hasThreshold?valued.filter(r=>!r.exposed):[];
  const completeValues=identityGood&&!!s.kind&&missing===0,complete=completeValues&&hasThreshold,completeGeometry=identityGood&&rows.every(r=>r.geometryValid);
  const valuesGate=!rows.length?'assets in scope for this screen':!identityGood?'one unique ID for every asset ('+invalid+' missing, '+duplicates.size+' duplicated)':!s.kind?'a defined exposure screen':missing?s.label+' values for '+missing+' of '+rows.length+' assets':null;
  const gate=valuesGate||(hasThreshold?null:'a declared '+s.label+' threshold'),geomGate=completeGeometry?null:'valid coordinates for every asset ('+rows.filter(r=>!r.geometryValid).length+' missing)';
  const counts=' ('+T.length+' exposed, '+C.length+' other)',unit=s.unit?' '+s.unit:'',kindName=s.kind==='binary'?'an in-or-out (binary) screen':'an ordered-class screen';
  const metrics=[];
  function metric(n,{value=null,display='',review=false,reason=null,notApplicable=null,method,requires,unit:u=null,extra={}}){
   const status=notApplicable?'not-applicable':reason||!finite(value)?'not-available':'computed';
   metrics.push({id:n,name:METRIC_NAMES[n-1],pillar:pillarOf(n),status,value:status==='computed'?value:null,unit:u,display:status==='computed'?display:'',reason:status==='computed'?null:notApplicable||reason||'enough assets in each group'+counts,review:status==='computed'?!!review:null,method,requires,...(status==='computed'?extra:{})});
  }
  const pop=complete?population(rows,areas,blocks,now):null;
  metric(1,{value:pop?.value,display:pop&&finite(pop.value)?pop.value.toFixed(2)+' percentage points, the population share of the areas with an exposed asset minus their share of areas':'',review:pop&&finite(pop.value)&&Math.abs(pop.value)>1e-10,
   reason:!Array.isArray(areas)||!Array.isArray(blocks)?'service-area or area-unit data with Census block population for these assets':gate||pop?.reason,method:pop?.method||'Compares the population share and the area share of the service areas that contain an exposed asset.',requires:'An area unit (service area) for every asset with deduplicated Census block population',unit:'percentage points',extra:{detail:pop}});
  const w=complete&&s.kind==='continuous'?w1(T.map(r=>r.value),C.map(r=>r.value)):null;
  metric(2,{value:w,display:w==null?'':w.toFixed(3)+unit+' gap between the '+s.label+' distributions of exposed and other assets (exact empirical Wasserstein-1)',notApplicable:s.kind&&s.kind!=='continuous'?'it needs a continuous intensity; this is '+kindName:null,reason:gate||(w==null?'at least one asset in each group'+counts:null),
   method:'Exact empirical Wasserstein-1 distance between the screen values of the exposed and other groups. The split is defined by the same values, so separation is descriptive.',requires:'A continuous intensity for every asset and both groups nonempty',unit:s.unit||null});
  const a=complete&&completeGeometry?nn(T):null,b=complete&&completeGeometry?nn(C):null,sym=a&&b?1-Math.abs(1/a-1/b)/(1/a+1/b):null;
  metric(3,{value:sym,display:sym==null?'':sym.toFixed(3)+' inverse nearest-neighbor point-density symmetry (1 means equal spacing)',reason:gate||geomGate||(sym==null?'at least two distinct asset locations in each group'+counts:null),
   method:'1 - |1/a - 1/b| / (1/a + 1/b) from mean nearest-neighbor distances a and b (km) within each group. Asset spacing is not resident density, travel time or access.',requires:'Coordinates for every asset and at least two distinct locations in each group',unit:'dimensionless'});
  const comp=complete&&completeGeometry&&radius>0?components(T,radius):null;
  metric(4,{value:comp,display:comp+' group'+(comp===1?'':'s')+' of exposed assets linked within '+radius+' km',reason:gate||geomGate||(!(radius>0)?'a declared linking radius':null),
   method:'Counts weak components of the radius graph on exposed assets ('+radius+' km, an analytical scale from config, not a response boundary). Not connected infrastructure.',requires:'Coordinates for every asset and a declared linking radius',unit:'components'});
  const bandOk=s.kind==='continuous'?s.band!=null&&s.band>=0:Number.isInteger(s.band)&&s.band>=1,banded=complete&&bandOk?valued.filter(r=>inBand(s)(r.value)).length:null;
  metric(5,{value:banded,display:banded+' asset'+(banded===1?'':'s')+' within the declared boundary band ('+(s.kind==='continuous'?'plus or minus '+s.band+unit:s.band+' class'+(s.band===1?'':'es')+' each side')+')',review:banded>0,notApplicable:s.kind==='binary'?'an in-or-out (binary) screen has no boundary band':null,reason:gate||(!bandOk?'a declared boundary band for this screen':null),
   method:'Counts assets whose screen value lies within the declared band of the threshold. Classification sensitivity, not survey or forecast error.',requires:'An ordered or continuous screen with a declared band',unit:'assets'});
  const stepOk=s.worseStep!=null&&s.worseStep>0,higher=complete&&stepOk?valued.filter(r=>worse(s)(r.value)).length:null,added=higher==null?null:higher-T.length;
  metric(6,{value:added,display:added+' additional asset'+(added===1?'':'s')+' exposed one declared step worse ('+T.length+' to '+higher+')',review:added>0,notApplicable:s.kind==='binary'?'an in-or-out (binary) screen has no worse step':null,reason:gate||(!stepOk?'a declared worse step for this screen':null),
   method:'Recounts exposed assets after moving the threshold one declared step toward the worse case. Sensitivity, not a calibrated forecast-error model.',requires:'An ordered or continuous screen with a declared worse step',unit:'additional assets',extra:{ratio:higher!=null&&T.length?higher/T.length:null}});
  metric(7,{reason:NEVER_7,method:'A variational free energy needs a specified, validated probabilistic model; asset locations and screens cannot supply it.',requires:'A calibrated probabilistic dependence model with verified operating inputs',unit:null});
  const ladderOk=!!s.ladder&&s.ladderOffset!=null,auc=completeValues&&ladderOk?ladderAuc(s,valued):null;
  metric(8,{value:auc,display:auc==null?'':(100*auc).toFixed(2)+'% of the declared range ('+(s.ladder?s.ladder[0]+' to '+s.ladder.at(-1):'')+') with assets exposed, exact step integral',notApplicable:s.kind==='binary'?'an in-or-out (binary) screen has no intensity ladder':null,reason:valuesGate||(!s.ladder?'a declared ladder of at least two increasing levels':s.ladderOffset==null?'a valid offset between the screen values and the ladder':null),
   method:'Exact integral of the exposed fraction over the declared ladder range: mean of clamp(distance into the range / span, 0, 1). Not an event probability or affected population.',requires:'An ordered or continuous screen with a declared ladder',unit:'fraction of declared range'});
  const rangeOk=lo!=null&&hi!=null&&hi>lo&&lo>=0,d9=complete&&completeGeometry&&rangeOk&&T.length&&C.length?C.map(c=>Math.min(...T.map(t=>distance(c,t)))):null,frontier=d9?mean(d9.map(d=>clamp((hi-Math.max(lo,d))/(hi-lo)))):null;
  metric(9,{value:frontier,display:frontier==null?'':(100*frontier).toFixed(2)+'% nearest-exposed-distance AUC over '+lo+' to '+hi+' km',reason:gate||geomGate||(!rangeOk?'a declared buffer distance range':null)||(!T.length||!C.length?'at least one asset in each group'+counts:null),
   method:'Exact unweighted AUC of the distance from each other asset to the nearest exposed asset over the declared '+lo+' to '+hi+' km range. Geometric proximity, not spread, routing or dependence.',requires:'Coordinates for every asset, both groups nonempty and a declared buffer range',unit:'fraction of declared distance range'});
  metric(10,{reason:NEVER_10,method:'Leakage needs a verified directed network with capacities and operating state. Proximity, shared areas or slope cannot establish flow, and no network is inferred.',requires:'A verified directed network with capacities and timestamped operating state',unit:null});
  return {metrics,screenSummary:{exposed:valued.length&&hasThreshold?T.length:null,total:rows.length,missing,label:s.label,unit:s.unit,kind:s.kind,source:s.source,dataDate:s.dataDate},
   assets:rows.map(r=>({id:r.id,value:r.value,status:r.value==null||!hasThreshold?'unknown':r.exposed?'exposed':'other'})),
   settings:{componentRadiusKm:radius,frontierRadiusKm:[lo,hi],band:s.band,worseStep:s.worseStep,ladder:s.ladder}};
 }

 /* ---------- Coastal reproduction (St. Petersburg local tier) ---------- */
 const terrain=s=>finite(s.groundElevationFt)&&s.groundElevationFt!==-9999&&(s.elevationVerticalDatum||s.verticalDatum||s.datum)==='NAVD88';
 function coastalScope(stations,scope){return (Array.isArray(stations)?stations:[]).filter(s=>scope!=='city'||s?.isCityOwned===true||(s?.isCityOwned==null&&s?.owner==='City of St. Petersburg'));}
 function coastalLevelScreen({stations,context,levelMllwFt,offsetFt,ladder,scope,now}={}){
  const list=coastalScope(stations,scope),plane=finite(levelMllwFt)&&levelMllwFt!==-9999&&finite(offsetFt)&&offsetFt!==-9999?levelMllwFt-offsetFt:null;
  const screen=screenFrom({kind:'continuous',direction:'lower',values:list.map(s=>({id:s?.id,value:terrain(s||{})?s.groundElevationFt:null})),threshold:plane,band:1,worseStep:2,ladder,ladderOffset:finite(offsetFt)?offsetFt:NaN,label:'ground elevation',unit:'ft NAVD88',source:'Coastal console published register and USGS 3DEP terrain'});
  const result=computeMetrics({assets:list.map(s=>({id:s?.id,lat:s?.lat,lon:s?.lon,areaId:s?.basin})),screen,config:{componentRadiusKm:1.5,frontierRadiusKm:[.5,5]},areas:context?.areas,blocks:context?.populationBlocks,now});
  return {...result,levelFtMLLW:finite(levelMllwFt)&&levelMllwFt!==-9999?levelMllwFt:null,planeFtNAVD88:plane,scope:scope==='city'?'city':'all'};
 }
 /* Same per-sample classification as CWRPublicPlanning's forecast(). */
 function forecast(rows,stations,offset,now){
  const fail=reason=>({status:'unknown',reason,sampleCount:0,samples:[],everScreenedIds:[],alwaysScreenedIds:[],switchingIds:[]});
  if(!Array.isArray(rows)||!rows.length||rows.length>10000||!finite(now)||!finite(offset)||offset===-9999)return fail('Bounded future model samples with explicit ft/MLLW units are required');
  const byTime=new Map();
  for(const row of rows){const t=typeof row?.t==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(row.t)?Date.parse(row.t):row?.t;
   if(!finite(t)||!finite(row?.v)||row.v===-9999||row.unit!=='ft'||row.datum!=='MLLW')return fail('Invalid model value, UTC time or explicit ft/MLLW units');
   if(t<=now||t>now+48*3600000)continue;
   if(byTime.has(t)&&byTime.get(t)!==row.v)return fail('Conflicting model samples at one validity time');byTime.set(t,row.v);
  }
  const ordered=[...byTime].sort((a,b)=>a[0]-b[0]);if(!ordered.length)return fail('No remaining next 48 h forecast sample; no scenario or zero is substituted');
  const valid=stations.filter(r=>r.terrainValid),unknown=stations.length-valid.length;
  if(!valid.length)return fail('No compatible NAVD88 terrain is available');
  const sets=ordered.map(([t,v])=>new Set(valid.filter(s=>s.groundElevationFt<=v-offset).map(s=>s.id))),ever=new Set(sets.flatMap(s=>[...s])),always=[...sets[0]].filter(id=>sets.every(s=>s.has(id))),switching=[...ever].filter(id=>!always.includes(id));
  const peak=ordered.reduce((a,b)=>b[1]>a[1]?b:a),gaps=ordered.slice(1).map((r,i)=>(r[0]-ordered[i][0])/3600000);
  return {status:unknown?'unknown':'context',partial:!!unknown,terrainKnown:valid.length,terrainUnknown:unknown,sampleCount:ordered.length,start:new Date(ordered[0][0]).toISOString(),end:new Date(ordered.at(-1)[0]).toISOString(),maxGapHours:gaps.length?Math.max(...gaps):null,peak:{at:new Date(peak[0]).toISOString(),levelFtMLLW:peak[1]},samples:ordered.map(([t,v],i)=>({at:new Date(t).toISOString(),levelFtMLLW:v,planeFtNAVD88:v-offset,screenedCount:sets[i].size,terrainUnknown:unknown})),everScreenedIds:[...ever],alwaysScreenedIds:always,switchingIds:switching,method:'Independent terrain classification at each available future NOAA model sample. Gaps and sample spacing are explicit; no interpolation, flooded hours, continuous exceedance duration, outages or hydraulic routing is inferred. Caller must verify the official model source/run; valid sample times alone do not prove current issue time.'};
 }
 /* Window and peak exactly as the Coastal page's usableOFSWindow(), then forecast() on that window. */
 function ofsPeak(rows,stations,offsetFt,now){
  const list=(Array.isArray(rows)?rows:[]).map(r=>r&&typeof r.t==='string'?{...r,t:Date.parse(r.t)}:r);
  const inWindow=finite(now)?list.filter(row=>typeof row?.t==='number'&&isFinite(row.t)&&typeof row.v==='number'&&isFinite(row.v)&&row.t>now&&row.t<=now+48*3600e3).slice().sort((a,b)=>a.t-b.t):[];
  let window=null;
  if(inWindow.length){const peak=inWindow.reduce((a,b)=>b.v>a.v?b:a),start=inWindow[0].t,end=inWindow.at(-1).t;let gap=0;for(let i=1;i<inWindow.length;i++)gap=Math.max(gap,(inWindow[i].t-inWindow[i-1].t)/3600e3);window={rows:inWindow,peak,start,end,hours:end>start?(end-start)/3600e3:null,sampleCount:inWindow.length,maxGapHours:gap};}
  const ids=new Set();let identityGood=Array.isArray(stations)&&stations.length>0;
  const stationRows=(Array.isArray(stations)?stations:[]).map(s=>{const id=typeof s?.id==='string'&&s.id.trim()?s.id:null;if(!id||ids.has(id))identityGood=false;else ids.add(id);return {id,groundElevationFt:s?.groundElevationFt,terrainValid:terrain(s||{})};});
  const exposure=identityGood?forecast(window?window.rows.map(r=>({t:r.t,v:r.v,unit:r.unit??'ft',datum:r.datum??'MLLW'})):[],stationRows,offsetFt,now):{status:'unknown',reason:'Complete unique station identities required',samples:[],sampleCount:0};
  return {status:window?'ok':'unavailable',message:window?'NOAA OFS 48 h peak '+window.peak.v.toFixed(2)+' ft MLLW at '+iso(window.peak.t)+'.':'No remaining OFS forecast sample in the next 48 hours; no level is substituted.',levelFtMLLW:window?window.peak.v:null,peakAt:window?iso(window.peak.t):null,window,exposure};
 }

 /* ---------- format ---------- */
 const format={
  money(v){if(!finite(v))return 'Not listed';const a=Math.abs(v),s=v<0?'-$':'$';return a>=1e9?s+(a/1e9).toFixed(1)+'B':a>=1e6?s+(a/1e6).toFixed(1)+'M':a>=1e3?s+(a/1e3).toFixed(1)+'K':s+Math.round(a);},
  distance(km){if(!finite(km))return 'Distance not known';const mi=km/1.609344,f=v=>v<10?v.toFixed(1):Math.round(v).toLocaleString('en-US');return f(mi)+' mi ('+f(km)+' km)';},
  date(value,timeZone){const t=timeOf(value);if(!finite(t))return 'Date not listed';try{return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short',...(timeZone?{timeZone}:{})}).format(new Date(t));}catch(e){return new Date(t).toISOString().replace('T',' ').slice(0,16)+' UTC';}},
  pct(v,digits=1){return finite(v)?v.toFixed(digits)+'%':'Not listed';}};

 /* ---------- native response plan ---------- */
 const DIMENSIONS=[
  {mitigation:'Compare the population and area shares of the service areas with an exposed asset; each Census block is counted once and nothing is apportioned.',public:'Check that notices reach every named area with an exposed asset; this does not say who loses service.',operator:'Verify actual service customers with the system owner before allocating crews, pumps or supplies.'},
  {mitigation:'Compare the full intensity distributions of exposed and other assets instead of a single cutoff.',public:'Read official warnings for your exact location; the gap describes assets, not your home.',operator:'Obtain surveyed or engineered values (equipment height, design level) for assets near the threshold before protection decisions.'},
  {mitigation:'Compare how tightly exposed and other assets cluster; uneven spacing points to coverage gaps.',public:'Know two ways to reach help; asset spacing is not travel time.',operator:'Check access routes and staging coverage against official road information; spacing is not a route.'},
  {mitigation:'Count separate clusters of exposed assets at a declared radius to see how many distinct areas need attention.',public:'If several separate areas are listed, follow the guidance for your own area.',operator:'Plan inspections per cluster and confirm access to each with the responsible agency.'},
  {mitigation:'Count assets close to the screen threshold, where small changes flip the result.',public:'If you are near a boundary, prepare as if you are inside it.',operator:'Recheck assets in the band when the forecast or map updates; verify their surveyed values.'},
  {mitigation:'Recount exposure one declared step worse to see how quickly the exposed group grows.',public:'Plan for conditions one step worse than forecast.',operator:'Review which assets change classification one step worse and pre-position checks for them.'},
  {mitigation:'Needs a calibrated probabilistic model of how assets depend on each other; none is inferred.',public:'Follow official service notices; this console cannot judge dependence between systems.',operator:'Use verified cross-agency procedures and actual service reports; do not infer dependence from maps.'},
  {mitigation:'Integrate exposure across the declared intensity range so one scenario does not decide the picture.',public:'Know what changes for you at higher levels of the hazard, not only the forecast one.',operator:'Review long-term exposure across the range with official hazard maps; no automatic trigger follows.'},
  {mitigation:'Measure how close other assets sit to the exposed group within a declared buffer range.',public:'Areas next to an affected area can be cut off; plan routes that avoid it.',operator:'Review assets near the exposed group for access and warning; distance is not travel time or spread.'},
  {mitigation:'Needs a verified directed network with capacities and operating state; no network is inferred or modeled as real.',public:'Follow your utility\'s notices for service status.',operator:'Follow utility escalation channels; field verification requires the responsible operator.'}];
 const GENERAL={
  tropical:['Know your evacuation zone, where you would go and how long the trip takes.','Confirm evacuation zones, shelter openings and generator fuel with local emergency management before the storm.'],
  surge:['Storm surge is the leading cause of hurricane deaths; leave when officials order it for your zone.','Check low-lying assets against the NOAA water-level forecast and the local evacuation zones.'],
  'inland-flood':['Turn around, do not drown: never drive or walk through flood water.','Review low-lying facilities and river gauge forecasts with the local floodplain manager.'],
  severe:['Pick a shelter room on the lowest floor, away from windows, and keep a way to get warnings.','Confirm warning reception, backup power and staff shelter areas for each facility.'],
  heat:['Drink water, limit midday activity and check on people who live alone.','Confirm cooling-center hours, backup power for cooling and outreach to people at higher risk.'],
  wildfire:['Keep a go-bag ready and know two ways out; follow evacuation orders right away.','Confirm defensible space, evacuation routes and air filtration for sensitive facilities.'],
  drought:['Follow local water-use restrictions.','Review supply, demand and conservation stages with the water system.'],
  earthquake:['Drop, cover and hold on; secure heavy furniture and water heaters.','Confirm post-earthquake inspection lists for critical buildings and bridges.'],
  winter:['Keep heat, food, water and medicine for several days; never run a generator indoors.','Confirm warming-center plans, road treatment and backup heat for critical facilities.'],
  landslide:['Watch for new cracks, tilting trees or sudden changes in creek water during heavy rain.','Review slopes above roads and facilities with the local geologist or public works.'],
  tsunami:['If you feel a strong earthquake near the coast, move to high ground right away.','Confirm tsunami evacuation routes and signage with local emergency management.'],
  volcanic:['Follow USGS and local guidance on ashfall; protect your lungs and electronics.','Review ash cleanup, air filtration and transport plans with the responsible agencies.'],
  avalanche:['Check the avalanche forecast before travel in avalanche terrain.','Coordinate road closures and control work with the avalanche center and transportation agency.']};
 const REVIEW_HOURS={nwsAlerts:1,shelters:6,riverGauges:1,tideStation:1,ofsForecast:6,heatRisk:12,wildfires:3,airQuality:1,tropical:3,earthquakes:6,drought:168,outages:1,volcanoes:24};
 const nameOf=it=>text(it?.name)||text(it?.shelterName)||text(it?.shelter_name)||text(it?.facilityName)||text(it?.NAME)||null;
 const placeOf=it=>[text(it?.address),text(it?.city),text(it?.state)].filter(Boolean).join(', ');
 function fnv(str){let h=0x811c9dc5;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h.toString(16).padStart(8,'0');}
 /* NOAA flood levels are published without a datum and appear to be in station datum; subtracting the station's MLLW
    value gives an approximate MLLW level. One helper so the plan and the page cards cannot drift. */
 function floodLevelsMllw(fl){
  const m=fl&&finite(fl.mllwInStationDatum)?fl.mllwInStationDatum:null,cv=v=>m!=null&&finite(v)?Math.round((v-m)*100)/100:null;
  return {available:m!=null,mllwInStationDatum:m,nwsMinor:cv(fl?.nwsMinor),nwsModerate:cv(fl?.nwsModerate),nwsMajor:cv(fl?.nwsMajor),nosMinor:cv(fl?.nosMinor),nosModerate:cv(fl?.nosModerate),nosMajor:cv(fl?.nosMajor)};
 }
 function buildPlan({place,ranking,modules,results,metrics,track,now,timeZone}={}){
  const tz=timeZone||place?.timeZone||undefined;
  const tr=track==='operator'?'operator':'public',res=results||{},get=n=>res[n]||null,ok=n=>get(n)?.status==='ok'&&get(n).data?get(n):null,fd=v=>format.date(v,tz),dist=v=>format.distance(v);
  const after=name=>{const h=REVIEW_HOURS[name];return finite(now)&&h?iso(now+h*3600000):null;},dateOf=r=>r?.dataDate||null,srcName=r=>(r?.title||'Source')+(r?.hostedBy==='Esri'?' (Federal dataset hosted by Esri)':'')+(r?.experimental?' (Experimental)':'');
  const leading=new Set(ranking?.leading||[]),alerts=alertItems(get('nwsAlerts'),now);
  /* Phase: active NWS alerts for the leading hazards only (no Coastal storm clock, response-plans/CONTRACT.md:101). */
  const leadAll=alerts.filter(a=>alertHazards(a.event).some(c=>leading.has(c))).map(a=>({a,level:alertLevel(a.event),until:a.ends||a.expires||null}));
  const leadAlerts=leadAll.filter(x=>x.level!=='advisory'),advisories=leadAll.filter(x=>x.level==='advisory').map(x=>x.a.event);
  const top=leadAlerts.sort((x,y)=>(y.level==='warning')-(x.level==='warning')||(timeOf(y.until)||0)-(timeOf(x.until)||0))[0];
  const others=alerts.filter(a=>!leadAll.some(x=>x.a===a)).map(a=>a.event);
  const advLine=advisories.length?' Active advisories or statements for leading hazards (these do not set the Watch or Warning phase): '+[...new Set(advisories)].join(', ')+'.':'';
  const otherLine=others.length?' Other active alerts (not leading hazards here): '+[...new Set(others)].join(', ')+'.':'';
  const alertsOk=get('nwsAlerts')?.status==='ok'||get('nwsAlerts')?.status==='empty';
  const rankOk=ranking&&ranking.status==='ok';
  const phase=!rankOk?{id:'unknown',label:'Phase not set: hazard ranking unavailable',basis:(ranking?'FEMA NRI did not answer for this county':'The FEMA NRI hazard ranking has not loaded yet')+', so the leading hazards, and with them the phase, cannot be set here.'+(alertsOk?(alerts.length?' Active NWS alerts at this point: '+[...new Set(alerts.map(a=>a.event))].join(', ')+'.':' NWS lists no active alert at this point.'):get('nwsAlerts')?' NWS alerts did not answer; check weather.gov directly.':' NWS alerts are still loading.'),until:null,alertId:null}
   :top?{id:top.level,label:top.level==='warning'?'Warning':'Watch',basis:'NWS '+top.a.event+(top.a.senderName?' from '+top.a.senderName:'')+(top.until?', in effect until '+fd(top.until):'')+'. It maps to '+alertHazards(top.a.event).filter(c=>leading.has(c)).map(c=>HAZARD.get(c).name).join(', ')+', a leading hazard here.'+advLine+otherLine,until:top.until?iso(timeOf(top.until)):null,alertId:top.a.id||null}
   :!alertsOk?(get('nwsAlerts')?{id:'unknown',label:'Phase not set: NWS alerts unavailable',basis:'NWS alerts did not answer, so the phase cannot be known: a watch or warning may be in effect. Check weather.gov directly.',until:null,alertId:null}
    :{id:'unknown',label:'Phase not set: NWS alerts loading',basis:'NWS alerts are still loading, so the phase cannot be known yet.',until:null,alertId:null})
   :{id:'prepare',label:'Prepare',basis:'No active NWS watch or warning for the leading hazards at this point.'+advLine+otherLine,until:null,alertId:null};
  /* Dimensions */
  const mlist=Array.isArray(metrics?.metrics)?metrics.metrics:[],summary=metrics?.screenSummary||null;
  const screenLine=summary&&finite(summary.exposed)?' ('+summary.exposed+' of '+summary.total+' assets exposed by the '+summary.label+' screen'+(typeof summary.source==='string'?', '+summary.source:'')+')':'';
  const dimensions=DIMENSIONS.map((d,i)=>{const n=i+1,m=mlist.find(x=>x.id===n),status=m?m.status:'not-available';
   const condition=!m?'Not available here: '+(n===7?NEVER_7:n===10?NEVER_10:'no exposure screen has been run for this place')+'.':status==='computed'?'Computed here: '+m.display+screenLine+'.'+(m.review?' Flagged for review.':''):(status==='not-applicable'?'Not applicable here: ':'Not available here: ')+m.reason+'.';
   return {id:n,name:METRIC_NAMES[i],pillar:pillarOf(n),status,condition,inputs:m?.requires||'',mitigation:d.mitigation,nextSteps:d[tr]};});
  /* Actions: real records first, then labeled general guidance */
  const mods=(Array.isArray(modules)?modules:moduleStatus({ranking,place,results:res})).filter(m=>m.status==='leading'),actions=[],used=new Set();
  const add=(module,key,o)=>{const r=res[key]&&typeof res[key]==='object'?res[key]:null,general=o.source==='General guidance';actions.push({id:module+'-'+key+'-'+actions.length,track:tr,module,text:o.text,basis:o.basis||null,source:o.source||null,dataDate:o.dataDate||null,dataDateText:general?null:o.dataDate?null:r?.dataDateText||'Data date not published by this source',checkedAt:general?null:r?.fetchedAt||null,escalateTo:o.escalateTo||null,reviewAfter:o.reviewAfter||null});};
  const pub=tr==='public',confirm=' Confirm before you go.';
  for(const m of mods){const def=MODULE.get(m.id);if(!def)continue;
   for(const a of alerts.filter(a=>alertHazards(a.event).some(c=>def.hazards.includes(c)))){const until=a.ends||a.expires||null;
    add(m.id,'nwsAlerts',{text:'NWS '+a.event+' in effect'+(until?' until '+fd(until):'')+'. '+(pub?'Follow the instructions in the alert.':'Review the alert text and coordinate with '+(a.senderName||'the NWS forecast office')+'.'),basis:a.headline||a.event,source:'National Weather Service alerts (api.weather.gov)',dataDate:a.sent||a.effective||null,escalateTo:pub?'Local emergency management; call 911 in an emergency':a.senderName||'NWS forecast office',reviewAfter:until?iso(timeOf(until)):after('nwsAlerts')});}
   const r=get,live=[];
   /* Only a storm within 1,500 km is named as an action; a storm on the far side of the world is not one. */
   if(m.id==='tropical'&&ok('tropical')?.data.storms?.length){const s=r('tropical').data.storms[0];if(finite(s.distanceKm)&&s.distanceKm<=1500)live.push(['tropical',(s.name||'A tropical cyclone')+(finite(s.intensity)?' ('+s.intensity+' kt)':'')+' is '+dist(s.distanceKm)+' away (advisory '+fd(s.advisoryTime)+'). Follow NHC advisories.',s.advisoryTime]);}
   if(m.id==='surge'&&ok('tideStation')?.data.station){const d=r('tideStation').data,st=d.station,fl=d.floodLevels||{};live.push(['tideStation','NOAA tide station '+st.name+' ('+st.id+'), '+dist(st.distanceKm)+' away'+(d.latest&&finite(d.latest.v)?': '+d.latest.v.toFixed(2)+' ft MLLW at '+fd(d.latest.t):'')+(finite(floodLevelsMllw(fl).nwsMinor)?'. NWS minor flood level about '+floodLevelsMllw(fl).nwsMinor.toFixed(2)+' ft MLLW (converted from station datum; NOAA does not name the datum of its flood levels)':'')+'.',d.latest?.t]);}
   if(m.id==='surge'&&ok('ofsForecast')&&res.ofsPeak?.levelFtMLLW!=null)live.push(['ofsForecast','NOAA OFS forecast peak '+res.ofsPeak.levelFtMLLW.toFixed(2)+' ft MLLW at '+fd(res.ofsPeak.peakAt)+' (model guidance, not an observation).',res.ofsPeak.peakAt]);
   if(m.id==='inland-flood'&&ok('riverGauges')?.data.items?.length){const g=r('riverGauges').data.items[0];live.push(['riverGauges','River gauge '+(g.name||g.lid)+' ('+g.lid+'), '+dist(g.distanceKm)+' away'+(finite(g.observedFt)?': '+g.observedFt+' ft at '+fd(g.observedTime):'')+(g.category?', flood category '+String(g.category).replace(/_/g,' '):'')+(finite(g.minor)?'; minor flood stage '+g.minor+' ft':'')+'.',g.observedTime]);}
   if(m.id==='severe'&&res.spcCategory&&ok('spcOutlook')){const c=res.spcCategory;live.push(['spcOutlook',c.label?'SPC Day 1 outlook: '+(SPC_NAMES[c.label]||c.label)+' ('+c.label+', level '+c.rank+' of 6) at this point, valid until '+fd(r('spcOutlook').data.expires)+'.':'SPC Day 1 outlook: no severe thunderstorm category at this point.',r('spcOutlook').data.issued]);}
   if(m.id==='heat'&&ok('heatRisk')?.data.days?.length){const days=r('heatRisk').data.days.filter(d=>finite(d.levels?.[0]));if(days.length){const p=days.reduce((a,b)=>b.levels[0]>a.levels[0]?b:a);live.push(['heatRisk','NWS HeatRisk (Experimental) peaks at level '+p.levels[0]+' of 4 on '+fd(p.validTime)+' at this point.',p.validTime]);}}
   if((m.id==='wildfire')&&ok('wildfires')?.data.incidents?.length){const f=r('wildfires').data.incidents[0];live.push(['wildfires',(f.name||'A wildfire')+(finite(f.acres)?', '+Math.round(f.acres).toLocaleString('en-US')+' acres':'')+(finite(f.containment)?', '+f.containment+'% contained':'')+', is '+dist(f.distanceKm)+' away (updated '+fd(f.modified)+').',f.modified]);}
   if((m.id==='wildfire'||m.id==='heat')&&ok('airQuality')?.data.items?.length&&!used.has('airQuality')){used.add('airQuality');const q=r('airQuality').data,w=q.items.reduce((a,b)=>(b.aqi??-1)>(a.aqi??-1)?b:a);live.push(['airQuality','AirNow '+q.area+': '+w.parameter+' AQI '+w.aqi+' ('+w.category+') for '+w.validDate+'.',null]);}
   if(m.id==='drought'&&ok('drought')){const d=r('drought').data;live.push(['drought','U.S. Drought Monitor map of '+d.mapDate+': '+format.pct(d.d1,0)+' of the county in moderate drought or worse (D1+), '+format.pct(d.d3,0)+' in extreme drought or worse (D3+).',d.mapDate]);}
   if(m.id==='earthquake'&&ok('earthquakes')?.data.items?.length){const q=r('earthquakes').data,e=q.items[0];live.push(['earthquakes',(q.count??q.items.length)+' earthquakes of magnitude 2.5 or more within 250 km in the last 30 days; latest M'+e.mag+' '+e.place+' on '+fd(e.time)+'.',e.time]);}
   if(m.id==='earthquake'&&!pub&&ok('seismicDesign')){const s=r('seismicDesign').data;live.push(['seismicDesign','ASCE 7-22 seismic design category '+s.sdc+' at this point (Ss '+s.ss+', S1 '+s.s1+').',null]);}
   if(m.id==='volcanic'&&ok('volcanoes')?.data.items?.length){const v=r('volcanoes').data.items;live.push(['volcanoes','USGS lists '+v.length+' volcano'+(v.length===1?'':'es')+' at an elevated alert level: '+v.map(x=>nameOf(x)||'unnamed').join(', ')+'.',null]);}
   for(const [name,line,date] of live)add(m.id,name,{text:line,basis:srcName(r(name))+' result for this place',source:srcName(r(name)),dataDate:date||dateOf(r(name)),escalateTo:pub?null:'Responsible agency for this source',reviewAfter:name==='spcOutlook'?r(name).data.expires||null:after(name)});
   /* Lifelines this module strains, each listed once under the first leading module that strains it. */
   for(const life of def.strains){if(used.has('life:'+life))continue;
    if(life==='shelter'&&(ok('shelters')||get('shelters')?.status==='empty')){used.add('life:shelter');const first=ok('shelters')?.data.items?.[0],s=first&&finite(first.distanceKm)&&first.distanceKm<=160?first:null;
     add(m.id,'shelters',{text:s?'Nearest open shelter listed: '+(nameOf(s)||'unnamed shelter')+(placeOf(s)?', '+placeOf(s):'')+', '+dist(s.distanceKm)+' away.'+confirm:'FEMA National Shelter System: no open shelter listed within 100 miles (None listed in this source). Shelters can open when needed; check local emergency management.',source:srcName(get('shelters')),dataDate:dateOf(get('shelters')),escalateTo:pub?'Local emergency management':null,reviewAfter:after('shelters'),basis:'Open shelters only; capacity is often blank.'});}
    /* Department of Defense hospitals serve military beneficiaries, so the public track leaves them out and the operator track labels them. */
    const dod=x=>/department of defense/i.test(String(x?.type||''));
    if(life==='health'){const h=ok('hospitalsCMS')||ok('hospitalsUSGS'),pool=(h?.data.items||[]).filter(x=>!pub||!dod(x));if(pool.length){used.add('life:health');const list=pool.slice(0,pub?1:3);
     add(m.id,h===get('hospitalsCMS')?'hospitalsCMS':'hospitalsUSGS',{text:(pub?'Nearest hospital listed: ':'Hospitals listed nearest first: ')+list.map(x=>(nameOf(x)||'unnamed hospital')+(dod(x)?' (Department of Defense hospital, military beneficiaries)':'')+', '+dist(x.distanceKm)+' away'+(x.emergencyServices!=null||x.emergency!=null?', emergency services: '+((x.emergencyServices??x.emergency)===true||/^y/i.test(String(x.emergencyServices??x.emergency))?'yes':'no'):'')).join('; ')+'.'+(pub?confirm+' Call 911 in an emergency.':' A listing is not live capacity; confirm status with each hospital.'),source:srcName(h),dataDate:dateOf(h),escalateTo:pub?'911 in an emergency':'Hospital emergency management contacts',basis:'Facility records, not operating condition.'});}}
    if(life==='power'&&ok('outages')?.data.reporting&&r('outages').data.items?.length){used.add('life:power');const o=r('outages').data.items,total=o.reduce((s,x)=>s+(finite(x.metersAffected)?x.metersAffected:0),0);
     add(m.id,'outages',{text:'ORNL ODIN reports '+total.toLocaleString('en-US')+' customer meters out in the county ('+[...new Set(o.map(x=>x.utility).filter(Boolean))].join(', ')+').',source:srcName(r('outages')),dataDate:o[0].updated||dateOf(r('outages')),escalateTo:pub?'Your electric utility':'Utility emergency liaison',reviewAfter:after('outages'),basis:'Utility-reported outages; only reporting utilities are included.'});}
    if(life==='water'&&!pub&&ok('waterSystems')?.data.items?.length){used.add('life:water');const w=r('waterSystems').data.items,big=w.slice().sort((a,b)=>(b.populationServed||0)-(a.populationServed||0))[0];
     add(m.id,'waterSystems',{text:w.length+' active community water system'+(w.length===1?'':'s')+' listed for the county; largest: '+big.name+' ('+(big.populationServed||0).toLocaleString('en-US')+' people served). Confirm operating status with each system.',source:srcName(r('waterSystems')),dataDate:dateOf(r('waterSystems')),escalateTo:'Water system operators',basis:'EPA SDWIS inventory; not operating condition.'});}
    if(life==='transport'&&!pub&&ok('bridges')?.data.total){used.add('life:transport');const b=r('bridges').data;
     add(m.id,'bridges',{text:b.poor+' of '+b.total+' bridges nearby have a poor structural rating (a condition rating, not a closure).',source:srcName(r('bridges')),dataDate:dateOf(r('bridges')),escalateTo:'State transportation agency',basis:'National Bridge Inventory records.'});}
   }
   const g=GENERAL[m.id];if(g)add(m.id,'general',{text:'General guidance: '+g[pub?0:1],basis:'General preparedness guidance, not specific to this place.',source:'General guidance',dataDate:null});
  }
  /* Limitations */
  const limitations=['FEMA NRI expected annual loss is a long-term average, not a forecast of the next event.','Asset records are inventories, not live operating condition: the plan cannot know whether a facility, plant, hospital, bridge or road is open or working right now.','No keyless national source covers communications networks, substations, live road closures or hospital capacity.','The phase follows active NWS alerts for the leading hazards only; it does not use the Coastal storm clock and does not predict an event.','Metrics 7 and 10 need '+NEVER_7+' and '+NEVER_10+'; neither is available or inferred.'];
  if(ranking?.noRatings)limitations.push(ranking.noRatingsNote);
  if(ranking&&ranking.status!=='ok')limitations.push('FEMA NRI county figures are not available, so hazards are not ranked here and no other place is substituted.');
  for(const [name,r] of Object.entries(res)){if(!r||typeof r!=='object'||!r.status)continue;if(r.status==='unavailable')limitations.push(srcName(r)+' was unavailable: '+(r.message||'no data')+' The plan does not use it.');else if(r.status==='not-covered')limitations.push(srcName(r)+' does not cover this place: '+(r.message||r.coverage||'')+'');}
  /* Revision: evidence only (fetch times excluded so a polling update with the same evidence keeps the key). */
  const evidence={place:place?[place.county?.fips,place.tract?.geoid,finite(place.lat)?place.lat.toFixed(4):null,finite(place.lon)?place.lon.toFixed(4):null]:null,track:tr,ranking:ranking?[ranking.status,ranking.version,ranking.dataDate,ranking.leading]:null,phase:[phase.id,phase.until,phase.alertId],alerts:alerts.map(a=>[a.id,a.event,a.sent,a.ends,a.expires]),
   metrics:mlist.map(m=>[m.id,m.status,m.value,m.reason]),screen:summary,results:Object.keys(res).sort().map(k=>{const r=res[k];return [k,r?.status,r?.dataDate,fnv(JSON.stringify(r&&'data' in r?r.data:r)??'')];})};
  return {phase,dimensions,actions,limitations,revision:'rev-'+fnv(JSON.stringify(evidence))};
 }

 root.CREngine={HAZARDS,MODULES,LIFELINES,PILLARS,METRIC_NAMES,alertHazards,rankHazards,moduleStatus,sourceCoverage,screenFrom,nfhlRank,spcRank,computeMetrics,coastalScope,coastalLevelScreen,ofsPeak,buildPlan,floodLevelsMllw,format,distanceKm,nearest};
})(typeof window!=='undefined'?window:globalThis);
