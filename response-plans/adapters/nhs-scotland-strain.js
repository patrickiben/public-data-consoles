(function () {
  const R = window.ConsoleResponse, H = R.domain;
  const source = 'https://publichealthscotland.scot/publications/';
  const care = 'https://www.nhsinform.scot/campaigns/right-care-right-place';
  const rows = [
    {requiredInputs:['Site attendances and a declared comparison split'], analyticalMitigation:'Compare site-count and attendance-weighted summaries; report the denominator in each group.', publicAction:'Ask whether the summary represents the services and catchments relevant to your area.', operatorAction:'Review attendance-weighted and unweighted site comparisons before prioritizing a service review.'},
    {requiredInputs:['Same-period site distributions for the two comparison groups'], analyticalMitigation:'Use the empirical one-dimensional Wasserstein distance in attendances; case mix is not adjusted.', publicAction:'Read the distribution comparison alongside the dates and service types.', operatorAction:'Investigate whether differences in service size or case mix explain the distribution gap before comparing performance.'},
    {requiredInputs:['Catchment geometry','Population denominators','Consistent site inclusion'], analyticalMitigation:'A spatial density comparison needs catchments and population; site counts alone are insufficient.', publicAction:'Identify communities that may be missing from the published coverage.', operatorAction:'Obtain catchment denominators and compare geographic access before making an equity claim.'},
    {requiredInputs:['Verified referral or transfer graph','Defined service boundaries'], analyticalMitigation:'Use a verified patient-flow graph to assess connected service components; geographic proximity is not a referral edge.', publicAction:'Check official local pathways for the services you need.', operatorAction:'Map verified referral and transfer handoffs with the relevant boards; do not infer them from this ranking.'},
    {requiredInputs:['Declared reference level','Uncertainty or sensitivity band'], analyticalMitigation:'Inspect distance from the packaged 95% reference and a declared five-point band; the band is an interpretive sensitivity check.', publicAction:'Use current NHS care guidance rather than a historical waiting-time threshold to decide where to seek help.', operatorAction:'Review sites near the reference and whether reporting uncertainty changes their classification.'},
    {requiredInputs:['Alternative declared screening levels','Comparable site measurements'], analyticalMitigation:'Compare the number of sites below 90% and 95%; this is threshold sensitivity, not a fitted spatial-mixing statistic.', publicAction:'Check whether a conclusion changes when the comparison level changes.', operatorAction:'Prioritize conclusions that remain stable across documented screening levels; investigate sensitive classifications.'},
    {requiredInputs:['A specified probabilistic model','A common reporting period','Model energy and entropy terms'], analyticalMitigation:'A variational-free-energy value is not supplied by aggregate occupancy and wait figures.', publicAction:'Keep historical planning findings separate from current hospital status.', operatorAction:'Align periods and specify the model before estimating residual dependence or free energy.'},
    {requiredInputs:['Repeated national measurements','A declared reference and integration window'], analyticalMitigation:'The historical standard-gap AUC is a temporal planning proxy; it is not trial contamination or excess harm.', publicAction:'Ask whether a gap is persistent across reports rather than relying on one week.', operatorAction:'Review persistent performance gaps over the documented window alongside case mix and current operational records.', phase:'review'},
    {requiredInputs:['Observed transfers','Defined exposed/unexposed service groups','Boundary depth'], analyticalMitigation:'Frontier-risk AUC needs observed handoffs and a defined boundary; no patient-level routing is in this file.', publicAction:'Ask how continuity is maintained when care crosses service boundaries.', operatorAction:'Review actual inter-board and discharge handoffs using approved operational data.'},
    {requiredInputs:['Time-aligned directed patient/service flows','A declared cohort boundary'], analyticalMitigation:'Leakage cannot be inferred by joining quarterly occupancy to a different month of delayed discharges.', publicAction:'Check who owns the next handoff in your care pathway.', operatorAction:'Verify transfer and discharge ownership, escalation contacts and current capacity before changing a pathway.', phase:'review'}
  ];
  R.connect(() => {
    const sites = SNAP.sites.filter(s => Number.isFinite(s.pct4) && Number.isFinite(s.att));
    const ordered = [...sites].sort((a,b) => a.pct4-b.pct4), left=ordered.slice(0,Math.floor(ordered.length/2)), right=ordered.slice(left.length);
    const total=sites.reduce((s,x)=>s+x.att,0), share=total?100*left.reduce((s,x)=>s+x.att,0)/total:null;
    const countShare=sites.length?100*left.length/sites.length:null;
    const distance=H.wasserstein(left.map(s=>s.att),right.map(s=>s.att));
    const band=sites.length?sites.filter(s=>Math.abs(s.pct4-95)<=5).length:null;
    const sensitive=sites.length?sites.filter(s=>s.pct4>=90&&s.pct4<95).length:null;
    const gaps=SNAP.national.filter(s=>Number.isFinite(s.pct4)).map(s=>Math.max(0,(95-s.pct4)/95));
    const auc=gaps.length>1?100*gaps.slice(1).reduce((sum,g,i)=>sum+(g+gaps[i])/2,0)/(gaps.length-1):null;
    const date=String(SNAP.meta.aeWeek), when=date.slice(0,4)+'-'+date.slice(4,6)+'-'+date.slice(6,8);
    const evidence=[
      ['balance','Lower-half sites: attendance share minus site share',share==null?null:+(share-countShare).toFixed(2),'percentage points'],
      ['shape','Wasserstein gap in weekly attendances',distance==null?null:+distance.toFixed(2),'attendances'],
      ['margin','Sites within five points of packaged 95% reference',band,'sites'],
      ['sensitivity','Sites changing group between 90% and 95%',sensitive,'sites'],
      ['auc','Historical standard-gap AUC proxy',auc==null?null:+auc.toFixed(2),'% of reference, normalized over 30 weeks']
    ].map(([id,label,value,unit])=>({id,label,value,unit,measuredAt:when,basis:'measured',quality:value==null?'missing':'historical',source,note:'Computed from the packaged baseline captured '+SNAP.meta.fetched+'; not current triage data.'}));
    const override=(id,value,rule,explanation)=>({status:value==null?'unknown':value>0?'triggered':'clear',value:evidence.find(e=>e.id===id)?.value,unit:evidence.find(e=>e.id===id)?.unit,evidenceIds:[id],rule,explanation});
    return H.build({slug:'nhs-scotland-strain',title:'Ten-parameter service-planning checklist',context:'NHS Scotland · baseline week ending '+when+' · scenario: '+SCEN,scenario:SCEN!=='none',rows,evidence,authorityUrl:care,
      escalateWhen:'Use current NHS service guidance for care needs; operators escalate only on verified current conditions under their own approved pathway.',
      overrides:{
        1:override('balance',share==null?null:share-countShare,'Review when lower-half sites carry a greater attendance share than their share of sites.','Descriptive attendance-weighting adaptation; the split is the lower half of site4-hour performance, not randomized trial arms.'),
        2:override('shape',distance,'Review a nonzero attendance-distribution gap.','Actual empirical Wasserstein distance in attendances; this does not adjust clinical case mix.'),
        5:override('margin',band,'Review sites within five percentage points of the packaged 95% reference.','Threshold-margin proxy; the five-point band is interpretive, not a confidence interval.'),
        6:override('sensitivity',sensitive,'Review classifications that differ at 90% and 95%.','Threshold sensitivity adaptation; no spatial-mixing model is fitted.'),
        8:override('auc',auc,'Review a persistent positive gap over the packaged 30-week window.','Normalized trapezoidal standard-gap AUC; not contamination, treatment effect or a harm estimate.')},
      network:{label:'Service handoffs',basis:'interpretive',semantics:'No observed referral or patient-transfer edges are supplied.',coverage:'Aggregate A&E, occupancy and delayed-discharge reports use different periods.',roles:[],limitations:['No causal bed-flow or source/sink accounting can be estimated from these separate aggregates.']},
      limitations:['All calculations above use the dated baseline; a selected what-if changes the original national scenario display, not these historical site measurements.','These are adaptations of the ten diagnostic questions, with supported calculations and explicit input gaps; no CRT treatment effect is estimated.'],
      baseline:[{id:'care-pathway',track:'public',phase:'verify',when:'always',title:'Find current care guidance',nextStep:'Use NHS inform for current service guidance. Do not delay urgent care because a historical dashboard shows pressure.',escalateWhen:'Follow current clinical and emergency-service guidance for your situation.',authorityUrl:care}]
    });
  },['#scenout','#feeds','#eds']);
})();
