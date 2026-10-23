/* Pure numerical and authoring helpers. Embedded with the response layer; no network or imports. */
(function () {
  'use strict';
  const names = ['Population Balance', 'Wasserstein Distance (Shape Imbalance)', 'Density Symmetry',
    'Euler Characteristic (Contiguity)', 'Persistence Gap', 'Spatial Mixing (scale-stability)',
    'Variational Free Energy', 'Contamination AUC', 'Frontier Risk (Buffer Depth AUC)', 'Mobility Network Leakage'];
  function wasserstein(a, b) {
    return window.ConsoleResponse.math.wasserstein1(a, b);
  }
  function components(ids, edges) {
    if (!Array.isArray(ids) || !Array.isArray(edges) || !ids.length) return null;
    const adjacency = new Map(ids.map(id => [id, new Set()]));
    for (const [a, b] of edges) if (adjacency.has(a) && adjacency.has(b)) {
      adjacency.get(a).add(b); adjacency.get(b).add(a);
    }
    let count = 0; const seen = new Set();
    for (const id of adjacency.keys()) if (!seen.has(id)) {
      count++; const queue = [id]; seen.add(id);
      for (let i = 0; i < queue.length; i++) for (const next of adjacency.get(queue[i]))
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
    return count;
  }
  function build(spec) {
    const overrides = spec.overrides || {};
    const diagnostics = names.map((label, index) => {
      const id = index + 1, row = spec.rows[index] || {}, override = overrides[id] || {};
      return { id: 'metric-' + id, metricId: id, label,
        pillar: id <= 3 ? 'comparison' : id <= 7 ? 'structure' : 'spillover',
        status: 'unknown', evidenceIds: [], scope: 'planning',
        rule: row.rule || 'Assess this dimension against a documented local comparison and review criterion.',
        explanation: row.explanation || 'Not assessable from the public inputs currently supplied.',
        analyticalMitigation: row.analyticalMitigation || 'Document the comparison, input quality and scope before interpreting this dimension.',
        requiredInputs: row.requiredInputs || [], ...override };
    });
    const actions = [];
    diagnostics.forEach((diagnostic, index) => {
      const row = spec.rows[index] || {};
      for (const track of ['public', 'operator']) for (const when of ['triggered', 'unknown']) {
        const next = (track === 'public' ? row.publicAction : row.operatorAction) || 'Confirm the required inputs with the responsible data source.';
        actions.push({ id: spec.slug + '-m' + (index + 1) + '-' + track + '-' + when,
          metricIds: [index + 1], diagnosticIds: [diagnostic.id], track, when,
          phase: when === 'unknown' ? 'verify' : (row.phase || 'prepare'),
          title: (when === 'unknown' ? 'Resolve the input gap: ' : 'Review: ') + diagnostic.label,
          nextStep: (when === 'unknown' ? 'This dimension is not machine-assessed. ' : '') + next,
          escalateWhen: row.escalateWhen || spec.escalateWhen,
          authorityUrl: row.authorityUrl || spec.authorityUrl });
      }
    });
    return { slug: spec.slug, selectionKey: spec.selectionKey, title: spec.title, context: spec.context,
      scenario: !!spec.scenario, evidence: spec.evidence || [], diagnostics, impacts: spec.impacts,
      actions: [...(spec.baseline || []), ...actions], network: spec.network,
      limitations: spec.limitations || [] };
  }
  window.ConsoleResponse.domain = { wasserstein, components, build };
})();
