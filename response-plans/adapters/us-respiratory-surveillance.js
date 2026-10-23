// Maintainer adapter: public evidence only; no private questionnaire values.
(function () {
  'use strict';
  var cfg = {
  "slug": "us-respiratory-surveillance",
  "title": "Respiratory surveillance",
  "source": "https://data.cdc.gov/resource/vutn-jzwm.json",
  "authority": "https://www.cdc.gov/respiratory-viruses/prevention/index.html",
  "scope": "National surveillance supports verification and preparedness review, not a diagnosis, individual risk prediction or an automatic local incident declaration.",
  "gap": "No verified local catchment graph, person-level exposures or fitted CRT probability model is supplied.",
  "escalate": "Escalate stale, revised or discordant surveillance to the public-health/data lead. Current symptoms or immediate safety concerns require appropriate local care or emergency services, irrespective of this national trend. Professional operators must use current healthcare-specific guidance and their own SOP.",
  "limit": "Incomplete, lagged or preliminary reporting can change estimates. Do not add overlapping drug classes, different viruses or different surveillance measures.",
  "lenses": [
    [
      "Population / need balance",
      "Aligned age/sex and surveillance-participating populations denominators and respiratory preparedness needs by subgroup; sampling weights.",
      "Compare need-weighted coverage after checking age, sex, ascertainment and denominators.",
      "Ask the public-health service which age/sex and surveillance-participating populations groups are absent from the country average.",
      "Obtain disaggregated age/sex and surveillance-participating populations denominators and document which needs/service groups a respiratory preparedness plan covers."
    ],
    [
      "Temporal distribution shape",
      "Consecutive, comparable surveillance observations with unchanged definitions and declared time windows.",
      "Review exact empirical W1 alongside the original series and reporting revisions; do not apply a clinical cutoff.",
      "Use the distribution difference as a question about comparable reporting and access, not as an individual respiratory preparedness risk.",
      "Audit same-year registry/survey definitions and group composition before using the W1 comparison in respiratory preparedness resource planning."
    ],
    [
      "Local density / access symmetry",
      "Geocoded public-health surveillance, cleaner-air and care services, population denominators and defined comparable catchments.",
      "Estimate service/need density within comparable catchments, with suppression for small counts.",
      "Ask whether rural, remote and underserved communities have comparable access to public-health surveillance, cleaner-air and care services.",
      "Inventory public-health surveillance, cleaner-air and care services and catchment denominators; assess density contrasts before choosing outreach locations."
    ],
    [
      "Service contiguity",
      "Verified adjacency and functioning connections among public-health surveillance, cleaner-air and care services; dated coverage.",
      "Define adjacency explicitly; distinguish disconnected service coverage from missing records.",
      "Check the official local service directory rather than inferring access from a country rank.",
      "Validate catchment connectivity and identify an accountable alternate service pathway for a disconnected area."
    ],
    [
      "Repeated-surveillance direction",
      "Aligned repeated observations, reporting-lag information and an exact reference interval.",
      "Verify interval alignment and revisions; direction is a descriptive proxy, not proof of sustained local transmission or harm.",
      "Read the year next to respiratory preparedness figures and ask for newer local evidence before treating them as current.",
      "Reconcile country and reference vintages; seek repeated local measurements before escalating any persistent-service-gap claim."
    ],
    [
      "National / local scale stability",
      "Aligned, comparable local and national respiratory preparedness observations with coverage metadata.",
      "Check whether local reporting and population composition support a national-to-local comparison; do not manufacture a spatial mixing value.",
      "Check whether the comparison changes with the reference group; a country mean does not describe every community.",
      "Review world/income-reference sensitivity and repeat respiratory preparedness assessment across defensible local aggregation scales."
    ],
    [
      "Model / missingness review",
      "A specified respiratory preparedness observation and uncertainty model, missingness assumptions, validation data and objective.",
      "Document ascertainment and model assumptions; fit and validate an explicit objective before reporting variational free energy.",
      "Ask which respiratory preparedness values are reported, estimated or missing before interpreting model-based contrasts.",
      "Assign an analyst to review respiratory preparedness measurement uncertainty and missingness; do not invent a VFE score from a rate."
    ],
    [
      "Shared-exposure gradient",
      "Observed virus-specific ED, hospital and wastewater measurements across a defined dose/distance range and aligned respiratory preparedness outcomes.",
      "Prespecify the exposure range and weighting; test confounding and measurement error before integrating an AUC.",
      "Use current official respiratory preparedness guidance; the national average does not identify a shared exposure for a household.",
      "Collect privacy-protected virus-specific ED, hospital and wastewater measurements measurements with public-health oversight; assess an exposure gradient before any local intervention inference."
    ],
    [
      "Access frontier / buffer",
      "A defined surveillance and service access boundary, travel-time or distance surface, age/sex and surveillance-participating populations weights and service availability.",
      "Evaluate coverage across a justified distance/time range; report excluded populations and inaccessible routes.",
      "Confirm a usable local contact or service alternative with the official authority; do not infer a safe buffer from this mapless atlas.",
      "Map surveillance and service access boundary with current service availability and plan a reviewed alternate access route; keep sensitive locations out of public exports."
    ],
    [
      "Cross-boundary dependence",
      "Observed, aggregated privacy-protected aggregate care transfers or mobility with direction, period, units and coverage; privacy safeguards.",
      "Separate actual transfers from correlation; audit boundaries and avoid summing overlapping groups.",
      "Ask who coordinates respiratory preparedness services across administrative boundaries; no transfer route is inferred here.",
      "Verify privacy-protected aggregate care transfers or mobility with responsible partners and nominate a handoff owner before treating any area as a source or sink."
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

  function series(s) {return (Array.isArray(s)?s:[]).filter(function(p){return Array.isArray(p) && /^\d{4}-\d{2}-\d{2}$/.test(p[0]) && Number.isFinite(Date.parse(p[0]+'T00:00:00Z')) && new Date(p[0]+'T00:00:00Z').toISOString().slice(0,10)===p[0] && finite(p[1]) && p[1]>=0;}).slice().sort(function(a,b){return a[0].localeCompare(b[0]);});}
  function read() {
    var snap=typeof SNAP==='object' && SNAP || {}, key=typeof GLSEL==='string'?GLSEL:'flu', label={flu:'Influenza',covid:'COVID-19',rsv:'RSV'}[key] || key;
    var ed=series(snap.nssp && snap.nssp[key]), hosp=series(snap.resp && snap.resp[key]), wastewater=series(snap.wval_nat && snap.wval_nat[key]);
    var last=ed[ed.length-1], h=hosp[hosp.length-1], w=wastewater[wastewater.length-1], checked=snap.responseCheckedAt || snap.embedded || null;
    var q=last?freshness(last[0]+'T00:00:00Z',35):'missing';
    var evidence=[fact('ed','Emergency-department visits associated with '+label,last?last[1]:null,'%',last && last[0],cfg.source,q,'measured','Syndromic surveillance share; not an individual infection probability. Last weeks may be preliminary. A >35-day display-age guard marks evidence stale, not a CDC clinical threshold.',checked),
      fact('hospital','Hospitalization rate · '+label,h?h[1]:null,'per 100,000',h && h[0],'https://data.cdc.gov/resource/kvib-3txy.json',h?freshness(h[0]+'T00:00:00Z',35):'missing','measured','Different surveillance population and reporting period from ED visits; not added to ED shares.',checked),
      fact('wastewater','Unweighted derived site-category mean · '+label,w?w[1]:null,'ordinal activity category 1–5',w && w[0],'https://data.cdc.gov/resource/atcp-73re.json',w?freshness(w[0]+'T00:00:00Z',35):'missing','interpretive','Unweighted mean of ordinal reporting-site categories, not an official CDC national WVAL or a population-weighted concentration. Site coverage varies; this is not averaged with ED or hospitalization values.',checked)];
    var target=last?new Date(Date.parse(last[0]+'T00:00:00Z')-28*86400000).toISOString().slice(0,10):'', prev=ed.find(function(p){return p[0]===target;}), delta=last && prev?last[1]-prev[1]:null;
    evidence.push(fact('four-week-change','ED share change versus exactly four weeks earlier',round(delta),'percentage points',last && last[0],cfg.source,q,'interpretive','A descriptive direction check with no validated operational cutoff; revisions, composition and co-circulation matter.',checked));
    var ov={5:assess(5,'Four-week ED direction (temporal persistence proxy)',delta==null?'unknown':delta>0?'triggered':'clear',['ed','four-week-change'],'A positive four-week change prompts verification and preparedness review; flat/decreasing does not establish safety.','National weekly direction is not local persistence, individual risk or an automatic clinical operation.')};
    var tail=ed.slice(-8), contiguous=tail.length===8 && tail.every(function(p,i){return !i || Date.parse(p[0]+'T00:00:00Z')-Date.parse(tail[i-1][0]+'T00:00:00Z')===7*86400000;}), shape=contiguous?w1(tail.slice(0,4).map(function(p){return p[1];}),tail.slice(4).map(function(p){return p[1];})):null;
    evidence.push(fact('shape-w1','ED-share empirical W1 · previous four versus latest four weeks',round(shape),'percentage points',last && last[0],cfg.source,q,'interpretive','Equal weight per week in two declared time windows; not independent treatment groups. Requires eight consecutive weeks.',checked));
    ov[2]=assess(2,'Four-versus-four weekly ED distribution W1 (temporal adaptation)',shape==null?'unknown':shape>1e-10?'triggered':'clear',['ed','shape-w1'],'A nonzero descriptive W1 prompts source and trend review, with no risk or clinical cutoff.','This compares ED-share distributions in consecutive windows, not CRT arms or patient-level disease severity.');
    return plan('United States · '+label+' selected in “At a glance” · ED week '+(last?last[0]:'unavailable')+' · national surveillance planning',evidence,ov);
  }
  ConsoleResponse.connect(read,['#glsel','#glchart','#glv','#gls','#hosps','#wwstats','#srcchip']);


})();
