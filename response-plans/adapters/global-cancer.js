// Maintainer adapter: public evidence only; no private questionnaire values.
(function () {
  'use strict';
  var cfg = {
  "slug": "global-cancer",
  "title": "Cancer burden",
  "source": "https://gco.iarc.fr/",
  "authority": "https://www.who.int/health-topics/cancer",
  "scope": "Periodic modeled global estimates support structural planning and questions for responsible programmes; no current local incident is inferred.",
  "gap": "This static exhibit supplies headline burden estimates, not the disaggregated populations, geography, repeated local observations or fitted models needed to score this dimension.",
  "escalate": "Ask the responsible registry/programme lead to review incompatible definitions, missing populations or a proposed service plan. Individual diagnosis, screening, treatment and medication decisions require a qualified clinician and current national guidance.",
  "limit": "IARC GLOBOCAN 2022 modeled incidence. Deaths and new cases are different populations; no case-fatality or survival ratio is inferred.",
  "lenses": [
    [
      "Population / need balance",
      "Aligned age/sex, cancer-site and eligible populations denominators and cancer-service planning needs by subgroup; sampling weights.",
      "Compare need-weighted coverage after checking age, sex, ascertainment and denominators.",
      "Ask the public-health service which age/sex, cancer-site and eligible populations groups are absent from the country average.",
      "Obtain disaggregated age/sex, cancer-site and eligible populations denominators and document which needs/service groups a cancer-service planning plan covers."
    ],
    [
      "Comparable burden-distribution review",
      "Disease-specific distributions with identical denominators, population coverage, definition and year in declared groups.",
      "Obtain comparable disaggregated burden distributions before computing W1; heterogeneous headline counts cannot supply a shape comparison.",
      "Use the distribution difference as a question about comparable reporting and access, not as an individual cancer-service planning risk.",
      "Audit same-year registry/survey definitions and group composition before using the W1 comparison in cancer-service planning resource planning."
    ],
    [
      "Local density / access symmetry",
      "Geocoded cancer diagnosis, registry and referral services, population denominators and defined comparable catchments.",
      "Estimate service/need density within comparable catchments, with suppression for small counts.",
      "Ask whether rural, remote and underserved communities have comparable access to cancer diagnosis, registry and referral services.",
      "Inventory cancer diagnosis, registry and referral services and catchment denominators; assess density contrasts before choosing outreach locations."
    ],
    [
      "Service contiguity",
      "Verified adjacency and functioning connections among cancer diagnosis, registry and referral services; dated coverage.",
      "Define adjacency explicitly; distinguish disconnected service coverage from missing records.",
      "Check the official local service directory rather than inferring access from a country rank.",
      "Validate catchment connectivity and identify an accountable alternate service pathway for a disconnected area."
    ],
    [
      "Persistence of a documented programme gap",
      "Repeated disease-specific observations using consistent definitions and uncertainty intervals.",
      "Obtain repeat local programme/registry measurements; a dated global estimate does not establish a persistent current gap.",
      "Read the year next to cancer-service planning figures and ask for newer local evidence before treating them as current.",
      "Reconcile country and reference vintages; seek repeated local measurements before escalating any persistent-service-gap claim."
    ],
    [
      "Geographic scale / registry coverage",
      "Comparable country and local programme/registry estimates, boundaries and completeness.",
      "Assess uncertainty and registry/survey completeness across scales before interpreting a local burden difference.",
      "Check whether the comparison changes with the reference group; a country mean does not describe every community.",
      "Review world/income-reference sensitivity and repeat cancer-service planning assessment across defensible local aggregation scales."
    ],
    [
      "Model / missingness review",
      "A specified cancer-service planning observation and uncertainty model, missingness assumptions, validation data and objective.",
      "Document ascertainment and model assumptions; fit and validate an explicit objective before reporting variational free energy.",
      "Ask which cancer-service planning values are reported, estimated or missing before interpreting model-based contrasts.",
      "Assign an analyst to review cancer-service planning measurement uncertainty and missingness; do not invent a VFE score from a rate."
    ],
    [
      "Shared-exposure gradient",
      "Observed site-specific risk-factor and diagnostic-access measures across a defined dose/distance range and aligned cancer-service planning outcomes.",
      "Prespecify the exposure range and weighting; test confounding and measurement error before integrating an AUC.",
      "Use current official cancer-service planning guidance; the national average does not identify a shared exposure for a household.",
      "Collect privacy-protected site-specific risk-factor and diagnostic-access measures measurements with public-health oversight; assess an exposure gradient before any local intervention inference."
    ],
    [
      "Access frontier / buffer",
      "A defined diagnostic and treatment service access boundary, travel-time or distance surface, age/sex, cancer-site and eligible populations weights and service availability.",
      "Evaluate coverage across a justified distance/time range; report excluded populations and inaccessible routes.",
      "Confirm a usable local contact or service alternative with the official authority; do not infer a safe buffer from this mapless atlas.",
      "Map diagnostic and treatment service access boundary with current service availability and plan a reviewed alternate access route; keep sensitive locations out of public exports."
    ],
    [
      "Cross-boundary dependence",
      "Observed, aggregated aggregated cancer referrals with direction, period, units and coverage; privacy safeguards.",
      "Separate actual transfers from correlation; audit boundaries and avoid summing overlapping groups.",
      "Ask who coordinates cancer-service planning services across administrative boundaries; no transfer route is inferred here.",
      "Verify aggregated cancer referrals with responsible partners and nominate a handoff owner before treating any area as a source or sink."
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

  var rows=INC, host=document.querySelector('header') || document.body, label=document.createElement('label'), chooser=document.createElement('select');
  label.textContent='Public planning focus (published estimates): ';label.style.display='block';label.style.marginTop='12px';chooser.id='response-public-focus';
  rows.forEach(function(row,i){var option=document.createElement('option');option.value=String(i);option.textContent=String(row[0]).replace(/<[^>]*>/g,'');chooser.appendChild(option);});label.appendChild(chooser);host.appendChild(label);
  function read() {
    var row=rows[Number(chooser.value)] || rows[0], name=row && String(row[0]).replace(/<[^>]*>/g,''), value=row && finite(row[1])?row[1]:null;
    var evidence=[fact('published-estimate',name || 'Published focus unavailable',value,"new cases / year","2022",cfg.source,'historical','modeled',"IARC GLOBOCAN 2022 modeled incidence. Deaths and new cases are different populations; no case-fatality or survival ratio is inferred.",'2026-06-27')];
    var mortality=typeof MORT!=='undefined' && MORT.find(function(r){return r[0]===row[0];});
    evidence.push(fact('published-deaths',name+' · modeled deaths',mortality && finite(mortality[1])?mortality[1]:null,'deaths / year','2022',cfg.source,'historical','modeled','Mortality is not follow-up of the incident cases and must not be divided by incidence to claim survival.','2026-06-27'));
    var records=[];
    rows.forEach(function(site,i){var id='cancer-site-'+i,m=typeof MORT!=='undefined'&&MORT.find(function(r){return r[0]===site[0];}),label=String(site[0]).replace(/<[^>]*>/g,'');evidence.push(fact(id,label+' · modeled incidence',finite(site[1])?site[1]:null,'new cases/year','2022',cfg.source,'historical','modeled','GLOBOCAN modeled source estimate; cancer sites and categories must not be summed into unique people.','2026-06-27'));var ids=[id];if(m&&finite(m[1])){var deathId=id+'-deaths';ids.push(deathId);evidence.push(fact(deathId,label+' · modeled deaths',m[1],'deaths/year','2022',cfg.source,'historical','modeled','Separate mortality estimate, not follow-up of incident cases.','2026-06-27'));}records.push({id:id,label:label,kind:'context',evidenceIds:ids,summary:'2022 · '+site[1]+' modeled new cases'+(m&&finite(m[1])?'; separately '+m[1]+' modeled deaths (not follow-up of these cases)':'')+'. No survival ratio or future benefit is estimated.'});});
    var output=plan((name || 'No public focus')+' · 2022 estimate · structural planning only',evidence,{});
    output.selectionKey=JSON.stringify([cfg.slug,name||null,'modeled annual incidence and separate mortality']);
    output.impacts={title:'Published cancer burden estimates',scope:(name||'No cancer selected')+' · GLOBOCAN 2022',summary:'Source-modeled annual incidence and mortality are distinct quantities. They do not predict an individual outcome or intervention benefit.',items:[{id:'new-cases',label:'Published modeled new cancer cases',value:value,unit:'new cases/year',kind:'context',evidenceIds:['published-estimate'],method:'Use the selected source estimate directly.',note:'Incident cases are not necessarily unique people across sites.'},{id:'deaths',label:'Published modeled cancer deaths',value:mortality&&finite(mortality[1])?mortality[1]:null,unit:'deaths/year',kind:'context',evidenceIds:['published-deaths'],method:'Use the separate mortality estimate; do not divide by incidence.',note:'Mortality is not longitudinal follow-up of this incident cohort.'},{id:'benefit',label:'Deaths avoided or future service demand',value:null,unit:'not estimated',kind:'context',evidenceIds:['published-estimate'],method:'No causal intervention or future-demand model is fitted.',note:'No case-fatality, survival or treatment-benefit estimate is inferred.'}],records:records,limitations:['GLOBOCAN 2022is a dated modeled reference, not a current registry feed.','Different cancer categories and incidence/mortality populations are not summed or divided to estimate survival.']};return output;
  }
  ConsoleResponse.connect(read,['#response-public-focus']);

})();
