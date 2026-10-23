// Maintainer adapter: public evidence only; no private questionnaire values.
(function () {
  'use strict';
  var cfg = {
  "slug": "human-trafficking",
  "title": "Safe assistance reference review",
  "source": "https://www.dhs.gov/blue-campaign",
  "authority": "https://www.transportation.gov/stop-human-trafficking/roadmap",
  "scope": "Public awareness and safe-assistance reference review only. No personal situation choice, location, identity, narrative or response output is read or exported.",
  "gap": "This is a public-reference review, not a scored assessment. The underlying personal forms and outputs are deliberately excluded; applicable dimensions require independently verified inputs and qualified review.",
  "escalate": "For immediate danger, use appropriate local emergency help when safe. Otherwise use the official assistance/reporting resources and the organization’s safeguarding protocol. Do not confront, pursue or independently investigate; keep identifying details out of public exports.",
  "limit": "These ten lenses are a qualitative resource-review checklist, not a trafficking detector, investigation tool, person-level risk score or proof from the presence/absence of indicators. Do not confront or pursue a suspected trafficker.",
  "lenses": [
    [
      "Inclusive assistance scope",
      "Verified public service eligibility, language/accessibility scope and underserved-population needs.",
      "Review who a resource excludes without profiling or scoring individuals.",
      "Check accessible official assistance options; no demographic trait proves trafficking.",
      "Review non-discriminatory, accessible referral information with a qualified safeguarding lead."
    ],
    [
      "Comparable evidence definitions",
      "Validated definitions and ethically governed aggregate evidence; no personal-case data here.",
      "Do not compute W1 from warning-sign lists or infer a case from a pattern score.",
      "Treat awareness indicators as prompts for safe official guidance, never proof about a person.",
      "Use trained safeguarding review and validated definitions; prohibit automated person-level classification."
    ],
    [
      "Safe assistance availability",
      "Verified current public support services, accessibility and safe-contact options.",
      "Review availability with qualified service partners; no public map of vulnerable people is created.",
      "Use official service information and a safe device/contact channel where possible.",
      "Verify assistance availability and accessible contact methods; do not publish sensitive shelter or survivor locations."
    ],
    [
      "Accountable safeguarding pathway",
      "Verified organizational reporting and support responsibilities.",
      "Map approved safeguarding handoffs, not suspected criminal relationships.",
      "Follow official reporting/support options; do not confront or investigate.",
      "Review the organization’s safeguarding protocol and designated handoff responsibilities with trained staff."
    ],
    [
      "Reference / contact recency",
      "Current official support contacts and dated protocol reviews.",
      "Recheck service links and protocol versions; repeated indicators do not prove a case.",
      "Check current official assistance resources before sharing an old contact sheet.",
      "Version resource reviews and test public contacts without transmitting sensitive case details."
    ],
    [
      "Setting / jurisdiction applicability",
      "Current setting-specific official guidance and qualified local safeguarding advice.",
      "Review applicability without transferring a protocol blindly between settings or jurisdictions.",
      "Use official guidance relevant to the location and setting; avoid speculation about individuals.",
      "Have the designated lead review jurisdiction and setting-specific protocol differences."
    ],
    [
      "Uncertainty / evidence integrity",
      "Ethically governed validated definitions and qualified safeguarding review.",
      "Document uncertainty and possible harms; no VFE model, risk score or accusation is justified by this page.",
      "Do not turn ambiguous signs into allegations; use official help and safe reporting options.",
      "Require trained review, proportionality and privacy safeguards before any organizational action."
    ],
    [
      "Information / rumor contamination",
      "Verified sources, consent and clear distinction between observation and inference.",
      "Avoid spreading unverified identifying information; no exposure AUC is computed.",
      "Do not post names, images or suspicions publicly; seek official guidance safely.",
      "Review communications for unverified allegations and secondary harm; use approved confidential channels."
    ],
    [
      "Safety / contingency review",
      "A trained, context-specific safeguarding plan and safe assistance options.",
      "A public checklist cannot calculate a safety radius or buffer AUC; prioritize qualified safety planning.",
      "For immediate danger, seek appropriate local emergency help when safe; do not confront or pursue.",
      "Use the approved safeguarding/emergency protocol and trained partners; never infer a safe intervention distance."
    ],
    [
      "Consent / support handoff",
      "Verified support contacts, consent requirements and safe confidential handoff roles.",
      "Assess privacy and handoff accountability; no mobility/criminal network is inferred.",
      "Use official support options without entering identifying details into this plan.",
      "Review consent, data minimization and support handoff with trained partners; store case records only in approved systems."
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
