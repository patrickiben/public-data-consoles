/* Public-evidence planning sequence, not clinical triage or a risk score.
 * Pure selectors: no DOM, native/private state, network or ambient clock.
 * A rank compares records only where unit, cohort and reporting period agree.
 */
(function (root) {
  'use strict';
  const R = root.ConsoleResponse;
  if (!R || typeof R.registerPrioritizer !== 'function') return;
  const urls = {
    wb: 'https://data.worldbank.org/', who: 'https://www.who.int/data/gho',
    vaccine: 'https://www.who.int/news-room/fact-sheets/detail/immunization-coverage',
    wash: 'https://www.who.int/health-topics/water-sanitation-and-hygiene-wash',
    respiratory: 'https://www.cdc.gov/respiratory-viruses/data/index.html',
    overdose: 'https://www.cdc.gov/nchs/nvss/vsrr/drug-overdose-data.htm',
    nhs: 'https://www.nhsinform.scot/campaigns/right-care-right-place',
    cancer: 'https://gco.iarc.who.int/',
    amr: 'https://www.who.int/news-room/fact-sheets/detail/antimicrobial-resistance',
    ntd: 'https://www.who.int/health-topics/neglected-tropical-diseases',
    outbreak: 'https://www.who.int/emergencies/disease-outbreak-news'
  };
  const numeric = v => typeof v === 'number' && Number.isFinite(v);
  const fmt = n => numeric(n) ? n.toLocaleString('en-US', {maximumFractionDigits: 3}) : 'unavailable';
  const safeURL = s => typeof s === 'string' && /^https?:\/\/[^\s]+$/i.test(s);
  function period(s) {
    if (typeof s !== 'string' || !/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(s)) return null;
    const iso = s.length === 4 ? s + '-01-01' : s.length === 7 ? s + '-01' : s;
    const ms = Date.parse(iso + 'T00:00:00Z');
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === iso ? ms : null;
  }
  function facts(input) {
    const rows = Array.isArray(input.evidence) ? input.evidence.filter(Boolean) : [], counts = new Map();
    rows.forEach(f => counts.set(f.id, (counts.get(f.id) || 0) + 1));
    return rows.filter(f => typeof f.id === 'string' && counts.get(f.id) === 1);
  }
  const get = (rows, id) => rows.find(f => f.id === id);
  const ids = rows => [...new Set(rows.filter(Boolean).map(f => f.id))];
  const usable = f => !!f && ['current', 'historical'].includes(f.quality) &&
    (numeric(f.value) || typeof f.value === 'string' && !!f.value.trim()) &&
    period(f.measuredAt) != null && safeURL(f.source);
  const number = f => usable(f) && numeric(f.value);
  const current = f => usable(f) && f.quality === 'current' && f.basis !== 'demo';
  const cleanLabel = f => String(f?.label || 'Selected public context');
  const place = input => String(input.impacts?.scope || input.context || input.slug).split(' · ')[0];
  const selectedName = f => cleanLabel(f).split(' · ').slice(1).join(' · ') || cleanLabel(f);
  function concept(key, data) { return Object.assign({key, phase: 'review', signal: 'planning', priority: 'planned', evidenceIds: [], requiresCurrent: false}, data); }
  function finalize(input, concepts, authority) {
    return concepts.slice(0, 5).flatMap((c, index) => ['public', 'operator'].map(track => {
      const e = facts(input), linked = c.evidenceIds.map(id => get(e, id)).filter(Boolean);
      const practice = !!input.scenario || linked.some(f => f.basis === 'demo');
      return {
        id: 'health-priority-' + input.slug + '-' + c.key + '-' + track,
        track, phase: practice ? 'review' : c.phase, when: 'always', evidenceIds: c.evidenceIds,
        metricIds: c.metricIds || [], parameterLinks: c.parameterLinks || [],
        decisionBasis: (c.parameterLinks || []).length ? undefined : practice
          ? 'This is a practice review, not a real-world ten-parameter alarm.'
          : c.signal === 'data-gap'
            ? 'This step resolves a public-source gap; no parameter score establishes an all-clear.'
            : 'This step reviews the selected public record and reporting period, not a ten-parameter score.',
        title: (practice ? 'Practice: ' : '') + c.title,
        target: c.target, reason: c.reason, nextStep: track === 'public' ? c.publicStep : c.operatorStep,
        priority: practice ? 'planned' : c.priority, rank: index + 1,
        timing: c.timing || 'Before the next planning review or use of these figures',
        signal: practice ? 'scenario' : c.signal, requiresCurrent: practice ? false : c.requiresCurrent,
        validUntil: practice ? undefined : c.validUntil,
        escalateWhen: c.escalateWhen || 'The responsible authority verifies a current service concern, or a source discrepancy changes the planning conclusion.',
        escalateTo: track === 'public' ? c.publicOwner || 'The relevant health authority or service information team' : c.operatorOwner || 'The accountable public-health/service planning lead and source data owner',
        authorityUrl: c.authorityUrl || authority,
        reviewAfter: c.reviewAfter || 'Recheck after the next official release, source revision or change of selection.'
      };
    }));
  }
  function gap(key, target, rows, reason, specific) {
    return concept(key, {title: 'Verify ' + target, target, evidenceIds: ids(rows), signal: 'data-gap', phase: 'verify', reason,
      publicStep: 'Check the linked reporting period and coverage with the publishing health authority. ' + specific,
      operatorStep: 'Recover and validate the named source period, definition and coverage before using this selection. ' + specific,
      timing: 'Before comparing or acting on this selection',
      escalateWhen: 'The missing, stale or conflicting record affects an actual decision or conflicts with an official current report.'});
  }
  function applicability(input, rows, target, detail, authority) {
    const dates = [...new Set(rows.filter(usable).map(f => f.measuredAt))].sort();
    return concept('applicability', {title: 'Confirm current local applicability', target,
      evidenceIds: ids(rows), signal: dates.length ? 'planning' : 'data-gap', phase: 'verify',
      reason: 'Source periods: ' + (dates.join(', ') || 'not available') + '. ' + detail,
      publicStep: 'Use the responsible local authority’s current information for practical decisions; ask whether this dated source represents your area and population.',
      operatorStep: 'Reconcile current local coverage, definitions and capacity with this dated planning evidence; document the decision owner and unresolved inputs.',
      authorityUrl: authority, timing: 'Before a real service or public-health decision',
      reviewAfter: 'Recheck when local conditions, cohort definitions or the official source release change.'});
  }
  const wb = [
    'global-air-pollution', 'global-demographic-transition', 'global-health-atlas', 'global-health-systems',
    'global-hiv-tb-malaria', 'global-immunization', 'global-maternal-child-health', 'global-mental-health',
    'global-ncd-burden', 'global-nutrition', 'global-road-safety', 'global-wash'
  ];
  const coverageSets = {
    'global-wash': {keys: ['smdw', 'basw', 'smss', 'bass', 'hygn', 'odfc'], cohort: 'total residents', url: urls.wash},
    'global-immunization': {keys: ['dtp', 'mcv'], cohort: 'children aged 12–23 months', url: urls.vaccine},
    'global-health-atlas': {keys: ['dtp', 'mcv'], cohort: 'children aged 12–23 months', url: urls.vaccine}
  };
  function worldbank(input) {
    const e = facts(input), selected = get(e, 'selected-value'), country = place(input), groups = [];
    if (!number(selected)) groups.push(gap('selected-source', country + ' · ' + selectedName(selected), [selected],
      'The selected annual source value, reporting year or public source link is unavailable or stale.',
      'Do not substitute a neighboring year, a zero or another country.'));
    const config = coverageSets[input.slug];
    if (config) {
      const rows = config.keys.map(key => ({key, f: get(e, 'impact-source-' + key)}))
        .filter(r => number(r.f) && /^\d{4}$/.test(r.f.measuredAt) && r.f.value >= 0 && r.f.value <= 100);
      // Exact-year comparisons only. The newest year with at least two compatible
      // measures wins; singleton records remain selected context, never a league table.
      const years = [...new Set(rows.map(r => r.f.measuredAt))].sort().reverse();
      const year = years.find(y => rows.filter(r => r.f.measuredAt === y).length >= 2);
      const eligible = rows.filter(r => r.f.measuredAt === year).map(r => ({...r, gap: r.key === 'odfc' ? r.f.value : 100 - r.f.value}))
        .sort((a, b) => b.gap - a.gap || a.key.localeCompare(b.key));
      eligible.slice(0, 2).forEach((r, index) => {
        const meaning = r.key === 'odfc' ? 'reported open-defecation share' : 'share outside this reported service standard';
        groups.push(concept('coverage-' + r.key, {title: (index ? 'Then review ' : 'Review the largest comparable coverage gap: ') + selectedName(r.f),
          target: country + ' · ' + selectedName(r.f) + ' · ' + year, evidenceIds: [r.f.id],
          reason: fmt(r.gap) + '% ' + meaning + ' among ' + config.cohort + ' in ' + year +
            '; source value ' + fmt(r.f.value) + '%. Ranked only among ' + eligible.length + ' compatible measures in that exact year. Overlapping standards are not summed; this orders coverage, not health harm.',
          publicStep: 'Ask the responsible programme which communities in this cohort lack the specified service and read its current local coverage plan.',
          operatorStep: 'Review the corresponding same-cohort subnational coverage and delivery constraints before prioritizing programme outreach or capacity; retain the source definition and denominator.',
          authorityUrl: config.url, timing: 'At the next programme planning review, after confirming the source year'}));
      });
      if (!year) groups.push(gap('coverage-alignment', country + ' · comparable ' + config.cohort + ' coverage', rows.map(r => r.f),
        'No pair of supported coverage measures shares an exact observation year and declared cohort.',
        'Keep different years and vaccine/service cohorts separate; no cross-year gap ranking is supplied.'));
    }
    if (number(selected) && !groups.some(g => g.evidenceIds.some(id => {
      const f = get(e, id); return f && f.label === selected.label && f.measuredAt === selected.measuredAt && f.value === selected.value;
    }))) {
      const items = input.impacts?.items || [], source = e.find(f => f.id.startsWith('impact-source-') && f.label === selected.label && f.value === selected.value && f.measuredAt === selected.measuredAt);
      const quantity = source && items.find(i => numeric(i.value) && i.evidenceIds?.includes(source.id) && i.evidenceIds.every(id => number(get(e, id))));
      groups.push(concept('selected-context', {title: 'Review the selected source-defined measure', target: country + ' · ' + selectedName(selected),
        evidenceIds: quantity ? quantity.evidenceIds : [selected.id],
        reason: fmt(selected.value) + ' ' + (selected.unit || 'source units') + ' in ' + selected.measuredAt +
          (quantity && quantity.unit !== selected.unit ? '; supported annual context: ' + fmt(quantity.value) + ' ' + quantity.unit + '. ' + quantity.method : '.') +
          ' Different conditions, cohorts and units are not ranked as equivalent need or clinical risk.',
        publicStep: 'Read the named cohort, measurement definition and year; ask the relevant programme about its current local situation and service plan.',
        operatorStep: 'Review this selected measure in its own programme and cohort, validate any exact-year denominator and compare current subnational records before resource decisions.',
        timing: 'At the next review of this programme or population'}));
    }
    const baseline = number(selected) ? [selected] : e.filter(f => f.id.startsWith('impact-source-') && number(f)).slice(0, 2);
    groups.push(applicability(input, baseline, country + ' · local programme applicability',
      'National annual measures and geographic population/land comparisons do not identify service catchments, current access equity, staffed capacity or individual outcomes.', urls.wb));
    return finalize(input, groups, config?.url || urls.who);
  }
  function nhs(input) {
    const e = facts(input), groups = [], siteFacts = e.filter(f => /^impact-site-.+-o12$/.test(f.id));
    const sites = siteFacts.map(f => ({f, att: get(e, f.id.replace(/-o12$/, '-att'))}));
    const usableSites = sites.filter(s => number(s.f) && number(s.att) && s.f.unit === 'attendances' && s.att.unit === 'attendances' && Number.isSafeInteger(s.f.value) && s.f.value >= 0 &&
      Number.isSafeInteger(s.att.value) && s.att.value >= s.f.value && s.f.measuredAt === s.att.measuredAt);
    const dates = usableSites.map(s => s.f.measuredAt).sort(), latest = dates.at(-1);
    const cohort = usableSites.filter(s => s.f.measuredAt === latest).sort((a, b) => b.f.value - a.f.value || a.f.id.localeCompare(b.f.id));
    const missing = sites.filter(s => !usableSites.includes(s));
    if (missing.length || !cohort.length) {
      const first = missing.slice().sort((a, b) => (number(b.att) ? b.att.value : -1) - (number(a.att) ? a.att.value : -1) || a.f.id.localeCompare(b.f.id))[0];
      groups.push(gap('site-coverage', first ? cleanLabel(first.f).replace(/ · o12$/, '') + ' · over-12-hour count' : 'NHS site-week workload coverage',
        first ? [first.f, first.att] : siteFacts,
        missing.length + ' site records lack a valid matched-week attendance/over-12-hour pair; missing values do not mean no long waits.',
        'Recover the published site counts; do not invert a rounded percentage or fill an unknown with zero.'));
    }
    cohort.slice(0, 2).forEach((s, index) => groups.push(concept('site-' + s.f.id, {
      title: (index ? 'Then review reported waits at ' : 'Review the largest reported long-wait workload: ') + cleanLabel(s.f).replace(/ · o12$/, ''),
      target: cleanLabel(s.f).replace(/ · o12$/, '') + ' · week ' + latest, evidenceIds: ids([s.f, s.att]),
      reason: fmt(s.f.value) + ' reported attendances over 12 hours out of ' + fmt(s.att.value) + ' attendances in ' + latest +
        '; ordered by reported count among ' + cohort.length + ' complete same-week sites. Visits can repeat; over-12-hour counts are already inside over-8-hour counts. This is workload, not adjusted performance or individual risk.',
      publicStep: 'Check current NHS guidance and the board’s service information. A historical wait count should not direct where you seek care or delay needed care.',
      operatorStep: 'Reconcile the site’s current timestamped queue, case mix, staffed capacity and approved escalation pathway before choosing any operational response.',
      timing: 'At the next site-capacity planning review; verify current conditions before operational use'})));
    const delayed = e.filter(f => f.id.startsWith('impact-delay-') && number(f) && Number.isSafeInteger(f.value) && f.value >= 0);
    const month = delayed.map(f => f.measuredAt).sort().at(-1), top = delayed.filter(f => f.measuredAt === month).sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))[0];
    if (top) groups.push(concept('delayed-board', {title: 'Review the separately dated discharge census', target: cleanLabel(top) + ' · ' + month,
      evidenceIds: [top.id], reason: fmt(top.value) + ' people aged 18+ in the All Delay Reasons census, the largest reported board count in this source month. This census is neither added to A&E visits nor converted into future bed days.',
      publicStep: 'Ask the board about its current discharge-support and continuity information; the census does not predict an individual discharge.',
      operatorStep: 'Review current discharge coordination and support constraints with the accountable board teams; keep this monthly census separate from the weekly A&E stream.', timing: 'At the next board discharge-planning review'}));
    groups.push(applicability(input, [get(e, 'impact-ae-att'), get(e, 'impact-delayed')].filter(Boolean), 'NHS Scotland · current service and source dates',
      'Historical A&E weeks, discharge months and bed/care-use quarters differ; none supplies a live queue, current spare beds or a clinical routing decision.', urls.nhs));
    return finalize(input, groups, urls.nhs);
  }
  function cdc(input) {
    const respiratory = input.slug === 'us-respiratory-surveillance', e = facts(input), groups = [];
    const main = get(e, respiratory ? 'ed' : 'selected-total'), change = get(e, respiratory ? 'four-week-change' : 'year-change');
    const scope = respiratory ? place(input) : String(input.impacts?.scope || input.context || '').split(' · ').slice(0, 2).join(' · ');
    if (!current(main) || !numeric(main?.value)) groups.push(gap('surveillance-source', scope + ' · ' + cleanLabel(main), [main, change],
      'The selected surveillance value has no applicable current source period. A stale or retained display record cannot establish the present trend.',
      'Use the next successful official release; missing surveillance does not establish low activity.'));
    else {
      const aligned = current(change) && numeric(change.value) && change.measuredAt === main.measuredAt;
      groups.push(concept('selected-trend', {title: 'Review the selected reported trend', target: scope + ' · ' + main.measuredAt,
        evidenceIds: ids(aligned ? [main, change] : [main]), priority: 'next', signal: 'observed-condition', requiresCurrent: true,
        validUntil: surveillanceExpiry(main.measuredAt, respiratory),
        reason: cleanLabel(main) + ': ' + fmt(main.value) + ' ' + main.unit + ' at ' + main.measuredAt +
          (aligned ? '; ' + fmt(change.value) + ' ' + change.unit + ' ' + (respiratory ? 'versus exactly four weeks earlier.' : 'versus the same ending month one year earlier.') : '; the matched change is unavailable.') +
          (respiratory ? ' An ED share is not an infection probability or patient count.' : ' Predicted means lag-adjusted past rolling-year deaths, not future deaths; overlapping drug classes are not summed.'),
        publicStep: 'Read the selected condition, source period and current CDC/local health-department information; this descriptive trend supplies no individual diagnosis or triage instruction.',
        operatorStep: 'Review source revisions and the selected condition against compatible current local surveillance and your approved preparedness pathway; no numeric clinical trigger is inferred.',
        timing: 'At the next official surveillance check, before local operational interpretation',
        reviewAfter: 'Recheck on the next official release, revision or condition selection change.'}));
    }
    const pattern = respiratory ? /^impact-state-/ : /^impact-jurisdiction-/;
    const rows = e.filter(f => pattern.test(f.id));
    const matchedPeriod = respiratory ? get(e, 'wastewater')?.measuredAt : main?.measuredAt;
    const good = rows.filter(f => current(f) && numeric(f.value) && f.value >= 0 && f.measuredAt === matchedPeriod);
    const missing = rows.filter(f => !good.includes(f));
    if (missing.length || !good.length) groups.push(gap('geographic-coverage', scope + ' · ' + (missing[0] ? cleanLabel(missing[0]) : 'geographic reporting'),
      missing.length ? missing.slice(0, 3) : [get(e, 'scale-coverage')],
      missing.length + ' of ' + rows.length + ' downloaded jurisdiction records lack a valid exact-period report for ' + (matchedPeriod || 'the selected period') +
        '. ' + (respiratory ? 'Wastewater coverage is reporting sites, not residents; unreported areas are not low-activity areas.' : 'Retained older display values are not substituted; NY excludes NYC and YC is separate.'),
      'Verify the named jurisdiction and the published coverage before making a geographic comparison.'));
    if (!respiratory && good.length) {
      const top = good.slice().sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))[0];
      groups.push(concept('jurisdiction-workload', {title: 'Review the largest matched-period reported count', target: cleanLabel(top) + ' · ' + matchedPeriod,
        evidenceIds: [top.id], signal: 'observed-condition', priority: 'next', requiresCurrent: true,
        validUntil: surveillanceExpiry(top.measuredAt, false),
        reason: fmt(top.value) + ' lag-adjusted predicted deaths in the rolling year among ' + good.length + ' compatible downloaded jurisdiction reports. A count orders reported workload, not per-capita risk, current incidents or treatment benefit; jurisdictions and drug classes are not summed.',
        publicStep: 'Read the jurisdiction definition and current health-department prevention/service information; this count does not predict personal harm.',
        operatorStep: 'Review the jurisdiction’s data quality and compatible local prevention/service coverage; obtain matched population definitions before any rate or equity comparison.',
        timing: 'At the next provisional-mortality planning review'}));
    }
    const coverage = get(e, 'scale-coverage'), disagreement = get(e, 'scale-disagreement');
    if (current(coverage) && current(disagreement) && numeric(coverage.value) && coverage.value > 0 && numeric(disagreement.value) && coverage.measuredAt === disagreement.measuredAt) {
      groups.push(concept('direction-coverage', {title: 'Review where the reporting subset changes direction', target: scope + ' · matched geographic direction',
        evidenceIds: ids([coverage, disagreement]), metricIds: [6], signal: 'observed-condition', priority: 'next', requiresCurrent: true,
        parameterLinks: [{metricId: 6,
          why: 'This scale-stability adaptation checks whether the reporting subset changes the overall direction; it does not measure geographic spread.',
          whyNow: 'Check source coverage first, then review local differences before interpreting the aggregate direction; the next release can change both.'}],
        validUntil: surveillanceExpiry(coverage.measuredAt, respiratory),
        reason: fmt(disagreement.value) + '% direction disagreement among ' + fmt(coverage.value) + ' ' + coverage.unit + ' at ' + coverage.measuredAt +
          '. ' + (respiratory ? 'Derived ordinal site-category means are not concentration, prevalence or official national WVAL.' : 'Rolling-year directions are not causal spillover or present-month incidents.') + ' Agreement in a partial reporting subset does not establish an all-clear.',
        publicStep: 'Check whether your area and the selected condition are represented before interpreting a national direction.',
        operatorStep: 'Inspect the exact endpoint weeks/months, source definitions and missing jurisdictions; review local directions separately rather than averaging incompatible signals.',
        timing: 'After the selected-source check, before geographic interpretation'}));
    }
    groups.push(applicability(input, main ? [main] : [], scope + ' · local applicability',
      respiratory ? 'ED shares, hospitalization rates and wastewater site categories use different populations and periods; no calibrated individual-outcome or hospital-demand forecast is supplied.' :
        'Provisional rolling-year mortality is revisable, lagged and not an individual prognosis, current emergency count or intervention-benefit estimate.', respiratory ? urls.respiratory : urls.overdose));
    return finalize(input, groups, respiratory ? urls.respiratory : urls.overdose);
  }
  // Match the maintained adapters' display-age limits exactly. These are data-age
  // guards, not clinical deadlines. Core rechecks expiry even on an unchanged export.
  function surveillanceExpiry(value, respiratory) {
    if (period(value) == null) return undefined;
    const base = respiratory ? period(value) : /^\d{4}-\d{2}$/.test(value) ?
      Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)), 0) : null;
    return base == null ? undefined : new Date(base + (respiratory ? 35 : 240) * 86400000).toISOString();
  }
  function reference(input) {
    const e = facts(input), groups = [], selected = get(e, 'published-estimate'), target = cleanLabel(selected);
    const cancer = input.slug === 'global-cancer', ntd = input.slug === 'global-ntds', url = cancer ? urls.cancer : ntd ? urls.ntd : urls.amr;
    const dateGap = get(e, 'disease-specific-period');
    if (!number(selected) || ntd && !usable(dateGap)) groups.push(gap('reference-date', target + ' · disease-specific definition and date', [selected, dateGap],
      ntd ? 'The selected disease reference has mixed burden definitions and no exact disease-specific observation year. The 2024 intervention headline does not date this disease row.' : 'The selected published estimate lacks a valid quantity, observation period or public source.',
      'Verify the exact publication table, observation year, population and estimate definition; do not use retrieval time as the measurement date.'));
    if (number(selected) && !ntd) groups.push(concept('selected-burden', {title: 'Review the selected published burden context', target,
      evidenceIds: [selected.id], signal: 'reference', reason: fmt(selected.value) + ' ' + selected.unit + ' in ' + selected.measuredAt +
        (cancer ? '. Modeled incidence and mortality are separate populations; no survival or case-fatality ratio is calculated.' : '. Attributable and associated AMR deaths use different counterfactuals and are not added; the estimate is not current local susceptibility.'),
      publicStep: 'Read the selected site/pathogen definition and reference year; ask the responsible programme about current local services and evidence.',
      operatorStep: cancer ? 'Use current registry scope, population, stage mix and service records to review actual local workload before capacity planning.' :
        'Review current local surveillance and laboratory coverage with the accountable surveillance/stewardship team; this global reference does not select an antibiotic or predict a patient outcome.',
      timing: 'At the next programme or service-planning review'}));
    const headline = get(e, 'intervention-headline');
    if (ntd && number(headline)) groups.push(concept('intervention-headline', {title: 'Use the dated intervention-coverage context separately', target: 'WHO NTD programme context · ' + headline.measuredAt,
      evidenceIds: [headline.id], signal: 'reference', reason: fmt(headline.value) + ' ' + headline.unit + ' in ' + headline.measuredAt + '. People requiring interventions are not infections; disease rows with overlapping or different definitions are not summed.',
      publicStep: 'Ask the relevant programme which disease-specific interventions and communities this headline covers.',
      operatorStep: 'Validate the disease-specific eligible population, intervention coverage and observation year before prioritizing delivery gaps.', timing: 'At the next disease-programme planning review'}));
    groups.push(applicability(input, ntd && number(headline) ? [headline] : selected ? [selected] : [], target + ' · current local evidence',
      'A published global burden reference does not supply a current local catchment, capacity, individual prognosis or causal intervention benefit.', url));
    return finalize(input, groups, url);
  }
  function outbreak(input) {
    const e = facts(input), groups = [], rows = e.filter(f => /^mpox-country-.+-cases$/.test(f.id)), good = rows.filter(number);
    const ordered = good.slice().sort((a, b) => period(a.measuredAt) - period(b.measuredAt) || a.id.localeCompare(b.id));
    const oldest = ordered[0], newest = ordered.at(-1), missing = rows.filter(f => !number(f));
    if (missing.length) groups.push(gap('country-date-gap', cleanLabel(missing[0]), missing.slice(0, 3), missing.length + ' country cumulative records lack a valid reporting date/count.', 'Do not substitute a World date for a country’s report date.'));
    groups.push(concept('country-alignment', {title: 'Align the oldest country report before comparison', target: oldest ? cleanLabel(oldest) + ' · ' + oldest.measuredAt : 'Mpox country reporting dates',
      evidenceIds: ids(oldest ? [oldest, newest] : [get(e, 'mpox-dates')]), signal: oldest ? 'planning' : 'data-gap', phase: 'verify',
      reason: oldest ? 'Oldest supported country date ' + oldest.measuredAt + '; newest ' + newest.measuredAt + '; ' + fmt((period(newest.measuredAt) - period(oldest.measuredAt)) / 86400000) +
        ' days apart among ' + good.length + ' dated rows. Cumulative cases cannot establish active burden, current incidence or transmission links.' : 'No dated country comparison is supported.',
      publicStep: 'Read each country’s date and current health-authority notices before repeating a cumulative ranking.',
      operatorStep: 'Obtain compatible incident-case definitions, surveillance coverage and matched epidemiological intervals before geographic response comparisons.', timing: 'Before interpreting country rankings'}));
    const measles = get(e, 'measles-count'), window = get(e, 'annual'), partial = /partial|year.to.date/i.test(String(window?.value || '') + ' ' + String(measles?.note || ''));
    groups.push(concept('measles-window', {title: 'Verify the measles archive window', target: 'U.S. measles · ' + (measles?.measuredAt || 'year unavailable'),
      evidenceIds: ids([measles, window]), signal: number(measles) ? 'reference' : 'data-gap', phase: 'verify',
      reason: number(measles) ? fmt(measles.value) + ' archived confirmed cases in ' + measles.measuredAt + (partial ? '; partial/year-to-date cutoff is not supplied, so a full-year comparison is unsupported.' : '; this dated annual total is not a current local count.') : 'No valid archived measles count/year is available.',
      publicStep: 'Use current CDC/local health-department information for present conditions; retain the archived period label when sharing this figure.',
      operatorStep: 'Recover the exact epidemiological cutoff and case-definition revision, then compare matched windows separately from full-year totals.',
      authorityUrl: 'https://www.cdc.gov/measles/data-research/index.html', timing: 'Before a year-on-year claim or local interpretation'}));
    return finalize(input, groups, urls.outbreak);
  }
  wb.forEach(slug => R.registerPrioritizer(slug, worldbank));
  R.registerPrioritizer('nhs-scotland-strain', nhs);
  ['us-respiratory-surveillance', 'us-overdose-surveillance'].forEach(slug => R.registerPrioritizer(slug, cdc));
  ['global-cancer', 'global-ntds', 'antimicrobial-resistance'].forEach(slug => R.registerPrioritizer(slug, reference));
  R.registerPrioritizer('global-outbreak-tracker', outbreak);
})(typeof window === 'object' ? window : globalThis);
