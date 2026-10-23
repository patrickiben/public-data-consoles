// Maintainer adapter: public evidence only; no private questionnaire values.
(function () {
  'use strict';
  var cfg = {
  "slug": "medical-cost-abroad",
  "title": "Medical travel reference review",
  "source": "https://www.cdc.gov/yellow-book/hcp/health-care-abroad/medical-tourism.html",
  "authority": "https://www.cdc.gov/yellow-book/hcp/health-care-abroad/medical-tourism.html",
  "scope": "Public medical-travel reference review only. No procedure selection, personal cost, destination choice or computed comparison is read or exported.",
  "gap": "This is a public-reference review, not a scored assessment. The underlying personal forms and outputs are deliberately excluded; applicable dimensions require independently verified inputs and qualified review.",
  "escalate": "Refer clinical suitability, follow-up and complications to a qualified clinician; verify facility and financial terms with the responsible organizations. Current health concerns require appropriate care, not a travel-price comparison.",
  "limit": "Illustrative procedure prices are not verified offers, all-in costs, quality evidence or a recommendation to travel. No clinical suitability or safety score is computed.",
  "lenses": [
    [
      "Comparable patient / procedure populations",
      "Verified public case mix, procedure definitions and risk-adjustment denominators.",
      "Compare like procedures and populations; price lists cannot establish population balance.",
      "Ask a qualified clinician what makes published procedure comparisons clinically comparable.",
      "Audit procedure and case-mix definitions before presenting cross-country comparisons."
    ],
    [
      "All-in quote distributions",
      "Verified like-for-like itemized quotes including follow-up and complications, with dates and currency.",
      "Obtain comparable quote distributions before W1; do not score broad price ranges as clinical value.",
      "Ask which services and contingencies a public quote excludes.",
      "Build an itemized nonidentifying comparison specification and verify inclusions independently."
    ],
    [
      "Follow-up service access",
      "Verified local follow-up providers, accessibility and care catchments.",
      "Assess follow-up access separately from advertised price or facility density.",
      "Discuss follow-up access with a qualified local clinician before using a travel estimate.",
      "Review accessible follow-up resources and responsibilities without implying a price rank establishes quality."
    ],
    [
      "Care-path continuity",
      "Verified pre-care, treating-facility and follow-up responsibilities.",
      "Check that every handoff has an accountable clinician/service; no observed care graph exists here.",
      "Ask who would provide follow-up and answer a complication concern.",
      "Verify the complete care-coordination pathway under the organization’s own clinical governance."
    ],
    [
      "Quote / credentials recency",
      "Current dated quotes, public credentials and repeated checks.",
      "Verify recency and change in terms; do not infer enduring safety from an old price or accreditation label.",
      "Recheck current facility and service information using official sources.",
      "Schedule reference and credential reviews with versioned source dates."
    ],
    [
      "Jurisdiction applicability",
      "Current jurisdiction, licensing, insurance and coverage rules from responsible bodies.",
      "Review applicability in each jurisdiction; no spatial mixing metric follows from country costs.",
      "Ask responsible insurers and clinicians which rules and coverage apply; do not infer portability.",
      "Document jurisdiction-specific scope and require a qualified review before presenting generalized travel guidance."
    ],
    [
      "Cost / risk model review",
      "A specified validated all-in cost and clinical uncertainty model.",
      "Separate price assumptions from outcome evidence; no fitted VFE or clinical utility model is available.",
      "Treat savings estimates as incomplete until their assumptions and care implications are verified.",
      "Audit unmeasured complications, follow-up and currency assumptions; report uncertainty without a composite safety score."
    ],
    [
      "Incompatible evidence contamination",
      "Comparable quality, price and outcome definitions across sources.",
      "Keep marketing prices, registry outcomes and anecdotal reviews distinct; no AUC is defensible here.",
      "Check whether an advertised cost or review is being mistaken for independent quality evidence.",
      "Review source independence and comparable definitions before reusing claims."
    ],
    [
      "Complication / continuity contingency",
      "A clinician-reviewed contingency plan, follow-up arrangements and verified service availability.",
      "Review contingencies qualitatively; no safe travel buffer or buffer-depth AUC is estimated.",
      "Use CDC’s questions and a qualified clinician to discuss complications and continuity of care.",
      "Verify clinical contingency and continuity responsibilities under approved procedures, without publishing personal records."
    ],
    [
      "Cross-border handoff",
      "Verified consent, record-transfer responsibilities and accountable clinical contacts.",
      "Document a privacy-preserving care handoff; no mobility leakage or outcome gain is inferred.",
      "Ask how medical records and follow-up information would reach a chosen clinician securely.",
      "Review consent, secure records and accountability for cross-border handoffs; do not include private details in this plan."
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

    return plan('Public reference context only · ten-point review · no individual assessment',evidence,{});
  }
  ConsoleResponse.connect(read,[]);

})();
