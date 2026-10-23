# Response-plan integration contract

Maintainer source, embedded into each single-file console. No runtime import, provider key,
external library or network request is added by the response layer.

The shared script is installed early in `<head>` and exposes `window.ConsoleResponse.set(payload)`.
Adapters call it after the existing data/render state changes and reset it to unknown when a new
location/event/query starts. Calls made before the response panel mounts are retained. The generator
inserts a response panel and an accessible shortcut; it does not replace existing navigation.

Each console has `response-plans/adapters/<slug>.js`. The adapter is embedded immediately after the
existing application script, in the same top-level browser scope. Use explicit hooks/bridges for
state inside an IIFE, or register a read function via `ConsoleResponse.connect(read, selectors)`.
`connect` runs once and on relevant existing DOM changes, ignoring the response panel's own writes;
it must debounce and render only changed payloads. Prefer actual state objects over parsing text.
Selectors scope observation to existing data panels. A `connect` failure produces unknown evidence.

Payload (plain JSON-compatible objects; `value` may be finite number or explanatory string):

```js
{
  slug, title, context, // public context only; no patient, debt, wearable or other private inputs
  evidence: [{id, label, value, unit, measuredAt, checkedAt,
    basis: 'measured|modeled|interpretive|demo',
    quality: 'current|historical|stale|missing', source, note}],
  diagnostics: [{id, metricId: 1, pillar: 'comparison|structure|spillover', label,
    scope: 'current|planning', status: 'triggered|clear|unknown', evidenceIds: [],
    value, unit, rule, explanation, analyticalMitigation, requiredInputs,
    operationalMitigation}],
  actions: [{id, track: 'public|operator', phase: 'verify|prepare|respond|review',
    when: 'always|triggered|unknown', diagnosticIds: [], metricIds: [], title, nextStep,
    escalateWhen, authorityUrl}],
  network: {label, basis, semantics, period, coverage,
    roles: [{id, label, role, inbound, outbound, unit}], limitations: []}, // optional
  limitations: [], scenario: false // optional explicit exercise context
}
```

Safety/meaning rules:

- A diagnostic that depends on missing/stale evidence is unknown, even if an adapter says clear.
  Historical evidence can support explicitly structural/planning diagnostics, never an emergency.
  Set diagnostic scope to planning for that explicit historical use; the default scope is current.
  Link each diagnostic to evidenceIds. Missing references or unsupported empty dependencies are unknown.
- Unknown does not mean safe. Demo/scenario conditions cannot activate real incident guidance;
  render an explicit practice/scenario label. Actions remain interpretive, with official authority links.
- Triggered actions match any listed triggered diagnostic. Unknown actions match unknown diagnostics.
  Always actions are baseline preparation/review, not claims an incident exists.
- Comparison/structure/spillover are adaptations of research principles. Do not claim a fitted CRT
  estimand, validated ten-metric transfer, causal contagion, or VAR/FEVD unless actually implemented.
- No invented graph: declare unavailable directed information where no observed edge set exists.
  State edge direction, period alignment, duplicates, boundary coverage and unit for accounting.
- Public and operator tracks share evidence but use different actions. Operator steps require the
  organization's own SOP/telemetry and authority. No dispatch/switching, medication, trade or evacuation
  decision is automated. Public instructions defer to current official instructions.
- Acknowledgments are local planning notes, not completed operations. Reset/review them when context,
  evidence or scenario changes. Do not persist sensitive inputs or transmit anything.
- Include research links to both repositories and method limits. Every panel has a basis label.
  Show sources and measurement dates, an explicit unknown state, and a local export/print path.
- Coastal already has its full plan; mark it native in the generator manifest, fix its unknown/ack
  semantics in place and give it two audience tracks rather than append a duplicate response panel.

All32 consoles must be in the manifest, including explicit native/not-applicable method explanations.
`--check` must detect stale generated blocks without a visitor build step. Tests intercept providers
and map tiles; verify all consoles offline plus fixture-driven changes, audience tracks and export.

## Ten canonical dimensions and checklist chain

Every console renders all ten numbered dimensions within the three pillars. The dimension names
identify research adaptations, not a claim that the original CRT estimator/metric has been fitted:

1. Population Balance (comparison)
2. Wasserstein Distance / Shape Imbalance (comparison)
3. Density Symmetry (comparison)
4. Euler Characteristic / Contiguity (structure)
5. Persistence Gap (structure)
6. Spatial Mixing / Scale Stability (structure)
7. Variational Free Energy (structure)
8. Contamination AUC (spillover)
9. Frontier Risk / Buffer Depth AUC (spillover)
10. Mobility Network Leakage (spillover)

Use metricId 1..10 on the aggregate domain diagnostic. The dimension field is accepted as a
compatibility alias. Arbitrary per-entity diagnostics without a metricId are additional context;
the core never assigns them to a canonical dimension by position. Absent or duplicate canonical
dimensions are unknown, with named required inputs. Numeric values are shown only when supplied
and finite; a justified domain proxy must state what it measures and its limits.

Each dimension displays metric/domain condition, analytical mitigation, required inputs and
operational next steps linked to verify/prepare/respond/review phases. Actions may reference
diagnosticIds or canonical metricIds (both are combined). Link the actual conditions that select
the action, and do not mark unsupported dimensions healthy.

The operator view permits a temporary self-reported “review needed” flag. It creates a verification
checklist for acquiring inputs/reviewing the dimension, without changing machine evidence or
activating real incident instructions. No “self-reported safe” option is provided. Flags and local
acknowledgments reset on context, evidence, scenario or rule changes, but a checkedAt-only polling
update is not a new evidence revision. Nothing is persisted or transmitted.

Core DOM selectors for integration tests: #console-response, #console-response-shortcut,
[data-cr-metric="1"] through "10", [data-cr-diagnostic], [data-cr-action],
#cr-track-public/#cr-track-operator, #cr-export/#cr-print and #cr-assess-1 through 10.
The native Coastal implementation preserves its own selectors and receives no duplicate panel.

The shared mount starts with a compact heading/status and collapsed planner so existing tools
remain reachable, including on mobile. The floating shortcut opens the planner and action phase
checklist. Print mode temporarily opens every response section and restores the user's view.
connect observes scoped mutations, relevant controls, visible-minute ticks and visibility changes;
it ignores its own writes and does not require a page reload to mark evidence stale.
