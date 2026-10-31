// Community Resilience engine regressions: pure node, no browser, network or generated HTML.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const sandbox={window:{}};vm.createContext(sandbox);
vm.runInContext(await read('../public-data-runtime/coastal-planning.js'),sandbox);
vm.runInContext(await read('../public-data-runtime/community-resilience-engine.js'),sandbox);
const E=sandbox.window.CREngine,{analyze}=sandbox.window.CWRPublicPlanning,plain=v=>JSON.parse(JSON.stringify(v));
let passed=0;function check(name,test){test();console.log('PASS Community Resilience engine: '+name);passed++;}
/* NRI attribute fixtures copied from the FEMA NRI county and tract layers (version December 2025), probed 2026-10-30. */
const NRI={
 anchorage:{"STCOFIPS":"02020","COUNTY":"Anchorage","STATE":"Alaska","STATEABBRV":"AK","NRI_VER":"December 2025","POPULATION":290985,"BUILDVALUE":72282405145,"RISK_SCORE":97.39185750636132,"RISK_RATNG":"Relatively High","EAL_VALT":366826354.0620838,"SOVI_RATNG":"Very Low","RESL_RATNG":"Relatively Low","AVLN_EALT":6782820.48,"AVLN_RISKS":97.08,"AVLN_RISKR":"Very High","CFLD_EALT":4485.97,"CFLD_RISKS":28.0,"CFLD_RISKR":"Very Low","CWAV_EALT":492258.63,"CWAV_RISKS":27.89,"CWAV_RISKR":"Relatively Low","DRGT_EALT":0,"DRGT_RISKS":0,"DRGT_RISKR":"No Rating","ERQK_EALT":352621404.04,"ERQK_RISKS":99.49,"ERQK_RISKR":"Relatively High","HAIL_EALT":27044.48,"HAIL_RISKS":7.19,"HAIL_RISKR":"Very Low","HWAV_EALT":null,"HWAV_RISKS":null,"HWAV_RISKR":"Insufficient Data","HRCN_EALT":null,"HRCN_RISKS":null,"HRCN_RISKR":"Not Applicable","ISTM_EALT":26903.21,"ISTM_RISKS":22.53,"ISTM_RISKR":"Very Low","LNDS_EALT":1564275.74,"LNDS_RISKS":98.85,"LNDS_RISKR":"Relatively High","LTNG_EALT":201152.54,"LTNG_RISKS":38.61,"LTNG_RISKR":"Relatively Low","IFLD_EALT":396.9,"IFLD_RISKS":0.19,"IFLD_RISKR":"Very Low","SWND_EALT":0,"SWND_RISKS":0,"SWND_RISKR":"No Rating","TRND_EALT":0.83,"TRND_RISKS":0.45,"TRND_RISKR":"Very Low","TSUN_EALT":2471646.32,"TSUN_RISKS":53.85,"TSUN_RISKR":"Relatively Low","VLCN_EALT":6992.58,"VLCN_RISKS":87.3,"VLCN_RISKR":"Relatively Low","WFIR_EALT":471183.54,"WFIR_RISKS":78.63,"WFIR_RISKR":"Relatively Low","WNTW_EALT":2155788.78,"WNTW_RISKS":98.76,"WNTW_RISKR":"Very High"},
 pima:{"STCOFIPS":"04019","COUNTY":"Pima","STATE":"Arizona","STATEABBRV":"AZ","NRI_VER":"December 2025","POPULATION":1042716,"BUILDVALUE":177785184675,"RISK_SCORE":99.10941475826972,"RISK_RATNG":"Relatively High","EAL_VALT":531351353.74333125,"SOVI_RATNG":"Relatively Moderate","RESL_RATNG":"Relatively Low","AVLN_EALT":358.42,"AVLN_RISKS":46.35,"AVLN_RISKR":"Very Low","CFLD_EALT":null,"CFLD_RISKS":null,"CFLD_RISKR":"Not Applicable","CWAV_EALT":149.85,"CWAV_RISKS":3.05,"CWAV_RISKR":"Very Low","DRGT_EALT":458565.83,"DRGT_RISKS":69.62,"DRGT_RISKR":"Relatively Moderate","ERQK_EALT":6323740.06,"ERQK_RISKS":91.73,"ERQK_RISKR":"Relatively Moderate","HAIL_EALT":1809897.1,"HAIL_RISKS":91.76,"HAIL_RISKR":"Relatively Moderate","HWAV_EALT":133121243.76,"HWAV_RISKS":99.78,"HWAV_RISKR":"Very High","HRCN_EALT":4770.32,"HRCN_RISKS":18.69,"HRCN_RISKR":"Very Low","ISTM_EALT":null,"ISTM_RISKS":null,"ISTM_RISKR":"Not Applicable","LNDS_EALT":2234.78,"LNDS_RISKS":58.65,"LNDS_RISKR":"Very Low","LTNG_EALT":2509834.61,"LTNG_RISKS":97.71,"LTNG_RISKR":"Very High","IFLD_EALT":347357075.99,"IFLD_RISKS":99.52,"IFLD_RISKR":"Very High","SWND_EALT":1313432.4,"SWND_RISKS":82.57,"SWND_RISKR":"Relatively Moderate","TRND_EALT":688345.9,"TRND_RISKS":37.5,"TRND_RISKR":"Relatively Low","TSUN_EALT":null,"TSUN_RISKS":null,"TSUN_RISKR":"Not Applicable","VLCN_EALT":null,"VLCN_RISKS":null,"VLCN_RISKR":"Not Applicable","WFIR_EALT":37561738.91,"WFIR_RISKS":99.65,"WFIR_RISKR":"Relatively High","WNTW_EALT":199965.8,"WNTW_RISKS":80.9,"WNTW_RISKR":"Relatively Moderate"},
 pinellas:{"STCOFIPS":"12103","COUNTY":"Pinellas","STATE":"Florida","STATEABBRV":"FL","NRI_VER":"December 2025","POPULATION":958822,"BUILDVALUE":163105567505,"RISK_SCORE":98.21882951653944,"RISK_RATNG":"Relatively High","EAL_VALT":303434178.67542726,"SOVI_RATNG":"Relatively Moderate","RESL_RATNG":"Very Low","AVLN_EALT":null,"AVLN_RISKS":null,"AVLN_RISKR":"Not Applicable","CFLD_EALT":24634188.96,"CFLD_RISKS":99.2,"CFLD_RISKR":"Very High","CWAV_EALT":26094586.9,"CWAV_RISKS":98.82,"CWAV_RISKR":"Very High","DRGT_EALT":3851.22,"DRGT_RISKS":20.64,"DRGT_RISKR":"Very Low","ERQK_EALT":560071.34,"ERQK_RISKS":66.92,"ERQK_RISKR":"Relatively Low","HAIL_EALT":2222809.59,"HAIL_RISKS":94.31,"HAIL_RISKR":"Relatively High","HWAV_EALT":5561233.75,"HWAV_RISKS":95.54,"HWAV_RISKR":"Relatively Moderate","HRCN_EALT":110079976.67,"HRCN_RISKS":98.87,"HRCN_RISKR":"Very High","ISTM_EALT":null,"ISTM_RISKS":null,"ISTM_RISKR":"Not Applicable","LNDS_EALT":72.75,"LNDS_RISKS":17.62,"LNDS_RISKR":"Very Low","LTNG_EALT":8897516.66,"LTNG_RISKS":99.84,"LTNG_RISKR":"Very High","IFLD_EALT":90829435.22,"IFLD_RISKS":96.85,"IFLD_RISKR":"Relatively High","SWND_EALT":705714.15,"SWND_RISKS":65.62,"SWND_RISKR":"Relatively Moderate","TRND_EALT":33467775.91,"TRND_RISKS":99.05,"TRND_RISKR":"Very High","TSUN_EALT":null,"TSUN_RISKS":null,"TSUN_RISKR":"Insufficient Data","VLCN_EALT":null,"VLCN_RISKS":null,"VLCN_RISKR":"Not Applicable","WFIR_EALT":376945.54,"WFIR_RISKS":81.14,"WFIR_RISKR":"Relatively Low","WNTW_EALT":0,"WNTW_RISKS":0,"WNTW_RISKR":"No Rating"},
 garfield:{"STCOFIPS":"30033","COUNTY":"Garfield","STATE":"Montana","STATEABBRV":"MT","NRI_VER":"December 2025","POPULATION":1171,"BUILDVALUE":1004707754,"RISK_SCORE":2.480916030534351,"RISK_RATNG":"Very Low","EAL_VALT":2645636.594449855,"SOVI_RATNG":"Relatively Low","RESL_RATNG":"Relatively High","AVLN_EALT":0.14,"AVLN_RISKS":1.32,"AVLN_RISKR":"Very Low","CFLD_EALT":null,"CFLD_RISKS":null,"CFLD_RISKR":"Not Applicable","CWAV_EALT":885513.8,"CWAV_RISKS":44.15,"CWAV_RISKR":"Relatively Low","DRGT_EALT":6992.17,"DRGT_RISKS":21.69,"DRGT_RISKR":"Very Low","ERQK_EALT":7143.64,"ERQK_RISKS":6.42,"ERQK_RISKR":"Very Low","HAIL_EALT":96307.04,"HAIL_RISKS":22.93,"HAIL_RISKR":"Very Low","HWAV_EALT":22654.6,"HWAV_RISKS":10.6,"HWAV_RISKR":"Very Low","HRCN_EALT":null,"HRCN_RISKS":null,"HRCN_RISKR":"Not Applicable","ISTM_EALT":985.4,"ISTM_RISKS":2.17,"ISTM_RISKR":"Very Low","LNDS_EALT":687.28,"LNDS_RISKS":38.74,"LNDS_RISKR":"Very Low","LTNG_EALT":158004.13,"LTNG_RISKS":35.78,"LTNG_RISKR":"Relatively Low","IFLD_EALT":875739.45,"IFLD_RISKS":5.38,"IFLD_RISKR":"Very Low","SWND_EALT":157578.43,"SWND_RISKS":16.03,"SWND_RISKR":"Very Low","TRND_EALT":15794.88,"TRND_RISKS":4.23,"TRND_RISKR":"Very Low","TSUN_EALT":null,"TSUN_RISKS":null,"TSUN_RISKR":"Not Applicable","VLCN_EALT":null,"VLCN_RISKS":null,"VLCN_RISKR":"Not Applicable","WFIR_EALT":398226.52,"WFIR_RISKS":78.34,"WFIR_RISKR":"Relatively Low","WNTW_EALT":20009.11,"WNTW_RISKS":19.89,"WNTW_RISKR":"Very Low"},
 cleveland:{"STCOFIPS":"40027","COUNTY":"Cleveland","STATE":"Oklahoma","STATEABBRV":"OK","NRI_VER":"December 2025","POPULATION":295221,"BUILDVALUE":46683231625,"RISK_SCORE":91.2849872773537,"RISK_RATNG":"Relatively Moderate","EAL_VALT":111904684.98126237,"SOVI_RATNG":"Relatively Low","RESL_RATNG":"Relatively Moderate","AVLN_EALT":null,"AVLN_RISKS":null,"AVLN_RISKR":"Not Applicable","CFLD_EALT":null,"CFLD_RISKS":null,"CFLD_RISKR":"Not Applicable","CWAV_EALT":19938966.54,"CWAV_RISKS":97.58,"CWAV_RISKR":"Relatively High","DRGT_EALT":768425.83,"DRGT_RISKS":74.9,"DRGT_RISKR":"Relatively Moderate","ERQK_EALT":3442955.33,"ERQK_RISKS":86.26,"ERQK_RISKR":"Relatively Low","HAIL_EALT":10772490.42,"HAIL_RISKS":98.82,"HAIL_RISKR":"Relatively High","HWAV_EALT":11532061.71,"HWAV_RISKS":97.3,"HWAV_RISKR":"Relatively High","HRCN_EALT":26279.67,"HRCN_RISKS":36.67,"HRCN_RISKR":"Very Low","ISTM_EALT":6128699.4,"ISTM_RISKS":99.63,"ISTM_RISKR":"Very High","LNDS_EALT":2588.04,"LNDS_RISKS":57.95,"LNDS_RISKR":"Very Low","LTNG_EALT":642467.52,"LTNG_RISKS":74.43,"LTNG_RISKR":"Relatively Moderate","IFLD_EALT":35839238.54,"IFLD_RISKS":88.17,"IFLD_RISKR":"Relatively Moderate","SWND_EALT":3902813.03,"SWND_RISKS":96.28,"SWND_RISKR":"Relatively High","TRND_EALT":17312129.33,"TRND_RISKS":96.31,"TRND_RISKR":"Relatively High","TSUN_EALT":null,"TSUN_RISKS":null,"TSUN_RISKR":"Not Applicable","VLCN_EALT":null,"VLCN_RISKS":null,"VLCN_RISKR":"Not Applicable","WFIR_EALT":759205.41,"WFIR_RISKS":84.96,"WFIR_RISKR":"Relatively Low","WNTW_EALT":836364.21,"WNTW_RISKS":95.58,"WNTW_RISKR":"Relatively High"},
 sanJuan:{"STCOFIPS":"72127","COUNTY":"San Juan","STATE":"Puerto Rico","STATEABBRV":"PR","NRI_VER":"December 2025","POPULATION":341981,"BUILDVALUE":74294584455,"RISK_SCORE":null,"RISK_RATNG":"Insufficient Data","EAL_VALT":434520246.2896882,"SOVI_RATNG":"Data Unavailable","RESL_RATNG":"Data Unavailable","AVLN_EALT":null,"AVLN_RISKS":null,"AVLN_RISKR":"Not Applicable","CFLD_EALT":913312.83,"CFLD_RISKS":null,"CFLD_RISKR":"Insufficient Data","CWAV_EALT":0,"CWAV_RISKS":null,"CWAV_RISKR":"Insufficient Data","DRGT_EALT":0,"DRGT_RISKS":null,"DRGT_RISKR":"Insufficient Data","ERQK_EALT":132083867.66,"ERQK_RISKS":null,"ERQK_RISKR":"Insufficient Data","HAIL_EALT":5702.57,"HAIL_RISKS":null,"HAIL_RISKR":"Insufficient Data","HWAV_EALT":0,"HWAV_RISKS":null,"HWAV_RISKR":"Insufficient Data","HRCN_EALT":193328387.35,"HRCN_RISKS":null,"HRCN_RISKR":"Insufficient Data","ISTM_EALT":null,"ISTM_RISKS":null,"ISTM_RISKR":"Not Applicable","LNDS_EALT":4948962.54,"LNDS_RISKS":null,"LNDS_RISKR":"Insufficient Data","LTNG_EALT":3382879.05,"LTNG_RISKS":null,"LTNG_RISKR":"Insufficient Data","IFLD_EALT":34209264.22,"IFLD_RISKS":null,"IFLD_RISKR":"Insufficient Data","SWND_EALT":10902.13,"SWND_RISKS":null,"SWND_RISKR":"Insufficient Data","TRND_EALT":274333.32,"TRND_RISKS":null,"TRND_RISKR":"Insufficient Data","TSUN_EALT":65354421.27,"TSUN_RISKS":null,"TSUN_RISKR":"Insufficient Data","VLCN_EALT":8213.36,"VLCN_RISKS":null,"VLCN_RISKR":"Insufficient Data","WFIR_EALT":null,"WFIR_RISKS":null,"WFIR_RISKR":"Insufficient Data","WNTW_EALT":0,"WNTW_RISKS":null,"WNTW_RISKR":"Insufficient Data"},
 pinellasTract:{"STCOFIPS":"12103","TRACTFIPS":"12103021900","COUNTY":"Pinellas","STATE":"Florida","STATEABBRV":"FL","NRI_VER":"December 2025","POPULATION":3304,"BUILDVALUE":646883546,"RISK_SCORE":36.81638186293746,"RISK_RATNG":"Relatively Low","EAL_VALT":848997.8375037179,"SOVI_RATNG":"Relatively High","RESL_RATNG":"Very Low","AVLN_EALT":null,"AVLN_RISKS":null,"AVLN_RISKR":"Not Applicable","CFLD_EALT":0,"CFLD_RISKS":0,"CFLD_RISKR":"No Rating","CWAV_EALT":90796.26,"CWAV_RISKS":70.57,"CWAV_RISKR":"Relatively Moderate","DRGT_EALT":0,"DRGT_RISKS":0,"DRGT_RISKR":"No Rating","ERQK_EALT":1754.92,"ERQK_RISKS":10.46,"ERQK_RISKR":"Very Low","HAIL_EALT":8471.03,"HAIL_RISKS":57.59,"HAIL_RISKR":"Relatively Low","HWAV_EALT":19415.44,"HWAV_RISKS":34.93,"HWAV_RISKR":"Relatively Low","HRCN_EALT":417853.18,"HRCN_RISKS":90.6,"HRCN_RISKR":"Relatively High","ISTM_EALT":null,"ISTM_RISKS":null,"ISTM_RISKR":"Not Applicable","LNDS_EALT":0,"LNDS_RISKS":0,"LNDS_RISKR":"No Rating","LTNG_EALT":31603.68,"LTNG_RISKS":87.35,"LTNG_RISKR":"Relatively High","IFLD_EALT":159576.07,"IFLD_RISKS":8.83,"IFLD_RISKR":"Very Low","SWND_EALT":2535.64,"SWND_RISKS":17.63,"SWND_RISKR":"Very Low","TRND_EALT":116966.63,"TRND_RISKS":66.96,"TRND_RISKR":"Relatively Moderate","TSUN_EALT":null,"TSUN_RISKS":null,"TSUN_RISKR":"Insufficient Data","VLCN_EALT":null,"VLCN_RISKS":null,"VLCN_RISKR":"Not Applicable","WFIR_EALT":24.97,"WFIR_RISKS":28.52,"WFIR_RISKR":"Very Low","WNTW_EALT":0,"WNTW_RISKS":0,"WNTW_RISKR":"No Rating"},
 garfieldTract:{"STCOFIPS":"30033","TRACTFIPS":"30033000100","COUNTY":"Garfield","STATE":"Montana","STATEABBRV":"MT","NRI_VER":"December 2025","POPULATION":1171,"BUILDVALUE":1004707754,"RISK_SCORE":82.72151070838238,"RISK_RATNG":"Relatively Moderate","EAL_VALT":2645636.594449854,"SOVI_RATNG":"Relatively Moderate","RESL_RATNG":"Relatively Moderate","AVLN_EALT":0.14,"AVLN_RISKS":0.35,"AVLN_RISKR":"Very Low","CFLD_EALT":null,"CFLD_RISKS":null,"CFLD_RISKR":"Not Applicable","CWAV_EALT":885513.8,"CWAV_RISKS":98.71,"CWAV_RISKR":"Very High","DRGT_EALT":6992.17,"DRGT_RISKS":86.7,"DRGT_RISKR":"Relatively Low","ERQK_EALT":7143.64,"ERQK_RISKS":23.66,"ERQK_RISKR":"Very Low","HAIL_EALT":96307.04,"HAIL_RISKS":90.96,"HAIL_RISKR":"Relatively High","HWAV_EALT":22654.6,"HWAV_RISKS":34.37,"HWAV_RISKR":"Relatively Low","HRCN_EALT":null,"HRCN_RISKS":null,"HRCN_RISKR":"Not Applicable","ISTM_EALT":985.4,"ISTM_RISKS":13.54,"ISTM_RISKR":"Very Low","LNDS_EALT":687.28,"LNDS_RISKS":91.17,"LNDS_RISKR":"Relatively Low","LTNG_EALT":158004.13,"LTNG_RISKS":99.47,"LTNG_RISKR":"Very High","IFLD_EALT":875739.45,"IFLD_RISKS":72.92,"IFLD_RISKR":"Relatively Moderate","SWND_EALT":157578.43,"SWND_RISKS":96.08,"SWND_RISKR":"Relatively High","TRND_EALT":15794.88,"TRND_RISKS":29.32,"TRND_RISKR":"Very Low","TSUN_EALT":null,"TSUN_RISKS":null,"TSUN_RISKR":"Not Applicable","VLCN_EALT":null,"VLCN_RISKS":null,"VLCN_RISKR":"Not Applicable","WFIR_EALT":398226.52,"WFIR_RISKS":97.83,"WFIR_RISKR":"Relatively High","WNTW_EALT":20009.11,"WNTW_RISKS":93.22,"WNTW_RISKR":"Relatively High"}};
