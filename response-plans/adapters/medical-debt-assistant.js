// Maintainer adapter: public evidence only; no private questionnaire values.
(function () {
  'use strict';
  var cfg = {
  "slug": "medical-debt-assistant",
  "title": "Medical billing reference review",
  "source": "https://www.consumerfinance.gov/consumer-tools/debt-collection/",
  "authority": "https://www.consumerfinance.gov/consumer-tools/debt-collection/",
  "scope": "Public billing and assistance-resource review only. No questionnaire answer, amount, identity, notice date, account, address or generated letter is read or exported.",
  "gap": "This is a public-reference review, not a scored assessment. The underlying personal forms and outputs are deliberately excluded; applicable dimensions require independently verified inputs and qualified review.",
  "escalate": "A court document, disputed identity/balance, unresolved assistance barrier or time-sensitive notice needs prompt review by the responsible billing office or qualified legal assistance. Check actual dates and jurisdiction privately; the checklist creates no deadline or legal conclusion.",
  "limit": "This checklist does not determine a debt’s validity, individual rights, eligibility, jurisdiction-specific deadlines or a legal strategy. Verify current guidance with the responsible agency or qualified legal assistance.",
  "lenses": [
    [
      "Billing / assistance scope balance",
      "Current public eligibility definitions, provider/collector scope and affected-population denominators.",
      "Check which billing and assistance categories a public guide covers; no person-level balance score is possible.",
      "Read who the official resource covers before relying on a generic template.",
      "Review whether public assistance materials omit relevant provider, collector or language-access groups."
    ],
    [
      "Comparable bill / claim structure",
      "Publicly comparable itemization and coding definitions with consistent units and periods.",
      "Validate comparison categories before any W1; no private bill or debt distribution is collected.",
      "Use official guidance to ask privately for understandable billing information, without exporting account details.",
      "Audit public itemization/verification guidance and hand off case-specific review through approved channels."
    ],
    [
      "Assistance access density",
      "Verified public financial-assistance and qualified legal-help directories and catchments.",
      "Assess accessible assistance availability, not the number of links as a density score.",
      "Check current official assistance contacts and accessible service options.",
      "Maintain a verified assistance directory with language/disability access and current service scope."
    ],
    [
      "Accountable resolution pathway",
      "Verified responsibilities among billing office, payer, collector and assistance service.",
      "Map public handoff roles; do not infer a legal liability network.",
      "Confirm which responsible office can verify a bill, assistance request or collection question.",
      "Assign a responsible handoff contact and a process for unresolved verification requests."
    ],
    [
      "Notice / guidance recency",
      "Current official guidance and independently reviewed dates/jurisdiction in the private case.",
      "Recheck governing dates and guidance; no deadline is calculated from this public checklist.",
      "Keep actual notice dates private and seek qualified help promptly for time-sensitive documents.",
      "Version public resources and require qualified case-specific deadline review outside this plan."
    ],
    [
      "Jurisdiction / provider applicability",
      "Current agency guidance and qualified review of provider, debt and jurisdiction scope.",
      "Test each resource’s scope rather than transferring a rule across jurisdictions.",
      "Confirm applicability with an official agency or qualified legal-assistance service.",
      "Audit public scripts for scope limits and refer jurisdiction-specific questions for qualified review."
    ],
    [
      "Eligibility / balance assumptions",
      "Verified programme definitions and a qualified review of billing/coverage assumptions.",
      "Separate a public explanation from a determination of debt or eligibility; no probabilistic/VFE model is fitted.",
      "Ask the responsible office to explain its definitions; this checklist cannot decide an amount owed.",
      "Review assumptions and document uncertainty without using a score to deny assistance or validate debt."
    ],
    [
      "Rule / template contamination",
      "Current authoritative sources and clear separation of provider, collector and payer processes.",
      "Check that templates do not mix different roles or outdated rules; no contamination AUC is estimated.",
      "Compare a template’s scope with current official guidance before using it privately.",
      "Have a qualified reviewer check templates and remove unsupported rights, deadlines or cross-role claims."
    ],
    [
      "Escalation / continuity contingency",
      "Verified assistance, complaint and qualified legal-help channels with current availability.",
      "Review escalation options qualitatively; no legal safety buffer or buffer-depth AUC is computed.",
      "Use official assistance/complaint resources and seek qualified help for unresolved or urgent issues.",
      "Verify a handoff for time-sensitive notices and unresolved disputes, without retaining personal facts here."
    ],
    [
      "Secure case handoff",
      "Verified agency/service contacts, consent and approved record-handling rules.",
      "Minimize case data and clarify responsibility; no collection-transfer network is inferred.",
      "Use official channels for any private records; never include account or identity data in this public export.",
      "Review consent, approved secure channels and a named case owner in the actual service system."
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
    return {slug:cfg.slug,selectionKey:JSON.stringify([cfg.slug,'public-reference',cfg.authority]),title:'Ten-dimension action checklist · '+cfg.title,context:context,evidence:evidence,diagnostics:diagnostics,actions:actions,
      limitations:[cfg.scope,cfg.limit,'All ten dimensions are review lenses. A domain proxy is labeled explicitly; unavailable inputs never become an all-clear. No fitted CRT causal effect, validated clinical score or intervention benefit is estimated.']};
  }

  function read() {
    var evidence=[fact('public-resource','Public official reference context',cfg.scope,'',null,cfg.source,'historical','interpretive','Links checked 23 October 2026; reference content may change. No private form or result is inspected.','2026-10-23')];

    evidence.push(fact('official-guidance',"CMS patient-provider dispute-resolution reference",400,"USD above a provider’s good-faith estimate","2026-10-02","https://www.cms.gov/initiatives/your-patient-rights/medical-bill-rights/get-help/dispute-bill",'historical','interpretive',"Published federal PPDR reference, not a universal billing rule or savings amount. CMS lists uninsured/not-using-insurance, a qualifying advance estimate, care/date and initial-bill timing requirements. Applicability and all current conditions require private review of the official guidance. Source checked 23 October 2026.",'2026-10-23'));
    var payload=plan('Public reference context only · ten-point review · no individual assessment',evidence,{});
    payload.impacts={title:'Official public guidance and explicit impact limits',scope:"Public billing-rights reference only; no bill, account, notice date or generated letter is inspected",summary:'The source supports a dated public reference and practical review steps. It supplies no personalized financial, clinical or safeguarding outcome estimate.',items:[{id:'guidance-reference',label:"CMS patient-provider dispute-resolution reference",value:400,unit:"USD above a provider’s good-faith estimate",kind:'context',evidenceIds:['official-guidance'],method:'Use the dated official guidance as reference context; verify current applicability with the responsible professional or agency.',note:"Published federal PPDR reference, not a universal billing rule or savings amount. CMS lists uninsured/not-using-insurance, a qualifying advance estimate, care/date and initial-bill timing requirements. Applicability and all current conditions require private review of the official guidance. Source checked 23 October 2026."},{id:'private-outcome-unavailable',label:"Individual debt validity, dispute eligibility or savings",value:null,unit:"USD above a provider’s good-faith estimate",kind:'context',evidenceIds:['official-guidance'],method:'Not calculated from public guidance or private form answers.',note:'Required person-level facts and qualified review are absent from this public planning summary.'}],records:[{id:"eligibility",label:"Review the full CMS qualification criteria",summary:"The400USD comparison is only one listed condition. This public checklist does not evaluate a person’s documents, dates, insurance status or eligibility.",kind:'context',evidenceIds:['official-guidance']},{id:"billing-help",label:"Keep case-specific documents private",summary:"Use the responsible billing office, official CMS/CFPB resources or qualified legal assistance. This public export contains no bill or identity information.",kind:'context',evidenceIds:['official-guidance']}],limitations:[cfg.scope,cfg.limit,'All ten numerical dimensions remain unknown unless independent applicable inputs are supplied; a documented resource is not an outcome measurement.']};
    return payload;
  }
  ConsoleResponse.connect(read,[]);

})();
