// Maintainer adapter: public evidence only; no private questionnaire values.
(function () {
  'use strict';
  var cfg = {
  "slug": "us-overdose-surveillance",
  "title": "Overdose surveillance",
  "source": "https://www.cdc.gov/nchs/nvss/vsrr/drug-overdose-data.htm",
  "authority": "https://www.cdc.gov/overdose-prevention/",
  "scope": "National surveillance supports verification and preparedness review, not a diagnosis, individual risk prediction or an automatic local incident declaration.",
  "gap": "No verified local catchment graph, person-level exposures or fitted CRT probability model is supplied.",
  "escalate": "Escalate stale, revised or discordant surveillance to the public-health/data lead. Current symptoms or immediate safety concerns require appropriate local care or emergency services, irrespective of this national trend. Professional operators must use current healthcare-specific guidance and their own SOP.",
  "limit": "Incomplete, lagged or preliminary reporting can change estimates. Do not add overlapping drug classes, different viruses or different surveillance measures.",
  "lenses": [
    [
      "Population / need balance",
      "Aligned age/sex and jurisdiction-specific populations denominators and overdose prevention needs by subgroup; sampling weights.",
      "Compare need-weighted coverage after checking age, sex, ascertainment and denominators.",
      "Ask the public-health service which age/sex and jurisdiction-specific populations groups are absent from the country average.",
      "Obtain disaggregated age/sex and jurisdiction-specific populations denominators and document which needs/service groups a overdose prevention plan covers."
    ],
    [
      "Temporal distribution shape",
      "Consecutive, comparable surveillance observations with unchanged definitions and declared time windows.",
      "Review exact empirical W1 alongside the original series and reporting revisions; do not apply a clinical cutoff.",
      "Use the distribution difference as a question about comparable reporting and access, not as an individual overdose prevention risk.",
      "Audit same-year registry/survey definitions and group composition before using the W1 comparison in overdose prevention resource planning."
    ],
    [
      "Local density / access symmetry",
      "Geocoded prevention, harm-reduction and treatment referral services, population denominators and defined comparable catchments.",
      "Estimate service/need density within comparable catchments, with suppression for small counts.",
      "Ask whether rural, remote and underserved communities have comparable access to prevention, harm-reduction and treatment referral services.",
      "Inventory prevention, harm-reduction and treatment referral services and catchment denominators; assess density contrasts before choosing outreach locations."
    ],
    [
      "Service contiguity",
      "Verified adjacency and functioning connections among prevention, harm-reduction and treatment referral services; dated coverage.",
      "Define adjacency explicitly; distinguish disconnected service coverage from missing records.",
      "Check the official local service directory rather than inferring access from a country rank.",
      "Validate catchment connectivity and identify an accountable alternate service pathway for a disconnected area."
    ],
    [
      "Repeated-surveillance direction",
      "Aligned repeated observations, reporting-lag information and an exact reference interval.",
      "Verify interval alignment and revisions; direction is a descriptive proxy, not proof of sustained local transmission or harm.",
      "Read the year next to overdose prevention figures and ask for newer local evidence before treating them as current.",
      "Reconcile country and reference vintages; seek repeated local measurements before escalating any persistent-service-gap claim."
    ],
    [
      "National / jurisdiction direction sensitivity",
      "Same pathogen/drug definition, units and exact endpoint periods for national and at least two reporting jurisdictions; report missing pairs and coverage.",
      "Check direction agreement on the paired reporting subset and its source/sample composition. Missing coverage cannot establish stable local or national conditions.",
      "Read the exact dates and reporting coverage; national direction can differ from participating jurisdictions and does not establish your local or personal risk.",
      "Reconcile the same-period jurisdiction and national definitions, source revisions and reporting/site composition. Obtain local surveillance before any authority-reviewed operational escalation."
    ],
    [
      "Model / missingness review",
      "A specified overdose prevention observation and uncertainty model, missingness assumptions, validation data and objective.",
      "Document ascertainment and model assumptions; fit and validate an explicit objective before reporting variational free energy.",
      "Ask which overdose prevention values are reported, estimated or missing before interpreting model-based contrasts.",
      "Assign an analyst to review overdose prevention measurement uncertainty and missingness; do not invent a VFE score from a rate."
    ],
    [
      "Shared-exposure gradient",
      "Observed separately measured fatal/nonfatal overdose and service-access signals across a defined dose/distance range and aligned overdose prevention outcomes.",
      "Prespecify the exposure range and weighting; test confounding and measurement error before integrating an AUC.",
      "Use current official overdose prevention guidance; the national average does not identify a shared exposure for a household.",
      "Collect privacy-protected separately measured fatal/nonfatal overdose and service-access signals measurements with public-health oversight; assess an exposure gradient before any local intervention inference."
    ],
    [
      "Access frontier / buffer",
      "A defined prevention and treatment access boundary, travel-time or distance surface, age/sex and jurisdiction-specific populations weights and service availability.",
      "Evaluate coverage across a justified distance/time range; report excluded populations and inaccessible routes.",
      "Confirm a usable local contact or service alternative with the official authority; do not infer a safe buffer from this mapless atlas.",
      "Map prevention and treatment access boundary with current service availability and plan a reviewed alternate access route; keep sensitive locations out of public exports."
    ],
    [
      "Cross-boundary dependence",
      "Observed, aggregated aggregated cross-jurisdiction service referrals with direction, period, units and coverage; privacy safeguards.",
      "Separate actual transfers from correlation; audit boundaries and avoid summing overlapping groups.",
      "Ask who coordinates overdose prevention services across administrative boundaries; no transfer route is inferred here.",
      "Verify aggregated cross-jurisdiction service referrals with responsible partners and nominate a handoff owner before treating any area as a source or sink."
    ]
  ]
};
  var names = ['Population Balance','Wasserstein Shape Imbalance','Density Symmetry','Euler Contiguity','Persistence Gap','Spatial Mixing / Scale Stability','Variational Free Energy','Contamination AUC','Frontier Risk / Buffer Depth AUC','Mobility Network Leakage'];
  function finite(v) { return typeof v === 'number' && Number.isFinite(v); }
  function round(v) { return finite(v) ? Number(v.toPrecision(6)) : null; }
  function fact(id,label,value,unit,date,source,quality,basis,note,checked) {
    return { id:id,label:label,value:value,unit:unit || '',measuredAt:date || null,checkedAt:checked || null,source:source || cfg.source,
      quality:value == null ? 'missing' : quality || 'historical',basis:basis || 'modeled',note:note || '' };
  }
  // Shared exact empirical CDF distance; no approximation or extra dependency.
  function w1(a,b) { return ConsoleResponse.math.wasserstein1(a,b); }
  function assess(number,label,status,ids,rule,explanation) { return {metricId:number,id:'dimension-'+number,label:label,status:status,evidenceIds:ids,rule:rule,explanation:explanation,scope:'planning'}; }
  function plan(context,evidence,overrides) {
    evidence=evidence.slice();
    evidence.push(fact('reference-scope','Scope of this planning review',cfg.scope,'',null,cfg.source,'historical','interpretive','Official resources support review and handoff, not a validated transfer of all ten CRT parameters.','2026-10-23'));
    var diagnostics=cfg.lenses.map(function(l,i) {
      var d=Object.assign(assess(i+1,l[0],'unknown',['reference-scope'],'Not assessable from this console’s supplied inputs.',cfg.gap),overrides && overrides[i+1] || {});
      d.requiredInputs=l[1]; d.analyticalMitigation=l[2]; d.operationalMitigation=l[4]; return d;
    });
    var actions=[];
    diagnostics.forEach(function(d,i) {
      var l=cfg.lenses[i];
      ['public','operator'].forEach(function(track) {
        // Keep an unknown path even if the core later invalidates stale dependencies.
        var supported=d.evidenceIds.length && d.evidenceIds.every(function(id){var f=evidence.find(function(fact){return fact.id===id;});return f && f.value!=null && ['current','historical'].includes(f.quality);});
        var conditions=['unknown','triggered'];if(d.status==='clear' && supported)conditions.push('always');
        conditions.forEach(function(when) {
          var unknown=when==='unknown';
          actions.push({id:track+'-dimension-'+(i+1)+'-'+when,track:track,phase:unknown?'verify':when==='triggered'?'prepare':'review',when:when,diagnosticIds:[d.id],
            title:'#'+(i+1)+' '+names[i]+': '+l[0],
            nextStep:(unknown?'Evidence needed. ':when==='triggered'?'Planning review condition met. ':'Baseline review. ')+(track==='public'?l[3]:l[4])+(unknown?' Required inputs: '+l[1]:''),
            escalateWhen:cfg.escalate,authorityUrl:cfg.authority});
        });
      });
    });
    return {slug:cfg.slug,title:'Ten-dimension action checklist · '+cfg.title,context:context,evidence:evidence,diagnostics:diagnostics,actions:actions,
      limitations:[cfg.scope,cfg.limit,'All ten dimensions are review lenses. A domain proxy is labeled explicitly; unavailable inputs never become an all-clear. No fitted CRT causal effect, validated clinical score or intervention benefit is estimated.']};
  }

  function freshness(date,days) { var t=Date.parse(date); return Number.isFinite(t) && t<=Date.now() && Date.now()-t<=days*86400000?'current':'stale'; }
  function focus(options) {
    var el=document.getElementById('response-public-focus'); if(el)return el;
    var host=document.querySelector('header') || document.body, label=document.createElement('label');
    label.textContent='Public planning focus (not personal information): '; label.style.display='block'; label.style.marginTop='12px';
    el=document.createElement('select');el.id='response-public-focus';
    options.forEach(function(o){var option=document.createElement('option');option.value=o[0];option.textContent=o[1];el.appendChild(option);});label.appendChild(el);host.appendChild(label);return el;
  }

  var chooser=focus([['total','All-drug overdoses'],['syn','Synthetic opioids excluding methadone'],['psy','Psychostimulants'],['coc','Cocaine'],['her','Heroin'],['rx','Natural / semisynthetic opioids'],['opi','All opioids']]);
  function read() {
    var snap=typeof SNAP==='object' && SNAP || {}, key=chooser.value, periods=snap.periods || [], vals=snap.nat && snap.nat[key] || [];
    var pairs=periods.map(function(p,i){return [p,vals[i]];}).filter(function(p){return /^\d{4}-(0[1-9]|1[0-2])$/.test(p[0]) && finite(p[1]) && p[1]>=0;}).sort(function(a,b){return a[0].localeCompare(b[0]);});
    var last=pairs[pairs.length-1], period=last && last[0], end=period?new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5,7)),0)).toISOString():null;
    var q=end?freshness(end,240):'missing', checked=snap.responseCheckedAt || snap.embedded || null, label=chooser.selectedOptions[0].textContent;
    var evidence=[fact('selected-total','Predicted 12-month overdose deaths · '+label,last?last[1]:null,'deaths in rolling 12 months ending',period,cfg.source,q,'modeled','Lag-adjusted provisional estimate, not a current-month count. Drug classes overlap and must not be summed. A >240-day display-age guard marks this planning evidence stale; it is not a CDC alert threshold.',checked)];
    var prevPeriod=period?(Number(period.slice(0,4))-1)+period.slice(4):'', prev=pairs.find(function(p){return p[0]===prevPeriod;}), change=last && prev && prev[1]>0?100*(last[1]/prev[1]-1):null;
    evidence.push(fact('year-change','Same ending-month year-on-year change',round(change),'%',period,cfg.source,q,'interpretive','Compares two 12-month totals ending one year apart. Preliminary estimates can be revised; no short-term incident or intervention effect is inferred.',checked));
    var ov={5:assess(5,'Year-on-year rolling-burden change (temporal proxy)',change==null?'unknown':change>0?'triggered':'clear',['selected-total','year-change'],'A positive change prompts a planning/data-quality review; nonpositive does not establish safety.','Exact ending-month alignment is required. This is not topological persistence, statistical significance or a local outbreak test.')};
    var tail=pairs.slice(-12), contiguous=tail.length===12 && tail.every(function(p,i){if(!i)return true;var a=tail[i-1][0].split('-').map(Number),b=p[0].split('-').map(Number);return b[0]*12+b[1]===a[0]*12+a[1]+1;}), shape=contiguous?w1(tail.slice(0,6).map(function(p){return p[1];}),tail.slice(6).map(function(p){return p[1];})):null;
    evidence.push(fact('shape-w1','Temporal empirical W1 · previous six versus latest six monthly rolling totals',round(shape),'deaths in rolling 12-month totals',period,cfg.source,q,'interpretive','The windows contain serially overlapping 12-month totals, not independent observations or different populations. An empirical descriptive shape comparison only.',checked));
    ov[2]=assess(2,'Six-versus-six rolling-total distribution W1 (temporal adaptation)',shape==null?'unknown':shape>1e-10?'triggered':'clear',['selected-total','shape-w1'],'A nonzero W1 prompts review of changing burden and reporting; twelve consecutive monthly estimates are required.','The metric has no clinical cutoff, independent-sample significance or CRT arm interpretation.');
    var stateRows={};if(['total','syn'].includes(key))(snap.stateHistoryExpectedJurisdictions || []).forEach(function(code){stateRows[code]=[];});if(['total','syn'].includes(key))Object.entries(snap.stateMonthly || {}).forEach(function(entry){if(entry[1] && entry[1][key])stateRows[entry[0]]=entry[1][key];});
    var scale=typeof HealthPublicData==='object' && HealthPublicData.directionAgreement?HealthPublicData.directionAgreement(pairs,stateRows,prevPeriod,period):null;
    var scaleNote='Exactly matched rolling-12-month ending periods '+prevPeriod+' and '+(period || 'unavailable')+' for '+label+'. '+(scale?'Paired '+scale.paired+' of '+scale.observed+' downloaded jurisdictions; missing pairs: '+(scale.missing.join(', ')||'none within downloaded coverage')+'. National predicted counts '+scale.nationalStart+'→'+scale.nationalEnd+'. ':'State history is downloaded for all-drug totals and synthetic opioids only. ')+'Jurisdictions are compared separately, never summed; New York excludes NYC and YC is New York City. This is unweighted jurisdiction-direction sensitivity, not a resident-weighted rate, a current-month incident, causal spillover or a complete population coverage claim. Retained display-only latest counts do not replace missing source-history endpoints. '+(scale?scale.rows.map(function(r){return r.id+': '+r.start+'→'+r.end;}).join('; '):'');
    evidence.push(fact('scale-coverage','Matched-period jurisdiction reporting coverage',scale?scale.paired:null,'paired jurisdictions of '+(scale?scale.observed:'unknown')+' downloaded',period,cfg.source,q,'interpretive',scaleNote,checked));
    evidence.push(fact('scale-disagreement','Jurisdiction versus national year-on-year direction disagreement',scale?round(100*scale.disagreementShare):null,'% of paired reporting jurisdictions',period,cfg.source,q,'interpretive',scaleNote,checked));
    ov[6]=Object.assign(assess(6,'Matched-period national/jurisdiction direction sensitivity (scale proxy)',scale?(scale.disagree?'triggered':scale.missing.length?'unknown':'clear'):'unknown',['selected-total','scale-coverage','scale-disagreement'],'Any observed direction disagreement prompts review of spatial aggregation and reporting. Missing exact-period pairs cannot establish agreement; no disagreement only describes the paired subset, not a national or local all-clear.','Compare the same drug definition and exact rolling-year ending months. No cross-jurisdiction transmission, population weighting or intervention effect is inferred.'),{value:scale?round(100*scale.disagreementShare):null,unit:'% paired jurisdictions with different direction'});
    var reported=snap.rep&&snap.rep[key],reportedPeriod=snap.reportedPeriods&&snap.reportedPeriods[key],reportedKnown=finite(reported)&&reported>=0&&/^\d{4}-(0[1-9]|1[0-2])$/.test(reportedPeriod||'');
    evidence.push(fact('reported-total','Provisional reported 12-month overdose deaths · '+label,reportedKnown?reported:null,'reported deaths in rolling 12 months',reportedKnown?reportedPeriod:null,cfg.source,reportedKnown?freshness(new Date(Date.UTC(+reportedPeriod.slice(0,4),+reportedPeriod.slice(5,7),0)).toISOString(),240):'missing','measured','Reported counts are distinct from lag-adjusted predicted estimates and may have a different ending month. They are not summed or subtracted as an estimate of unobserved deaths.',checked));
    var records=[];
    if(['total','syn'].includes(key))Object.entries(snap.states||{}).forEach(function(entry){var code=entry[0],state=entry[1],points=snap.stateMonthly&&snap.stateMonthly[code]&&snap.stateMonthly[code][key]||[],point=points.find(function(p){return p[0]===period&&finite(p[1])&&p[1]>=0;}),id='impact-jurisdiction-'+code;
      evidence.push(fact(id,(state.name||code)+' · '+label+' predicted deaths',point?point[1]:null,'predicted deaths in rolling 12 months',period,cfg.source,q,'modeled','Exact national ending month only. Retained display-only observations are not substituted for missing source history. New York state excludes NYC; YC is New York City. Drug categories overlap.',checked));
      records.push({id:code,label:state.name||code,kind:'context',evidenceIds:[id],summary:point?period+' ending 12 months · '+point[1]+' predicted deaths; provisional and revisable.':'No applicable '+period+' source-history report; retained older display values are not current-period evidence.'});
    });
    var output=plan('United States · '+label+' · '+(period || 'period unavailable')+' ending-month provisional surveillance · planning only',evidence,ov);
    output.impacts={title:'Published overdose burden and jurisdiction records',scope:'United States · '+label+' · rolling 12-month periods',summary:'Published reported counts and CDC lag-adjusted predicted counts remain distinct. These are provisional surveillance estimates, not forecasts of future deaths.',items:[
      {id:'predicted-burden',label:'Lag-adjusted predicted overdose deaths',value:last?last[1]:null,unit:'deaths in rolling 12 months',kind:'context',evidenceIds:['selected-total'],method:'Use the published predicted estimate for its stated ending month.',note:'Predicted here adjusts incomplete reporting of past deaths; it does not forecast a future period.'},
      {id:'reported-burden',label:'Provisional reported overdose deaths',value:reportedKnown?reported:null,unit:'deaths in rolling 12 months',kind:'context',evidenceIds:['reported-total'],method:'Use the separately reported total and its own ending month.',note:'Do not subtract from a differently dated prediction or sum overlapping drug classes.'},
      {id:'future-deaths',label:'Future deaths or deaths prevented by an intervention',value:null,unit:'deaths',kind:'context',evidenceIds:['selected-total'],method:'No future risk or counterfactual intervention model is fitted.',note:'Surveillance trends do not estimate the benefit of a particular intervention.'}
    ],records:records,limitations:['Rolling annual counts overlap across successive months; monthly points are not summed.','Jurisdiction records require exact national ending-month alignment; missing records remain unknown.','Drug categories overlap, jurisdiction boundaries differ and provisional values can be revised; no causal source, current incident or personal prognosis is inferred.']};return output;
  }
  ConsoleResponse.connect(read,['#response-public-focus','#srcchip','#vintchip','#natv','#waves','#states']);


})();
