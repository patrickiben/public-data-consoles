// Maintainer adapter: public evidence only; no private questionnaire values.
(function () {
  'use strict';
  var cfg = {
  "slug": "global-immunization",
  "title": "Immunization coverage",
  "source": "https://data.worldbank.org/",
  "authority": "https://www.who.int/health-topics/vaccines-and-immunization",
  "scope": "Annual country indicators support structural planning only; no current local incident, individual prognosis or treatment choice is inferred.",
  "gap": "This country atlas has no verified local catchment geography, exposure gradients, service graph or fitted probabilistic objective.",
  "escalate": "Refer discrepant definitions, missing populations or an unverified service plan to the responsible public-health/data lead. For a present health concern, use a qualified local service and current official guidance; do not wait for an annual indicator.",
  "limit": "Country averages, unequal observation years and selected-country coverage limit comparison. Income groups are declared comparison strata, not causal treatment arms. A national coverage percentage does not establish individual immunity, full-dose completion or a local outbreak.",
  "lenses": [
    [
      "Population / need balance",
      "Aligned vaccine/dose-specific eligible cohorts denominators and immunization programme needs by subgroup; sampling weights.",
      "Compare need-weighted coverage after checking age, sex, ascertainment and denominators.",
      "Ask the public-health service which vaccine/dose-specific eligible cohorts groups are absent from the country average.",
      "Obtain disaggregated vaccine/dose-specific eligible cohorts denominators and document which needs/service groups a immunization programme plan covers."
    ],
    [
      "Same-year country-distribution shape",
      "The selected indicator, same-year country values and declared income-group membership; sufficient observations in both groups.",
      "Review the empirical W1 with units and group sizes; check ascertainment and report excluded countries.",
      "Use the distribution difference as a question about comparable reporting and access, not as an individual immunization programme risk.",
      "Audit same-year registry/survey definitions and group composition before using the W1 comparison in immunization programme resource planning."
    ],
    [
      "Local density / access symmetry",
      "Geocoded routine immunization services, population denominators and defined comparable catchments.",
      "Estimate service/need density within comparable catchments, with suppression for small counts.",
      "Ask whether rural, remote and underserved communities have comparable access to routine immunization services.",
      "Inventory routine immunization services and catchment denominators; assess density contrasts before choosing outreach locations."
    ],
    [
      "Service contiguity",
      "Verified adjacency and functioning connections among routine immunization services; dated coverage.",
      "Define adjacency explicitly; distinguish disconnected service coverage from missing records.",
      "Check the official local service directory rather than inferring access from a country rank.",
      "Validate catchment connectivity and identify an accountable alternate service pathway for a disconnected area."
    ],
    [
      "Measurement-vintage alignment proxy",
      "Selected country year and latest world indicator year; repeated local measurements for actual persistence analysis.",
      "Align observation years first. A year gap is a comparability proxy, not persistent homology or proof a condition persisted.",
      "Read the year next to immunization programme figures and ask for newer local evidence before treating them as current.",
      "Reconcile country and reference vintages; seek repeated local measurements before escalating any persistent-service-gap claim."
    ],
    [
      "Reference-group sensitivity proxy",
      "Same-year selected value, world and income-group aggregates; subnational geographies for true spatial scale checks.",
      "Compare the direction of the selected-value gap using world versus income-group reference; then obtain subnational sensitivity analysis.",
      "Check whether the comparison changes with the reference group; a country mean does not describe every community.",
      "Review world/income-reference sensitivity and repeat immunization programme assessment across defensible local aggregation scales."
    ],
    [
      "Model / missingness review",
      "A specified immunization programme observation and uncertainty model, missingness assumptions, validation data and objective.",
      "Document ascertainment and model assumptions; fit and validate an explicit objective before reporting variational free energy.",
      "Ask which immunization programme values are reported, estimated or missing before interpreting model-based contrasts.",
      "Assign an analyst to review immunization programme measurement uncertainty and missingness; do not invent a VFE score from a rate."
    ],
    [
      "Shared-exposure gradient",
      "Observed documented vaccine/dose coverage and exposure measures across a defined dose/distance range and aligned immunization programme outcomes.",
      "Prespecify the exposure range and weighting; test confounding and measurement error before integrating an AUC.",
      "Use current official immunization programme guidance; the national average does not identify a shared exposure for a household.",
      "Collect privacy-protected documented vaccine/dose coverage and exposure measures measurements with public-health oversight; assess an exposure gradient before any local intervention inference."
    ],
    [
      "Access frontier / buffer",
      "A defined routine immunization access boundary, travel-time or distance surface, vaccine/dose-specific eligible cohorts weights and service availability.",
      "Evaluate coverage across a justified distance/time range; report excluded populations and inaccessible routes.",
      "Confirm a usable local contact or service alternative with the official authority; do not infer a safe buffer from this mapless atlas.",
      "Map routine immunization access boundary with current service availability and plan a reviewed alternate access route; keep sensitive locations out of public exports."
    ],
    [
      "Cross-boundary dependence",
      "Observed, aggregated aggregated catchment and programme referrals with direction, period, units and coverage; privacy safeguards.",
      "Separate actual transfers from correlation; audit boundaries and avoid summing overlapping groups.",
      "Ask who coordinates immunization programme services across administrative boundaries; no transfer route is inferred here.",
      "Verify aggregated catchment and programme referrals with responsible partners and nominate a handoff owner before treating any area as a source or sink."
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

  function read() {
    var snap=typeof SNAP==='object' && SNAP || {}, key=typeof CMPK==='string'?CMPK:'', select=document.getElementById('cysel'), iso=select && select.value;
    var country=snap.cty && snap.cty[iso], meta=snap.indMeta && snap.indMeta[key], latest=country && country.latest && country.latest[key];
    var years=snap.years || [], year=latest && String(latest.y), valid=!!meta && !!latest && finite(latest.v) && /^\d{4}$/.test(year) && Number(year)<=new Date().getUTCFullYear();
    var checked=snap.responseCheckedAt || snap.embedded || null;
    var src=meta && meta.ind?'https://data.worldbank.org/indicator/'+encodeURIComponent(meta.ind):cfg.source;
    var evidence=[fact('selected-value',(country?country.name:'Country unavailable')+' · '+(meta?meta.name:'Indicator unavailable'),valid?latest.v:null,meta && meta.unit,valid?year:null,src,'historical','modeled','Published country-level indicator; reported and modeled components vary by source. Not individual risk.',checked)];
    var ov={}, all=Object.values(snap.cty || {}), known=['HIC','UMC','LMC','LIC'];
    var rows=valid?all.filter(function(c){var p=c.latest && c.latest[key];return p && finite(p.v) && String(p.y)===year && known.includes(c.income);}):[];
    var group=country && country.income, a=rows.filter(function(c){return c.income===group;}).map(function(c){return c.latest[key].v;}), b=rows.filter(function(c){return c.income!==group;}).map(function(c){return c.latest[key].v;});
    var shape=known.includes(group) && a.length>=2 && b.length>=2?w1(a,b):null;
    evidence.push(fact('shape-w1','Equal-country empirical W1 · '+(country && country.incomeName || 'selected income group')+' (n='+a.length+') vs other known-income displayed countries (n='+b.length+')',round(shape),meta && meta.unit,valid?year:null,src,'historical','interpretive','Only selected-year values and displayed countries enter; no imputation, population weights, risk threshold or causal estimand. Unknown-income countries excluded; displayed income classifications need not match the historical observation-year classification.',checked));
    ov[2]=assess(2,'Same-year income-group distribution W1',shape==null?'unknown':shape>1e-10?'triggered':'clear',['shape-w1'],'A nonzero descriptive W1 prompts a comparability review; zero means equal empirical distributions only. At least two countries per group.','Selected-country income group versus all other known-income countries in this atlas, each country equally weighted. This is a descriptive adaptation, not a CRT treatment/control comparison or clinical cutoff.');
    var world=snap.agg && snap.agg.WLD && snap.agg.WLD.s && snap.agg.WLD.s[key] || [], lastWorld=-1;
    world.forEach(function(v,i){if(finite(v) && /^\d{4}$/.test(String(years[i])) && Number(years[i])<=new Date().getUTCFullYear() && (lastWorld<0 || Number(years[i])>Number(years[lastWorld])))lastWorld=i;});
    var gap=valid && lastWorld>=0?Math.abs(Number(year)-Number(years[lastWorld])):null;
    evidence.push(fact('year-gap','Country versus latest world measurement-year gap',gap,'years',valid?year:null,src,'historical','interpretive','Temporal comparability proxy; it does not measure persistence of an outcome.',checked));
    ov[5]=assess(5,'Measurement-year alignment gap (proxy)',gap==null?'unknown':gap>0?'triggered':'clear',['selected-value','year-gap'],'Different observation years trigger a vintage review; equal years only establish calendar alignment.','A descriptive planning adaptation of persistence review; no persistent-homology or longitudinal persistence estimate is supplied.');
    var at=years.findIndex(function(y){return String(y)===year;}), inc=snap.agg && snap.agg[group] && snap.agg[group].s && snap.agg[group].s[key] || [];
    var worldV=at>=0 && finite(world[at])?world[at]:null, incomeV=at>=0 && finite(inc[at])?inc[at]:null;
    var sensitive=valid && worldV!=null && incomeV!=null?Math.sign(latest.v-worldV)!==Math.sign(latest.v-incomeV):null;
    evidence.push(fact('world-reference','World reference in selected country year',worldV,meta && meta.unit,valid?year:null,src,'historical','modeled','Only the identical indicator/year is used.',checked));
    evidence.push(fact('income-reference','Income-group reference in selected country year',incomeV,meta && meta.unit,valid?year:null,src,'historical','modeled','Published aggregate; may use different weights from the equal-country W1.',checked));
    ov[6]=assess(6,'World / income-reference direction sensitivity (proxy)',sensitive==null?'unknown':sensitive?'triggered':'clear',['selected-value','world-reference','income-reference'],'Review when the selected-value gap changes sign using world versus income-group reference.','Reference-group sensitivity is not geographic mixing or within-country scale stability; no higher/lower value is automatically labeled good or bad.');
    return plan((country?country.name:'No country selected')+' · '+(meta?meta.name:'No indicator selected')+' · '+(valid?year:'measurement unavailable')+' · annual structural planning',evidence,ov);
  }
  ConsoleResponse.connect(read,['#profcards','#profmeta','#cmpbars','#cysel','#cmpind','#srcchip','#vintchip']);

})();
