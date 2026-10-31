// Maintainer adapter: reads only window.FoodAccessResponse (tract flags and source status).
// It never reads or emits the typed address, the display name or any coordinates.
(function () {
  'use strict';
  var ATLAS = 'https://www.ers.usda.gov/data-products/food-access-research-atlas/';
  var SNAP = 'https://www.fna.usda.gov/snap/retailer-locator';
  var OSM = 'https://www.openstreetmap.org/copyright';
  var VINTAGE = '2025 SNAP-authorized Retailer Access Map, released July 2026; store locations as of June 2025; 2020 census tracts and population; 2020-2024 ACS income';
  var cfg = {
    slug: 'food-desert-oases',
    title: 'Food access and nearby food sources',
    source: ATLAS,
    authority: SNAP,
    scope: 'Census tract food-access flags from the USDA Food Access Research Atlas and counts of nearby SNAP-authorized stores, SNAP-authorized farmers markets and OpenStreetMap food banks. The typed address, place name and coordinates are never read or included in this plan.',
    gap: 'This lens is a planning review, not a scored assessment. The tract flags and listings do not supply the inputs it needs, so it stays unknown.',
    escalate: 'If someone needs food today or the lists here are unavailable or thin, dial 2-1-1 or contact the regional food bank network. Confirm hours and eligibility with each place before traveling.',
    limit: 'The Atlas classifies census tracts using June 2025 store locations; it does not describe current store access or any household. Listings can be outdated or incomplete, OpenStreetMap food bank tags are partial, there is no complete national pantry list, and distances are straight-line, not travel distance.',
    lenses: [
      ['Tract population and income context', 'Tract population, low-income status and comparable neighboring tracts from the same Atlas edition.', 'Compare the tract with neighbors from the same edition; this console reads one tract and computes no population balance.', 'Read the low-income and low-access rows together; one tract flag does not describe your household.', 'Compare tract flags across the service area using the same Atlas edition before allocating outreach.'],
      ['Listing distance distribution', 'Comparable straight-line distance lists for the same source, radius and data date.', 'Do not compare distance lists from different sources or radii; no distribution distance is computed.', 'Compare places within the same list; a store list and a food bank list measure different things.', 'Keep SNAP retailer, farmers market and food bank distances separate when comparing areas.'],
      ['Tract low-income and low-access flag', 'A resolved 2020 census tract in the 2025 Atlas with its low-income and low-access flag (1 mile urban, 10 miles rural).', 'The Atlas flag is a published tract classification based on June 2025 store locations, not a measured density of the current listings.', 'Use the flag as background; check the current lists and call ahead before you travel.', 'Use the tract flag to plan outreach, then verify current store and pantry operations locally.'],
      ['Neighboring tract pattern', 'Flags for adjacent tracts and a defined adjacency rule.', 'This console reads only the searched tract; clusters of flagged tracts are not assessed.', 'Check the official Atlas map to see whether nearby tracts share the flag.', 'Review adjacent tracts in the official Atlas before drawing a service boundary.'],
      ['Atlas edition and listing dates', 'The Atlas edition, each listing data date and repeated editions measured the same way.', 'The 2025 Atlas uses June 2025 store locations and the 2019 measure counted supermarkets only, so the two are not a trend; the listings carry their own later dates.', 'Note the date shown for each source; an older Atlas flag may not match today.', 'Record the Atlas edition and each listing date in any briefing; do not present the 2019 and 2025 measures as a trend.'],
      ['Search radius sensitivity', 'Counts at several radii from the same source and data date.', 'The SNAP search widens until it finds enough stores, so counts at different radii are not comparable densities.', 'Read the radius next to each count before comparing places.', 'Report counts with their radius; do not compare a 2 mile count with a 50 mile count.'],
      ['Food access model', 'A specified model of travel time, prices, hours and eligibility.', 'No travel-time, price or eligibility model is fitted; straight-line distance is not travel time.', 'Think about how you would actually get there, opening hours and eligibility; this page does not.', 'Use local transport, hours and eligibility data in a separate approved plan; this page fits no model.'],
      ['Listing completeness across sources', 'Comparable complete listings and a justified range of distances.', 'OpenStreetMap food bank tags are partial and there is no complete national pantry list; no integrated exposure measure is computed.', 'Call 211 or your food bank network for places missing from these lists.', 'Cross-check OpenStreetMap food banks with the regional food bank network before publishing a list.'],
      ['Distance to the nearest SNAP-authorized store', 'A successful SNAP retailer query with the nearest store distance, plus the urban or rural status of the tract.', 'Flagged when the nearest listed SNAP-authorized store is more than 1 mile (urban tract) or 10 miles (rural tract) away in a straight line; this mirrors the Atlas distance test, not travel distance.', 'If the nearest store is far, check transport options, delivery and SNAP online purchasing with the retailer.', 'Check transport, delivery and mobile pantry options for areas beyond the distance test.'],
      ['Referral and handoff', 'Verified referral contacts, eligibility rules and hours for each place.', 'No referral network is observed; this console lists places only.', 'Call ahead to confirm hours, stock and eligibility, or dial 2-1-1 for a referral.', 'Keep a verified referral list with hours and eligibility; refer through 211 or the regional food bank network.']
    ]
  };
  var names = ['Population Balance','Wasserstein Shape Imbalance','Density Symmetry','Euler Contiguity','Persistence Gap','Spatial Mixing / Scale Stability','Variational Free Energy','Contamination AUC','Frontier Risk / Buffer Depth AUC','Mobility Network Leakage'];
  // Source status labels passed to the prioritizer so it can say why a source has no result.
  var STATUSES = ['idle','loading','ok','empty','partial','failed','not-covered','no-tract'];
  var MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  function finite(v) { return typeof v === 'number' && Number.isFinite(v); }
  function fact(id,label,value,unit,date,source,quality,basis,note,checked) {
    return { id:id,label:label,value:value,unit:unit || '',measuredAt:date || null,checkedAt:checked || null,source:source || cfg.source,
      quality:value == null ? 'missing' : quality || 'historical',basis:basis || 'modeled',note:note || '' };
  }
  // Source dates arrive as ISO text (OpenStreetMap) or as 'October 21, 2026' (USDA layer metadata).
  function isoDate(value) {
    if (typeof value !== 'string') return null;
    var text = value.trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(text)) return Number.isFinite(Date.parse(text)) ? text : null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return Number.isFinite(Date.parse(text + 'T00:00:00Z')) ? text : null;
    var m = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(text), month = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
    if (month < 0) return null;
    var day = new Date(Date.UTC(+m[3], month, +m[2]));
    return day.getUTCDate() === +m[2] ? day.toISOString().slice(0,10) : null;
  }
  function checkedIso(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null; }
  function flag(flags, key) { return flags && (flags[key] === 1 || flags[key] === 0) ? flags[key] : null; }
  function assess(number,label,status,ids,rule,explanation) { return {metricId:number,id:'dimension-'+number,label:label,status:status,evidenceIds:ids,rule:rule,explanation:explanation,scope:'planning'}; }
  function plan(context,evidence,overrides) {
    evidence=evidence.slice();
    evidence.push(fact('reference-scope','Scope of this planning review',cfg.scope,'',null,cfg.source,'historical','interpretive','Public tract flags and listing counts support review and referral, not a validated transfer of all ten parameters.','2026-10-30'));
    var diagnostics=cfg.lenses.map(function(l,i) {
      var d=Object.assign(assess(i+1,l[0],'unknown',['reference-scope'],'Not assessable from the tract flags and listing counts.',cfg.gap),overrides && overrides[i+1] || {});
      d.requiredInputs=l[1]; d.analyticalMitigation=l[2]; d.operationalMitigation=l[4]; return d;
    });
    var actions=[];
    diagnostics.forEach(function(d,i) {
      var l=cfg.lenses[i];
      ['public','operator'].forEach(function(track) {
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
    return {slug:cfg.slug,selectionKey:JSON.stringify([cfg.slug,'unselected']),title:'Ten-dimension action checklist: '+cfg.title,context:context,evidence:evidence,diagnostics:diagnostics,actions:actions,
      limitations:[cfg.scope,cfg.limit,'All ten dimensions are review lenses. Unavailable inputs never become an all-clear, and a failed source is unknown, never zero. No fitted causal effect, eligibility decision or travel-time estimate is produced.']};
  }

  var LISTS = [
    {key:'snap', id:'snap-count', nearest:'snap-nearest', label:'SNAP-authorized stores (excluding farmers markets)', noun:'SNAP-authorized stores', source:SNAP},
    {key:'markets', id:'markets-count', label:'SNAP-authorized farmers markets', noun:'SNAP-authorized farmers markets', source:SNAP},
    {key:'foodbanks', id:'foodbanks-count', label:'Food banks and meal programs tagged in OpenStreetMap', noun:'OpenStreetMap food banks', source:OSM}
  ];

  function read() {
    var s = window.FoodAccessResponse && typeof window.FoodAccessResponse === 'object' ? window.FoodAccessResponse : {};
    var t = s.tract && typeof s.tract === 'object' ? s.tract : {}, t19 = s.tract2019 && typeof s.tract2019 === 'object' ? s.tract2019 : {};
    var sources = s.sources && typeof s.sources === 'object' ? s.sources : {};
    var geoid = typeof t.geoid === 'string' && /^\d{11}$/.test(t.geoid) ? t.geoid : null;
    var ok = t.status === 'ok' && !!geoid && !!t.flags, flags = ok ? t.flags : null;
    var lila = flag(flags,'lila1and10'), urban = ok && (t.urban === 1 || t.urban === 0) ? t.urban : null;
    var tractChecked = checkedIso(t.checkedAt), atlasDate = '2026-07';
    var tractNote = ok ? 'Census tract '+geoid+' (2020 boundaries). Describes the tract, not a household or current store access.' : t.status === 'not-covered' ? 'Not covered: the Atlas includes the 50 states and DC only.' : t.status === 'no-tract' ? 'No census tract was found at the searched point; no result is implied.' : t.status === 'failed' ? 'The Atlas query was unavailable at check time; this is not a "not low access" result.' : 'No census tract resolved yet.';
    var evidence = [];
    evidence.push(fact('fara-method','USDA Food Access Research Atlas edition',typeof t.vintage === 'string' && t.vintage ? t.vintage : VINTAGE,'Atlas edition',atlasDate,ATLAS,'historical','interpretive','Low access is measured as straight-line distance to any SNAP-authorized store, including convenience stores; the older 2019 measure counted supermarkets and large grocery stores only.'));
    var tractFact = fact('tract-lila','Low income and low access, 1 mile urban or 10 miles rural (2025 Atlas)',lila === 1 ? 'Flagged' : lila === 0 ? 'Not flagged' : null,'tract flag',atlasDate,ATLAS,'historical','modeled',tractNote,tractChecked);
    tractFact.sourceStatus = STATUSES.indexOf(t.status) >= 0 ? t.status : 'idle';
    evidence.push(tractFact);
    evidence.push(fact('tract-low-income','Low-income tract (2025 Atlas)',flag(flags,'lowIncome') === 1 ? 'Yes' : flag(flags,'lowIncome') === 0 ? 'No' : null,'tract flag',atlasDate,ATLAS,'historical','modeled','Poverty rate of at least 20%, or median family income at or below 80% of the state or metro median (2020-2024 ACS).',tractChecked));
    evidence.push(fact('tract-low-access','Low access, 1 mile urban or 10 miles rural, without the income test (2025 Atlas)',flag(flags,'la1and10') === 1 ? 'Yes' : flag(flags,'la1and10') === 0 ? 'No' : null,'tract flag',atlasDate,ATLAS,'historical','modeled','At least 500 people or a third of residents live beyond the distance from a SNAP-authorized store.',tractChecked));
    evidence.push(fact('tract-urban','Tract urban or rural status (2025 Atlas)',urban === 1 ? 'Urban' : urban === 0 ? 'Rural' : null,'tract class',atlasDate,ATLAS,'historical','measured','Urban when the tract population-weighted centroid is in a 2025 Census urban area.',tractChecked));
    var ok19 = t19.status === 'ok' && !!t19.flags, lila19 = ok19 ? flag(t19.flags,'lila1and10') : null;
    evidence.push(fact('tract-2019','Low income and low access, 1 mile urban or 10 miles rural (2019 Atlas, supermarkets only)',lila19 === 1 ? 'Flagged' : lila19 === 0 ? 'Not flagged' : null,'tract flag','2019',ATLAS,'historical','modeled','2010 census tracts and supermarkets or large grocery stores only; not comparable with the 2025 measure and not a trend.',checkedIso(t19.checkedAt)));

    var counts = {};
    LISTS.forEach(function (cfgList) {
      var src = sources[cfgList.key] && typeof sources[cfgList.key] === 'object' ? sources[cfgList.key] : {};
      var settled = ['ok','empty','partial'].includes(src.status) && finite(src.count) && src.count >= 0;
      var radius = finite(src.radiusMi) ? src.radiusMi : null, day = isoDate(src.dataDate), checked = checkedIso(src.checkedAt);
      var unit = radius == null ? 'listed' : 'listed within ' + radius + ' mi';
      var measured = settled ? day || 'Source data date unavailable at check time' : null;
      var note = !settled ? (src.status === 'failed' ? 'Unavailable at check time; this is unknown, not zero nearby.' : src.status === 'loading' ? 'Still loading; unknown until the query settles.' : 'Not searched yet; unknown.') :
        src.status === 'partial' ? 'Partial list: at least this many are listed; some may be missing.' :
        src.count === 0 ? 'The query succeeded and lists zero within the radius. Zero listed is not proof that none exist.' : 'Listed in the source within the radius; confirm hours and eligibility with each place.';
      var f = fact(cfgList.id,cfgList.label,settled ? src.count : null,unit,measured,cfgList.source,day ? 'current' : 'historical','measured',note,checked);
      if (settled && src.status === 'partial') f.partial = true;
      f.sourceStatus = STATUSES.indexOf(src.status) >= 0 ? src.status : 'idle';
      evidence.push(f);
      counts[cfgList.key] = {settled:settled, status:src.status, radius:radius, day:day, unit:unit, value:settled ? src.count : null, partial:src.status === 'partial', nearest:finite(src.nearestMi) ? src.nearestMi : null, measured:measured, checked:checked};
    });
    var snap = counts.snap, nearestValue = null;
    if (snap.settled && !snap.partial) nearestValue = snap.value === 0 ? (snap.radius == null ? 'Beyond the searched radius' : 'Beyond ' + snap.radius + ' mi') : snap.nearest;
    evidence.push(fact('snap-nearest','Straight-line distance to the nearest listed SNAP-authorized store',nearestValue,'mi straight-line',snap.measured,SNAP,snap.day ? 'current' : 'historical','measured','Straight-line distance from the searched point, not travel distance. A partial or failed list gives no nearest distance.',snap.checked));

    var threshold = urban === 1 ? 1 : urban === 0 ? 10 : null, d9 = 'unknown';
    if (threshold != null && nearestValue != null) d9 = typeof nearestValue === 'string' ? (snap.radius != null && snap.radius >= threshold ? 'triggered' : 'unknown') : nearestValue > threshold ? 'triggered' : 'clear';
    var overrides = {
      3: {status: lila == null ? 'unknown' : lila === 1 ? 'triggered' : 'clear', evidenceIds:['tract-lila'], rule:'2025 Atlas low income and low access flag at 1 mile urban or 10 miles rural for the searched census tract.', explanation:'A published tract classification from June 2025 store locations; it is background for planning, not current access or a household test.'},
      9: {status: d9, evidenceIds:['tract-urban','snap-nearest'], rule:'Nearest listed SNAP-authorized store more than 1 mile (urban tract) or 10 miles (rural tract) away in a straight line.', explanation:'Mirrors the Atlas distance test using the current SNAP retailer list; straight-line distance is not travel distance, and a failed or partial list stays unknown.'}
    };
    var searched = Number.isInteger(s.selectionId) && s.selectionId > 0 && s.state && s.state !== 'idle';
    var geo = sources.geocoder && typeof sources.geocoder === 'object' ? sources.geocoder.status : null;
    var context = ok ? 'Census tract '+geoid+' (2025 SNAP-authorized Retailer Access Map)' : !searched ? 'No search yet' : geo === 'failed' ? 'Place search unavailable' : geo === 'empty' ? 'No place found for the search' : 'No census tract resolved';
    var payload = plan(context,evidence,overrides);
    payload.selectionKey = JSON.stringify([cfg.slug,'search',Number.isInteger(s.selectionId) && s.selectionId > 0 ? s.selectionId : 'unselected']);
    function item(c, cfgList) {
      return {id:cfgList.key+'-listed',label:cfgList.noun+(c.partial ? ' (partial list)' : ''),value:c.value,unit:c.unit,kind:c.day ? 'observed' : 'context',evidenceIds:[cfgList.id],
        method:'Count of places in the source within the stated straight-line radius of the searched point, as of the source data date.',
        note:c.settled ? (c.partial ? 'At least this many; the list is incomplete.' : 'A listing is not confirmation of hours, stock or eligibility.') : 'Unavailable or not searched: unknown, not zero.',validAt:c.day || undefined};
    }
    var items = [{id:'atlas-edition',label:'USDA Food Access Research Atlas edition used for tract flags',value:'2025 SNAP-authorized Retailer Access Map (released July 2026)',unit:'reference',kind:'context',evidenceIds:['fara-method'],method:'Published USDA ERS edition; store locations as of June 2025 on 2020 census tracts.',note:'Reference context only; it describes no searched location.'},{id:'tract-classification',label:'2025 Atlas low income and low access (1 mile urban, 10 miles rural)',value:lila === 1 ? 'Flagged' : lila === 0 ? 'Not flagged' : null,unit:'tract flag',kind:'context',evidenceIds:['tract-lila'],method:'Published USDA ERS tract flag for the census tract containing the searched point.',note:'Describes the tract using June 2025 store locations; not current store access or any household.'}];
    LISTS.forEach(function (cfgList) { items.push(item(counts[cfgList.key], cfgList)); });
    items.push({id:'snap-nearest-distance',label:'Nearest listed SNAP-authorized store',value:typeof nearestValue === 'number' ? nearestValue : null,unit:'mi straight-line',kind:snap.day ? 'observed' : 'context',evidenceIds:['snap-nearest'],method:'Straight-line distance from the searched point to the nearest store in the SNAP retailer list.',note:'Not travel distance or time.'});
    var records = [{id:'fara-reference',label:'USDA Food Access Research Atlas edition',kind:'context',evidenceIds:['fara-method'],summary:VINTAGE+'. Low access is distance to any SNAP-authorized store, including convenience stores.'}];
    if (lila19 != null) records.push({id:'fara-2019-reference',label:'2019 Atlas measure (older method)',kind:'context',evidenceIds:['tract-2019'],summary:'The 2019 measure on 2010 tracts, counting supermarkets and large grocery stores only, is '+(lila19 === 1 ? 'flagged' : 'not flagged')+' for this location. It is not comparable with the 2025 measure.'});
    payload.impacts = {title:'Tract food-access classification and nearby food listings',scope:'Census tract flags and listing counts only; the typed address and coordinates are excluded',
      summary:'The tract flag is a dated USDA classification, not current access. Listing counts come from the USDA SNAP retailer list and OpenStreetMap; a failed source is unknown, never zero, and a successful zero is a real zero within its radius.',
      items:items,records:records,
      limitations:[cfg.limit,'Farmers markets shown are only those authorized to accept SNAP. OpenStreetMap food bank tags are partial, and there is no complete national pantry list; dial 2-1-1 for local help.']};
    return payload;
  }
  ConsoleResponse.connect(read,['#status','#area','#results','#place']);

})();