const NOW=Date.parse('2026-10-30T18:00:00Z');
const countyResult=(attrs,more={})=>({id:'nri-county',title:'FEMA National Risk Index, county',owner:'FEMA',status:'ok',dataDate:'2025-12-16T07:37:01.340Z',data:{attrs},...more});
const rank=(attrs,more={})=>E.rankHazards({county:countyResult(attrs),...more});
const place=(abbr,more={})=>({state:{abbr},isPR:abbr==='PR',isConus:!['AK','HI','PR'].includes(abbr),lat:32.2226,lon:-110.9747,county:{fips:'04019',name:'Pima County'},...more});
const mod=(list,id)=>list.find(m=>m.id===id),src=(m,name)=>m.sources.find(s=>s.name===name);

check('registries: 18 NRI hazards, 13 modules, 6 lifelines, every hazard in exactly one module',()=>{
 assert.equal(E.HAZARDS.length,18);assert.equal(E.MODULES.length,13);assert.deepEqual(Array.from(E.LIFELINES,l=>l.id),['water','power','health','shelter','transport','communications']);
 for(const h of E.HAZARDS)assert.equal(E.MODULES.filter(m=>m.hazards.includes(h.code)).length,1,h.code);
 const lifelines=new Set(E.LIFELINES.map(l=>l.id));for(const m of E.MODULES){assert.ok(m.strains.every(s=>lifelines.has(s)),m.id);for(const k of Object.keys(m.notCovered))assert.ok(m.liveSources.includes(k)||m.staticSources.includes(k),m.id+' '+k);}
 assert.deepEqual(Array.from(E.MODULES,m=>m.id),['tropical','surge','inland-flood','severe','heat','wildfire','drought','earthquake','winter','landslide','tsunami','volcanic','avalanche']);
});
check('alertHazards maps current NWS event names',()=>{
 const cases={'Extreme Heat Warning':['HWAV'],'Heat Advisory':['HWAV'],'Extreme Cold Warning':['CWAV'],'Cold Weather Advisory':['CWAV'],'Storm Surge Warning':['CFLD'],'Coastal Flood Advisory':['CFLD'],'Red Flag Warning':['WFIR'],'Tsunami Warning':['TSUN'],'Avalanche Warning':['AVLN'],'Flood Watch':['IFLD'],'Flash Flood Warning':['IFLD'],'Flood Advisory':['IFLD'],'Winter Storm Warning':['WNTW'],'Winter Weather Advisory':['WNTW'],'Ice Storm Warning':['ISTM'],'Blizzard Warning':['WNTW'],'Tornado Warning':['TRND'],'Severe Thunderstorm Watch':['HAIL','SWND'],'High Wind Warning':['SWND'],'Hurricane Warning':['HRCN'],'Tropical Storm Watch':['HRCN'],'Extreme Wind Warning':['HRCN','SWND'],'Dense Fog Advisory':[],'':[]};
 for(const [event,codes] of Object.entries(cases))assert.deepEqual(plain(E.alertHazards(event)),codes,event);
 assert.deepEqual(plain(E.alertHazards(null)),[]);
});
check('ranking by county EAL matches the research table for five counties',()=>{
 const expected={pinellas:['HRCN','IFLD','TRND','CWAV','CFLD'],pima:['IFLD','HWAV','WFIR','ERQK','LTNG'],cleveland:['IFLD','CWAV','TRND','HWAV','HAIL'],garfield:['CWAV','IFLD','WFIR','LTNG','SWND'],sanJuan:['HRCN','ERQK','TSUN','IFLD','LNDS']};
 for(const [key,codes] of Object.entries(expected)){const r=rank(NRI[key]);assert.equal(r.status,'ok');assert.deepEqual(plain(r.leading),codes,key);assert.equal(r.rows.length,18);assert.equal(r.version,'December 2025');assert.equal(r.dataDate,'2025-12-16T07:37:01.340Z');
  r.rows.filter(x=>x.ealRank).forEach((x,i,a)=>{assert.equal(x.ealRank,i+1);if(i)assert.ok(a[i-1].eal>=x.eal);});}
 const p=rank(NRI.pinellas),hrcn=p.rows.find(r=>r.code==='HRCN');
 assert.equal(E.format.money(hrcn.eal),'$110.1M');assert.equal(hrcn.rating,'Very High');assert.equal(p.noRatings,false);
 assert.deepEqual(plain(p.notApplicable).sort(),['AVLN','ISTM','VLCN']);assert.deepEqual(plain(p.insufficient),['TSUN']);
 const wntw=p.rows.find(r=>r.code==='WNTW');assert.equal(wntw.ealRank,null);assert.equal(wntw.applicable,true);
 assert.ok(rank(NRI.pima).notApplicable.includes('CFLD'));
});
check('Puerto Rico ranks by EAL with no ratings or scores',()=>{
 const r=rank(NRI.sanJuan);assert.equal(r.noRatings,true);assert.match(r.noRatingsNote,/does not publish risk scores/);
 assert.ok(r.rows.every(x=>x.score===null));const h=r.rows.find(x=>x.code==='HRCN');assert.equal(h.rating,'Insufficient Data');assert.equal(h.insufficient,true);assert.equal(h.ealRank,1);
 assert.equal(r.county.riskScore,null);assert.equal(r.county.soviRating,'Data Unavailable');assert.ok(r.notApplicable.includes('AVLN')&&r.notApplicable.includes('ISTM'));
});
check('tract figures are detail only and never replace county figures',()=>{
 const withTract=E.rankHazards({county:countyResult(NRI.pinellas),tract:{status:'ok',data:{attrs:NRI.pinellasTract}}}),alone=rank(NRI.pinellas);
 assert.deepEqual(plain(withTract.leading),plain(alone.leading));const h=withTract.rows.find(r=>r.code==='HRCN');assert.equal(h.eal,alone.rows.find(r=>r.code==='HRCN').eal);assert.ok(Math.abs(h.tractEal-417853)<1);assert.equal(withTract.tract.fips,'12103021900');
 assert.equal(withTract.rows.find(r=>r.code==='CFLD').ealRank,5,'tract CFLD of 0 does not demote the county rank');
 const other=E.rankHazards({county:countyResult(NRI.pima),tract:{data:{attrs:NRI.pinellasTract}}});assert.equal(other.tract,null);assert.match(other.tractNote,/another county/);assert.ok(other.rows.every(r=>r.tractEal===null));
 const g=E.rankHazards({county:countyResult(NRI.garfield),tract:{data:{attrs:NRI.garfieldTract}}});assert.equal(g.tract,null);assert.match(g.tractNote,/single census tract/);
 const none=E.rankHazards({county:{status:'unavailable',message:'Timed out'},tract:{data:{attrs:NRI.pinellasTract}}});assert.equal(none.status,'unavailable');assert.equal(none.rows.length,0);assert.equal(none.leading.length,0);
});
const floodWatch={id:'urn:oid:2.49.0.1.840.0.tucson-flood',event:'Flood Watch',severity:'Severe',certainty:'Possible',urgency:'Future',headline:'Flood Watch issued October 30 at 7:00AM MST until November 2 at 5:00AM MST by NWS Tucson AZ',areaDesc:'Tucson Metro Area',senderName:'NWS Tucson AZ',sent:'2026-10-30T07:00:00-07:00',effective:'2026-10-30T07:00:00-07:00',onset:'2026-10-31T11:00:00-07:00',ends:'2026-11-02T05:00:00-07:00',expires:'2026-10-31T03:00:00-07:00'};
const alertsResult=items=>({id:'nws-alerts',title:'NWS active alerts',owner:'NOAA NWS',status:items.length?'ok':'empty',dataDate:'2026-10-30T17:55:00Z',fetchedAt:'2026-10-30T17:59:00Z',data:{items}});
check('module statuses: leading, not applicable, alerts first, coverage rules',()=>{
 const pimaRank=rank(NRI.pima),pima=E.moduleStatus({ranking:pimaRank,place:place('AZ'),results:{}});
 assert.equal(pima.length,13);assert.equal(pima[0].id,'inland-flood');assert.equal(pima[0].status,'leading');assert.equal(pima[0].rank,1);assert.match(pima[0].reason,/#1 by expected annual loss in Pima/);
 for(const id of ['surge','tsunami','volcanic'])assert.equal(mod(pima,id).status,'not-applicable',id);assert.match(mod(pima,'surge').reason,/Coastal Flooding as Not Applicable in Pima/);
 assert.equal(mod(pima,'heat').status,'leading');assert.equal(src(mod(pima,'heat'),'heatRisk').status,'skipped');assert.equal(mod(pima,'winter').status,'rated');
 const statuses=pima.map(m=>m.status),order=['leading','rated','not-available','not-applicable'];assert.deepEqual(statuses.slice().sort((a,b)=>order.indexOf(a)-order.indexOf(b)),statuses);
 const ak=E.moduleStatus({ranking:rank(NRI.anchorage),place:place('AK'),results:{heatRisk:{status:'ok'}}});
 assert.equal(src(mod(ak,'heat'),'heatRisk').status,'not-covered');assert.match(src(mod(ak,'heat'),'heatRisk').reason,/lower 48/);assert.equal(src(mod(ak,'severe'),'spcOutlook').status,'not-covered');assert.equal(src(mod(ak,'surge'),'surge').status,'not-covered');assert.equal(src(mod(ak,'heat'),'airQuality').status,'skipped');
 const pr=E.moduleStatus({ranking:rank(NRI.sanJuan),place:place('PR'),results:{}});
 assert.equal(src(mod(pr,'heat'),'heatRisk').status,'not-covered');assert.equal(src(mod(pr,'heat'),'airQuality').status,'not-covered');assert.equal(src(mod(pr,'surge'),'surge').status,'skipped');
 assert.equal(mod(pr,'heat').status,'not-available');assert.match(mod(pr,'heat').reason,/insufficient data for Heat Wave/);assert.equal(mod(pr,'tropical').status,'leading');assert.doesNotMatch(mod(pr,'tropical').reason,/NRI Insufficient/);
 const fl=E.moduleStatus({ranking:rank(NRI.pinellas),place:place('FL'),results:{heatRisk:{status:'ok'}}});assert.equal(src(mod(fl,'heat'),'heatRisk').status,'ok');assert.equal(fl[0].id,'tropical');
 const winter=E.moduleStatus({ranking:E.rankHazards({county:countyResult(NRI.pima),alerts:alertsResult([{...floodWatch,id:'w',event:'Winter Storm Warning'}])}),place:place('AZ')});
 assert.equal(winter[0].id,'winter');assert.equal(winter[0].status,'leading');assert.match(winter[0].reason,/Active NWS alert: Winter Storm Warning/);
 const expired=E.rankHazards({county:countyResult(NRI.pima),alerts:alertsResult([{...floodWatch,ends:'2026-10-30T10:00:00-07:00'}]),now:NOW});assert.equal(expired.rows.find(r=>r.code==='IFLD').activeAlerts.length,0);
 const none=E.moduleStatus({ranking:E.rankHazards({county:null}),place:place('AZ')});assert.ok(none.every(m=>m.status==='not-available'));
});
check('screen helpers: NFHL and SPC ranks',()=>{
 assert.equal(E.nfhlRank('VE'),3);assert.equal(E.nfhlRank('AE'),2);assert.equal(E.nfhlRank('AO'),2);assert.equal(E.nfhlRank('X','0.2 PCT ANNUAL CHANCE FLOOD HAZARD'),1);assert.equal(E.nfhlRank('X','AREA OF MINIMAL FLOOD HAZARD'),0);assert.equal(E.nfhlRank('D'),null);assert.equal(E.nfhlRank(null),null);
 assert.equal(E.spcRank('TSTM'),1);assert.equal(E.spcRank('HIGH'),6);assert.equal(E.spcRank(null),0);assert.equal(E.spcRank('BOGUS'),null);
});
/* Generic metric rules on a small fixture: six assets about 1 to 2 km apart. */
const assets=[0,1,2,3,4,5].map(i=>({id:'a'+i,lat:27.70+0.01*i,lon:-82.60+0.004*(i%2),areaId:'Z'+(i%3)}));
const areas=['Z0','Z1','Z2'].map((id,i)=>({id,geometryComplete:true,blockIds:['b'+i],sourceIds:['test-areas']})),blocks=[{id:'b0',population:100,referenceYear:2020},{id:'b1',population:300,referenceYear:2020},{id:'b2',population:600,referenceYear:2020}];
const vals=list=>list.map((value,i)=>({id:'a'+i,value}));
const run=(screen,more={})=>E.computeMetrics({assets,screen:E.screenFrom(screen),areas,blocks,now:NOW,...more});
const M=(r,n)=>r.metrics.find(m=>m.id===n),st=(r,ns)=>ns.map(n=>M(r,n).status);
const continuous={kind:'continuous',direction:'lower',values:vals([0,2,3,0.5,5,8]),threshold:1,band:1,worseStep:2,ladder:[0,1,4],label:'ground elevation',unit:'ft'};
check('metric rules: continuous screen computes all but 7 and 10',()=>{
 const r=run(continuous);assert.deepEqual(Array.from(r.metrics,m=>m.id),[1,2,3,4,5,6,7,8,9,10]);
 assert.deepEqual(st(r,[1,2,3,4,5,6,8,9]),Array(8).fill('computed'));assert.equal(r.screenSummary.exposed,2);assert.equal(r.screenSummary.missing,0);
 assert.equal(M(r,7).status,'not-available');assert.equal(M(r,7).reason,'a calibrated probabilistic dependence model with verified operating inputs');
 assert.equal(M(r,10).status,'not-available');assert.equal(M(r,10).reason,'a verified directed network with capacities and timestamped operating state');
 assert.equal(M(r,5).value,3);assert.equal(M(r,5).review,true);assert.equal(M(r,6).value,2);assert.equal(M(r,6).review,true);assert.equal(M(r,2).review,false);
 assert.equal(M(r,1).unit,'percentage points');assert.ok(Math.abs(M(r,1).value-100*(.1-1/3))<1e-12,'only area Z0 holds exposed assets');assert.equal(M(r,1).review,true);
 for(const m of r.metrics){assert.ok(m.method&&m.requires&&m.pillar,m.id);if(m.status==='computed')assert.ok(m.display&&m.reason===null);else assert.ok(m.reason&&m.value===null&&m.review===null);}
 assert.equal(M(r,8).pillar,'Exposure Resilience');
});
check('metric values follow the coastal definitions (W1, exact AUC, frontier)',()=>{
 const r=E.computeMetrics({assets:assets.slice(0,3),screen:E.screenFrom({...continuous,values:vals([0,2,3])}),now:NOW});
 assert.equal(M(r,2).value,2.5);assert.equal(M(r,8).value,7/12);assert.equal(M(r,4).value,1);
 const wide=E.computeMetrics({assets:assets.slice(0,3),screen:E.screenFrom({...continuous,values:vals([0,2,3])}),config:{componentRadiusKm:0.5,frontierRadiusKm:[0.1,10]},now:NOW});
 assert.equal(M(wide,4).value,1);assert.notEqual(M(wide,9).value,M(r,9).value);assert.match(M(wide,9).display,/0.1 to 10 km/);
 assert.equal(M(E.computeMetrics({assets:assets.slice(0,3),screen:E.screenFrom({...continuous,values:vals([0,2,3])}),config:{componentRadiusKm:-1}}),4).status,'not-available');
});
check('metric rules: area units with population are required for metric 1',()=>{
 const r=run(continuous,{areas:undefined,blocks:undefined});assert.equal(M(r,1).status,'not-available');assert.match(M(r,1).reason,/service-area or area-unit data/);
 const unmatched=E.computeMetrics({assets:assets.map(a=>({...a,areaId:null})),screen:E.screenFrom(continuous),areas,blocks,now:NOW});assert.equal(M(unmatched,1).status,'not-available');assert.match(M(unmatched,1).reason,/service-area match/);
 assert.equal(M(run(continuous,{blocks:blocks.map(b=>({...b,referenceYear:2099}))}),1).status,'not-available');
});
check('metric rules: binary screens make 2, 5, 6 and 8 not applicable',()=>{
 const r=run({kind:'binary',values:vals([true,false,true,false,false,true]),label:'NWS warning polygon',ladder:[0,1],band:1,worseStep:1});
 assert.deepEqual(st(r,[2,5,6,8]),Array(4).fill('not-applicable'));assert.match(M(r,2).reason,/continuous intensity/);assert.match(M(r,8).reason,/no intensity ladder/);
 assert.deepEqual(st(r,[1,3,4,9]),Array(4).fill('computed'));assert.equal(r.screenSummary.exposed,3);
});
check('metric rules: ordered screens need a band, a worse step and a ladder; 2 is not applicable',()=>{
 const flood={kind:'ordered',values:vals([0,1,2,3,2,0]),threshold:2,band:1,worseStep:1,label:'FEMA flood zone class'};
 const r=run(flood);assert.equal(M(r,2).status,'not-applicable');assert.match(M(r,2).reason,/ordered-class screen/);
 assert.equal(M(r,5).value,3,'classes 1 and 2 sit on either side of the boundary');assert.equal(M(r,6).value,1,'the 0.2% zone joins one step worse');
 assert.equal(M(r,8).status,'not-available');assert.match(M(r,8).reason,/ladder/);
 assert.ok(Math.abs(M(run({...flood,ladder:[0,3]}),8).value-(0+1+2+3+2+0)/3/6)<1e-12);
 assert.equal(M(run({...flood,band:null}),5).status,'not-available');assert.match(M(run({...flood,band:null}),5).reason,/band/);
 assert.equal(M(run({...flood,worseStep:0}),6).status,'not-available');assert.match(M(run({...flood,worseStep:0}),6).reason,/worse step/);
});
check('metric rules: an incomplete screen withholds dependent metrics with the missing count',()=>{
 const r=run({...continuous,values:vals([0,2,3,0.5,null,8])});
 for(const n of [1,2,3,4,5,6,8,9]){assert.equal(M(r,n).status,'not-available',n);assert.match(M(r,n).reason,/1 of 6 assets/);}
 assert.equal(r.screenSummary.missing,1);assert.equal(r.screenSummary.exposed,2,'known subtotal stays visible');
 const b=run({kind:'binary',values:vals([1,0,1,0,null,null])});assert.deepEqual(st(b,[2,5,6,8]),Array(4).fill('not-applicable'));assert.match(M(b,3).reason,/2 of 6 assets/);
 const noThreshold=run({...continuous,threshold:null});assert.equal(M(noThreshold,5).status,'not-available');assert.match(M(noThreshold,5).reason,/threshold/);assert.equal(M(noThreshold,8).status,'computed','the ladder integral needs no threshold');
 const dup=E.computeMetrics({assets:[assets[0],assets[0]],screen:E.screenFrom(continuous),now:NOW});assert.ok(dup.metrics.every(m=>m.status==='not-available'));assert.match(M(dup,2).reason,/unique ID/);
 const none=E.computeMetrics({assets:[],screen:E.screenFrom(continuous)});assert.ok(none.metrics.every(m=>m.status==='not-available'));
});
check('metric rules: coordinates and enough points per group for 3, 4 and 9',()=>{
 const r=E.computeMetrics({assets:assets.map((a,i)=>i?a:{...a,lat:null}),screen:E.screenFrom(continuous),areas,blocks,now:NOW});
 for(const n of [3,4,9]){assert.equal(M(r,n).status,'not-available');assert.match(M(r,n).reason,/coordinates/);}assert.deepEqual(st(r,[1,2,5,6,8]),Array(5).fill('computed'));
 const one=run({...continuous,threshold:0});assert.equal(one.screenSummary.exposed,1);assert.equal(M(one,3).status,'not-available');assert.match(M(one,3).reason,/two distinct/);assert.equal(M(one,9).status,'computed');
 const zero=run({...continuous,threshold:-5});assert.equal(zero.screenSummary.exposed,0);assert.equal(M(zero,9).status,'not-available');assert.equal(M(zero,2).status,'not-available');assert.equal(M(zero,4).value,0);assert.equal(M(zero,4).status,'computed');
});
/* Coastal equality on the real published St. Petersburg data. */
const stationsFile=JSON.parse(await read('../consoles/coastal-water-resilience/data/public-stations.json')),contextFile=JSON.parse(await read('../consoles/coastal-water-resilience/data/impact-context.json'));
const LADDER=[3,4,5,6,7,8,10,12],OFFSET=1.48;
/* Same filter as publicScopeRecords() in the Coastal page. */
const scoped=scope=>stationsFile.stations.filter(s=>scope==='all'||s.isCityOwned===true||(s.isCityOwned==null&&s.owner==='City of St. Petersburg'));
function same(a,b,label){
 assert.deepEqual(Array.from(b.metrics,m=>m.id),Array.from(a.metrics,m=>m.n),label);
 for(const am of a.metrics){const bm=b.metrics.find(m=>m.id===am.n),where=label+' metric '+am.n;
  assert.equal(bm.value,am.value,where);
  if(am.status==='unknown')assert.notEqual(bm.status,'computed',where);else{assert.equal(bm.status,'computed',where);assert.equal(bm.review,am.status==='review',where);}
  if(am.n===6&&am.status!=='unknown')assert.equal(bm.ratio,am.ratio,where);}
 assert.equal(b.screenSummary.exposed,a.coverage.screenedCount,label+' screened count');
}
check('coastalLevelScreen equals CWRPublicPlanning.analyze on the published data at 4, 6, 8 and 10 ft, both scopes',()=>{
 assert.equal(scoped('city').length,82);assert.equal(scoped('all').length,131);assert.equal(E.coastalScope(stationsFile.stations,'city').length,82);
 for(const scope of ['city','all'])for(const level of [4,6,8,10]){
  const a=analyze({stations:scoped(scope),levelFtMLLW:level,datumOffsetFt:OFFSET,levels:LADDER,context:contextFile,now:NOW,forecastRows:[]});
  const b=E.coastalLevelScreen({stations:stationsFile.stations,context:contextFile,levelMllwFt:level,offsetFt:OFFSET,ladder:LADDER,scope,now:NOW});
  same(a,b,scope+' '+level+' ft');assert.equal(b.planeFtNAVD88,a.coverage.planeFtNAVD88);
  if(level>=6)assert.equal(b.metrics.filter(m=>m.status==='computed').length,8,'real data computes all eight metrics at '+level+' ft');
 }
 const city6=E.coastalLevelScreen({stations:stationsFile.stations,context:contextFile,levelMllwFt:6,offsetFt:OFFSET,ladder:LADDER,scope:'city',now:NOW});
 assert.equal(city6.screenSummary.exposed,9);assert.equal(M(city6,4).value,8);assert.equal(M(city6,5).value,12);assert.equal(M(city6,6).value,23);assert.equal(M(city6,1).detail.selectedPopulation,14333);assert.equal(M(city6,1).detail.totalPopulation,110572);
});
check('coastal equality holds for missing level, sentinels, missing terrain, bad ladder and duplicate IDs',()=>{
 const base=scoped('all'),variants=[['no level',{level:null}],['level sentinel',{level:-9999}],['offset sentinel',{offset:-9999}],['offset missing',{offset:undefined}],['missing terrain',{stations:base.map((s,i)=>i===3?{...s,groundElevationFt:null}:s)}],['wrong datum',{stations:base.map((s,i)=>i===5?{...s,elevationVerticalDatum:'MLLW'}:s)}],['bad ladder',{ladder:[4,3]}],['duplicate id',{stations:[...base,base[0]]}],['missing coordinates',{stations:base.map((s,i)=>i===7?{...s,lat:null}:s)}],['no context',{context:null}]];
 for(const [label,v] of variants){const stations=v.stations||base,level='level' in v?v.level:6,offset='offset' in v?v.offset:OFFSET,ladder=v.ladder||LADDER,context='context' in v?v.context:contextFile;
  const a=analyze({stations,levelFtMLLW:level,datumOffsetFt:offset,levels:ladder,context,now:NOW,forecastRows:[]}),b=E.coastalLevelScreen({stations,context,levelMllwFt:level,offsetFt:offset,ladder,scope:'all',now:NOW});same(a,b,label);}
});
/* The Coastal page's own usableOFSWindow(), run from its source in an isolated context. */
const html=await read('../consoles/coastal-water-resilience/index.html'),windowSource=html.match(/function usableOFSWindow\(at\)\{[\s\S]*?\n\}/)[0];
function pageWindow(rows,at){const ctx={OFS:{rows},FEEDS:{ofs:{retained:false}}};vm.createContext(ctx);vm.runInContext(windowSource+';this.result=usableOFSWindow('+at+');',ctx);return ctx.result;}
const hour=3600000,ofsRows=[[-2,7.9],[-1,9.4],[1,2.1],[2,4.6],[3,5.8],[4,7.2],[5,6.9],[6,5.0],[9,3.3],[30,6.1],[47,2.0],[49,12]].map(([h,v])=>({t:NOW+h*hour,v}));
check('ofsPeak reproduces the Coastal OFS window and forecast() exactly',()=>{
 for(const scope of ['city','all']){const stations=scoped(scope),mine=E.ofsPeak(ofsRows,stations,OFFSET,NOW),page=pageWindow(ofsRows,NOW);
  assert.equal(JSON.stringify(mine.window),JSON.stringify(page));assert.equal(mine.levelFtMLLW,7.2);assert.equal(mine.peakAt,new Date(NOW+4*hour).toISOString());
  const coastal=analyze({stations,levelFtMLLW:page.peak.v,datumOffsetFt:OFFSET,levels:LADDER,context:contextFile,now:NOW,forecastRows:page.rows.map(r=>({t:r.t,v:r.v,unit:'ft',datum:'MLLW'}))});
  assert.equal(JSON.stringify(mine.exposure),JSON.stringify(coastal.forecastExposure));assert.equal(mine.exposure.status,'context');assert.equal(mine.exposure.sampleCount,9);
  assert.ok(mine.exposure.samples.some(s=>s.screenedCount>0));
  same(coastal,E.coastalLevelScreen({stations,context:contextFile,levelMllwFt:mine.levelFtMLLW,offsetFt:OFFSET,ladder:LADDER,scope:'all',now:NOW}),scope+' OFS peak');}
 const stale=ofsRows.filter(r=>r.t<=NOW),mine=E.ofsPeak(stale,scoped('all'),OFFSET,NOW);assert.equal(pageWindow(stale,NOW),null);assert.equal(mine.window,null);assert.equal(mine.levelFtMLLW,null);assert.equal(mine.status,'unavailable');
 assert.equal(JSON.stringify(mine.exposure),JSON.stringify(analyze({stations:scoped('all'),levelFtMLLW:null,datumOffsetFt:OFFSET,levels:LADDER,context:contextFile,now:NOW,forecastRows:[]}).forecastExposure));
 assert.equal(E.ofsPeak(ofsRows,[...scoped('all'),scoped('all')[0]],OFFSET,NOW).exposure.status,'unknown');
 const partial=scoped('all').map((s,i)=>i===2?{...s,groundElevationFt:-9999}:s),page=pageWindow(ofsRows,NOW),mineP=E.ofsPeak(ofsRows,partial,OFFSET,NOW).exposure;
 assert.equal(JSON.stringify(mineP),JSON.stringify(analyze({stations:partial,levelFtMLLW:page.peak.v,datumOffsetFt:OFFSET,levels:LADDER,context:contextFile,now:NOW,forecastRows:page.rows.map(r=>({t:r.t,v:r.v,unit:'ft',datum:'MLLW'}))}).forecastExposure));assert.equal(mineP.status,'unknown');assert.equal(mineP.partial,true);
});
/* Native response plan */
const pimaRanking=E.rankHazards({county:countyResult(NRI.pima),now:NOW}),tucson=place('AZ',{label:'Tucson city, Pima County, Arizona',tract:{geoid:'04019001100'}});
const baseResults=()=>({nwsAlerts:alertsResult([]),
 shelters:{id:'fema-shelters',title:'FEMA National Shelter System open shelters',owner:'FEMA',status:'empty',dataDate:null,fetchedAt:'2026-10-30T17:59:00Z',message:'None listed in this source.',data:{items:[]}},
 hospitalsCMS:{id:'cms-hospitals',title:'CMS Medicare hospitals',owner:'CMS',hostedBy:'Esri',status:'ok',dataDate:'2025-12-22T00:00:00Z',fetchedAt:'2026-10-30T17:59:00Z',data:{items:[{name:'Banner University Medical Center Tucson',address:'1625 N Campbell Ave',city:'Tucson',state:'AZ',emergencyServices:'Yes',distanceKm:2.4}]}},
 riverGauges:{id:'nwps-gauges',title:'NOAA NWPS river gauges',owner:'NOAA',status:'ok',dataDate:'2026-10-30T17:45:00Z',fetchedAt:'2026-10-30T17:59:00Z',data:{items:[{lid:'RILA3',name:'Rillito Creek at Dodge Blvd',category:'no_flooding',observedFt:1.2,observedTime:'2026-10-30T17:45:00Z',minor:6,distanceKm:4.1}]}},
 heatRisk:{id:'nws-heatrisk',title:'NWS HeatRisk',owner:'NOAA NWS',experimental:true,status:'unavailable',message:'Timed out after 20 s.',fetchedAt:'2026-10-30T17:59:00Z',data:null}});
const metricsTucson=run(continuous);
check('buildPlan with no alerts: prepare phase, ten dimensions, only real records or labeled general guidance',()=>{
 const results=baseResults(),modules=E.moduleStatus({ranking:pimaRanking,place:tucson,results}),plan=E.buildPlan({place:tucson,ranking:pimaRanking,modules,results,metrics:metricsTucson,track:'public',now:NOW});
 assert.equal(plan.phase.id,'prepare');assert.equal(plan.phase.until,null);assert.match(plan.phase.basis,/No active NWS watch or warning for the leading hazards/);
 assert.equal(plan.dimensions.length,10);assert.deepEqual(Array.from(plan.dimensions,d=>d.pillar),['Statistical Interchangeability','Statistical Interchangeability','Statistical Interchangeability','Topological and Spatial Cohesion','Topological and Spatial Cohesion','Topological and Spatial Cohesion','Topological and Spatial Cohesion','Exposure Resilience','Exposure Resilience','Exposure Resilience']);
 for(const d of plan.dimensions){assert.ok(d.condition&&d.inputs&&d.mitigation&&d.nextSteps,d.id);assert.ok(/^(Computed here|Not available here|Not applicable here): /.test(d.condition),d.condition);}
 assert.match(plan.dimensions[4].condition,/^Computed here: 3 assets within the declared boundary band.*2 of 6 assets exposed by the ground elevation screen.*Flagged for review/);
 assert.equal(plan.dimensions[6].condition,'Not available here: a calibrated probabilistic dependence model with verified operating inputs.');
 assert.ok(plan.actions.length>0);
 for(const a of plan.actions){assert.equal(a.track,'public');assert.ok(['inland-flood','heat','wildfire','earthquake','severe'].includes(a.module),a.module);
  if(a.source==='General guidance')assert.match(a.text,/^General guidance: /);else{assert.ok(a.dataDate||a.dataDateText,a.text);assert.ok(a.checkedAt,a.text);assert.doesNotMatch(a.text,/^General guidance/);}}
 const hospital=plan.actions.find(a=>/Banner University Medical Center Tucson/.test(a.text));assert.ok(hospital);assert.match(hospital.text,/Confirm before you go/);assert.match(hospital.source,/Federal dataset hosted by Esri/);assert.equal(hospital.dataDate,'2025-12-22T00:00:00Z');
 const shelter=plan.actions.find(a=>a.id.includes('shelters'));assert.match(shelter.text,/None listed in this source/);assert.equal(shelter.dataDate,null);assert.equal(shelter.dataDateText,'Data date not published by this source');
 const gauge=plan.actions.find(a=>a.module==='inland-flood'&&/Rillito Creek/.test(a.text));assert.equal(gauge.dataDate,'2026-10-30T17:45:00Z');
 assert.ok(!plan.actions.some(a=>/nwsAlerts/.test(a.id)),'no alert action without an alert');assert.ok(!plan.actions.some(a=>/HeatRisk/.test(a.text)),'an unavailable source creates no action');
 assert.ok(plan.limitations.some(l=>/NWS HeatRisk \(Experimental\) was unavailable: Timed out/.test(l)));assert.ok(plan.limitations.some(l=>/live operating condition/.test(l)));
 assert.ok(!JSON.stringify(plan).includes('\u2014'),'no em dashes');
 const noMetrics=E.buildPlan({place:tucson,ranking:pimaRanking,results,track:'public',now:NOW});assert.ok(noMetrics.dimensions.every(d=>d.status==='not-available'));assert.match(noMetrics.dimensions[0].condition,/no exposure screen has been run/);
 assert.equal(E.buildPlan({place:tucson,ranking:pimaRanking,modules,results:{...results,nwsAlerts:{...results.nwsAlerts,fetchedAt:'2026-10-30T18:30:00Z'}},metrics:metricsTucson,track:'public',now:NOW}).revision,plan.revision,'a fetch-time-only update keeps the revision');
 const op=E.buildPlan({place:tucson,ranking:pimaRanking,modules,results,metrics:metricsTucson,track:'operator',now:NOW});assert.notEqual(op.revision,plan.revision);assert.ok(op.actions.every(a=>a.track==='operator'));assert.notEqual(op.dimensions[0].nextSteps,plan.dimensions[0].nextSteps);
});
check('buildPlan with a Flood Watch: watch phase until the alert ends, real alert action, new revision',()=>{
 const results={...baseResults(),nwsAlerts:alertsResult([floodWatch])},ranking=E.rankHazards({county:countyResult(NRI.pima),alerts:results.nwsAlerts,now:NOW}),modules=E.moduleStatus({ranking,place:tucson,results});
 const plan=E.buildPlan({place:tucson,ranking,modules,results,metrics:metricsTucson,track:'public',now:NOW}),quiet=E.buildPlan({place:tucson,ranking:pimaRanking,results:baseResults(),metrics:metricsTucson,track:'public',now:NOW});
 assert.equal(plan.phase.id,'watch');assert.equal(plan.phase.label,'Watch');assert.equal(plan.phase.until,'2026-11-02T12:00:00.000Z');assert.match(plan.phase.basis,/NWS Flood Watch from NWS Tucson AZ/);assert.match(plan.phase.basis,/Inland Flooding, a leading hazard/);
 const alert=plan.actions.find(a=>a.module==='inland-flood'&&/Flood Watch/.test(a.text));assert.ok(alert);assert.equal(alert.source,'National Weather Service alerts (api.weather.gov)');assert.equal(alert.dataDate,floodWatch.sent);assert.equal(alert.reviewAfter,'2026-11-02T12:00:00.000Z');assert.equal(alert.basis,floodWatch.headline);
 assert.notEqual(plan.revision,quiet.revision);
 const warn=E.buildPlan({place:tucson,ranking,results:{...results,nwsAlerts:alertsResult([floodWatch,{...floodWatch,id:'ffw',event:'Flash Flood Warning',ends:'2026-10-31T02:00:00-07:00'}])},track:'public',now:NOW});assert.equal(warn.phase.id,'warning');assert.equal(warn.phase.until,'2026-10-31T09:00:00.000Z');
 const other=E.buildPlan({place:tucson,ranking:pimaRanking,results:{...baseResults(),nwsAlerts:alertsResult([{...floodWatch,id:'ws',event:'Winter Storm Warning'}])},track:'public',now:NOW});
 assert.equal(other.phase.id,'prepare','alerts for non-leading hazards do not set the phase');assert.match(other.phase.basis,/Winter Storm Warning/);
 const down=E.buildPlan({place:tucson,ranking:pimaRanking,results:{nwsAlerts:{status:'unavailable',title:'NWS active alerts',message:'HTTP 503.'}},track:'public',now:NOW});assert.equal(down.phase.id,'prepare');assert.match(down.phase.basis,/not available right now/);
});
check('buildPlan: advisories and statements do not set Watch; a missing ranking sets no phase; tide flood levels are converted to MLLW',()=>{
 for(const event of ['Flood Advisory','Flood Statement','Heat Advisory']){
  const results={...baseResults(),nwsAlerts:alertsResult([{...floodWatch,id:'adv-'+event,event}])},ranking=E.rankHazards({county:countyResult(NRI.pima),alerts:results.nwsAlerts,now:NOW});
  const plan=E.buildPlan({place:tucson,ranking,results,track:'public',now:NOW});
  assert.equal(plan.phase.id,'prepare',event);assert.match(plan.phase.basis,new RegExp('do not set the Watch or Warning phase\\): '+event),event);
  assert.ok(plan.actions.some(a=>a.text.startsWith('NWS '+event)),'the advisory is still listed as an action');
 }
 const noRank=E.buildPlan({place:tucson,ranking:{status:'unavailable',rows:[],leading:[]},results:baseResults(),track:'public',now:NOW});
 assert.equal(noRank.phase.id,'unknown');assert.match(noRank.phase.label,/Phase not set: hazard ranking unavailable/);assert.match(noRank.phase.basis,/FEMA NRI did not answer/);
 const tide={id:'coops-station',title:'NOAA CO-OPS water level',owner:'NOAA',status:'ok',dataDate:'2026-10-30T17:54:00Z',fetchedAt:'2026-10-30T17:59:00Z',data:{station:{id:'8726520',name:'St. Petersburg',distanceKm:1.9},latest:{t:'2026-10-30T17:54:00Z',v:2.86,datum:'MLLW'},floodLevels:{nwsMinor:8.33,mllwInStationDatum:3.37,datumNote:'x'}}};
 const pin=place('FL',{label:'St. Petersburg city, Pinellas County, Florida'});
 const sp=E.buildPlan({place:pin,ranking:{status:'ok',rows:[],leading:['CFLD']},modules:[{id:'surge',status:'leading'}],results:{nwsAlerts:alertsResult([]),tideStation:tide},track:'public',now:NOW});
 const act=sp.actions.find(a=>a.module==='surge'&&/St. Petersburg/.test(a.text));assert.ok(act);assert.match(act.text,/2\.86 ft MLLW/);assert.match(act.text,/about 4\.96 ft MLLW \(converted from station datum/);assert.doesNotMatch(act.text,/8\.33|mllwInStationDatum|\)\.\)/);
 const noConv=E.buildPlan({place:pin,ranking:{status:'ok',rows:[],leading:['CFLD']},modules:[{id:'surge',status:'leading'}],results:{nwsAlerts:alertsResult([]),tideStation:{...tide,data:{...tide.data,floodLevels:{nwsMinor:8.33}}}},track:'public',now:NOW});
 assert.doesNotMatch(noConv.actions.find(a=>a.module==='surge').text,/flood level/,'no threshold when it cannot be converted');
 const tz=E.buildPlan({place:{...tucson,timeZone:'America/Phoenix'},ranking:E.rankHazards({county:countyResult(NRI.pima),alerts:alertsResult([floodWatch]),now:NOW}),results:{...baseResults(),nwsAlerts:alertsResult([floodWatch])},track:'public',now:NOW});
 assert.match(tz.phase.basis,/MST/,'times use the place time zone');
});
check('rankHazards withholds special land use and nearly empty tracts',()=>{
 const county=countyResult(NRI.pima),base=county.data.attrs;
 const tract=(fips,pop)=>({...county,id:'nri-tract',data:{attrs:{...base,TRACTFIPS:fips,POPULATION:pop,BUILDVALUE:1,EAL_VALT:40600}}});
 const afb=E.rankHazards({county,tract:tract('04019980300',5000),now:NOW});assert.equal(afb.tract,null);assert.match(afb.tractNote,/special land use tract/);assert.ok(afb.rows.every(r=>r.tractEal==null));
 const tiny=E.rankHazards({county,tract:tract('04019001100',5),now:NOW});assert.equal(tiny.tract,null);assert.match(tiny.tractNote,/only 5 residents/);
 const normal=E.rankHazards({county,tract:tract('04019001100',4200),now:NOW});assert.ok(normal.tract);
});
check('moduleStatus names insufficient and not-applicable hazards separately and keeps a covering live feed',()=>{
 const county=countyResult(NRI.pima),a={...county.data.attrs,CWAV_RISKR:'Insufficient Data',CWAV_EALT:0,WNTW_RISKR:'Insufficient Data',WNTW_EALT:0,ISTM_RISKR:'Not Applicable',ISTM_EALT:null,DRGT_RISKR:'Insufficient Data',DRGT_EALT:0};
 const ranking=E.rankHazards({county:{...county,data:{attrs:a}},now:NOW}),mods=E.moduleStatus({ranking,place:place('AZ'),results:{}});
 const winter=mods.find(m=>m.id==='winter'),drought=mods.find(m=>m.id==='drought');
 assert.equal(winter.status,'not-available');assert.match(winter.reason,/insufficient data for Cold Wave, Winter Weather in .* and rates Ice Storm as Not Applicable/);
 assert.equal(drought.status,'not-available');assert.match(drought.reason,/not ranked here/);assert.match(drought.reason,/U\.S\. Drought Monitor\) still covers this place/);
});
check('buildPlan leaves Department of Defense hospitals out of the public nearest-hospital action',()=>{
 const results={...baseResults(),hospitalsCMS:{...baseResults().hospitalsCMS,data:{items:[{name:'673Rd Medical Group',type:'Acute Care - Department of Defense',emergencyServices:'Yes',distanceKm:3},{name:'Providence Alaska Medical Center',type:'Acute Care Hospitals',emergencyServices:'Yes',distanceKm:9}]}}};
 const pub=E.buildPlan({place:tucson,ranking:pimaRanking,results,track:'public',now:NOW}),h=pub.actions.find(a=>/Nearest hospital listed/.test(a.text));
 assert.match(h.text,/Providence Alaska Medical Center/);assert.doesNotMatch(h.text,/673Rd/);
 const op=E.buildPlan({place:tucson,ranking:pimaRanking,results,track:'operator',now:NOW}),o=op.actions.find(a=>/Hospitals listed nearest first/.test(a.text));
 assert.match(o.text,/673Rd Medical Group \(Department of Defense hospital/);
});
check('format helpers, distanceKm and nearest',()=>{
 assert.equal(E.format.money(110079977),'$110.1M');assert.equal(E.format.money(2.5e9),'$2.5B');assert.equal(E.format.money(848998),'$849.0K');assert.equal(E.format.money(null),'Not listed');
 assert.equal(E.format.distance(1.609344),'1.0 mi (1.6 km)');assert.equal(E.format.distance(40),'25 mi (40 km)');assert.equal(E.format.pct(6.7),'6.7%');
 assert.equal(E.format.date('2026-11-02T12:00:00Z','America/Phoenix'),'Nov 2, 2026, 5:00 AM MST');assert.equal(E.format.date('nope'),'Date not listed');
 const d=E.distanceKm({lat:27.7606,lon:-82.6269},{lat:27.773,lon:-82.64});assert.ok(d>1.8&&d<1.9);assert.equal(E.distanceKm({lat:null,lon:0},{lat:0,lon:0}),null);
 const list=E.nearest([{id:'far',lat:28,lon:-82.6},{id:'none'},{id:'near',lat:27.77,lon:-82.63}],{lat:27.7606,lon:-82.6269});assert.deepEqual(Array.from(list,x=>x.id),['near','far','none']);assert.equal(list[2].distanceKm,null);
});
console.log('PASS '+passed+' Community Resilience engine regression groups');
