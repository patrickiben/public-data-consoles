// Maintainer adapter: public evidence only; no private questionnaire values.
(function () {
  'use strict';
  var cfg = {
  "slug": "antimicrobial-resistance",
  "title": "Antimicrobial resistance",
  "source": "https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(21)02724-0/fulltext",
  "authority": "https://www.who.int/health-topics/antimicrobial-resistance",
  "scope": "Periodic modeled global estimates support structural planning and questions for responsible programmes; no current local incident is inferred.",
  "gap": "This static exhibit supplies headline burden estimates, not the disaggregated populations, geography, repeated local observations or fitted models needed to score this dimension.",
  "escalate": "Ask the responsible registry/programme lead to review incompatible definitions, missing populations or a proposed service plan. Individual diagnosis, screening, treatment and medication decisions require a qualified clinician and current national guidance.",
  "limit": "GRAM 2019 modeled bacterial AMR attributable deaths. Not current hospital susceptibility, a current outbreak or a prescribing guide. Associated and attributable deaths are distinct.",
  "lenses": [
    [
      "Population / need balance",
      "Aligned population, organism and sampled-infection denominators and AMR surveillance and stewardship needs by subgroup; sampling weights.",
      "Compare need-weighted coverage after checking age, sex, ascertainment and denominators.",
      "Ask the public-health service which population, organism and sampled-infection groups are absent from the country average.",
      "Obtain disaggregated population, organism and sampled-infection denominators and document which needs/service groups a AMR surveillance and stewardship plan covers."
    ],
    [
      "Comparable burden-distribution review",
      "Disease-specific distributions with identical denominators, population coverage, definition and year in declared groups.",
      "Obtain comparable disaggregated burden distributions before computing W1; heterogeneous headline counts cannot supply a shape comparison.",
      "Use the distribution difference as a question about comparable reporting and access, not as an individual AMR surveillance and stewardship risk.",
      "Audit same-year registry/survey definitions and group composition before using the W1 comparison in AMR surveillance and stewardship resource planning."
    ],
    [
      "Local density / access symmetry",
      "Geocoded microbiology, infection-prevention and stewardship services, population denominators and defined comparable catchments.",
      "Estimate service/need density within comparable catchments, with suppression for small counts.",
      "Ask whether rural, remote and underserved communities have comparable access to microbiology, infection-prevention and stewardship services.",
      "Inventory microbiology, infection-prevention and stewardship services and catchment denominators; assess density contrasts before choosing outreach locations."
    ],
    [
      "Service contiguity",
      "Verified adjacency and functioning connections among microbiology, infection-prevention and stewardship services; dated coverage.",
      "Define adjacency explicitly; distinguish disconnected service coverage from missing records.",
      "Check the official local service directory rather than inferring access from a country rank.",
      "Validate catchment connectivity and identify an accountable alternate service pathway for a disconnected area."
    ],
    [
      "Persistence of a documented programme gap",
      "Repeated disease-specific observations using consistent definitions and uncertainty intervals.",
      "Obtain repeat local programme/registry measurements; a dated global estimate does not establish a persistent current gap.",
      "Read the year next to AMR surveillance and stewardship figures and ask for newer local evidence before treating them as current.",
      "Reconcile country and reference vintages; seek repeated local measurements before escalating any persistent-service-gap claim."
    ],
    [
      "Geographic scale / registry coverage",
      "Comparable country and local programme/registry estimates, boundaries and completeness.",
      "Assess uncertainty and registry/survey completeness across scales before interpreting a local burden difference.",
      "Check whether the comparison changes with the reference group; a country mean does not describe every community.",
      "Review world/income-reference sensitivity and repeat AMR surveillance and stewardship assessment across defensible local aggregation scales."
    ],
    [
      "Model / missingness review",
      "A specified AMR surveillance and stewardship observation and uncertainty model, missingness assumptions, validation data and objective.",
      "Document ascertainment and model assumptions; fit and validate an explicit objective before reporting variational free energy.",
      "Ask which AMR surveillance and stewardship values are reported, estimated or missing before interpreting model-based contrasts.",
      "Assign an analyst to review AMR surveillance and stewardship measurement uncertainty and missingness; do not invent a VFE score from a rate."
    ],
    [
      "Shared-exposure gradient",
      "Observed organism-specific resistance and antimicrobial-use measures across a defined dose/distance range and aligned AMR surveillance and stewardship outcomes.",
      "Prespecify the exposure range and weighting; test confounding and measurement error before integrating an AUC.",
      "Use current official AMR surveillance and stewardship guidance; the national average does not identify a shared exposure for a household.",
      "Collect privacy-protected organism-specific resistance and antimicrobial-use measures measurements with public-health oversight; assess an exposure gradient before any local intervention inference."
    ],
    [
      "Access frontier / buffer",
      "A defined diagnostic and stewardship service access boundary, travel-time or distance surface, population, organism and sampled-infection weights and service availability.",
      "Evaluate coverage across a justified distance/time range; report excluded populations and inaccessible routes.",
      "Confirm a usable local contact or service alternative with the official authority; do not infer a safe buffer from this mapless atlas.",
      "Map diagnostic and stewardship service access boundary with current service availability and plan a reviewed alternate access route; keep sensitive locations out of public exports."
    ],
    [
      "Cross-boundary dependence",
      "Observed, aggregated privacy-protected aggregate care transfers with direction, period, units and coverage; privacy safeguards.",
      "Separate actual transfers from correlation; audit boundaries and avoid summing overlapping groups.",
      "Ask who coordinates AMR surveillance and stewardship services across administrative boundaries; no transfer route is inferred here.",
      "Verify privacy-protected aggregate care transfers with responsible partners and nominate a handoff owner before treating any area as a source or sink."
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

  var rows=PATHO, host=document.querySelector('header') || document.body, label=document.createElement('label'), chooser=document.createElement('select');
  label.textContent='Public planning focus (published estimates): ';label.style.display='block';label.style.marginTop='12px';chooser.id='response-public-focus';
  rows.forEach(function(row,i){var option=document.createElement('option');option.value=String(i);option.textContent=String(row[0]).replace(/<[^>]*>/g,'');chooser.appendChild(option);});label.appendChild(chooser);host.appendChild(label);
  function read() {
    var row=rows[Number(chooser.value)] || rows[0], name=row && String(row[0]).replace(/<[^>]*>/g,''), value=row && finite(row[1])?row[1]:null;
    var evidence=[fact('published-estimate',name || 'Published focus unavailable',value,"attributable deaths / year","2019",cfg.source,'historical','modeled',"GRAM 2019 modeled bacterial AMR attributable deaths. Not current hospital susceptibility, a current outbreak or a prescribing guide. Associated and attributable deaths are distinct.",'2026-06-27')];

    return plan((name || 'No public focus')+' · '+"2019"+' estimate · structural planning only',evidence,{});
  }
  ConsoleResponse.connect(read,['#response-public-focus']);

})();
