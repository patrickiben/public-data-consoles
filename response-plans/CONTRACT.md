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

## Public-data impacts

Every shared adapter supplies `impacts` for the current selection, even when the only supported
content is dated public reference material and named unknown inputs:

```js
impacts: {
  title, scope, summary,
  items: [{id, label, value, unit, kind: 'observed|forecast|context|scenario',
    evidenceIds: [], method, note, validAt}],
  records: [{id, label, summary, kind, evidenceIds: [], validAt}],
  limitations: []
}
```

- Link every item/record to unique evidence IDs with a public HTTP(S) source and observation or
  reporting period. Checking/download time alone is not a measurement period. Preserve source
  identities, scope, units, definitions and dates in the local JSON export.
- Numeric items require a finite value and unit. Missing is `null`, never zero. A derived item links
  every required input; one missing, stale, undated or ambiguous dependency withholds the item.
- `observed` and `forecast` require applicable current evidence. Historical reports are `context`;
  a same-hour day-ahead forecast benchmark for an elapsed hour is context, not a future forecast.
  Optional `validAt` is a forecast validity endpoint. An invalid or elapsed endpoint withholds it,
  even if the report is otherwise fresh. Visible-minute/visibility refresh and export reconcile
  expiry; a validity transition resets local review notes without a new source response.
- A demo source or explicit scenario forces a practice label. Official model estimates retain a
  modeled basis. An agency estimate of exposure is not a measured loss. Context can include rates,
  counts and inventories, but must not become a future outcome or intervention-benefit estimate.
- Compute population-based counts only when the definition, denominator population and year match.
  Do not multiply age-standardized rates, cohort-specific risks or censored percentages by total
  population. Avoid aggregating overlapping units, nested bands, different report hours or periods.
- Unsupported personal, hydraulic, electrical, operational or causal inputs remain named gaps.
  Do not import personal queries/records into the shared evidence or export.
- The UI displays `triggered` as REVIEW and `clear` as CONTEXT · condition not met. These internal
  compatibility states select checklist actions; neither is an all-clear or a safety certificate.
  Unknown diagnostic values and unsupported impact conclusions are withheld from the displayed
  estimate. Original source evidence remains inspectable with its quality label.

The compact panel includes a visible **Review impacts and source records** button. Integration
selectors: `#cr-open-impacts`, `[data-cr-section="impacts"]`, `[data-cr-impact="<id>"]`, and
`[data-cr-impact-record="<id>"]`. Source publication and observation periods must survive refresh,
selection changes, print and export. Impacts, method or scope changes reset local review notes;
checking the same evidence again (`checkedAt` only) does not.

## Prioritized response actions

Each shared console registers a pure `ConsoleResponse.registerPrioritizer(slug, derive)` function
from its manifest `prioritySource`. It receives a cloned public adapter payload. It must not read
native/private inputs, mutate provider evidence, fetch data or persist state. It returns a short
list for each audience; all ten existing diagnostic chains remain available as detailed follow-up.

```js
{id, track: 'public|operator', phase: 'verify|prepare|respond|review',
 when: 'always|triggered|unknown', diagnosticIds: [], metricIds: [], evidenceIds: [],
 title, target, reason, nextStep, priority: 'immediate|next|planned|routine', rank,
 timing, signal: 'official-warning|observed-condition|forecast|data-gap|planning|reference|scenario',
 requiresCurrent, validUntil, escalateWhen, escalateTo, authorityUrl, reviewAfter}
```

The core marks derived actions `featured`, resolves dimensions, validates required steps, and sorts
by priority class, numeric rank, then stable ID. `position` numbers the selected actions separately
for each audience. Priority classes describe review order, not an official emergency severity score.
A selector may choose a step from evidence directly (`when: always`); its `reason` must name the
specific evidence condition. Missing-input steps remain selectable with their named gap.

Current-dependent actions require unique, dated, public source facts with current non-demo quality.
Missing, stale, unsafe, future-dated, ambiguous or expired evidence withholds these steps. Immediate
priority requires a current measured official warning, source authority link and future validity
endpoint. Historical or practice evidence cannot acquire urgent priority. A clock-driven expiry or
changed ranking clears local review notes even without a new source payload. Check-time-only updates
that do not change the assessment preserve notes. Failed selectors fall back to source verification.

Timing describes when to verify, prepare or review. Use source-native issue/valid times and existing
local procedures; do not manufacture dispatch deadlines, routed arrival times or intervention gains.
Different gauges, years, reporting hours, case definitions, or overlapping cohorts must not be pooled
into one urgency score. Public notices retain identity, actual/test status, message type, location
scope, issue time, instructions and expiry; canceled, test and expired notices are not current warnings.

The compact **Do next** preview and **Open prioritized checklist** button lead to ranked cards with
place/record, why, timing, next step, escalation trigger/recipient, recheck condition and source dates.
Detailed dimension actions remain below in a disclosure. Public/operator views, print and local JSON
export retain the same ordering and evidence. Selectors: `#cr-open-priorities`, `[data-cr-priority]`,
`.cr-priority-preview`, and `[data-cr-section="followup"]`.
