// Maintainer adapter: public evidence only; no private questionnaire values.
(function () {
  'use strict';
  var cfg = {
  "slug": "prescription-savings",
  "title": "Prescription cost references",
  "source": "https://www.medicaid.gov/medicaid/prescription-drugs/retail-price-survey",
  "authority": "https://www.medicaid.gov/medicaid/prescription-drugs/retail-price-survey",
  "scope": "Public benchmark and assistance-resource review only. No medication search, prescription, payer choice or pharmacy result is read or included in this plan.",
  "gap": "This is a public-reference review, not a scored assessment. The underlying personal forms and outputs are deliberately excluded; applicable dimensions require independently verified inputs and qualified review.",
  "escalate": "Ask a pharmacist or prescriber about product equivalence and clinical questions, and the payer/pharmacy about a verified personal quote. Do not change or interrupt prescribed treatment because of a benchmark. Keep personal details outside the public plan.",
  "limit": "NADAC is an acquisition-cost benchmark, not a patient price. This review cannot establish product interchangeability, individual coverage, savings or an appropriate medication.",
  "lenses": [
    [
      "Benchmark population balance",
      "Public acquisition-cost sample definition, payer/dispensing scope and sampling weights.",
      "Review which pharmacies and products the benchmark represents; no population-balance value is available.",
      "Read the CMS benchmark definition before comparing it with a personal price.",
      "Document benchmark sampling and payer/dispensing scope before using this reference in an assistance workflow."
    ],
    [
      "Like-for-like quote shape",
      "Comparable product, strength, form, package, date and payer quote distributions.",
      "Validate comparable public quote distributions before calculating W1; do not pool different products or package units.",
      "Ask a pharmacist which product and package details must match; do not enter them into this exported plan.",
      "Create a nonidentifying quote-comparison specification and separately verify product/form/unit equivalence."
    ],
    [
      "Access density",
      "Verified public pharmacy/assistance locations, service eligibility and population catchments.",
      "Assess service coverage with current directories; price entries are not a geographic access metric.",
      "Check a current public pharmacy or assistance directory for reachable services.",
      "Review assistance-service coverage with accessible hours and language support, without collecting prescription identities here."
    ],
    [
      "Complete assistance pathway",
      "Verified contacts and responsibilities from pharmacy to payer and assistance programmes.",
      "Map service handoffs and identify missing steps; no observed operational graph is supplied.",
      "Confirm which official office answers pricing, coverage and assistance questions.",
      "Maintain a verified public handoff directory with an accountable contact for unresolved assistance requests."
    ],
    [
      "Quote / reference persistence",
      "Dated repeated public benchmark releases and verified quote-validity information.",
      "Check release dates and whether products/units changed before interpreting repeated prices.",
      "Recheck the current CMS release and ask how long a verified quote applies.",
      "Version public references and review stale resource links; do not infer a persistent patient price."
    ],
    [
      "Payer / location applicability",
      "Comparable public quotes across defined payers, pharmacies and jurisdictions.",
      "Test contextual applicability; a benchmark comparison is not geographic price stability.",
      "Confirm whether a resource applies to the relevant payer or jurisdiction with the responsible service.",
      "Review reference applicability across payer/location contexts before distributing a generalized cost claim."
    ],
    [
      "Cost-model assumptions",
      "An explicit cost/coverage model, validated inputs and uncertainty.",
      "Separate acquisition cost, dispensing fees, insurance and patient liability; no VFE model is fitted.",
      "Ask what a quoted figure includes before treating it as an out-of-pocket amount.",
      "Record cost-model assumptions and uncertainty; require independent verification before publishing a savings estimate."
    ],
    [
      "Scope contamination review",
      "Comparable units and a justified range of quote/eligibility conditions.",
      "Keep acquisition benchmarks separate from retail prices and discounts; no contamination AUC is estimated.",
      "Check that a comparison has not mixed an invoice benchmark with a patient cash or insured quote.",
      "Audit public comparison labels and units; correct incompatible price claims before sharing assistance materials."
    ],
    [
      "Continuity / contingency review",
      "Verified assistance availability, care-continuity options and responsible clinical contacts.",
      "Review service contingencies qualitatively; no clinical safety buffer or buffer AUC is known.",
      "Direct affordability/continuity questions to the pharmacist or prescriber rather than substituting products from this page.",
      "Verify the clinical handoff for affordability barriers under the service’s own SOP; publish only nonidentifying contact options."
    ],
    [
      "Referral / information handoff",
      "Verified programme contacts, consent requirements and privacy-safe referral roles.",
      "Document the public handoff route; no patient transfer or eligibility network is inferred.",
      "Use official assistance contacts and avoid putting medication or identity details into a public export.",
      "Review consent and data-minimization rules for assistance handoffs; keep private case records in approved systems."
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
    var evidence=[fact('public-resource','Public official reference context',cfg.scope,'',null,cfg.source,'historical','interpretive','Links checked 23 October 2026; reference content may change. No private form or result is inspected.','2026-10-23')];
    evidence.push(fact('public-dataset','Public NADAC dataset identifier',typeof NADAC_DS==='string'?NADAC_DS:null,'',null,cfg.source,'current','interpretive','Public dataset metadata only; it does not describe any medication query or patient.','2026-10-23'));
    evidence.push(fact('cms-method','CMS NADAC methodology reference reviewed 23 October 2026','Weekly acquisition-cost reference; not a patient retail/insured price','reference context','Methodology reference reviewed 2026-10-23; not a price observation','https://www.medicaid.gov/medicaid/nadac','historical','interpretive','Official methodology checked 23 October 2026. Generic monthly updates currently use a three-month moving average; this is not an exact product-equivalence or substitution decision.','2026-10-23'));
    var release=typeof NADAC_RELEASE==='object'&&NADAC_RELEASE&&NADAC_RELEASE.dataset===NADAC_DS?NADAC_RELEASE:null,day=release&&/^\d{4}-\d{2}-\d{2}$/.test(release.day||'')?release.day:null,age=day?(Date.now()-Date.parse(day+'T00:00:00Z'))/86400000:null;
    if(!Number.isFinite(age)||age<0){day=null;age=null;}
    evidence.push(fact('cms-release','Universally reported NADAC release date',day,'release date',day,'https://data.medicaid.gov/dataset/'+NADAC_DS,day?'historical':'missing','measured','Public release metadata only. No medicine query, product name, NDC result, prescription, insurance or personal cost is read.',release&&Number.isFinite(release.checked)?new Date(release.checked).toISOString():null));
    var payload=plan('Public acquisition-cost reference context · no medicine or personal assessment',evidence,{});
    payload.impacts={title:'Public acquisition-cost reference and pricing limits',scope:'CMS dataset/release metadata only; medication query and results excluded',summary:'The native tool can display dated CMS product records, but this public plan reads only universal metadata and methodology. Acquisition costs cannot predict an individual’s retail/insured price or safe substitution.',items:[{id:'cms-reference',label:'Published CMS pricing basis',value:'Pharmacy acquisition-cost benchmark',unit:'public reference',kind:'context',evidenceIds:['cms-method'],method:'Interpret source unit and effective/release date for any separately reviewed record; verify exact product with a pharmacist.',note:'No patient savings, retail quote, coverage or therapeutic equivalence is estimated.'},{id:'release-age',label:'Age of the public NADAC release metadata',value:age==null?null:Math.floor(age),unit:'days',kind:'context',evidenceIds:['cms-release'],method:'Calendar age since the reported release date; no price or person-level inference.',note:'Unavailable until independently valid public release metadata is available in the native reader.'},{id:'personal-savings',label:'Individual savings or final price',value:null,unit:'USD',kind:'context',evidenceIds:['cms-method'],method:'Not computed from acquisition benchmarks or private query inputs.',note:'Requires actual pharmacy/plan quotes and appropriate professional product verification.'}],records:[{id:'nadac-methodology',label:'CMS NADAC methodology',kind:'context',evidenceIds:['cms-method'],summary:'Dated weekly acquisition references; generic monthly smoothing and source-specific pricing units matter.'},{id:'nadac-public-release',label:'Reported public release',kind:'context',evidenceIds:['cms-release'],summary:day?'NADAC release '+day+'; universal dataset '+NADAC_DS+'. No medication-result record is exported.':'A valid release date is not available; no date is inferred from a private result.'}],limitations:[cfg.scope,cfg.limit,'No name-match distribution is treated as a matched-product price comparison. Missing release dates and zero/missing prices are not silently substituted.']};
    return payload;
  }
  ConsoleResponse.connect(read,[]);

})();
