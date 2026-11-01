/* Plain wording for pages that serve people looking for a place, not planners (manifest: "plainWording").
   The shared plan keeps its research terms on every other console. This changes only what is shown on these
   pages: evidence, ranking and the exported plan stay as they are. */
(function (root) {
  'use strict';
  var doc = root.document; if (!doc) return;
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // Plain part names alone: no research name in parentheses, and no research definition behind a help button.
  if (root.ConsoleMetricHelp) root.ConsoleMetricHelp.label = function (id, text) { return esc(String(text).replace(/\s\(.*\)$/, '')); };
  function when(iso) { var d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }); }
  // Whole sentences come first, so that the shorter terms below cannot break them.
  var WORDS = [
    [/ ?Scope of this planning review: (?:Missing or stale evidence\.)(?: A supported finite value or documented description is unavailable\.)?/g, ''],
    [/Scope of this planning review: Unavailable(?: \[[^\]]*\])?; observed\/reported not supplied/g, 'No data here answers this.'],
    [/These are planning prompts, not instructions to dispatch, switch equipment, prescribe, trade or evacuate\. /g, 'These are planning prompts, not official orders or medical advice. '],
    [/Use your organization’s verified telemetry, SOP and decision authority\./g, 'Use your organization’s own data, procedures and decision authority.'],
    [/Ordered for this selection and audience\. Timing is an interpretive review prompt unless attributed to a current official notice\. Source periods remain visible; older reports support planning\./g, 'Ordered for this search and audience. Timing is a suggestion unless an official notice sets it. Each source keeps its date, and older reports are for planning.'],
    [/Checks are temporary local planning notes, not completed operations\. Context or evidence changes reset them\. Nothing is transmitted or stored by this response layer\./g, 'Check marks are temporary notes in this tab. They reset when the place or data changes, and they are not sent or saved.'],
    [/Observations, official forecasts and historical context retain their own dates and meanings\. A public-data screen alone does not establish an outage, individual harm or completed response\./g, 'Each source keeps its own date and meaning. These lists alone do not show that a place is open, closed or usable.'],
    [/Missing or stale evidence\.( A supported finite value or documented description is unavailable\.)?/g, 'No current data from this source.'],
    [/Directed network information is unavailable\. No source\/sink, causal route or restoration gain is inferred\./g, 'This page does not track how people move between places, so it draws no conclusions about that.'],
    [/This step resolves a public-source gap; no parameter score establishes an all-clear\./g, 'A public source did not answer. Nothing here is an all-clear.'],
    [/This step (?:reviews|follows) the selected public record or (?:guidance|source check),? (?:not a|rather than a) ten-parameter score\./g, 'It comes from the public record or guidance, not from a score.'],
    [/, not a validated transfer of all ten parameters\./g, '. They do not answer all ten parts of this review.'],
    [/Unavailable; obtain the named required inputs\./g, 'Not available.'],
    [/No numerical metric supplied; assess the stated domain condition and evidence\./g, 'No single number. See below.'],
    [/Not assessable from the currently applicable evidence\./g, 'Cannot be judged from the data here.'],
    [/Not assessed: applicable inputs are not supplied\./g, 'Not assessed: this page does not have the data.'],
    [/Self-reported review needed: #(\d+) .*/g, 'You flagged part #$1 for review'],
    [/(\d+) of 10 dimensions unknown\./g, '$1 of the 10 parts of this review are unknown.'],
    [/(\d+) available impact\/context items?/g, 'Data records: $1 available'],
    // Lens, model and method language in the page's own explanations.
    [/This lens is a planning review, not a scored assessment\./g, 'This is a planning review, not a score.'],
    [/do not supply the inputs it needs/g, 'cannot answer it'],
    [/so no population balance is computed/g, 'so they are not compared'],
    [/no (?:distribution distance|density symmetry) is computed/g, 'no comparison is made'],
    [/no persistence is computed/g, 'no trend is worked out'],
    [/no completeness measure is computed/g, 'completeness is not measured'],
    [/no nearest-distance score is computed/g, 'no distance score is given'],
    [/\bis fitted\b/g, 'is used'],
    [/are not samples of one distribution/g, 'are different kinds of lists'],
    [/Listing distance distribution/g, 'How far away listings are'],
    [/an observed network of/g, 'a record of'],
    [/All ten dimensions are review lenses\./g, 'All ten parts are review prompts.'],
    [/Unavailable inputs never become an all-clear/g, 'Missing data never becomes an all-clear'],
    [/No fitted causal effect/g, 'No cause-and-effect estimate'],
    [/, data Each Refuge listing shows its own date/g, ', each with its own date'],
    [/a defined adjacency rule/g, 'a rule for which areas count as neighbors'],
    [/\bjustified\b/g, 'sensible'],
    [/distance threshold/g, 'distance limit'],
    [/comparable densities/g, 'comparable'],
    [/\bradii\b/g, 'distances'],
    [/same source, radius and data date/g, 'same source, distance and data date'],
    // Labels.
    [/Response plan and ten-parameter detail/g, 'Response plan and the ten-part review'],
    [/Prioritized live action checklist/g, 'What to do next, in order'],
    [/Dimension-by-dimension follow-up/g, 'Follow-up on each of the ten parts'],
    [/Projected impacts and public-data context/g, 'What the public data shows'],
    [/View impacts and sources/g, 'View data and sources'],
    [/Public records behind this view/g, 'Public records behind this page'],
    [/Evidence, dates and sources/g, 'Sources and dates'],
    [/Research-informed diagnostics/g, 'The ten parts of this review'],
    [/Directed accounting and method limits/g, 'Method limits'],
    [/Spillover and dependence/g, 'Nearby areas and referrals'],
    [/How this parameter informs the plan/g, 'How this part shapes the plan'],
    [/Why these parameters inform this step/g, 'Why these parts matter here'],
    [/Why this parameter:/g, 'Why it matters:'],
    [/Why at this stage:/g, 'Why now:'],
    [/Why this is prioritized:/g, 'Why:'],
    [/Where \/ record:/g, 'Where:'],
    [/^Selection:$/g, 'For:'],
    [/Escalate \/ review:/g, 'If you need more help:'],
    [/Escalate if:/g, 'Get more help if:'],
    [/Escalate to:/g, 'Who can help:'],
    [/^ The (?:clinic|venue)$/g, ' 211 or a local information line'],
    [/Nearest listed SNAP-authorized store more than (.*?) away in a straight line\./g, 'Test: nearest listed store more than $1 away in a straight line?'],
    [/Basis for this step:/g, 'Where this step comes from:'],
    [/Responsible authority \/ guidance/g, 'Source of this guidance'],
    [/Reviewed locally for this evidence revision/g, 'I checked this'],
    [/Trigger \/ dimensions:/g, 'What this covers:'],
    [/Baseline preparation \/ review; no incident is implied\./g, 'Routine review; no incident is implied.'],
    [/Baseline review\. /g, ''],
    [/Metric \/ proxy value:/g, 'Reading:'],
    [/Domain condition \/ proxy:/g, 'What this looks at:'],
    [/Supporting evidence:/g, 'Based on:'],
    [/Analytical mitigation:/g, 'How this page handles it:'],
    [/Reference context only/g, 'Background only'],
    [/Evidence withheld: Observation\/reporting period is unavailable\./g, 'This source gives no date.'],
    [/Observed \/ reported:/g, 'Date:'],
    [/observed\/reported:? /g, 'date: '],
    [/Verify inputs/g, 'Check the information'],
    [/verify the original report/g, 'check the original source'],
    // Status words.
    [/ \[[a-z]+, (?:MEASURED|MODELED|INTERPRETIVE)[^\]]*\]/g, ''],
    [/UNKNOWN · inputs incomplete/g, 'Unknown · missing information'],
    [/CONTEXT · condition not met/g, 'background, nothing flagged'],
    [/Descriptive context/g, 'Background'],
    [/ · planning context/g, ''],
    [/\bUNKNOWN\b/g, 'unknown'],
    [/\bREVIEW\b/g, 'review'],
    [/^INTERPRETIVE$/g, 'Planning note'],
    [/^MEASURED$/g, 'From the source'],
    [/^MODELED$/g, 'Modeled'],
    [/^CONTEXT$/g, 'Background'],
    [/Not assessable from the /g, 'Cannot be judged from the '],
    [/Not assessable/g, 'Not known'],
    // The inputs a research-grade answer would need are listed once, on each part, not repeated in every step.
    [/(?:Check|Verify) the missing or unqualified inputs\.\s*/g, ''],
    [/Evidence needed\. /g, ''],
    [/Planning review condition met\. /g, 'Worth a closer look. '],
    [/\sRequired inputs: .*?(?= Unknown does not mean clear|$)/g, ''],
    [/^Required inputs:$/g, 'What it would take to judge this:'],
    [/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z\b/g, when]
  ];
  function plain(value) { return WORDS.reduce(function (text, rule) { return text.replace(rule[0], rule[1]); }, value); }
  function apply(panel) {
    // "What changed" compares evidence revisions, which means nothing to someone looking for a place.
    var changes = panel.querySelector('[data-cr-section="changes"]'); if (changes) changes.remove();
    panel.querySelectorAll('[data-cr-impact-record] > .cr-note').forEach(function (note) { if (/^Record ID:/.test(note.textContent)) note.remove(); });
    var walker = doc.createTreeWalker(panel, root.NodeFilter.SHOW_TEXT), node;
    while ((node = walker.nextNode())) { var next = plain(node.nodeValue); if (next !== node.nodeValue) node.nodeValue = next; }
  }
  function start() {
    var panel = doc.getElementById('console-response'); if (!panel) return;
    // The plan replaces its whole body on each render; this runs before the browser paints it.
    new root.MutationObserver(function () { apply(panel); }).observe(panel, { childList: true });
    apply(panel);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})(window);
