(function (root) {
  'use strict';
  var doc = root.document, payload = null, revision = '', evidenceRevision = '', track = 'public', acknowledgments = new Set(), manualReview = new Set(), prioritizers = new Map(), lastAssessment = null, changes = null;
  var priorityOrder = { immediate: 0, next: 1, planned: 2, routine: 3 };
  function registerPrioritizer(slug, derive) {
    if (typeof slug !== 'string' || !slug || typeof derive !== 'function') throw new TypeError('A console slug and priority function are required.');
    prioritizers.set(slug, derive);
  }
  function derivePriorities(input) {
    var derive = prioritizers.get(input.slug);
    if (!derive) return [];
    try {
      var actions = derive(JSON.parse(JSON.stringify(input)));
      if (!Array.isArray(actions)) throw new TypeError('Priority actions must be an array.');
      return actions.map(function (a) { return Object.assign({}, a, { featured: true }); });
    } catch (error) {
      return ['public', 'operator'].map(function (audience) { return { id: 'priority-reader-' + audience, featured: true, track: audience, phase: 'verify', when: 'always', priority: 'next', rank: 1, signal: 'data-gap', evidenceIds: [], title: 'Verify the original source before choosing a response', target: input.context || input.slug, reason: 'The priority reader could not resolve this selection.', nextStep: 'Open the evidence sources and confirm the selected place, period and coverage.', timing: 'Before using this checklist for a decision.', escalateWhen: 'The source cannot be verified or conflicts with a current official notice.', escalateTo: 'The source publisher or your designated duty lead.', reviewAfter: 'After the source or selection is verified.' }; });
    }
  }
  var metrics = [
    ['Population Balance', 'comparison', 'Defined comparison groups, workload/population denominators and aligned periods.'],
    ['Wasserstein Distance / Shape Imbalance', 'comparison', 'Comparable distributions in the same unit and period; group membership.'],
    ['Density Symmetry', 'comparison', 'Observed locations or defined comparable density denominators.'],
    ['Euler Characteristic / Contiguity', 'structure', 'A justified adjacency/topology definition and observed coverage.'],
    ['Persistence Gap', 'structure', 'Repeated or threshold-adjacent measurements and an explicit reference margin.'],
    ['Spatial Mixing / Scale Stability', 'structure', 'Comparable measurements across specified spatial or aggregation scales.'],
    ['Variational Free Energy', 'structure', 'A specified probabilistic model/objective and dependence structure; not an invented score.'],
    ['Contamination AUC', 'spillover', 'Exposure/response across a justified range of distances, doses or thresholds.'],
    ['Frontier Risk / Buffer Depth AUC', 'spillover', 'Defined exposed/unexposed boundary, distance/depth and comparable weights.'],
    ['Mobility Network Leakage', 'spillover', 'Observed directed links or a labeled scenario, transfer semantics and boundary coverage.']
  ];
  var basisNames = { measured: 'MEASURED', modeled: 'MODELED', interpretive: 'INTERPRETIVE', demo: 'DEMO · practice only' };
  function text(value) { return value == null ? '' : String(value); }
  function esc(value) { return text(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function url(value) { return /^https?:\/\/[^\s]+$/i.test(text(value)) ? text(value) : ''; }
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      var out = {}; Object.keys(value).sort().forEach(function (key) { out[key] = canonical(value[key]); }); return out;
    }
    return value;
  }
  function signature(value) { return JSON.stringify(canonical(value)); }
  // Every presentation consumes the same evidence contract. Historical reporting
  // periods may be descriptive; a current observation needs a valid elapsed date.
  function evidenceProblem(f, count, current) {
    if (!f || typeof f.id !== 'string' || !f.id.trim() || count !== 1) return 'Missing or ambiguous evidence identity.';
    if (['missing', 'stale'].includes(f.quality)) return 'Missing or stale evidence.';
    if (!f.source) return 'Public source link is unavailable.';
    var period = text(f.measuredAt).trim(), at = Date.parse(period);
    if (!period) return 'Observation/reporting period is unavailable.';
    var isoDay = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(period);
    if (isoDay && (!Number.isFinite(at) || new Date(isoDay[1] + 'T00:00:00Z').toISOString().slice(0, 10) !== isoDay[1])) return 'Observation date is invalid.';
    if (Number.isFinite(at) && at > Date.now()) return 'Observation/report date is in the future.';
    if (current && (f.quality !== 'current' || !Number.isFinite(at))) return 'Current dated evidence is required.';
    return '';
  }
  function evaluateImpacts(input, facts) {
    var supplied = input.impacts || {}, byFact = new Map(), duplicates = new Set();
    facts.forEach(function (f) { if (byFact.has(f.id)) duplicates.add(f.id); byFact.set(f.id, f); });
    function normalize(rows, records) {
      if (!Array.isArray(rows)) return [];
      var seen = new Set(), duplicateRows = new Set();
      rows.forEach(function (r) { if (r && seen.has(r.id)) duplicateRows.add(r.id); if (r) seen.add(r.id); });
      return rows.map(function (row) {
        row = row || {};
        var ids = Array.isArray(row.evidenceIds) ? Array.from(new Set(row.evidenceIds)) : [];
        var reasons = [], linked = ids.map(function (id) { return byFact.get(id); }).filter(Boolean);
        var kind = ['observed', 'forecast', 'context', 'scenario'].includes(row.kind) ? row.kind : 'context';
        if (!['observed', 'forecast', 'context', 'scenario'].includes(row.kind)) reasons.push('The impact basis is not declared.');
        if (typeof row.id !== 'string' || !row.id.trim() || duplicateRows.has(row.id)) reasons.push('A unique public record identity is required.');
        if (!ids.length) reasons.push('No supporting public evidence is linked.');
        ids.forEach(function (id) {
          var f = byFact.get(id);
          var problem = evidenceProblem(f, duplicates.has(id) ? 2 : f ? 1 : 0, ['observed', 'forecast'].includes(kind));
          if (problem) reasons.push((f ? f.label || f.id : text(id)) + ': ' + problem);
        });
        var practice = !!input.scenario || linked.some(function (f) { return f.basis === 'demo'; }) || kind === 'scenario';
        if (practice) kind = 'scenario';
        if (!records && !(typeof row.value === 'number' && Number.isFinite(row.value) || typeof row.value === 'string' && row.value.trim())) reasons.push('A supported finite value or documented description is unavailable.');
        if (!records && typeof row.value === 'number' && !text(row.unit).trim()) reasons.push('The numeric unit is unavailable.');
        if (records && !text(row.summary).trim()) reasons.push('A documented record description is unavailable.');
        if (kind === 'forecast' && row.validAt != null && (!Number.isFinite(Date.parse(row.validAt)) || Date.parse(row.validAt) <= Date.now())) reasons.push('The forecast validity time is missing, invalid or elapsed.');
        var quality = linked.some(function (f) { return f.quality === 'missing'; }) || !linked.length ? 'missing' : linked.some(function (f) { return f.quality === 'stale'; }) ? 'stale' : linked.some(function (f) { return f.quality === 'historical'; }) ? 'historical' : 'current';
        var basis = practice ? 'demo' : kind === 'forecast' || linked.some(function (f) { return f.basis === 'modeled'; }) ? 'modeled' : linked.some(function (f) { return f.basis === 'interpretive'; }) ? 'interpretive' : 'measured';
        return { id: text(row.id), label: text(row.label || row.id), value: records ? undefined : reasons.length ? null : row.value,
          unit: text(row.unit), kind: kind, status: reasons.length ? 'unknown' : 'available', quality: quality, basis: basis, practice: practice,
          summary: reasons.length ? '' : text(row.summary), method: text(row.method), note: text(row.note), validAt: row.validAt == null ? null : text(row.validAt),
          evidenceIds: ids, reasons: reasons, sources: linked.map(function (f) { return { id: f.id, label: f.label, source: f.source, measuredAt: f.measuredAt || null, checkedAt: f.checkedAt || null, quality: f.quality, basis: f.basis }; }) };
      });
    }
    return { title: text(supplied.title || 'Public-data impacts and context'), scope: text(supplied.scope || input.context || 'Current console selection'),
      summary: text(supplied.summary || 'Quantified impacts require applicable public evidence. Review the supported records and explicit input gaps.'),
      items: normalize(supplied.items, false), records: normalize(supplied.records, true),
      limitations: Array.isArray(supplied.limitations) ? supplied.limitations.map(text) : ['No source-backed impact estimate is supplied for this selection.'] };
  }
  function diagnosticAssessment(d) { return d.status === 'unknown' ? 'UNKNOWN' : d.status === 'triggered' ? 'REVIEW' : 'CONTEXT · condition not met'; }
  function evaluate(input) {
    input = input || {};
    var facts = (Array.isArray(input.evidence) ? input.evidence : []).map(function (fact) {
      var f = Object.assign({}, fact);
      if (!basisNames[f.basis]) f.basis = 'interpretive';
      if (!['current', 'historical', 'stale', 'missing'].includes(f.quality)) f.quality = 'missing';
      if (f.value == null || f.value === '' || (typeof f.value === 'number' && !Number.isFinite(f.value))) f.quality = 'missing';
      if (!['number', 'string'].includes(typeof f.value)) { f.value = null; f.quality = 'missing'; }
      f.source = url(f.source); return f;
    });
    var byFact = new Map(facts.map(function (f) { return [f.id, f]; })), factCounts = new Map();
    facts.forEach(function (f) { factCounts.set(f.id, (factCounts.get(f.id) || 0) + 1); });
    facts.forEach(function (f) {
      var problem = evidenceProblem(f, factCounts.get(f.id), f.quality === 'current');
      if (problem && !['missing', 'stale'].includes(f.quality)) { f.quality = 'missing'; f.note = (f.note ? f.note + ' ' : '') + 'Evidence withheld: ' + problem; }
    });
    var diagnostics = (Array.isArray(input.diagnostics) ? input.diagnostics : []).map(function (diagnostic) {
      var d = Object.assign({}, diagnostic), ids = Array.isArray(d.evidenceIds) ? d.evidenceIds : [];
      d.evidenceIds = ids; d.status = ['triggered', 'clear', 'unknown'].includes(d.status) ? d.status : 'unknown';
      d.scope = d.scope === 'planning' ? 'planning' : 'current';
      d.reasons = [];
      if (typeof d.value === 'number' && !Number.isFinite(d.value)) d.reasons.push('The numeric metric is not finite.');
      if (!ids.length) d.reasons.push('No supporting evidence is linked.');
      ids.forEach(function (id) {
        var fact = byFact.get(id);
        var problem = evidenceProblem(fact, factCounts.get(id), d.scope !== 'planning');
        if (problem) d.reasons.push((fact ? fact.label || fact.id : id) + ': ' + problem);
      });
      if (d.reasons.length) d.status = 'unknown';
      d.practice = !!input.scenario || ids.some(function (id) { return byFact.get(id) && byFact.get(id).basis === 'demo'; });
      d.current = !d.reasons.length && ids.length > 0 && ids.every(function (id) { var f = byFact.get(id); return !evidenceProblem(f, factCounts.get(id), true) && f.basis !== 'demo'; });
      return d;
    });
    diagnostics.forEach(function (d) { var n = Number(d.metricId == null ? d.dimension : d.metricId); d.metricId = Number.isInteger(n) && n >= 1 && n <= 10 ? n : null; });
    var canonicalDiagnostics = metrics.map(function (metric, index) {
      var matches = diagnostics.filter(function (d) { return d.metricId === index + 1; });
      var d = matches.length === 1 ? matches[0] : { id: 'dimension-' + (index + 1), metricId: index + 1, status: 'unknown', evidenceIds: [], reasons: [], scope: 'planning', current: false };
      d = Object.assign({}, d, { canonicalLabel: metric[0], pillar: metric[1] });
      if (matches.length > 1) { d.status = 'unknown'; d.reasons = ['Conflicting duplicate canonical dimension definitions.']; }
      d.label = d.label || metric[0];
      d.requiredInputs = d.requiredInputs && (!Array.isArray(d.requiredInputs) || d.requiredInputs.length) ? d.requiredInputs : metric[2];
      d.analyticalMitigation = d.analyticalMitigation || 'Acquire and validate the required inputs; assess applicability before choosing an analysis.';
      if (!matches.length) { d.rule = 'Not assessable from the supplied data.'; d.explanation = 'No validated metric or justified domain proxy has been supplied.'; }
      return d;
    });
    diagnostics = canonicalDiagnostics.concat(diagnostics.filter(function (d) { return !d.metricId; }));
    diagnostics.forEach(function (d) { if (d.status === 'unknown') d.value = null; });
    var byDiagnostic = new Map(diagnostics.map(function (d) { return [d.id, d]; }));
    var actionRows = (Array.isArray(input.actions) ? input.actions : []).concat(derivePriorities(Object.assign({}, input, { evidence: facts, diagnostics: diagnostics })));
    var actionCounts = new Map();
    actionRows.forEach(function (a) { actionCounts.set(a.id, (actionCounts.get(a.id) || 0) + 1); });
    var actions = actionRows.map(function (action) {
      var a = Object.assign({}, action), ids = Array.isArray(a.diagnosticIds) ? a.diagnosticIds.slice() : [];
      (Array.isArray(a.metricIds) ? a.metricIds : []).forEach(function (n) { var d = diagnostics.find(function (item) { return item.metricId === Number(n); }); if (d && !ids.includes(d.id)) ids.push(d.id); });
      var relevant = ids.length ? ids.map(function (id) { return byDiagnostic.get(id) || { status: 'unknown', current: false }; }) : diagnostics;
      a.track = a.track === 'operator' ? 'operator' : 'public';
      a.phase = ['verify', 'prepare', 'respond', 'review'].includes(a.phase) ? a.phase : 'verify';
      a.when = ['always', 'triggered', 'unknown'].includes(a.when) ? a.when : 'unknown';
      if (a.when === 'always' && a.phase === 'respond') a.phase = 'prepare';
      a.selected = a.when === 'always' || relevant.some(function (d) { return d.status === a.when; });
      a.practice = !!input.scenario || relevant.some(function (d) { return d.practice; });
      a.withheld = a.phase === 'respond' && a.when !== 'always' && !a.practice && !relevant.some(function (d) { return d.status === 'triggered' && d.current; });
      if (a.withheld) a.selected = false;
      a.diagnosticIds = ids; a.authorityUrl = url(a.authorityUrl);
      if (a.featured) {
        a.evidenceIds = Array.isArray(a.evidenceIds) ? Array.from(new Set(a.evidenceIds)) : [];
        var linked = a.evidenceIds.map(function (id) { return byFact.get(id); });
        var supported = linked.length > 0 && linked.every(function (f) { return !evidenceProblem(f, f && factCounts.get(f.id), false); });
        a.current = supported && linked.every(function (f) { return !evidenceProblem(f, factCounts.get(f.id), true) && f.basis !== 'demo'; });
        a.practice = !!input.scenario || a.signal === 'scenario' || linked.some(function (f) { return f && f.basis === 'demo'; });
        a.priority = Object.prototype.hasOwnProperty.call(priorityOrder, a.priority) ? a.priority : 'planned';
        a.rank = Number.isFinite(a.rank) && a.rank > 0 ? a.rank : 100;
        a.withheldReasons = [];
        if (typeof a.id !== 'string' || !a.id.trim() || actionCounts.get(a.id) !== 1) a.withheldReasons.push('A unique action identity is required.');
        ['title', 'target', 'reason', 'nextStep', 'timing', 'escalateWhen', 'escalateTo', 'reviewAfter'].forEach(function (key) { if (!text(a[key]).trim()) a.withheldReasons.push('Missing action field: ' + key + '.'); });
        if (a.requiresCurrent && !a.current) a.withheldReasons.push('Current, dated, unambiguous public evidence is required.');
        if (['official-warning', 'observed-condition', 'forecast'].includes(a.signal) && !supported) a.withheldReasons.push('The named condition lacks applicable public evidence.');
        if (a.validUntil != null && (!Number.isFinite(Date.parse(a.validUntil)) || Date.parse(a.validUntil) <= Date.now())) a.withheldReasons.push('The action evidence has expired.');
        if (a.priority === 'immediate' && !(a.signal === 'official-warning' && a.current && a.authorityUrl && linked.every(function (f) { return f.basis === 'measured'; }) && a.validUntil && Date.parse(a.validUntil) > Date.now())) a.priority = 'next';
        if (a.practice || linked.some(function (f) { return f && f.quality === 'historical'; })) {
          if (priorityOrder[a.priority] < priorityOrder.planned) a.priority = 'planned';
        }
        a.withheld = a.withheld || a.withheldReasons.length > 0;
        if (a.withheld) a.selected = false;
        a.sources = linked.filter(Boolean).map(function (f) { return { id: f.id, label: f.label, source: f.source, measuredAt: f.measuredAt || null, quality: f.quality, basis: f.basis }; });
      }
      return a;
    });
    actions.sort(function (a, b) {
      if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
      return a.featured ? priorityOrder[a.priority] - priorityOrder[b.priority] || a.rank - b.rank || text(a.id).localeCompare(text(b.id)) : 0;
    });
    ['public', 'operator'].forEach(function (audience) {
      var n = 0; actions.forEach(function (a) { if (a.featured && a.selected && a.track === audience) a.position = ++n; });
    });
    return { slug: text(input.slug), selectionKey: text(input.selectionKey), title: text(input.title || 'Response plan'), context: text(input.context || 'Current console view'),
      evidence: facts, diagnostics: diagnostics, actions: actions, network: input.network || null, impacts: evaluateImpacts(input, facts),
      limitations: Array.isArray(input.limitations) ? input.limitations.map(text) : [], scenario: !!input.scenario };
  }
  function badge(basis) { return '<span class="cr-badge">' + esc(basisNames[basis] || basisNames.interpretive) + '</span>'; }
  function sourceLink(source, label) { return url(source) ? '<a href="' + esc(url(source)) + '" target="_blank" rel="noopener noreferrer">' + esc(label || 'Source') + '</a>' : '<span>Source not supplied</span>'; }
  function scrollToSection(el) {
    el.scrollIntoView({ behavior: root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  function focusKey(el) {
    if (!el) return '';
    if (el.id) return 'id:' + el.id;
    if (el.tagName === 'SUMMARY') return 'summary:' + el.parentElement.dataset.crSection;
    if (el.tagName === 'A') {
      var owner = el.closest('[data-cr-action],[data-cr-impact],[data-cr-impact-record],[data-cr-section]');
      var fact = el.closest('[data-cr-evidence],[data-cr-source]');
      return signature(['link', owner && [owner.dataset.crAction, owner.dataset.crImpact, owner.dataset.crImpactRecord, owner.dataset.crSection], fact && [fact.dataset.crEvidence, fact.dataset.crSource], el.getAttribute('href'), el.textContent]);
    }
    return '';
  }
  function mount() {
    if (!doc || !doc.body) return;
    var panel = doc.getElementById('console-response');
    if (!panel) return;
    if (!panel.dataset.mounted) {
      panel.dataset.mounted = 'true';
      // Keep the console's identity and navigation before the shared plan.
      var heading = doc.querySelector('h1'), nativeHeader = heading && heading.closest('header');
      if (nativeHeader && !panel.contains(nativeHeader)) nativeHeader.insertAdjacentElement('afterend', panel);
      panel.addEventListener('click', function (event) {
        var button = event.target.closest('[data-cr-track],[data-cr-export],[data-cr-print],[data-cr-open-impact],[data-cr-open-priorities]');
        if (!button) return;
        if (button.dataset.crTrack) { track = button.dataset.crTrack; render(); }
        if (button.hasAttribute('data-cr-print')) root.print();
        if (button.hasAttribute('data-cr-export')) download();
        if (button.hasAttribute('data-cr-open-priorities')) {
          panel.querySelector('[data-cr-section="plan"]').open = true;
          var actions = panel.querySelector('[data-cr-section="actions"]');
          if (actions) { actions.open = true; scrollToSection(actions); actions.querySelector('summary').focus({ preventScroll: true }); }
        }
        if (button.hasAttribute('data-cr-open-impact')) {
          panel.querySelector('[data-cr-section="plan"]').open = true;
          var impacts = panel.querySelector('[data-cr-section="impacts"]');
          if (impacts) { impacts.open = true; scrollToSection(impacts); impacts.querySelector('summary').focus({ preventScroll: true }); }
        }
      });
      panel.addEventListener('change', function (event) {
        var metric = Number(event.target.dataset.crAssess);
        if (metric >= 1 && metric <= 10) { if (event.target.value === 'review') manualReview.add(metric); else manualReview.delete(metric); render(); return; }
        var id = event.target.dataset.crAck;
        if (id) { if (event.target.checked) acknowledgments.add(id); else acknowledgments.delete(id); }
      });
      var shortcut = doc.getElementById('console-response-shortcut');
      if (shortcut) shortcut.addEventListener('click', function (event) {
        var group = panel.querySelector('[data-cr-section="plan"]'); if (group) group.open = true;
        event.preventDefault(); var checklist = panel.querySelector('[data-cr-section="actions"]'); if (checklist) checklist.open = true;
        scrollToSection(panel);
        var heading = doc.getElementById('console-response-title'); if (heading) heading.focus();
      });
      var printSections = null;
      function beginPrint() {
        if (printSections) return;
        if (payload) set(payload); // Reconcile clock-based expiry before printing.
        printSections = new Set(Array.from(panel.querySelectorAll('details[open]')).map(function (d) { return d.dataset.crSection; }));
        panel.querySelectorAll('details').forEach(function (d) { d.open = true; });
      }
      function endPrint() {
        if (!printSections) return;
        panel.querySelectorAll('details').forEach(function (d) { d.open = printSections.has(d.dataset.crSection); });
        printSections = null;
      }
      root.addEventListener('beforeprint', beginPrint); root.addEventListener('afterprint', endPrint);
      if (root.matchMedia) {
        var printMedia = root.matchMedia('print');
        if (printMedia.addEventListener) printMedia.addEventListener('change', function (event) { if (event.matches) beginPrint(); else endPrint(); });
      }
    }
    render();
  }
  function currentPlan() {
    var plan = evaluate(payload);
    manualReview.forEach(function (n) {
      var d = plan.diagnostics.find(function (item) { return item.metricId === n; }); if (!d) return;
      var authority = plan.actions.find(function (a) { return a.track === 'operator' && a.diagnosticIds.includes(d.id) && a.authorityUrl; });
      plan.actions.push({ id: 'manual-review-' + n, track: 'operator', phase: 'verify', when: 'always', selected: true, practice: false,
        diagnosticIds: [d.id], title: 'Self-reported review needed: #' + n + ' ' + d.canonicalLabel,
        nextStep: d.analyticalMitigation + ' Required inputs: ' + text(d.requiredInputs),
        escalateWhen: 'A local planning flag is not a measured incident. Review with your designated lead and verified SOP before taking operational action.',
        authorityUrl: authority ? authority.authorityUrl : '', selfReported: true });
    });
    plan.manualAssessments = Array.from(manualReview).sort(function (a, b) { return a - b; }).map(function (n) { return { metricId: n, assessment: 'review needed', basis: 'self-reported local planning' }; });
    return plan;
  }
  function render() {
    if (!doc) return;
    var panel = doc.getElementById('console-response'); if (!panel || !panel.dataset.mounted) return;
    var plan = currentPlan(), unknown = plan.diagnostics.filter(function (d) { return d.metricId && d.status === 'unknown'; }).length;
    var selected = plan.actions.filter(function (a) { return a.track === track && a.selected; });
    var open = new Set(Array.from(panel.querySelectorAll('details[open]')).map(function (d) { return d.dataset.crSection; }));
    var focused = doc.activeElement && panel.contains(doc.activeElement) ? focusKey(doc.activeElement) : '';
    panel.dataset.rendered = 'true';
    var h = '<header class="cr-head"><div><h2 id="console-response-title" tabindex="-1">' + esc(plan.title) + '</h2><p class="cr-context">' + esc(plan.context) + '</p></div>' + badge('interpretive') + '</header>';
    h += '<p class="cr-summary" role="status">' + (plan.scenario ? 'PRACTICE / SCENARIO · ' : '') + unknown + ' of 10 dimensions unknown. Unknown does not mean safe.<span class="cr-wide"> People and responsible authorities decide.</span></p>';
    var featured = selected.filter(function (a) { return a.featured; });
    if (featured.length) {
      var first = featured[0], periods = Array.from(new Set(first.sources.map(function (s) { return s.measuredAt; }).filter(Boolean)));
      h += '<div class="cr-priority-preview"><div><b>Do next · ' + esc(track === 'operator' ? 'Operators' : 'Public / local decisions') + '</b><p>' + esc(first.title) + '</p><span class="cr-preview-target">' + esc(first.target) + '</span><span class="cr-wide"> · ' + esc(first.timing) + '</span><small class="cr-preview-period">' + (periods.length ? 'Source period: ' + esc(periods.slice(0, 2).join('; ')) + (periods.length > 2 ? ' · more in checklist' : '') : 'Source gap · verify the original report') + '</small></div><button id="cr-open-priorities" data-cr-open-priorities>View actions (' + featured.length + ')</button></div>';
    }
    var impactRows = plan.impacts.items.concat(plan.impacts.records), availableImpacts = impactRows.filter(function (r) { return r.status === 'available'; }).length;
    h += '<div class="cr-impact-preview"><span>' + availableImpacts + ' available impact/context ' + (availableImpacts === 1 ? 'item' : 'items') + ' · ' + impactRows.filter(function (r) { return r.status === 'unknown'; }).length + ' unavailable.<span class="cr-wide"> Scope: ' + esc(plan.impacts.scope) + '.</span></span><button id="cr-open-impacts" data-cr-open-impact>View impacts and sources</button></div>';
    h += '<details class="cr-plan-group" data-cr-section="plan"' + (open.has('plan') ? ' open' : '') + '><summary>Response plan and ten-parameter detail</summary><p><b>Selection:</b> ' + esc(plan.context) + '</p>';
    h += '<div class="cr-toolbar" role="group" aria-label="Response audience"><button id="cr-track-public" data-cr-track="public" aria-pressed="' + (track === 'public') + '">Public / local decision makers</button><button id="cr-track-operator" data-cr-track="operator" aria-pressed="' + (track === 'operator') + '">Professional operators</button><button id="cr-export" data-cr-export>Export local plan</button><button id="cr-print" data-cr-print>Print</button></div>';
    function section(id, title, body, basis) { return '<details data-cr-section="' + id + '"' + (open.has(id) ? ' open' : '') + '><summary>' + title + ' ' + badge(basis) + '</summary>' + body + '</details>'; }
    if (changes) {
      var changeHTML = '<p>Compared with the previous evidence revision in this tab at ' + esc(changes.at) + '. Review notes reset when the evidence or selection changes.</p>';
      if (changes.selectionChanged) changeHTML += '<p>Selection changed. Values from different places or scenarios are not compared.</p>';
      else {
        changeHTML += '<ul>' + changes.evidence.map(function (c) { return '<li><b>' + esc(c.label) + ':</b> ' + esc(c.before) + ' → ' + esc(c.after) + '</li>'; }).join('') + '</ul>';
        var audienceChanges = changes.priorities.filter(function (a) { return a.track === track; });
        if (audienceChanges.length) changeHTML += '<p><b>Priority changes for this audience:</b></p><ul>' + audienceChanges.map(function (a) { return '<li>' + esc(a.title) + ': ' + esc(a.change) + (a.reason ? '. ' + esc(a.reason) : '') + '</li>'; }).join('') + '</ul>';
        if (!changes.evidence.length && !audienceChanges.length) changeHTML += '<p>Supporting calculations or applicability changed; review the updated plan below.</p>';
      }
      h += section('changes', 'What changed since the previous update', changeHTML, 'interpretive');
    }
    function impactSources(row) {
      return '<ul class="cr-impact-sources">' + row.sources.map(function (s) { return '<li data-cr-source="' + esc(s.id) + '">' + sourceLink(s.source, s.label || s.id) + ' · observed/reported: ' + esc(s.measuredAt || 'not supplied') + ' · ' + esc(s.quality) + (s.checkedAt ? '; checked: ' + esc(s.checkedAt) : '') + '</li>'; }).join('') + '</ul>';
    }
    function impactBadge(row) { return row.status === 'unknown' ? '<span class="cr-badge cr-unknown">UNKNOWN' + (row.practice ? ' · PRACTICE ONLY' : ' · inputs incomplete') + '</span>' : badge(row.basis); }
    function impactReasons(row) { return row.reasons.length ? '<details data-cr-section="impact-gaps-' + esc(row.id) + '"' + (open.has('impact-gaps-' + row.id) ? ' open' : '') + '><summary>Why this is unavailable</summary><p class="cr-unknown">' + esc(row.reasons.join(' ')) + '</p></details>' : ''; }
    var impactHTML = '<h3>' + esc(plan.impacts.title) + '</h3><p><b>Current scope:</b> ' + esc(plan.impacts.scope) + '</p><p>' + esc(plan.impacts.summary) + '</p><p class="cr-note">Observations, official forecasts and historical context retain their own dates and meanings. A public-data screen alone does not establish an outage, individual harm or completed response.</p><div class="cr-impact-grid">';
    plan.impacts.items.forEach(function (r) {
      impactHTML += '<article class="cr-impact-item" data-cr-impact="' + esc(r.id) + '"><h4>' + esc(r.label) + '</h4>' + impactBadge(r) + ' <span class="cr-badge">' + esc(r.kind.toUpperCase()) + '</span><p class="cr-impact-value">' + (r.status === 'unknown' ? 'Not assessable' : esc(typeof r.value === 'number' ? r.value.toLocaleString(undefined, { maximumSignificantDigits: 6 }) : r.value) + (r.unit ? ' ' + esc(r.unit) : '')) + '</p>' + (r.validAt ? '<p>' + (r.kind === 'forecast' ? 'Forecast valid: ' : 'Record / valid time: ') + esc(r.validAt) + '</p>' : '') + (r.method ? '<p><b>Method:</b> ' + esc(r.method) + '</p>' : '') + (r.note ? '<p>' + esc(r.note) + '</p>' : '') + impactReasons(r) + impactSources(r) + '</article>';
    });
    impactHTML += '</div>';
    if (plan.impacts.records.length) impactHTML += '<h3>Public records behind this view</h3><div class="cr-impact-records">' + plan.impacts.records.map(function (r) { return '<article data-cr-impact-record="' + esc(r.id) + '"><h4>' + esc(r.label) + '</h4><p class="cr-note">Record ID: ' + esc(r.id) + '</p>' + impactBadge(r) + ' <span class="cr-badge">' + esc(r.kind.toUpperCase()) + '</span><p>' + (r.status === 'unknown' ? '<b>Not assessable.</b> ' : '') + esc(r.status === 'unknown' ? 'This record cannot support the selected impact with the available evidence.' : r.summary) + '</p>' + (r.validAt ? '<p>' + (r.kind === 'forecast' ? 'Forecast valid: ' : 'Record / valid time: ') + esc(r.validAt) + '</p>' : '') + impactReasons(r) + impactSources(r) + '</article>'; }).join('') + '</div>';
    if (!impactRows.length) impactHTML += '<p class="cr-unknown">No applicable public impact records or quantified projection are available for this selection.</p>';
    impactHTML += '<ul>' + plan.impacts.limitations.map(function (limit) { return '<li>' + esc(limit) + '</li>'; }).join('') + '</ul>';
    var impactSection = section('impacts', 'Projected impacts and public-data context', impactHTML, 'interpretive');
    var actionHTML = '<p>These are planning prompts, not instructions to dispatch, switch equipment, prescribe, trade or evacuate. ' + (track === 'operator' ? 'Use your organization’s verified telemetry, SOP and decision authority.' : 'Follow current official instructions for your location.') + '</p>';
    if (featured.length) {
      actionHTML += '<h3>Prioritized live action checklist</h3><p class="cr-note">Ordered for this selection and audience. Timing is an interpretive review prompt unless attributed to a current official notice. Source periods remain visible; older reports support planning.</p><ol class="cr-priority-list">';
      featured.forEach(function (a) {
        var priorityLabel = a.practice ? 'Practice / planning' : { immediate: 'Current official warning · check now', next: 'Next check', planned: 'Planning review', routine: 'Follow-up' }[a.priority];
        actionHTML += '<li><article class="cr-action cr-priority" data-cr-action="' + esc(a.id) + '" data-cr-priority="' + esc(a.priority) + '"><div class="cr-priority-head"><span class="cr-priority-number" aria-label="Priority ' + a.position + '">' + a.position + '</span><div><span class="cr-badge">' + esc(priorityLabel) + '</span><h4>' + esc(a.title) + '</h4></div></div><p class="cr-priority-target"><b>Where / record:</b> ' + esc(a.target) + '</p><p><b>Why this is prioritized:</b> ' + esc(a.reason) + '</p><p class="cr-timing"><b>When:</b> ' + esc(a.timing) + '</p><p><b>Next:</b> ' + esc(a.nextStep) + '</p><div class="cr-escalation"><p><b>Escalate if:</b> ' + esc(a.escalateWhen) + '</p><p><b>Escalate to:</b> ' + esc(a.escalateTo) + '</p></div><p><b>Recheck:</b> ' + esc(a.reviewAfter) + '</p>' + (a.validUntil ? '<p class="cr-note">Evidence valid until: ' + esc(a.validUntil) + '</p>' : '') + (a.diagnosticIds.length ? '<p class="cr-note">Checklist dimensions: ' + esc(a.diagnosticIds.map(function (id) { var d = plan.diagnostics.find(function (item) { return item.id === id; }); return d ? (d.metricId ? '#' + d.metricId + ' ' : '') + d.label : id; }).join('; ')) + '</p>' : '') + impactSources(a) + '<p>' + sourceLink(a.authorityUrl, 'Responsible authority / guidance') + '</p><label><input type="checkbox" id="cr-ack-' + esc(a.id) + '" data-cr-ack="' + esc(a.id) + '"' + (acknowledgments.has(a.id) ? ' checked' : '') + '> Reviewed locally for this evidence revision</label></article></li>';
      });
      actionHTML += '</ol>';
    }
    var followupHTML = '';
    ['verify', 'prepare', 'respond', 'review'].forEach(function (phase) {
      var list = selected.filter(function (a) { return !a.featured && a.phase === phase; }); if (!list.length) return;
      followupHTML += '<h3>' + phase.charAt(0).toUpperCase() + phase.slice(1) + '</h3>';
      list.forEach(function (a) {
        var linked = a.diagnosticIds.map(function (id) { return plan.diagnostics.find(function (d) { return d.id === id; }); }).filter(Boolean);
        followupHTML += '<article class="cr-action" data-cr-action="' + esc(a.id) + '"><h4>' + esc(a.title) + (a.practice ? ' <span class="cr-badge">PRACTICE ONLY</span>' : '') + (a.selfReported ? ' <span class="cr-badge">SELF-REPORTED · planning</span>' : '') + '</h4><p><b>Trigger / dimensions:</b> ' + esc((a.when === 'always' ? 'Baseline preparation / review; no incident is implied. ' : '') + (linked.map(function (d) { return (d.metricId ? '#' + d.metricId + ' ' : '') + d.label + ' — ' + diagnosticAssessment(d) + (d.rule ? ' (' + d.rule + ')' : ''); }).join('; ') || 'Evidence is incomplete; verify before deciding.')) + '</p><p><b>Next:</b> ' + esc(a.nextStep) + '</p><p><b>Escalate / review:</b> ' + esc(a.escalateWhen || 'Use the responsible authority’s current guidance and local procedures.') + '</p><p>' + sourceLink(a.authorityUrl, 'Responsible authority / guidance') + '</p><label><input type="checkbox" id="cr-ack-' + esc(a.id) + '" data-cr-ack="' + esc(a.id) + '"' + (acknowledgments.has(a.id) ? ' checked' : '') + '> Reviewed locally for this evidence revision</label></article>';
      });
    });
    actionHTML += featured.length ? section('followup', 'Dimension-by-dimension follow-up', followupHTML, 'interpretive') : followupHTML;
    if (!selected.length) actionHTML += '<p class="cr-unknown">No supported conditional action is available for this track. Verify missing evidence and consult the responsible authority; this is not an all-clear.</p>';
    actionHTML += '<p class="cr-note">Checks are temporary local planning notes, not completed operations. Context or evidence changes reset them. Nothing is transmitted or stored by this response layer.</p>';
    h += section('actions', featured.length ? '1. Prioritized response plan' : '1. Condition-dependent response plan', actionHTML, 'interpretive');
    h += impactSection;
    var evidenceHTML = plan.evidence.length ? '<ul>' + plan.evidence.map(function (f) { return '<li data-cr-evidence="' + esc(f.id) + '"><b>' + esc(f.label || f.id) + ':</b> ' + esc(f.quality === 'missing' ? 'Unavailable' : f.value) + (f.unit ? ' ' + esc(f.unit) : '') + ' ' + badge(f.basis) + ' <span class="cr-quality">' + esc(f.quality) + '</span><br>Observed / reported: ' + esc(f.measuredAt || 'not supplied') + '; checked: ' + esc(f.checkedAt || 'not supplied') + '. ' + sourceLink(f.source) + (f.note ? '<br>' + esc(f.note) : '') + '</li>'; }).join('') + '</ul>' : '<p class="cr-unknown">Evidence unavailable. No current incident status can be inferred.</p>';
    h += section('evidence', '2. Evidence, dates and sources', evidenceHTML, 'interpretive');
    var diagnosticHTML = ['comparison', 'structure', 'spillover'].map(function (pillar) {
      var ds = plan.diagnostics.filter(function (d) { return d.pillar === pillar; });
      return '<h3>' + ({ comparison: 'Comparison and balance', structure: 'Structure and coverage', spillover: 'Spillover and dependence' })[pillar] + '</h3>' + (ds.length ? ds.map(function (d) {
        var related = plan.actions.filter(function (a) { return a.track === track && a.diagnosticIds.includes(d.id); });
        var supporting = d.evidenceIds.map(function (id) { var f = plan.evidence.find(function (item) { return item.id === id; }); return f ? f.label + ': ' + (f.quality === 'missing' ? 'Unavailable' : text(f.value) + (f.unit ? ' ' + f.unit : '')) + ' [' + f.quality + ', ' + basisNames[f.basis] + ']; observed/reported ' + text(f.measuredAt || 'not supplied') : id + ': unavailable'; }).join('; ');
        return '<article class="cr-diagnostic cr-' + d.status + '" data-cr-diagnostic="' + esc(d.id) + '"' + (d.metricId ? ' data-cr-metric="' + d.metricId + '"' : '') + '><h4>' + (d.metricId ? '#' + d.metricId + ' ' + esc(d.canonicalLabel) : esc(d.label)) + ' — ' + esc(diagnosticAssessment(d)) + '</h4>' + badge('interpretive') + (d.scope === 'planning' ? ' · planning context' : '') + '<p><b>Metric / proxy value:</b> ' + esc(d.status === 'unknown' ? 'Not assessable from the currently applicable evidence.' : (typeof d.value === 'number' && Number.isFinite(d.value)) || typeof d.value === 'string' ? text(d.value) + (d.unit ? ' ' + d.unit : '') : 'No numerical metric supplied; assess the stated domain condition and evidence.') + '</p><p><b>Domain condition / proxy:</b> ' + esc(d.label) + '. ' + esc(d.rule) + ' ' + esc(d.explanation) + (d.reasons.length ? ' ' + esc(d.reasons.join(' ')) : '') + '</p><p><b>Supporting evidence:</b> ' + esc(supporting || 'Unavailable; obtain the named required inputs.') + '</p><p><b>Required inputs:</b> ' + esc(Array.isArray(d.requiredInputs) ? d.requiredInputs.join('; ') : d.requiredInputs) + '</p><p><b>Analytical mitigation:</b> ' + esc(d.analyticalMitigation) + '</p><p><b>Operational step → phase:</b> ' + esc(related.length ? related.map(function (a) { return a.nextStep + ' → ' + a.phase + (a.selected ? ' (applicable)' : ' (condition not met)'); }).join(' ') : d.operationalMitigation || 'Obtain the missing evidence and review applicability with the responsible authority → verify.') + '</p>' + (track === 'operator' && d.metricId ? '<label>Local assessment (self-reported, never changes machine evidence): <select id="cr-assess-' + d.metricId + '" data-cr-assess="' + d.metricId + '"><option value="">Unassessed</option><option value="review"' + (manualReview.has(d.metricId) ? ' selected' : '') + '>Review needed</option></select></label>' : '') + '</article>';
      }).join('') : '<p class="cr-unknown">Not assessed: applicable inputs are not supplied.</p>');
    }).join('');
    h += section('diagnostics', '3. Research-informed diagnostics', diagnosticHTML, 'interpretive');
    var net = plan.network, networkHTML;
    if (!net) networkHTML = '<p class="cr-unknown">Directed network information is unavailable. No source/sink, causal route or restoration gain is inferred.</p>';
    else {
      networkHTML = '<p><b>' + esc(net.label) + '</b> ' + badge(net.basis) + '<br>' + esc(net.semantics) + '<br>Period alignment: ' + esc(net.period || 'not supplied') + '; coverage: ' + esc(net.coverage || 'not supplied') + '.</p>';
      if (Array.isArray(net.roles) && net.roles.length) networkHTML += '<div class="cr-table"><table><thead><tr><th>Entity</th><th>Role / interpretation</th><th>Inbound</th><th>Outbound</th><th>Unit</th></tr></thead><tbody>' + net.roles.map(function (r) { return '<tr><td>' + esc(r.label || r.id) + '</td><td>' + esc(r.role) + '</td><td>' + esc(r.inbound == null ? 'Unavailable' : r.inbound) + '</td><td>' + esc(r.outbound == null ? 'Unavailable' : r.outbound) + '</td><td>' + esc(r.unit || 'not additive') + '</td></tr>'; }).join('') + '</tbody></table></div>';
      networkHTML += '<p>' + esc((net.limitations || []).join(' ')) + '</p>';
    }
    h += section('network', '4. Directed accounting and method limits', networkHTML, 'interpretive');
    h += '<p class="cr-note">' + esc(plan.limitations.join(' ')) + '</p><p class="cr-note">Research adaptations: <a href="https://github.com/patrickiben/crt-design-demo" target="_blank" rel="noopener">Contamination-resilient CRT design</a> · <a href="https://github.com/patrickiben/directed-asymmetry-contagion" target="_blank" rel="noopener">Directed asymmetry and contagion</a>. These planning diagnostics do not establish a fitted CRT estimand, validated ten-metric transfer, causal contagion or intervention benefit.</p>';
    h += '</details>';
    panel.innerHTML = h;
    if (focused) {
      var nextFocus = Array.from(panel.querySelectorAll('[id],summary,a')).find(function (el) { return focusKey(el) === focused; }) || doc.getElementById('console-response-title');
      if (nextFocus) nextFocus.focus({ preventScroll: true });
    }
  }
  function describeFact(f) {
    if (!f) return 'not in this view';
    return (f.quality === 'missing' ? 'unavailable' : text(f.value) + (f.unit ? ' ' + f.unit : '')) + ' [' + f.quality + '; ' + text(f.measuredAt || 'period unavailable') + ']';
  }
  function compareAssessments(before, after) {
    var sameSelection = before.selectionKey && after.selectionKey ? before.selectionKey === after.selectionKey : before.context === after.context;
    var out = { at: new Date().toISOString(), selectionChanged: before.slug !== after.slug || !sameSelection || before.scenario !== after.scenario, evidence: [], priorities: [] };
    if (out.selectionChanged) return out;
    var previous = new Map(before.evidence.map(function (f) { return [f.id, f]; })), next = new Map(after.evidence.map(function (f) { return [f.id, f]; }));
    function comparable(f) { return f && [f.label, f.value, f.unit, f.quality, f.basis, f.measuredAt, f.source]; }
    new Set(Array.from(previous.keys()).concat(Array.from(next.keys()))).forEach(function (id) {
      var a = previous.get(id), b = next.get(id);
      if (signature(comparable(a)) !== signature(comparable(b))) out.evidence.push({ id: id, label: (b || a).label || id, before: describeFact(a), after: describeFact(b), sourceBefore: a && a.source || null, sourceAfter: b && b.source || null });
    });
    var oldActions = new Map(before.actions.filter(function (a) { return a.featured && a.selected; }).map(function (a) { return [a.track + ':' + a.id, a]; }));
    var newActions = new Map(after.actions.filter(function (a) { return a.featured && a.selected; }).map(function (a) { return [a.track + ':' + a.id, a]; }));
    new Set(Array.from(oldActions.keys()).concat(Array.from(newActions.keys()))).forEach(function (id) {
      var a = oldActions.get(id), b = newActions.get(id), item = b || a;
      if (!a || !b || a.position !== b.position || a.priority !== b.priority || a.reason !== b.reason) out.priorities.push({ id: item.id, track: item.track, title: item.title, change: !b ? 'no longer applicable to this evidence' : !a ? 'now priority ' + b.position : 'priority ' + a.position + ' → ' + b.position, reason: b ? b.reason : '' });
    });
    return out;
  }
  function set(input) {
    // A forecast can expire while its source payload is unchanged. Make that
    // transition an evidence revision on the existing visible-minute refresh.
    var impact = input && input.impacts || {};
    var clockState = (impact.items || []).concat(impact.records || []).filter(function (r) { return r && r.kind === 'forecast' && r.validAt != null; }).map(function (r) { var at = Date.parse(r.validAt); return [r.id, Number.isFinite(at) && at > Date.now()]; });
    var assessment = evaluate(input), priorities = assessment.actions.filter(function (a) { return a.featured; });
    var nextRevision = signature([input || {}, clockState, priorities]);
    if (nextRevision === revision) return;
    function evidenceOnly(value) {
      if (Array.isArray(value)) return value.map(evidenceOnly);
      if (value && typeof value === 'object') { var out = {}; Object.keys(value).forEach(function (key) { if (key !== 'checkedAt') out[key] = evidenceOnly(value[key]); }); return out; }
      return value;
    }
    // A successful check can renew a derived freshness cutoff without changing
    // the evidence or chosen steps. Preserve notes until the assessment changes.
    var priorityAssessment = priorities.map(function (a) { return {
      id: a.id, track: a.track, priority: a.priority, rank: a.rank, position: a.position,
      signal: a.signal, current: a.current, practice: a.practice, selected: a.selected,
      withheld: a.withheld, withheldReasons: a.withheldReasons,
      evidenceIds: a.evidenceIds, diagnosticIds: a.diagnosticIds
    }; });
    var nextEvidence = signature([evidenceOnly(input || {}), clockState, priorityAssessment]);
    if (nextEvidence !== evidenceRevision) {
      changes = lastAssessment ? compareAssessments(lastAssessment, assessment) : null;
      lastAssessment = assessment;
      acknowledgments.clear(); manualReview.clear();
    }
    evidenceRevision = nextEvidence; revision = nextRevision; payload = input || {}; render();
  }
  function connect(read, selectors) {
    var stopped = false, timer = null, interval = null, observer = null, targets = Array.isArray(selectors) ? selectors : selectors ? [selectors] : [];
    function update() {
      if (stopped) return;
      try { set(read()); }
      catch (error) { set({ title: 'Response plan', context: 'Evidence reader unavailable', limitations: ['The console evidence could not be read. Verify the original sources before deciding.'] }); }
    }
    function start() {
      if (stopped) return;
      update();
      if (!doc || !root.MutationObserver) return;
      observer = new root.MutationObserver(function (records) {
        var relevant = records.some(function (record) {
          var el = record.target.nodeType === 1 ? record.target : record.target.parentElement;
          if (!el || el.closest('#console-response')) return false;
          return !targets.length || targets.some(function (selector) { return el.matches(selector) || !!el.closest(selector) || !!el.querySelector(selector); });
        });
        if (relevant) { root.clearTimeout(timer); timer = root.setTimeout(update, 80); }
      });
      observer.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true });
      interval = root.setInterval(function () { if (!doc.hidden) update(); }, 60000);
      doc.addEventListener('visibilitychange', visible);
      doc.addEventListener('change', changed);
      doc.addEventListener('input', changed);
    }
    function visible() { if (!doc.hidden) update(); }
    function changed(event) { if (!event.target.closest('#console-response') && (!targets.length || targets.some(function (selector) { return event.target.matches(selector) || !!event.target.closest(selector); }))) update(); }
    if (doc && doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true }); else start();
    return function () { stopped = true; root.clearTimeout(timer); root.clearInterval(interval); if (observer) observer.disconnect(); if (doc) { doc.removeEventListener('visibilitychange', visible); doc.removeEventListener('change', changed); doc.removeEventListener('input', changed); } };
  }
  function exportPlan() {
    if (payload) set(payload); // Reconcile expiry even before the next visible-minute tick.
    return { exportedAt: new Date().toISOString(), note: 'Local planning review; not a record of completed operations.',
      track: track, plan: currentPlan(), changesSincePreviousUpdate: changes, acknowledgments: Array.from(acknowledgments) };
  }
  function download() {
    var blob = new Blob([JSON.stringify(exportPlan(), null, 2)], { type: 'application/json' });
    var link = doc.createElement('a'), objectURL = root.URL.createObjectURL(blob);
    link.href = objectURL; link.download = 'console-response-plan.json'; link.click(); root.setTimeout(function () { root.URL.revokeObjectURL(objectURL); }, 1000);
  }
  function wasserstein1(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || !left.length || !right.length ||
        left.concat(right).some(function (n) { return typeof n !== 'number' || !Number.isFinite(n); })) return null;
    var a = left.slice().sort(function (x, y) { return x - y; }), b = right.slice().sort(function (x, y) { return x - y; });
    var points = Array.from(new Set(a.concat(b))).sort(function (x, y) { return x - y; }), i = 0, j = 0, area = 0;
    for (var k = 0; k < points.length - 1; k++) {
      while (i < a.length && a[i] <= points[k]) i++;
      while (j < b.length && b[j] <= points[k]) j++;
      area += Math.abs(i / a.length - j / b.length) * (points[k + 1] - points[k]);
    }
    return area;
  }
  var definitions = Object.freeze(metrics.map(function (m, i) { return Object.freeze({ id: i + 1, name: m[0], pillar: m[1], requiredInputs: m[2] }); }));
  var api = { registerPrioritizer: registerPrioritizer, set: set, connect: connect, evaluate: evaluate, exportPlan: exportPlan, metricDefinitions: definitions, math: { wasserstein1: wasserstein1 }, version: 1 };
  root.ConsoleResponse = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (doc) { if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mount, { once: true }); else mount(); }
})(typeof window !== 'undefined' ? window : globalThis);
