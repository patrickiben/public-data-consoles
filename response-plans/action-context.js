/* Domain-specific explanations for existing ten-dimension actions. No data reads or decisions. */
(function (root) {
  'use strict';
  const R = root.ConsoleResponse;
  if (!R) return;

  const families = Object.freeze({
    'global-air-pollution': 'annual', 'global-demographic-transition': 'annual',
    'global-health-atlas': 'annual', 'global-health-systems': 'annual',
    'global-hiv-tb-malaria': 'annual', 'global-immunization': 'annual',
    'global-maternal-child-health': 'annual', 'global-mental-health': 'annual',
    'global-ncd-burden': 'annual', 'global-nutrition': 'annual',
    'global-road-safety': 'annual', 'global-wash': 'annual',
    'antimicrobial-resistance': 'burden', 'global-cancer': 'burden', 'global-ntds': 'burden',
    'us-respiratory-surveillance': 'surveillance', 'us-overdose-surveillance': 'surveillance',
    'global-outbreak-tracker': 'outbreak', 'nhs-scotland-strain': 'nhs',
    'river-flood-network': 'riverNetwork', 'river-flood-propagation': 'riverChain',
    'us-local-hazards': 'local', 'quake-consequence': 'quake',
    'us-grid-strain': 'grid', 'resilience-telemetry': 'market', 'usaid-consequence': 'aid',
    'prescription-savings': 'reference', 'medical-cost-abroad': 'reference',
    'medical-debt-assistant': 'reference', 'human-trafficking': 'reference', 'va-strain': 'va',
    'food-desert-oases': 'food'
  });
  const subjects = Object.freeze({
    'global-air-pollution': 'air-quality indicators',
    'global-demographic-transition': 'population and demographic indicators',
    'global-health-atlas': 'the selected health indicator',
    'global-health-systems': 'health-service indicators',
    'global-hiv-tb-malaria': 'HIV, tuberculosis or malaria indicators',
    'global-immunization': 'the selected vaccine and eligible cohort',
    'global-maternal-child-health': 'maternal and child-health indicators',
    'global-mental-health': 'mental-health indicators',
    'global-ncd-burden': 'noncommunicable-disease indicators',
    'global-nutrition': 'nutrition indicators', 'global-road-safety': 'road-safety indicators',
    'global-wash': 'water, sanitation and hygiene service indicators',
    'antimicrobial-resistance': 'the published antimicrobial-resistance estimate',
    'global-cancer': 'the selected cancer estimate', 'global-ntds': 'the selected NTD reference',
    'prescription-savings': 'the named drug product and public acquisition-cost benchmark',
    'medical-cost-abroad': 'the procedure quote and cross-border follow-up pathway',
    'medical-debt-assistant': 'the public billing and financial-assistance pathway',
    'human-trafficking': 'the public safeguarding and support pathway',
    'food-desert-oases': 'the tract food-access classification and nearby food listings'
  });

  // Entries explain the maintained adapter's actual estimand or input gap. They do
  // not transfer Coastal thresholds, claim a fitted CRT model, or select actions.
  const reasons = {
    annual: [
      'Country counts can overrepresent small populations in comparisons of {subject}; same-year resident totals clarify who the comparison represents, not who needs a service.',
      'The same-year income-group distribution shows whether {subject} differs beyond one country average; the empirical W1 does not identify a cause or a clinical cutoff.',
      'Population divided by land area adds coarse geographic context to {subject}; it cannot establish local service access, catchments or equity.',
      'A country indicator supplies no functioning service links; contiguity review needs an explicit local network before disconnected coverage can be assessed.',
      'Different country and reference observation years can change the comparison of {subject}; calendar alignment is a vintage check, not proof that a condition persisted.',
      'Changing the world versus income-group reference can change the direction of the selected gap; this tests reference sensitivity, not physical mixing.',
      'Reported, modeled and missing values in {subject} need an explicit uncertainty model before any free-energy quantity can be interpreted.',
      'An integrated exposure claim for {subject} needs a defined history, reference and denominator; a single annual rate is not a contamination curve.',
      'Country summaries cannot locate people at a service boundary; frontier planning needs actual boundaries, access distances and service availability.',
      'Administrative co-membership does not measure cross-boundary flow; coordination claims for {subject} need dated directed records and accountable partners.'
    ],
    burden: [
      'A global burden estimate is not a balanced comparison of local populations; the relevant eligible population and ascertainment must be known first.',
      'Different headline counts in {subject} are not comparable samples for a distribution distance; definitions, populations and units must match.',
      'A published global estimate does not locate services or people; local access-density claims require catchment and coverage denominators.',
      'Burden totals do not establish connected care pathways; functioning service links must be documented before contiguity can guide planning.',
      'One dated {subject} cannot establish a persistent current programme gap; repeated compatible local observations are needed.',
      'Registry and surveillance coverage can change with geography; local burden comparisons need matched definitions and visible reporting gaps.',
      'Uncertainty in {subject} cannot be replaced by a free-energy label; an explicit observation, missingness and validation model is required.',
      'Burden, intervention need and attributable harm are different quantities; exposure integration requires a declared common history and estimand.',
      'Global totals cannot identify a local access frontier or a safe buffer; actual service boundaries and populations are required.',
      'Similar burden across places is not measured transfer or transmission; any cross-boundary dependence requires its own directed evidence.'
    ],
    surveillance: [
      'Reported surveillance shares or rolling counts do not directly measure population need; eligible populations and reporting coverage must be matched.',
      'The temporal distribution comparison describes the selected surveillance series; reporting revisions and common units matter before interpreting its W1.',
      'Jurisdiction or reporting-site counts are not service-density measures; actual populations, catchments and access records are missing from that comparison.',
      'Co-reporting jurisdictions do not form a verified service or transmission graph; functioning links need independent evidence.',
      'A matched surveillance change is a dated description of direction; it does not establish present transmission, a future incident count or a patient outcome.',
      'National and jurisdiction directions can disagree on the matched reporting subset; partial coverage must be checked before treating the national direction as local.',
      'Case definitions, ascertainment and missing reports affect surveillance; none supplies a fitted free-energy objective by itself.',
      'A surveillance trend is not a shared-exposure AUC; a compatible exposure history, denominator and integration rule are needed.',
      'Reported regional activity does not locate a local susceptible-population or service frontier; boundary evidence must be obtained separately.',
      'Similar time trends do not establish cross-boundary transmission or referral flow; directed, time-aligned records are required.'
    ],
    outbreak: [
      'Selected-country cumulative cases do not balance affected populations or ascertainment; current incidence and eligible denominators are needed.',
      'The existing W1 compares reporting ages between country groups; it describes unequal timeliness, not a difference in outbreak severity.',
      'Country totals cannot show which communities are monitored or tested; surveillance catchments are needed to assess density.',
      'Country membership is not a connected outbreak cluster; current local incidence and a justified adjacency model are required.',
      'Country report dates and complete versus partial annual windows differ; alignment review comes before interpreting changes in case totals.',
      'A selected cumulative-country subset cannot show stability across local and national scales; matched incidence windows are required.',
      'Testing and case-definition differences are not a fitted dependence model; uncertainty and ascertainment must be specified explicitly.',
      'A cumulative total cannot be treated as integrated current exposure; incidence histories and a declared denominator are needed.',
      'Country totals cannot locate susceptible people at a current transmission frontier; approved local surveillance is needed.',
      'Country co-reporting or a clade label is not a measured transmission edge; contact, mobility or genomic investigation has a separate evidential role.'
    ],
    nhs: [
      'The lower-performing half of sites may carry a different share of attendances than its share of sites; attendance weights help distinguish workload from a site count.',
      'The W1 compares weekly attendance distributions between the declared site groups; differences in service size or case mix can explain the gap.',
      'Site counts and waiting percentages do not describe geographic access; catchment populations and service geometry are needed.',
      'Positive reported residence-to-treatment stay links can establish observed board connectivity; unpublished cells cannot establish a missing pathway.',
      'Sites near the packaged 95% reference may change classification under a small declared band; this is a planning margin, not a clinical decision threshold.',
      'Comparing site classifications at 90% and 95% exposes threshold-sensitive conclusions; it is not an estimate of spatial mixing.',
      'A&E weeks, discharge months and care-use quarters do not specify a joint probabilistic model; free energy remains unassessed.',
      'The normalized integral summarizes national shortfall below the packaged reference across the reported weeks; it combines gap size and recurrence, not patient harm or proof of persistence.',
      'Historical board-level totals do not locate an exposed care boundary; verified handoffs and service-group definitions are needed.',
      'The outside-residence-board share describes reported stays in its own quarter; repeat stays, unpublished cells and special providers prevent a patient-transfer or current-capacity interpretation.'
    ],
    riverNetwork: [
      'Gauge counts do not represent exposed residents or services; burden comparisons need actual community and asset weights.',
      'The focus-gauge W1 compares two complete adjacent days in one compatible physical unit; a shift does not identify downstream contribution or flood extent.',
      'A sampled gauge network cannot establish resident or asset-density symmetry; unmonitored areas need separate coverage review.',
      'Separate components of the completely inspected elevated-gauge graph need separate briefings; graph components are not inundation areas or crew routes.',
      'The share of completed hourly samples above this gauge’s action threshold shows sampled persistence; it does not establish continuous duration.',
      'A most-upstream role within the inspected network may change outside its bounded extent; nested complete network checks are needed.',
      'River reach membership supplies no agency-boundary dependence model; jurisdictional responsibility needs explicit coordination records.',
      'The hydraulic AUC summarizes completed hourly observations over the gauge’s action-to-major threshold range; it is not affected population, damage or contamination.',
      'An upstream gauge position does not locate vulnerable assets on an inundation frontier; official hazard geometry and consequence weights are needed.',
      'A most-upstream elevated watchpoint is supported only by complete inspected directed probes; topology does not measure leakage or a causal share of downstream flow.'
    ],
    riverChain: [
      'The order or count of gauges does not weight affected communities; population and asset records are needed before comparing burden.',
      'The focus-gauge W1 compares adjacent complete daily histories in its own units; raw stages at different gauge datums are not pooled.',
      'A few forecast points cannot establish community or asset-density symmetry; unmonitored corridor areas remain outside the sample.',
      'Separated elevated segments on verified adjacent links require distinct corridor review; missing observations must not be smoothed into one wave.',
      'Observed and forecast categories can differ at the same gauge; the comparison keeps observed time, forecast issue and future valid time separate.',
      'One bounded chain cannot establish scale stability; complete alternative extents or a documented forecast ensemble are needed.',
      'A river chain is not an administrative coordination model; responsibilities and cross-agency agreements must be supplied separately.',
      'The focus-gauge hydraulic AUC uses hourly observations and official action-to-major thresholds; it does not estimate properties affected or routed damage.',
      'Gauge order does not locate a property-level flood frontier; inundation geometry, asset distances and consequence weights are needed.',
      'A verified link crossing elevated and non-elevated categories identifies two watchpoints to review; it is not measured contaminant leakage or routed arrival.'
    ],
    local: [
      'Point alerts and reporting-area AQI do not supply affected population or facility weights; those denominators are needed before comparing burden.',
      'AQI, river stages, storm categories and flood zones have different units; they cannot supply a common distribution distance without a justified outcome scale.',
      'A reporting-area centroid and point-query coverage do not measure local monitoring density relative to people and facilities.',
      'The FEMA flag is susceptibility context for preparedness; it does not measure Euler contiguity, current flooding or an incident activation condition.',
      'An alert’s effective, onset and expiry metadata determine how its instructions apply; this row checks timing completeness, not persistent homology.',
      'One point and one reporting area do not establish geographic robustness; official nested areas and forecast alternatives are needed.',
      'Separate hazard feeds do not measure agency dependence; responsible authorities must reconcile their own instructions.',
      'A recent AQI value and mapped or annual context do not form a common exposure curve; incompatible hazard scores are not added.',
      'Point and area feeds cannot locate a distance-weighted asset frontier; current hazard boundaries and vulnerable-facility records are needed.',
      'Concurrent weather instructions and elevated AQI can affect the same activity; reviewing them together does not establish a causal hazard cascade.'
    ],
    quake: [
      'Reconciled PAGER country shares at MMI7+ versus MMI4+ describe modeled exposure composition; they do not measure equitable service allocation or confirmed casualties.',
      'The modeled shaking-distribution gap between mapped asset groups may reflect inventory and fragility differences; a W1 is not observed damage.',
      'OSM asset density depends on mapping completeness; exposure area and population denominators are needed before claiming symmetry.',
      'Components of the screened dependency graph identify model inspection questions; they are not a full Euler estimate or verified access routes.',
      'Assets near the declared shaking screen can change category under a small MMI perturbation; the band is not a confidence interval or safety clearance.',
      'Raising the shaking screen tests which modeled priorities change; that threshold sensitivity is not physical spatial mixing.',
      'Reachability and cross-boundary edge counts are not fitted free energy; a validated probabilistic dependency model is required.',
      'The PAGER band-index integral depends on the declared ordinal range and spacing; it summarizes modeled footprint without estimating damage or individual risk.',
      'One-to-three-hop reach examines a modeled dependency frontier; a hop is not travel, failure or restoration time.',
      'The fraction of links crossing the shaking screen is a dependency proxy; verified link status is needed before treating it as an actual disruption.'
    ],
    grid: [
      'Equal balancing-authority counts are not equal reported demand; same-hour load weights still do not measure customer or critical-load exposure.',
      'The within-authority W1 compares two complete adjacent days of hourly demand; it is not forecast accuracy or evidence of a supply shortfall.',
      'Balancing-authority centroids do not describe transmission footprints or customer density; physical service and asset locations are needed.',
      'Reported interchange does not recover bus-and-line connectivity or redundancy; an approved physical network model is needed.',
      'Same-hour demand minus its published day-ahead forecast identifies a deviation to verify; no universal emergency threshold or outage implication is fitted.',
      'Complete 24-, 72- and 168-hour peak lookbacks can give different demand-to-peak ratios; the range describes baseline sensitivity, not reserves.',
      'Authority reports alone do not define a calibrated dependence model or independent response regions; operating constraints and agreements are needed.',
      'A latest load report and peak do not define an integrated stress-impact curve; compatible scenarios, capacity constraints and exposure weights are needed.',
      'Map centroids cannot locate constrained interfaces or vulnerable customers; approved physical boundaries and critical-load records are needed.',
      'Negative matched-hour net interchange means net imports; import context needs actual reserves, limits and operator advisories before operational interpretation.'
    ],
    market: [
      'Ticker counts are not capital at risk; actual exposure weights belong in an approved controlled system and are not read by this public console.',
      'Aligned daily-return W1 describes distribution differences from a declared reference; asset type and volatility affect it, not just direction.',
      'Return-density total variation compares common-calendar samples in declared pooled-quantile bins; ties and sample size affect it, and it does not predict returns.',
      'Components of the estimated high-fragility subgraph describe model groups; they are not protected investments or verified transmission channels.',
      'Readings near the existing descriptive fragility bands may switch color; this margin is not a probability interval or crash forecast.',
      'Changing the estimated-edge gate tests network-classification sensitivity; stability still requires an aligned window and independent assessment.',
      'Lead-lag asymmetry and correlation do not specify a free-energy model; energy, entropy and validation terms are missing.',
      'Reachability over relative edge thresholds is a declared scenario AUC; it is not causal contagion, a loss probability or an investment-timing signal.',
      'One-to-three-hop reach examines the model boundary; common factors and boundary choices need review, and hops are not elapsed market time.',
      'Cross-group estimated associations are not observed money flows or exposures; documented holdings and model limitations must be reviewed separately.'
    ],
    aid: [
      'Recipient-country counts and dollars do not represent equal beneficiary exposure; service coverage, donor and backfill denominators are needed.',
      'The completed-year country-allocation W1 describes a distribution shift within the embedded scope; it does not identify a service interruption or health effect.',
      'Country-level allocations do not locate clinics, staff, supply routes or beneficiaries; actual catchments are needed for density review.',
      'Funding bars do not establish connected services or redundancy; functioning referral and supply links require verified local records.',
      'Partial quarters, completed years and separately updated agency endpoints cannot be treated as one funding-cut comparison; matched fiscal windows come first.',
      'A country subset and one agency total do not establish programme- or donor-scale stability; omitted scopes and accounting definitions matter.',
      'Programme co-dependence and donor backfill are not fitted by an allocation ratio; current execution and dependency records are needed.',
      'Obligations and published health scenarios are not a calibrated exposure AUC; service histories, denominators and a validated scenario model are needed.',
      'Country totals cannot locate a vulnerable facility at a service-loss frontier; local stock, staffing and access records are needed.',
      'A narrative funding-to-service-to-health sequence is not a measured causal graph; actual interruptions and competing causes must be investigated separately.'
    ],
    reference: [
      'The public scope of {subject} must be checked before assuming it represents a person, product or eligible group; no private population is assessed.',
      'A shape comparison for {subject} needs like-for-like records and units; a checklist, broad range or unrelated product is not a sample for W1.',
      'Links or advertised prices do not measure geographic access to {subject}; current directories and actual service availability are needed.',
      'The steps in {subject} need accountable handoff owners; a resource list alone is not an observed functioning network.',
      'The dates, contact details and applicable edition for {subject} must be verified; an old reference does not establish present applicability.',
      'Rules and services in {subject} can differ by payer, setting or jurisdiction; a reference cannot be transferred without checking its scope.',
      'A public explanation of {subject} is not a fitted eligibility, risk or free-energy model; private circumstances and professional determinations remain separate.',
      'Different kinds of evidence in {subject} must stay distinct; combining benchmarks, rules, marketing or reports does not produce a contamination AUC.',
      'Continuity planning for {subject} needs a qualified responsible contact and a practical alternative; no safe time, distance or buffer AUC is computed.',
      'A handoff in {subject} needs clear responsibility and minimum necessary information; no personal transfer or causal network is inferred.'
    ],
    food: [
      'Population and income context for {subject} comes from one census tract; comparing it with neighboring tracts needs the same Atlas edition, and one tract does not describe a household.',
      'A distance comparison for {subject} needs lists from the same source, radius and data date; a store list and a food bank list are not samples of one distribution.',
      'The density of listings for {subject} depends on the search radius, and the Atlas flag is a published June 2025 classification, not a measured density of current listings.',
      'Only the searched tract is read for {subject}; a cluster of flagged neighboring tracts needs adjacent Atlas records and a defined adjacency rule.',
      'The Atlas edition and the listing dates for {subject} differ; the 2025 and 2019 measures use different store definitions and tracts, so they are not a trend.',
      'Counts for {subject} change with the radius the search widened to; counts at different radii are not comparable densities.',
      'No travel-time, price, hours or eligibility model is fitted for {subject}; straight-line distance and a listing are not a measure of practical access.',
      'Listings for {subject} come from sources with different completeness; OpenStreetMap food bank tags are partial and there is no complete national pantry list.',
      'Straight-line distance to the nearest listed SNAP-authorized store in {subject} mirrors the Atlas distance test; it is not travel distance, and a failed list stays unknown.',
      'Referral for {subject} needs verified contacts, hours and eligibility; a list of places is not an observed referral network.'
    ],
    va: [
      'Synthetic census-weighted and unit-count summaries can rank drill units differently; they do not establish actual VA staffed capacity.',
      'A comparable occupancy-distribution comparison needs real matched services and case-mix definitions; the template supplies no validated care comparison.',
      'Synthetic staffing ratios do not measure geographic access; official facilities, catchments and referral coverage must be checked separately.',
      'The template has no verified transfer or dependency edges; service contiguity cannot be inferred from its unit list.',
      'The drill’s five-point capacity margin tests review procedures near nominal capacity; actual activation criteria require approved current local data.',
      'Comparing synthetic units at 90% and 100% tests sensitivity to the declared screen; neither level is validated as a current operating rule here.',
      'The template strain index is a heuristic; it does not fit or validate a probabilistic free-energy model.',
      'One synthetic census cannot identify an integrated exposure curve; approved repeated aggregate observations are needed.',
      'Ward and community-care boundaries need verified handoffs and transfer volumes before a frontier or buffer-depth quantity can be interpreted.',
      'Boarding and staffing counts do not measure cross-unit mobility; approved aligned handoff and transfer records are required.'
    ]
  };

  // Why this particular comparison belongs before the next decision. These are
  // review dependencies, not source-derived response deadlines.
  const sequence = {
    annual: [
      'Establish the resident denominator before prioritizing comparison groups.',
      'Inspect the full same-year distribution before treating one national average as typical.',
      'Check population/land alignment before interpreting a geographic density contrast.',
      'Obtain functioning local service links before coordinating disconnected coverage.',
      'Resolve observation-year differences before comparing the country with its reference.',
      'Test both reference groups before relying on the direction of the selected gap.',
      'Specify uncertainty and missingness before relying on model-based conclusions.',
      'Establish the complete historical exposure window before extrapolating one annual value.',
      'Identify actual access boundaries and alternatives before finalizing coverage plans.',
      'Verify directed cross-boundary records before assigning coordination responsibilities.'
    ],
    burden: [
      'Establish eligible populations and ascertainment before prioritizing burden groups.',
      'Obtain comparable disaggregated samples before interpreting a distribution difference.',
      'Verify local catchments and coverage before locating service-access gaps.',
      'Identify functioning care pathways before coordinating service continuity.',
      'Obtain repeated compatible observations before calling a programme gap persistent.',
      'Check registry completeness across geographies before transferring a burden comparison locally.',
      'Specify observation and uncertainty models before interpreting dependence.',
      'Define the exposure history and denominator before interpreting an integrated burden.',
      'Identify local service boundaries before choosing continuity arrangements.',
      'Verify actual directed links before sequencing cross-boundary responsibilities.'
    ],
    surveillance: [
      'Check the surveillance population and coverage before prioritizing reported groups.',
      'Compare aligned series and revisions before treating one recent value as representative.',
      'Obtain actual catchment and access denominators before interpreting reporting density.',
      'Verify service or transmission links before coordinating connected-area plans.',
      'Check the matched interval and revisions before treating reported direction as sustained.',
      'Inspect matched local directions and missing jurisdictions before applying a national trend locally.',
      'Resolve ascertainment and missingness assumptions before relying on a dependence model.',
      'Establish compatible exposure histories before integrating a surveillance signal.',
      'Locate actual local population and service boundaries before boundary-specific planning.',
      'Verify time-aligned directed records before assigning a cross-boundary pathway.'
    ],
    outbreak: [
      'Establish current incidence and population denominators before prioritizing countries.',
      'Resolve reporting-age differences before comparing country case distributions.',
      'Identify surveillance catchments before interpreting sparse reports as low activity.',
      'Obtain current local incidence and adjacency before grouping connected outbreak areas.',
      'Align report dates and partial versus complete windows before interpreting a change.',
      'Repeat matched incidence comparisons across scales before relying on a geographic pattern.',
      'Reconcile testing and case definitions before treating reports as independent.',
      'Establish incident-case histories before interpreting cumulative counts as exposure.',
      'Identify susceptible populations at actual local boundaries before targeted coverage review.',
      'Verify investigation-supported links before naming a source or sequencing cross-border responsibilities.'
    ],
    nhs: [
      'Check attendance weights before prioritizing a site group by its number of sites.',
      'Review service-size distributions and case mix before proposing one response for both site groups.',
      'Obtain catchment denominators before interpreting site geography as access equity.',
      'Check positive care-use paths and unpublished cells before coordinating board coverage.',
      'Review sites near the reference before committing a threshold-based classification.',
      'Compare the 90% and 95% classifications before relying on one screening level.',
      'Align independent reporting periods and specify the model before assuming joint dependencies.',
      'Inspect the repeated historical gap before extrapolating from one reported week.',
      'Identify actual service-boundary handoffs before finalizing continuity arrangements.',
      'Check the reported stay cohort and outside-board share before reviewing cross-board service agreements.'
    ],
    riverNetwork: [
      'Obtain community and asset weights before prioritizing branches by gauge count.',
      'Compare the complete adjacent daily histories before interpreting a new gauge reading as a changed pattern.',
      'Identify unmonitored communities before treating gauge density as coverage.',
      'Separate inspected elevated graph components before coordinating the branch briefing.',
      'Check the sampled action-threshold history before calling a current branch condition persistent.',
      'Test complete alternative network extents before relying on a most-upstream role.',
      'Identify agencies and agreements before assuming a reach belongs to one coordinated response.',
      'Review the complete hydraulic threshold window before generalizing from one elevated sample.',
      'Obtain actual inundation and asset boundaries before selecting frontier watchpoints.',
      'Verify all required directed probes before naming the upstream watchpoint and downstream contacts.'
    ],
    riverChain: [
      'Obtain exposed-population and asset weights before prioritizing corridor sections.',
      'Inspect the same-gauge adjacent-day histories before interpreting a new reading as a changed distribution.',
      'Identify unmonitored corridor areas before treating forecast-point coverage as representative.',
      'Keep separated elevated segments and missing breaks explicit before coordinating corridor review.',
      'Reconcile observation, forecast issue and valid times before planning around a category change.',
      'Check alternative complete extents or forecast assumptions before relying on one corridor boundary.',
      'Identify jurisdictional responsibilities before treating a river chain as a coordinated service area.',
      'Check the completed hourly threshold integral before extrapolating from one stage reading.',
      'Locate actual inundation boundaries and assets before selecting frontier coverage.',
      'Verify both gauges on a category-crossing link before coordinating their local contacts.'
    ],
    local: [
      'Identify affected groups and facilities before prioritizing burdens from point feeds.',
      'Keep unlike hazard units separate before comparing or combining their implications.',
      'Check monitoring footprint and distance before treating nearby observations as local exposure.',
      'Confirm mapped flood susceptibility during preparedness, before treating it as a current incident.',
      'Resolve each alert’s validity times before using its instructions for a planned activity.',
      'Compare official geographic extents before treating a point-query boundary as robust.',
      'Identify responsible agencies before reconciling potentially conflicting instructions.',
      'Establish compatible histories and denominators before describing cumulative multi-hazard exposure.',
      'Locate current hazard boundaries and vulnerable facilities before boundary-specific planning.',
      'Reconcile weather duties with air-quality guidance before the same affected activity.'
    ],
    quake: [
      'Check reconciled PAGER exposure groups before prioritizing a modeled geographic comparison.',
      'Review asset-group distributions and fragility differences before proposing one inspection approach.',
      'Verify inventory completeness and exposure denominators before interpreting mapped asset density.',
      'Identify separate modeled components before coordinating coverage; verify real routes separately.',
      'Check assets near the MMI screen before committing a modeled category.',
      'Compare the alternative shaking screen before relying on a model-priority ranking.',
      'Validate dependency and fragility assumptions before relying on joint model conclusions.',
      'Review all PAGER bands and the declared ordinal range before generalizing one exposure band.',
      'Check modeled frontier dependencies and actual backups before finalizing continuity coverage.',
      'Verify cross-screen dependencies and their status before sequencing inspection responsibilities.'
    ],
    grid: [
      'Align report hours and demand weights before prioritizing authorities by count or size.',
      'Inspect the complete adjacent daily load histories before treating one report as a new demand pattern.',
      'Obtain actual service and asset footprints before interpreting map density as exposure.',
      'Verify physical network topology before using reported interchange to coordinate restoration coverage.',
      'Check same-hour forecast and demand before interpreting the deviation or discussing persistence.',
      'Compare complete peak-lookback windows before relying on a recent-peak pressure ranking.',
      'Validate operating constraints and coordination boundaries before assuming independent regional actions.',
      'Establish compatible capacity scenarios and exposure weights before integrating stress.',
      'Identify actual constrained interfaces and critical loads before boundary-specific planning.',
      'Check same-hour imports, reserves and limits before interpreting cross-authority dependence.'
    ],
    market: [
      'Obtain approved exposure weights before interpreting ticker counts as capital at risk.',
      'Check aligned return distributions and reference choice before interpreting a shape difference.',
      'Check paired samples, ties and actual bin count before interpreting return-density symmetry.',
      'Review inferred cluster stability before using model groups in a risk discussion.',
      'Check readings near descriptive bands before treating a color change as a new model condition.',
      'Test the alternative edge gate before relying on a network grouping.',
      'Specify and validate the probabilistic model before interpreting energy-based language.',
      'Review the scenario source and threshold ladder before extrapolating its reachability AUC.',
      'Check boundary and common-factor assumptions before relying on a modeled frontier.',
      'Compare estimated cross-group links with documented exposures before assigning financial dependencies.'
    ],
    aid: [
      'Establish beneficiary and service denominators before prioritizing recipient groups.',
      'Inspect completed-year allocation distributions before interpreting a country funding shift.',
      'Obtain actual facilities and catchments before interpreting dollars as service-density coverage.',
      'Verify functioning supply and referral links before coordinating continuity coverage.',
      'Resolve fiscal-period completeness before computing or describing a funding cut.',
      'Check programme, country and donor scope alternatives before generalizing one allocation subset.',
      'Verify execution, co-dependencies and backfill before treating programme shocks as independent.',
      'Establish validated service histories before translating finance into integrated health exposure.',
      'Identify actual service-loss boundaries and stock constraints before selecting frontier support.',
      'Verify actual service interruptions and responsible partners before sequencing continuity handoffs.'
    ],
    reference: [
      'Confirm who and what the resource covers before using it for a person or service decision.',
      'Establish like-for-like definitions and units before comparing records or quotes.',
      'Check actual accessible services before treating a list of links as coverage.',
      'Identify the owner of each step before relying on a complete resolution or care pathway.',
      'Verify the reference, contact and governing dates before using the guidance.',
      'Confirm payer, setting and jurisdiction applicability before transferring a rule.',
      'Resolve assumptions before treating an explanation as an eligibility, cost or risk determination.',
      'Separate incompatible evidence types before relying on their combined implication.',
      'Identify a qualified contact and practical alternative before finalizing continuity arrangements.',
      'Clarify consent, minimum information and receiving responsibility before a handoff.'
    ],
    food: [
      'Compare the tract with neighbors from the same Atlas edition before describing local need.',
      'Keep each source list separate before comparing distances between places.',
      'Read the tract flag with its edition and the listing radius before describing local access.',
      'Check adjacent tracts in the official Atlas before drawing a service boundary.',
      'Match the Atlas edition and each listing date before combining them in a briefing.',
      'Note the radius of each count before comparing one place with another.',
      'Check transport, hours and eligibility separately before treating a listing as reachable.',
      'Cross-check partial food bank tags with 211 or the regional food bank before publishing a list.',
      'Confirm the nearest store list succeeded and is complete before reading the distance test.',
      'Confirm hours and eligibility with each place before making a referral.'
    ],
    va: [
      'Compare census-weighted and unit-count priorities during the drill before discussing allocation.',
      'Define matched real services before interpreting an occupancy-distribution comparison.',
      'Check official facilities and catchments before interpreting synthetic units as access coverage.',
      'Verify actual transfer and dependency links before coordinating service continuity.',
      'Review synthetic units near nominal capacity during the drill before choosing its response path.',
      'Compare the two declared drill screens before relying on the simulated priority order.',
      'Specify and govern any operational model before interpreting the heuristic strain index.',
      'Obtain approved repeated observations before interpreting an integrated exposure window.',
      'Assign verified ward and community-care handoff owners before finalizing the drill plan.',
      'Obtain actual aligned handoff records before discussing cross-unit flow or responsibility.'
    ]
  };
  const clean = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  function required(diagnostic, row) {
    const value = diagnostic.requiredInputs ?? row.requiredInputs;
    return Array.isArray(value) ? value.map(clean).filter(Boolean).join('; ') : clean(value);
  }
  function forMetric(input) {
    if (!input || !Number.isInteger(input.metricId) || input.metricId < 1 || input.metricId > 10) return null;
    const family = families[input.slug];
    if (!family) return null;
    const diagnostic = input.diagnostic && typeof input.diagnostic === 'object' ? input.diagnostic : {};
    const row = input.row && typeof input.row === 'object' ? input.row : {};
    const unknown = input.when === 'unknown' || diagnostic.status === 'unknown' || !['triggered', 'clear'].includes(diagnostic.status);
    let why = clean(row.parameterWhy) || reasons[family][input.metricId - 1].replace(/\{subject\}/g, subjects[input.slug] || 'the selected public measure');
    if (input.slug === 'global-air-pollution' && input.metricId === 8 && !clean(row.parameterWhy)) {
      why = 'The five-year annual-step PM2.5 integral uses the fixed WHO annual reference to describe historical concentration-years; it is not current AQI, personal dose or estimated deaths.';
    }
    let whyNow = clean(row.parameterWhyNow);
    if (!whyNow) {
      const inputs = required(diagnostic, row);
      const stageReason = sequence[family][input.metricId - 1];
      if (unknown) {
        whyNow = stageReason + ' ' + (input.track === 'operator' ? 'Verify the missing or unqualified inputs.' : 'Check the missing or unqualified inputs.');
        whyNow += inputs ? ' Required inputs: ' + inputs + '.' : ' The current row does not establish a supported assessment.';
        whyNow += ' Unknown does not mean clear; current official instructions take precedence.';
      } else if (input.phase === 'respond') {
        whyNow = stageReason + ' Use currently applicable official instructions or approved local activation rules; this screen does not authorize action or set its deadline.';
      } else if (input.phase === 'review') {
        whyNow = stageReason + ' Use the next relevant planning review; retain the source period and recheck changed assumptions. No response deadline is inferred.';
      } else if (input.phase === 'verify') {
        whyNow = stageReason + ' Check the source period and scope before relying on this screen; it is not proof of an incident or a response deadline.';
      } else {
        whyNow = stageReason + ' Use before the related planning decision; check the source period and current official guidance. No safe waiting interval is inferred.';
      }
      if (!unknown && diagnostic.status === 'clear') {
        whyNow = 'The supplied comparison does not trigger this row; that result is limited to its stated inputs and period. ' + whyNow;
      }
    }
    return { metricId: input.metricId, why, whyNow };
  }
  R.actionContext = Object.freeze({ forMetric, slugs: Object.freeze(Object.keys(families).sort()) });
})(typeof window === 'object' ? window : globalThis);
