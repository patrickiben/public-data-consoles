// Maintainer adapter: reads only window.RestroomResponse (source status and listing counts).
// It never reads or emits the typed address, the place name or any coordinates.
(function () {
  'use strict';
  var REFUGE = 'https://www.refugerestrooms.org/';
  var OSM = 'https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dtoilets';
  var HELP = 'https://www.211.org/';
  var METHOD = 'Refuge Restrooms API v1 (crowd-sourced listings) and OpenStreetMap amenity=toilets via Overpass';
  var cfg = {
    slug: 'public-bathroom-finder',
    title: 'Nearby public restroom listings',
    source: REFUGE,
    authority: HELP,
    scope: 'Counts of nearby restroom listings from Refuge Restrooms (crowd-sourced) and OpenStreetMap amenity=toilets. The typed address, place name and coordinates are never read or included in this plan.',
    gap: 'This lens is a planning review, not a scored assessment. The listings do not supply the inputs it needs, so it stays unknown.',
    escalate: 'If someone needs a restroom urgently or the lists here are unavailable or thin, ask the venue, a library, a transit agency or a local information line (dial 2-1-1). Confirm access, hours and cost before traveling.',
    limit: 'Refuge Restrooms entries are crowd-sourced, unverified and often years old. OpenStreetMap toilet tags are volunteer-edited and often lack fee, hours or accessibility. Free is shown only where fee=no is tagged. Neither source gives live status, and distances are straight-line, not walking distance.',
    lenses: [
      ['Listing coverage and population served', 'Population served and comparable complete restroom inventories for the same area.', 'Compare only complete inventories for the same area; these listings are partial, so no population balance is computed.', 'A listing is not a count of restrooms or of the people who may use them; ask the venue before relying on it.', 'Compare the listings with a complete local inventory and the population served before allocating restrooms.'],
      ['Listing distance distribution', 'Comparable straight-line distance lists for the same source, radius and data date.', 'Do not compare distance lists from different sources or radii; no distribution distance is computed.', 'Compare places within one source list; Refuge Restrooms and OpenStreetMap measure different things.', 'Keep Refuge Restrooms and OpenStreetMap distances separate when comparing areas.'],
      ['Listing density', 'Counts for comparable areas from the same source, radius and data date.', 'Counts depend on the search distance and on volunteer coverage; a low count is not a measured shortage and no density symmetry is computed.', 'Read the distance searched next to each count before comparing places.', 'Report counts with their source and radius; do not read a low count as a shortage.'],
      ['Adjacent area pattern', 'Listings for adjacent areas and a defined adjacency rule.', 'Only the searched area is read; clusters or gaps across adjacent areas are not assessed.', 'Search a nearby intersection or ZIP code to see whether listings continue beyond this area.', 'Search adjacent areas and review the results together before drawing a service boundary.'],
      ['Listing dates and age', 'Each listing date and repeated checks of the same listing over time.', 'Each listing carries its own update or edit date; an old entry may describe a restroom that has moved or closed, and no persistence is computed.', 'Check the date on each listing; an older entry may be out of date.', 'Record each listing date in any briefing and recheck older entries before relying on them.'],
      ['Search radius sensitivity', 'Counts at several radii from the same source and data date.', 'The OpenStreetMap search widens from 3 to 15 miles when fewer than 5 are listed, and Refuge Restrooms returns at most 100, so counts at different radii are not comparable densities.', 'Read the distance each source was searched to before comparing counts.', 'Report counts with their radius; do not compare a 3 mile count with a 15 mile count.'],
      ['Restroom access model', 'A specified model of opening hours, access rules, cost and cleanliness.', 'No model of hours, access, cost or cleanliness is fitted; a listing and a straight-line distance are not travel time or availability.', 'Check hours, access rules and cost with the venue before you go; this page has no live status.', 'Use local hours, access and cost data in a separate approved plan; this page fits no model.'],
      ['Listing completeness across sources', 'Comparable complete listings and a justified range of distances.', 'Refuge Restrooms is crowd-sourced and OpenStreetMap tags are partial; no complete list exists and no completeness measure is computed.', 'If nothing is listed nearby, ask a library, a transit agency or a local information line about public restrooms.', 'Cross-check both sources with local sources before publishing a list.'],
      ['Distance to the nearest listed restroom', 'A successful query from each source with the nearest straight-line distance and a justified distance threshold.', 'No distance threshold is validated for restroom access, so no nearest-distance score is computed; straight-line distance is not walking distance.', 'If the nearest listing is far, ask nearby businesses, libraries or transit staff about restrooms that are not listed.', 'Check walking routes and local options where the nearest listing is far; this page sets no threshold.'],
      ['Referral and handoff', 'Verified referral contacts, access rules and hours for each place.', 'No referral network is observed; this console lists places only.', 'Call ahead to confirm access, hours and cost, or dial 2-1-1 for a local referral.', 'Keep a verified list with hours and access rules; refer through 211 or the venue.']
    ]
  };
  var names = ['Population Balance','Wasserstein Shape Imbalance','Density Symmetry','Euler Contiguity','Persistence Gap','Spatial Mixing / Scale Stability','Variational Free Energy','Contamination AUC','Frontier Risk / Buffer Depth AUC','Mobility Network Leakage'];
  // Source status labels passed to the prioritizer so it can say why a source has no result.
  var STATUSES = ['idle','loading','ok','empty','partial','failed','not-run','not-used','invalid'];
  var MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  function finite(v) { return typeof v === 'number' && Number.isFinite(v); }
  function fact(id,label,value,unit,date,source,quality,basis,note,checked) {
    return { id:id,label:label,value:value,unit:unit || '',measuredAt:date || null,checkedAt:checked || null,source:source || cfg.source,
      quality:value == null ? 'missing' : quality || 'historical',basis:basis || 'modeled',note:note || '' };
  }
  // Source dates arrive as ISO text (Refuge Restrooms update day, OpenStreetMap database timestamp).
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
  function assess(number,label,status,ids,rule,explanation) { return {metricId:number,id:'dimension-'+number,label:label,status:status,evidenceIds:ids,rule:rule,explanation:explanation,scope:'planning'}; }
  function plan(context,evidence) {
    evidence = evidence.slice();
    evidence.push(fact('reference-scope','Scope of this planning review',cfg.scope,'',null,cfg.source,'historical','interpretive','Public listings support confirmation and referral, not a validated transfer of all ten parameters.','2026-10-30'));
    var diagnostics = cfg.lenses.map(function (l,i) {
      var d = assess(i+1,l[0],'unknown',['reference-scope'],'Not assessable from the listing counts.',cfg.gap);
      d.requiredInputs = l[1]; d.analyticalMitigation = l[2]; d.operationalMitigation = l[4]; return d;
    });
    var actions = [];
    diagnostics.forEach(function (d,i) {
      var l = cfg.lenses[i];
      ['public','operator'].forEach(function (track) {
        ['unknown','triggered'].forEach(function (when) {
          var unknown = when === 'unknown';
          actions.push({id:track+'-dimension-'+(i+1)+'-'+when,track:track,phase:unknown ? 'verify' : 'prepare',when:when,diagnosticIds:[d.id],
            title:'#'+(i+1)+' '+names[i]+': '+l[0],
            nextStep:(unknown ? 'Evidence needed. ' : 'Planning review condition met. ')+(track === 'public' ? l[3] : l[4])+(unknown ? ' Required inputs: '+l[1] : ''),
            escalateWhen:cfg.escalate,authorityUrl:cfg.authority});
        });
      });
    });
    return {slug:cfg.slug,selectionKey:JSON.stringify([cfg.slug,'unselected']),title:'Ten-dimension action checklist: '+cfg.title,context:context,evidence:evidence,diagnostics:diagnostics,actions:actions,
      limitations:[cfg.scope,cfg.limit,'All ten dimensions are review lenses. Unavailable inputs never become an all-clear, and a failed source is unknown, never zero. No access decision, availability forecast or walking-time estimate is produced.']};
  }

  var LISTS = [
    {key:'refuge', id:'refuge-count', label:'Refuge Restrooms listings (crowd-sourced)', noun:'Refuge Restrooms listings', source:REFUGE},
    {key:'osm', id:'osm-count', label:'OpenStreetMap public toilets (amenity=toilets)', noun:'OpenStreetMap public toilets', source:OSM}
  ];

  function read() {
    var s = window.RestroomResponse && typeof window.RestroomResponse === 'object' ? window.RestroomResponse : {};
    var sources = s.sources && typeof s.sources === 'object' ? s.sources : {};
    var evidence = [];
    evidence.push(fact('restroom-method','Listing sources used',METHOD,'reference','2026-10-30',REFUGE,'historical','interpretive','Reference context only. Refuge Restrooms records no cost or hours; free is shown only where OpenStreetMap is tagged fee=no.'));
    var counts = {};
    LISTS.forEach(function (cfgList) {
      var src = sources[cfgList.key] && typeof sources[cfgList.key] === 'object' ? sources[cfgList.key] : {};
      var settled = ['ok','empty','partial'].indexOf(src.status) >= 0 && finite(src.count) && src.count >= 0;
      var radius = finite(src.radiusMi) ? src.radiusMi : null, day = isoDate(src.dataDate), checked = checkedIso(src.checkedAt);
      var unit = radius == null ? 'listed' : 'listed within ' + radius + ' mi';
      var measured = settled ? day || 'Source data date unavailable at check time' : null;
      var note = !settled ? (src.status === 'failed' ? 'Unavailable at check time; this is unknown, not zero nearby.' : src.status === 'loading' ? 'Still loading; unknown until the query settles.' : 'Not searched yet; unknown.') :
        src.status === 'partial' ? 'Partial list: at least this many are listed; some may be missing.' :
        src.count === 0 ? 'The query succeeded and lists zero within the distance searched. Zero listed is not proof that none exist.' : 'Listed in the source within the distance searched; confirm access, hours and cost with each place.';
      var f = fact(cfgList.id,cfgList.label,settled ? src.count : null,unit,measured,cfgList.source,day ? 'current' : 'historical','measured',note,checked);
      if (settled && src.status === 'partial') f.partial = true;
      f.sourceStatus = STATUSES.indexOf(src.status) >= 0 ? src.status : 'idle';
      evidence.push(f);
      counts[cfgList.key] = {settled:settled, status:src.status, radius:radius, day:day, unit:unit, value:settled ? src.count : null, partial:src.status === 'partial'};
    });

    var searched = Number.isInteger(s.selectionId) && s.selectionId > 0 && s.state && s.state !== 'idle';
    var geo = sources.geocoder && typeof sources.geocoder === 'object' ? sources.geocoder.status : null;
    var refuge = sources.refuge && typeof sources.refuge === 'object' ? sources.refuge.status : null, osm = sources.osm && typeof sources.osm === 'object' ? sources.osm.status : null;
    // A search that ended before any point was known (invalid ZIP code, no device location) is not the idle state.
    var noLocation = s.state === 'settled' && refuge === 'not-run' && osm === 'not-run';
    var context = !searched ? 'No search yet' : geo === 'failed' ? 'Place search unavailable' : geo === 'empty' ? 'No place found for the search' : noLocation ? 'No location was available for the search' : 'Searched location';
    var payload = plan(context,evidence);
    payload.selectionKey = JSON.stringify([cfg.slug,'search',Number.isInteger(s.selectionId) && s.selectionId > 0 ? s.selectionId : 'unselected']);
    function item(c, cfgList) {
      return {id:cfgList.key+'-listed',label:cfgList.noun+(c.partial ? ' (partial list)' : ''),value:c.value,unit:c.unit,kind:c.day ? 'observed' : 'context',evidenceIds:[cfgList.id],
        method:'Count of listings in the source within the stated straight-line distance of the searched point, as of the source data date.',
        note:c.settled ? (c.partial ? 'At least this many; the list is incomplete.' : 'A listing is not confirmation of access, hours or cost.') : 'Unavailable or not searched: unknown, not zero.',validAt:c.day || undefined};
    }
    var items = [{id:'restroom-sources',label:'Listing sources used',value:'Refuge Restrooms (crowd-sourced) and OpenStreetMap amenity=toilets',unit:'reference',kind:'context',evidenceIds:['restroom-method'],method:'Reference to the two public listing sources this console reads.',note:'Reference context only; it describes no searched location.'}];
    LISTS.forEach(function (cfgList) { items.push(item(counts[cfgList.key], cfgList)); });
    var records = [{id:'restroom-reference',label:'Listing sources used',kind:'context',evidenceIds:['restroom-method'],summary:METHOD+'. Refuge Restrooms entries are crowd-sourced and unverified; free is shown only where OpenStreetMap is tagged fee=no.'}];
    payload.impacts = {title:'Nearby public restroom listings',scope:'Listing counts only; the typed address and coordinates are excluded',
      summary:'Listing counts come from Refuge Restrooms (crowd-sourced) and OpenStreetMap; a failed source is unknown, never zero, and a successful zero is a real zero within the distance searched.',
      items:items,records:records,
      limitations:[cfg.limit,'Many restrooms in businesses, libraries, parks and transit stations are not listed. Confirm access, hours and cost with the place before you go.']};
    return payload;
  }
  ConsoleResponse.connect(read,['#status','#results','#place']);

})();
