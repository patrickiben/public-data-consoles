/* Community Resilience public-source adapters. Network only through the injected fetch; no DOM.
   Every adapter resolves to one SourceResult and never throws. Asset records are not live operating condition,
   modeled maps are not forecasts, and an empty answer means "None listed in this source", not "none exist". */
(function(root){
 'use strict';
 const NO_DATE='Data date not published by this source';
 const NO_ANSWER='Data date unknown because the source did not answer';
 const NOMINATIM_GAP_MS=1050;
 const ATTRIBUTION='Address search: © OpenStreetMap contributors, via Nominatim';
 const NOMINATIM_POLICY='https://operations.osmfoundation.org/policies/nominatim/';
 const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 const MONTH_NAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];

 const TIGER='https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer';
 const NRI_COUNTY='https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0';
 const NRI_TRACT='https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Census_Tracts/FeatureServer/0';
 const OPENFEMA='https://www.fema.gov/api/open';
 const NWS='https://api.weather.gov';
 const SPC='https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson';
 const HEAT='https://mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer';
 const DROUGHT='https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/US_Drought_Intensity_v1/FeatureServer/1';
 const WFIGS_INCIDENTS='https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0';
 const WFIGS_PERIMETERS='https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0';
 const AIRNOW='https://files.airnowtech.org/airnow/today/reportingarea.dat';
 const HURRICANES='https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Active_Hurricanes_v1/FeatureServer/1';
 const FDSN='https://earthquake.usgs.gov/fdsnws/event/1/';
 const HANS='https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes';
 const NWPS='https://api.water.noaa.gov/nwps/v1/gauges';
 const RIVER_GAUGES='https://mapservices.weather.noaa.gov/eventdriven/rest/services/water/riv_gauges/MapServer/0';
 const COOPS='https://api.tidesandcurrents.noaa.gov';
 const NFHL='https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer';
 const EPQS='https://epqs.nationalmap.gov/v1/json';
 const SURGE='https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/StormSurgeRisk/MapServer';
 const SEISMIC='https://earthquake.usgs.gov/ws/building-codes/asce7-22/calculate';
 const SDWIS='https://data.epa.gov/efservice/';
 const ODIN='https://ornl.opendatasoft.com/api/explore/v2.1/catalog/datasets/odin-real-time-outages-county';
 const PLANTS='https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Power_Plants_in_the_US/FeatureServer/0';
 const USGS_HOSPITALS='https://carto.nationalmap.gov/arcgis/rest/services/structures/MapServer/14';
 const CMS_HOSPITALS='https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Medicare_Hospitals/FeatureServer/0';
 const HRSA='https://gisportal.hrsa.gov/server/rest/services/HealthCareFacilities/PrimaryHealthCareFacilities_FS/MapServer/0';
 const SHELTERS='https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/MapServer/0';
 const NBI='https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_National_Bridge_Inventory/FeatureServer/0';
 const SVI='https://services3.arcgis.com/ZvidGQkLaDJxRSJ2/arcgis/rest/services/CDC_ATSDR_Social_Vulnerability_Index_2022_USA/FeatureServer/';
 const ACS='https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/ACS_Highlights_Emergency_Response_Boundaries/FeatureServer/';
 const FCC='https://geo.fcc.gov/api/census/area';
 const NOMINATIM='https://nominatim.openstreetmap.org/search';

 const STATES=[['01','AL','Alabama'],['02','AK','Alaska'],['04','AZ','Arizona'],['05','AR','Arkansas'],['06','CA','California'],['08','CO','Colorado'],['09','CT','Connecticut'],['10','DE','Delaware'],['11','DC','District of Columbia'],['12','FL','Florida'],['13','GA','Georgia'],['15','HI','Hawaii'],['16','ID','Idaho'],['17','IL','Illinois'],['18','IN','Indiana'],['19','IA','Iowa'],['20','KS','Kansas'],['21','KY','Kentucky'],['22','LA','Louisiana'],['23','ME','Maine'],['24','MD','Maryland'],['25','MA','Massachusetts'],['26','MI','Michigan'],['27','MN','Minnesota'],['28','MS','Mississippi'],['29','MO','Missouri'],['30','MT','Montana'],['31','NE','Nebraska'],['32','NV','Nevada'],['33','NH','New Hampshire'],['34','NJ','New Jersey'],['35','NM','New Mexico'],['36','NY','New York'],['37','NC','North Carolina'],['38','ND','North Dakota'],['39','OH','Ohio'],['40','OK','Oklahoma'],['41','OR','Oregon'],['42','PA','Pennsylvania'],['44','RI','Rhode Island'],['45','SC','South Carolina'],['46','SD','South Dakota'],['47','TN','Tennessee'],['48','TX','Texas'],['49','UT','Utah'],['50','VT','Vermont'],['51','VA','Virginia'],['53','WA','Washington'],['54','WV','West Virginia'],['55','WI','Wisconsin'],['56','WY','Wyoming'],['60','AS','American Samoa'],['66','GU','Guam'],['69','MP','Northern Mariana Islands'],['72','PR','Puerto Rico'],['78','VI','U.S. Virgin Islands']];
 const STATE_KEYS=new Map();
 for(const s of STATES){STATE_KEYS.set(s[0],s);STATE_KEYS.set(s[1],s);STATE_KEYS.set(s[2].toUpperCase(),s);}
 STATE_KEYS.set('D.C.',STATE_KEYS.get('DC'));STATE_KEYS.set('WASHINGTON DC',STATE_KEYS.get('DC'));STATE_KEYS.set('WASHINGTON D.C.',STATE_KEYS.get('DC'));
 STATE_KEYS.set('VIRGIN ISLANDS',STATE_KEYS.get('VI'));STATE_KEYS.set('US VIRGIN ISLANDS',STATE_KEYS.get('VI'));STATE_KEYS.set('P.R.',STATE_KEYS.get('PR'));
 function stateOf(key){const s=STATE_KEYS.get(String(key??'').trim().replace(/\s+/g,' ').toUpperCase());return s?{fips:s[0],abbr:s[1],name:s[2]}:null;}

 const NRI_HAZARDS=['AVLN','CFLD','CWAV','DRGT','ERQK','HAIL','HWAV','HRCN','ISTM','LNDS','LTNG','IFLD','SWND','TRND','TSUN','VLCN','WFIR','WNTW'];
 const NRI_FIELDS=['STCOFIPS','COUNTY','STATE','STATEABBRV','NRI_VER','POPULATION','BUILDVALUE','RISK_SCORE','RISK_RATNG','EAL_VALT','EAL_RATNG','SOVI_SCORE','SOVI_RATNG','RESL_SCORE','RESL_RATNG'].concat(...NRI_HAZARDS.map(h=>[h+'_EALT',h+'_RISKS',h+'_RISKR']));
 const SPC_RANK={TSTM:1,MRGL:2,SLGT:3,ENH:4,MDT:5,HIGH:6};
 const SEVERITY={Extreme:4,Severe:3,Moderate:2,Minor:1};
 const VOLCANO_OBSERVATORIES={AK:['avo'],HI:['hvo'],AS:['hvo'],WA:['cvo'],OR:['cvo'],CA:['calvo'],NV:['calvo'],ID:['yvo'],MT:['yvo'],WY:['yvo'],UT:['yvo'],CO:['yvo'],NM:['yvo'],AZ:['yvo'],MP:['nmi'],GU:['nmi']};
 const ODIN_STATES_2026_10=['Arizona','California','Colorado','Delaware','Florida','Idaho','Indiana','Iowa','Kansas','Louisiana','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Montana','New Jersey','New Mexico','New York','North Carolina','Ohio','Oklahoma','Oregon','Pennsylvania','South Carolina','South Dakota','Tennessee','Texas','Utah','Virginia','Washington','West Virginia','Wyoming'];
 const WATER_SOURCES={GW:'Groundwater',GWP:'Purchased groundwater',SW:'Surface water',SWP:'Purchased surface water',GU:'Groundwater under the influence of surface water',GUP:'Purchased groundwater under the influence of surface water'};
 const SURGE_REGIONS=[
  ['Puerto Rico and the U.S. Virgin Islands',[17.5,18.8,-68,-64.4],[26,30,34,38,42]],
  ['Hawaii',[18.5,22.6,-161,-154.5],[90,94,98,102]],
  ['Guam',[13,14,144.4,145.2],[116,120,124,128,132]],
  ['American Samoa',[-15,-10.5,-171.5,-168],[137,141,145,149,153]],
  ['southern California',[32,35.5,-121.5,-114],[107,111]],
  ['the Atlantic and Gulf coasts',[24,47.6,-98,-66.8],[5,9,13,17,21]]];
 const SURGE_CLASSES={1:'Up to 3 ft above ground',2:'Greater than 3 ft above ground',3:'Greater than 6 ft above ground',4:'Greater than 9 ft above ground',5:'Leveed area'};

 const SOURCES={};
 function source(id,title,owner,link,coverage,extra){SOURCES[id]=Object.freeze({id,title,owner,hostedBy:null,experimental:false,link,coverage,...extra});}
 source('zcta','Census ZIP Code Tabulation Areas (TIGERweb)','U.S. Census Bureau','https://tigerweb.geo.census.gov/','ZIP Code Tabulation Areas approximate USPS ZIP codes as of the 2020 Census; PO box and newer ZIP codes may be missing.');
 source('zcta-overlap','Counties and places in this ZIP area (TIGERweb)','U.S. Census Bureau','https://tigerweb.geo.census.gov/','A ZIP area can cross county and city lines; this lists areas that share land with it, not mail delivery or service areas.');
 source('places','Census places and county subdivisions (TIGERweb)','U.S. Census Bureau','https://tigerweb.geo.census.gov/','Lists incorporated places, census designated places and county subdivisions with that name; neighborhoods and informal names are not included.');
 source('nominatim','Address search (Nominatim, OpenStreetMap)','OpenStreetMap contributors',NOMINATIM_POLICY,'Street addresses only, matched against volunteer OpenStreetMap data, so a match can be missing or approximate; ZIP codes are never sent here.');
 source('point-geography','Census geography at this point (TIGERweb, FCC Area API fallback)','U.S. Census Bureau','https://tigerweb.geo.census.gov/','Names the state, county, city, county subdivision and census tract that contain the point; it carries no hazard values.');
 source('nri-county','FEMA National Risk Index, county','FEMA','https://hazards.fema.gov/nri/','Modeled long-term averages for 18 natural hazards, not a forecast or a record of any one event; Puerto Rico has expected loss figures but no ratings.');
 source('nri-tract','FEMA National Risk Index, census tract','FEMA','https://hazards.fema.gov/nri/','Tract ratings rank against all U.S. tracts, so they can differ from the county rating; Puerto Rico has expected loss figures but no ratings.');
 source('fema-declarations','FEMA disaster declarations (OpenFEMA)','FEMA','https://www.fema.gov/disaster/declarations','Counts federal declarations that name this county since 2000; events without a federal declaration are not listed.');
 source('nws-alerts','National Weather Service alerts','NOAA National Weather Service','https://www.weather.gov/','Active watches, warnings and advisories for this point only; notices from local agencies are not included.');
 source('nws-point','National Weather Service office and zones','NOAA National Weather Service','https://www.weather.gov/','Names the forecast office and zones for this point; it carries no hazard values.');
 source('spc-outlook','Storm Prediction Center Day 1 outlook','NOAA Storm Prediction Center','https://www.spc.noaa.gov/products/outlook/day1otlk.html','Covers the lower 48 states only; Alaska, Hawaii, Puerto Rico and the territories are not covered.');
 source('heatrisk','NWS HeatRisk (experimental)','NOAA National Weather Service','https://www.wpc.ncep.noaa.gov/heatrisk/','Experimental 7-day heat risk for the lower 48 states only; Alaska, Hawaii, Puerto Rico and the territories are not covered.',{experimental:true});
 source('drought','U.S. Drought Monitor by county','National Drought Mitigation Center, USDA and NOAA','https://droughtmonitor.unl.edu/','Weekly share of county area in drought; it does not describe the water supply at any address.',{hostedBy:'Esri'});
 source('wildfires','Wildfire incidents and perimeters (NIFC WFIGS)','National Interagency Fire Center','https://data-nifc.opendata.arcgis.com/','Reported wildfire incidents and mapped perimeters only; new or small fires can be missing, and prescribed burns are counted separately.');
 source('air-quality','AirNow reporting areas','U.S. EPA AirNow and partner agencies','https://www.airnow.gov/','Preliminary hourly values for the nearest reporting area, which can differ from conditions at the address; Puerto Rico and the U.S. Virgin Islands are not in this file.');
 source('tropical','Active tropical cyclones','NOAA NHC and JTWC','https://www.nhc.noaa.gov/','Latest observed storm centers worldwide; storm size, rainfall and surge are not included.',{hostedBy:'Esri'});
 source('earthquakes','USGS earthquakes (past 30 days, M2.5+, within 250 km)','USGS','https://earthquake.usgs.gov/earthquakes/map/','Recorded earthquakes of magnitude 2.5 or more within 250 km in the past 30 days; it is not a forecast.');
 source('volcanoes','USGS elevated volcano alerts','USGS Volcano Hazards Program','https://volcanoes.usgs.gov/','Volcanoes above normal alert level for the observatory that covers this state; the feed gives no locations, so no distance is computed.');
 source('river-gauges','NOAA river gauges within 25 km','NOAA National Water Prediction Service','https://water.noaa.gov/','Gauges within 25 km only; streams without a gauge and flash flooding are not covered.');
 source('tide-station','NOAA tide station water level','NOAA CO-OPS','https://tidesandcurrents.noaa.gov/','Water level at the nearest NOAA station within 25 km; it does not show flooding on any particular street.');
 source('ofs-forecast','NOAA OFS water level forecast','NOAA CO-OPS and NOS','https://tidesandcurrents.noaa.gov/ofs/','Model guidance for one station; it is not an official forecast or warning.');
 source('flood-zone','FEMA flood map zone (NFHL)','FEMA','https://msc.fema.gov/portal/home','Mapped flood zone at this point; places FEMA has not mapped are not covered, and unmapped never means safe.');
 source('elevation','USGS ground elevation (EPQS)','USGS 3D Elevation Program','https://apps.nationalmap.gov/epqs/','Ground elevation at one point, not the floor height of any building.');
 source('surge','NHC storm surge risk maps','NOAA National Hurricane Center','https://www.nhc.noaa.gov/nationalsurge/','Worst-case modeled flooding by hurricane category for the Atlantic and Gulf coasts, Puerto Rico, the U.S. Virgin Islands, Hawaii, southern California, Guam and American Samoa; Alaska is not covered and it is not a forecast.');
 source('seismic-design','USGS seismic design values (ASCE 7-22)','USGS','https://earthquake.usgs.gov/ws/building-codes/','Building code design values for a default site class; not a plain-language hazard score or a forecast.');
 source('water-systems','EPA drinking water systems (SDWIS)','U.S. EPA','https://www.epa.gov/enviro/sdwis-search','Active community water systems that list this county; no operating condition, boil-water notices or service area maps.');
 source('outages','Power outages (ORNL ODIN)','Oak Ridge National Laboratory','https://ornl.opendatasoft.com/explore/dataset/odin-real-time-outages-county/','Only utilities that report to ODIN appear, in '+ODIN_STATES_2026_10.length+' states as of October 2026; other utilities and states are not covered.');
 source('power-plants','Power plants (EIA)','EIA','https://www.eia.gov/electricity/data/eia860m/','Generating plants from EIA-860M; a listed plant may be on standby or out of service, and substations and lines are not included.',{hostedBy:'Esri'});
 source('hospitals-usgs','Hospitals (USGS National Map)','USGS','https://www.usgs.gov/programs/national-geospatial-program/national-map','Hospital locations only; no beds, capacity or current status.');
 source('hospitals-cms','Medicare hospitals (CMS)','CMS','https://data.cms.gov/provider-data/topics/hospitals','Hospitals enrolled in Medicare with an emergency services flag; no beds, capacity or current status.',{hostedBy:'Esri'});
 source('health-centers','HRSA health center sites','HRSA','https://data.hrsa.gov/','HRSA-supported health center sites; hours and current status can differ.');
 source('shelters','Open shelters (FEMA National Shelter System)','FEMA and American Red Cross','https://www.fema.gov/emergency-managers/national-preparedness/plan','Shelters reported open right now; planned shelters that are not open are not listed.');
 source('bridges','National Bridge Inventory','FHWA, via BTS','https://www.fhwa.dot.gov/bridge/nbi.cfm','Structural condition ratings from inspections; a poor rating does not mean a bridge is closed, and live closures are not included.');
 source('community-context','Community context (CDC/ATSDR SVI 2022)','CDC/ATSDR','https://www.atsdr.cdc.gov/place-health/php/svi/','Census survey estimates for the county and tract with margins of error; SVI covers the 50 states and DC, and Puerto Rico uses Esri ACS layers.');
 source('screen-flood-zones','FEMA flood zones at assets (NFHL)','FEMA','https://msc.fema.gov/portal/home','Up to 25 assets are screened; unmapped points are not shown as safe.');
 source('screen-seismic','USGS seismic design values at assets (ASCE 7-22)','USGS','https://earthquake.usgs.gov/ws/building-codes/','Up to 15 assets are screened, with a default site class.');
 source('screen-nri-tract','FEMA National Risk Index tract values at assets','FEMA','https://hazards.fema.gov/nri/','Up to 25 assets are screened by the census tract that contains each one.');
 source('screen-heatrisk','NWS HeatRisk at assets (experimental)','NOAA National Weather Service','https://www.wpc.ncep.noaa.gov/heatrisk/','Up to 50 assets in the lower 48 states are screened in one request.',{experimental:true});
 source('local','Local published data files','Published with this site','./','Only the local files named in the place configuration; they are dated snapshots, not live operating condition.');

 class SourceError extends Error{constructor(message,status,userMessage){super(message);this.name='SourceError';this.status=status||null;this.userMessage=userMessage||null;}}

 const finite=v=>typeof v==='number'&&Number.isFinite(v);
 function num(v){if(v==null||(typeof v==='string'&&!v.trim())||typeof v==='boolean')return null;const n=typeof v==='number'?v:Number(String(v).trim());return Number.isFinite(n)?n:null;}
 function round(v,d){if(!finite(v))return null;const f=10**d;return Math.round(v*f)/f;}
 const iso=ms=>finite(ms)?new Date(ms).toISOString():null;
 const pad=n=>String(n).padStart(2,'0');
 function dayText(ms){const d=new Date(ms);return MONTHS[d.getUTCMonth()]+' '+d.getUTCDate()+', '+d.getUTCFullYear();}
 function stampText(ms){const d=new Date(ms);return dayText(ms)+' '+pad(d.getUTCHours())+':'+pad(d.getUTCMinutes())+' UTC';}
 function distanceKm(a,b){const rad=Math.PI/180,dlat=(b.lat-a.lat)*rad,dlon=(b.lon-a.lon)*rad,x=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;return 6371.0088*2*Math.asin(Math.sqrt(Math.max(0,Math.min(1,x))));}
 const km=(origin,lat,lon)=>finite(lat)&&finite(lon)?round(distanceKm(origin,{lat,lon}),2):null;
 const nearestFirst=list=>list.sort((a,b)=>(a.distanceKm??Infinity)-(b.distanceKm??Infinity));
 function attr(a,key){if(!a)return undefined;if(key in a)return a[key];const lower=key.toLowerCase();for(const k of Object.keys(a))if(k.toLowerCase()===lower)return a[k];return undefined;}
 const text=v=>v==null?null:String(v).trim()||null;
 const sql=s=>"'"+String(s).replace(/'/g,"''")+"'";
 const qs=p=>Object.entries(p).filter(([,v])=>v!=null).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
 const c4=v=>String(Number(v.toFixed(4)));
 const box=(lat,lon,[s,n,w,e])=>lat>=s&&lat<=n&&lon>=w&&lon<=e;
 const inConus=(lat,lon)=>box(lat,lon,[24.3,49.5,-125,-66.8]);
 const inAlaska=(lat,lon)=>lat>=51&&(lon<=-129||lon>=172);
 const inPuertoRicoOrVI=(lat,lon)=>box(lat,lon,[17.5,18.8,-68,-64.4]);
 function checkPoint(lat,lon){if(!finite(lat)||!finite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw new SourceError('Invalid coordinates');return {lat,lon};}
 function checkFips(fips,length){const s=String(fips??'');if(!new RegExp('^\\d{'+length+'}$').test(s))throw new SourceError('Invalid FIPS code');return s;}
 function dated(ms,prefix,basis,suffix){return finite(ms)?{dataDate:iso(ms),dataDateText:prefix+' '+dayText(ms)+(suffix||''),dataDateBasis:basis}:{dataDate:null,dataDateText:NO_DATE,dataDateBasis:basis+' (not present)'};}
 function fed(ms,basis,prefix){return finite(ms)?{dataDate:iso(ms),dataDateText:(prefix||'Feed updated')+' '+stampText(ms),dataDateBasis:basis}:{dataDate:null,dataDateText:NO_DATE,dataDateBasis:basis+' (not present)'};}
 const undated=basis=>({dataDate:null,dataDateText:NO_DATE,dataDateBasis:basis});
 const plural=(n,one,many)=>n+' '+(n===1?one:(many||one+'s'));
 const noData=e=>/no data|not found|no .*available/i.test(String(e&&e.message||e||''));
 function coopsTime(t){const m=/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(String(t??''));return m?Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5]):NaN;}
 function ymd(ms){const d=new Date(ms);return d.getUTCFullYear()+pad(d.getUTCMonth()+1)+pad(d.getUTCDate());}

 /* AirNow rows carry local time with a zone label. Alaska rows use ADT/AST for Alaska time, not Atlantic time. */
 function airStamp(date,time,zone,state){
  const d=/^(\d{2})\/(\d{2})\/(\d{2})$/.exec(date),t=/^(\d{1,2}):(\d{2})$/.exec(time);
  const offsets={UTC:0,GMT:0,EDT:-4,EST:-5,CDT:-5,CST:-6,MDT:-6,MST:-7,PDT:-7,PST:-8,AKDT:-8,AKST:-9,HDT:-9,HST:-10,AST:-4,ADT:-3,CHST:10,SST:-11};
  const offset=state==='AK'&&(zone==='ADT'||zone==='AST')?(zone==='ADT'?-8:-9):offsets[zone];
  if(!d||!t||offset==null)return NaN;
  const month=+d[1],day=+d[2],hour=+t[1],minute=+t[2];if(month<1||month>12||day<1||day>31||hour>23||minute>59)return NaN;
  return Date.UTC(2000+(+d[3]),month-1,day,hour,minute)-offset*3600000;
 }

 /* ZIP, ZIP+4, address, "Name, ST" or plain name. ZIP-shaped input never reaches Nominatim. */
 // Lowercase two-letter words that are also state codes; only the uppercase form counts as a state without a comma.
 const LOWER_WORDS=new Set(['in','or','me','hi','oh','de','la','al','id','co','pa','ma','mo']);
 function parseQuery(input){
  const raw=String(input??''),t=raw.trim().replace(/\s+/g,' ');
  if(!t)return {kind:'empty',raw};
  const zip=/^(\d{5})(?:-\d{4})?$/.exec(t);
  if(zip)return {kind:'zip',zip:zip[1],raw};
  if(/^[\d\s-]+$/.test(t))return {kind:'zip-invalid',raw,message:'A ZIP code has 5 digits'};
  if(/^\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?\s+[A-Za-z0-9]/.test(t))return {kind:'address',raw,text:t};
  const parts=t.split(',').map(s=>s.trim()).filter(Boolean);
  if(parts.length>1){
   const tail=/^(.*?)(?:\s+(\d{5})(?:-\d{4})?)?$/.exec(parts[parts.length-1]),state=stateOf(tail[1]);
   if(state)return {kind:'name',name:parts[0],stateAbbr:state.abbr,qualifier:parts.slice(1,-1).join(', ')||undefined,zip:tail[2]||undefined,raw};
   return {kind:'name',name:parts[0],qualifier:parts.slice(1).join(', '),raw};
  }
  /* "Moore OK", "Cedar Rapids IA", "Tucson Arizona": a trailing state code or name without a comma. */
  const words=t.split(' ');
  for(let k=Math.min(3,words.length-1);k>=1;k--){
   const tailWords=words.slice(-k),tail=tailWords.join(' ');
   if(k===1&&tail.length===2&&tail===tail.toLowerCase()&&LOWER_WORDS.has(tail))continue;
   if(k===1&&tail.length===2&&!/^[A-Za-z]{2}$/.test(tail))continue;
   const state=stateOf(tail);
   if(state)return {kind:'name',name:words.slice(0,-k).join(' '),stateAbbr:state.abbr,raw};
  }
  return {kind:'name',name:t,raw};
 }

 /* Even-odd point test over GeoJSON Polygon or MultiPolygon, or ArcGIS rings. */
 function inRing(ring,x,y){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;}
 const inRings=(rings,x,y)=>Array.isArray(rings)&&rings.reduce((inside,ring)=>Array.isArray(ring)&&ring.length>2&&inRing(ring,x,y)?!inside:inside,false);
 function pointInGeometry(g,lat,lon){
  if(!g||!finite(lat)||!finite(lon))return false;
  if(g.type==='Polygon')return inRings(g.coordinates,lon,lat);
  if(g.type==='MultiPolygon')return Array.isArray(g.coordinates)&&g.coordinates.some(p=>inRings(p,lon,lat));
  if(Array.isArray(g.rings))return inRings(g.rings,lon,lat);
  return false;
 }
 function spcCategoryAt(data,lat,lon){
  let best={label:null,rank:0};
  for(const f of (data&&Array.isArray(data.features)?data.features:[]))if(f&&f.rank>best.rank&&pointInGeometry(f.geometry,lat,lon))best={label:f.label,rank:f.rank};
  return best;
 }
 function nearestVertexKm(origin,rings){let best=Infinity;for(const ring of rings||[])for(const p of ring||[])if(finite(p[0])&&finite(p[1]))best=Math.min(best,distanceKm(origin,{lat:p[1],lon:p[0]}));return finite(best)?round(best,2):null;}

 /* Python json.dumps(sort_keys=True, separators=(",",":"), ensure_ascii=False) of a JSON text, keeping number spellings. */
 function canonicalJson(src){
  let i=0;const n=src.length;
  const ws=()=>{while(i<n&&(src[i]===' '||src[i]==='\n'||src[i]==='\r'||src[i]==='\t'))i++;};
  const fail=()=>{throw new SourceError('Malformed JSON');};
  const str=()=>{const s=i;if(src[i]!=='"')fail();i++;while(i<n&&src[i]!=='"'){if(src[i]==='\\')i++;i++;}if(i>=n)fail();i++;return JSON.stringify(JSON.parse(src.slice(s,i)));};
  function value(){
   ws();const ch=src[i];
   if(ch==='{'){i++;ws();const parts=[];if(src[i]==='}'){i++;return '{}';}
    for(;;){ws();const k=str();ws();if(src[i++]!==':')fail();parts.push([JSON.parse(k),k,value()]);ws();const d=src[i++];if(d==='}')break;if(d!==',')fail();}
    parts.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);return '{'+parts.map(p=>p[1]+':'+p[2]).join(',')+'}';}
   if(ch==='['){i++;ws();const parts=[];if(src[i]===']'){i++;return '[]';}
    for(;;){parts.push(value());ws();const d=src[i++];if(d===']')break;if(d!==',')fail();}return '['+parts.join(',')+']';}
   if(ch==='"')return str();
   const m=/^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(src.slice(i,i+64));if(!m)fail();i+=m[0].length;return m[0];
  }
  const out=value();ws();if(i!==n)fail();return out;
 }

 /* Nominatim usage policy: at most one request per second across the whole page, by waiting, never dropping. */
 let nominatimChain=Promise.resolve(),nominatimLast=-Infinity;
 function nominatimTurn(isCurrent){
  const turn=nominatimChain.then(async()=>{const wait=nominatimLast+NOMINATIM_GAP_MS-Date.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));if(typeof isCurrent==='function'&&!isCurrent())return false;nominatimLast=Date.now();return true;});
  nominatimChain=turn.catch(()=>{});return turn;
 }
 const nominatimKey=t=>String(t||'').trim().replace(/\s+/g,' ').toLowerCase();

 function create(options={}){
  const fetchFn=options.fetch||(typeof root.fetch==='function'?root.fetch.bind(root):null);
  const now=typeof options.now==='function'?options.now:()=>Date.now();
  const timeoutMs=finite(options.timeoutMs)&&options.timeoutMs>0?options.timeoutMs:20000;
  const slowTimeoutMs=finite(options.slowTimeoutMs)&&options.slowTimeoutMs>0?options.slowTimeoutMs:timeoutMs*2;
  const metaCache=new Map();
  /* Nominatim results are cached for the page session (usage policy: "Results must be cached on your side"); identical queries share one request. */
  const nominatimCache=new Map();
  let airCache=null,coopsCache=null,odinStatesCache=null,femaMetaCache=null;

  function finish(def,r,fetchedAt){
   return {id:def.id,title:r.title||def.title,owner:r.owner||def.owner,hostedBy:r.hostedBy!==undefined?r.hostedBy:def.hostedBy,experimental:!!def.experimental,
    status:r.status,message:r.message,dataDate:r.dataDate??null,dataDateText:r.dataDateText||NO_DATE,dataDateBasis:r.dataDateBasis||'none',
    fetchedAt,link:r.link||def.link,coverage:r.coverage||def.coverage,data:r.data===undefined?null:r.data,error:r.error||null};
  }
  async function run(id,work){
   const def=SOURCES[id],fetchedAt=iso(now());
   try{const r=await work();return finish(def,r,fetchedAt);}
   catch(e){const reason=String(e&&e.message||e||'Unknown error').slice(0,200);
    return finish(def,{status:'unavailable',message:e&&e.userMessage||def.title+' did not answer ('+reason+'). Nothing is shown in its place; check the source directly.',dataDate:null,dataDateText:NO_ANSWER,dataDateBasis:'none',data:null,error:reason},fetchedAt);}
  }

  async function request(url,o={}){
   if(!fetchFn)throw new SourceError('No fetch function available');
   const ms=o.timeout||timeoutMs,controller=typeof AbortController==='function'?new AbortController():null;let timer;
   const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{if(controller)controller.abort();reject(new SourceError('Timed out after '+round(ms/1000,2)+' s'));},ms);});
   const work=(async()=>{
    let response;
    try{response=await fetchFn(url,{method:o.method||'GET',headers:o.headers,body:o.body,signal:controller?controller.signal:undefined});}
    catch(e){throw new SourceError(e&&e.name==='AbortError'?'Request aborted':'Network request failed: '+String(e&&e.message||e).slice(0,120));}
    if(!response||!response.ok)throw new SourceError('HTTP '+(response?response.status:'error'),response&&response.status);
    const body=await response.text();
    const header=name=>response.headers&&typeof response.headers.get==='function'?response.headers.get(name):null;
    if(o.text)return {text:body,header};
    let json;try{json=JSON.parse(body);}catch(e){throw new SourceError('Malformed JSON');}
    if(!o.keepError&&json&&typeof json==='object'&&!Array.isArray(json)&&json.error)throw new SourceError('Service error: '+String(json.error.message||json.error.code||json.error).slice(0,160),json.error.code);
    return {json,header};
   })();
   work.catch(()=>{});
   try{return await Promise.race([work,timeout]);}finally{clearTimeout(timer);}
  }
  async function arcQuery(layer,params,o){
   const {json}=await request(layer+'/query?'+qs({...params,f:'json'}),o);
   if(!json||!Array.isArray(json.features))throw new SourceError('Missing feature list');
   return json;
  }
  function arcPost(layer,params){
   return request(layer+'/query',{method:'POST',body:qs({...params,f:'json'}),headers:{'Content-Type':'application/x-www-form-urlencoded'}}).then(({json})=>{if(!json||!Array.isArray(json.features))throw new SourceError('Missing feature list');return json.features;});
  }
  const pointParams=(lat,lon)=>({geometry:lon+','+lat,geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',returnGeometry:'false'});
  const nearParams=(lat,lon,meters,unit)=>({geometry:lon+','+lat,geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',distance:String(meters),units:unit||'esriSRUnit_Meter',returnGeometry:'true',outSR:'4326'});

  /* ArcGIS layer metadata, fetched once per layer per session (live feeds ask each time). Never rejects. */
  function layerInfo(j,header){
   const e=j&&j.editingInfo||{},edit=num(e.dataLastEditDate)??num(e.lastEditDate);
   const words=[j&&j.description,j&&j.serviceDescription,j&&j.documentInfo&&j.documentInfo.Comments].filter(v=>typeof v==='string').join(' ');
   const v=new RegExp('('+MONTH_NAMES.join('|')+') (\\d{1,2}), (\\d{4}) vintage').exec(words);
   const modified=Date.parse(header&&header('last-modified')||'');
   return {edit,editBasis:e.dataLastEditDate!=null?'ArcGIS layer editingInfo.dataLastEditDate':'ArcGIS layer editingInfo.lastEditDate',
    vintage:v?Date.UTC(+v[3],MONTH_NAMES.indexOf(v[1]),+v[2]):null,copyright:typeof (j&&j.copyrightText)==='string'?j.copyrightText:'',modified:finite(modified)?modified:null};
  }
  function arcMeta(url,live){
   if(!live&&metaCache.has(url))return metaCache.get(url);
   const p=request(url+'?f=json').then(({json,header})=>layerInfo(json,header)).catch(()=>null);
   if(!live){metaCache.set(url,p);p.then(v=>{if(!v)metaCache.delete(url);});}
   return p;
  }
  function metaDate(info,suffix,live){
   if(!info)return {dataDate:null,dataDateText:'Data date unknown because the layer metadata did not answer',dataDateBasis:'ArcGIS layer metadata (no answer)'};
   if(finite(info.edit))return live?fed(info.edit,info.editBasis):dated(info.edit,'Data updated',info.editBasis,suffix?' ('+suffix+')':'');
   if(finite(info.vintage))return dated(info.vintage,'Boundaries vintage',"ArcGIS service description 'vintage'",suffix?' ('+suffix+')':'');
   return undated('ArcGIS layer metadata has no edit date');
  }
  function capList(points,cap){
   const all=(Array.isArray(points)?points:[]).map((p,i)=>{const lat=Array.isArray(p)?p[0]:p&&p.lat,lon=Array.isArray(p)?p[1]:p&&p.lon;return {id:p&&p.id!=null?p.id:i,lat:num(lat),lon:num(lon)};});
   return {list:all.slice(0,cap),rest:all.slice(cap),total:all.length};
  }
  async function pool(list,limit,fn){
   const out=new Array(list.length);let next=0;
   await Promise.all(Array.from({length:Math.min(limit,list.length)},async()=>{while(next<list.length){const i=next++;out[i]=await fn(list[i],i);}}));
   return out;
  }
  function screenResult(label,values,rest,total,date){
   const all=values.concat(rest.map(p=>({id:p.id,value:null,reason:'not screened (over the cap)'})));
   const screened=values.length,failed=values.filter(v=>v.reason==='unavailable').length,known=values.filter(v=>v.value!=null).length;
   if(screened&&failed===screened)throw new SourceError('Every screen request failed');
   const capped=rest.length?' The first '+screened+' of '+total+' were screened.':'';
   return {status:known?'ok':'empty',message:(known?label+' found for '+known+' of '+screened+' screened assets.':'No '+label.toLowerCase()+' listed in this source for the screened assets.')+(failed?' '+plural(failed,'request')+' failed.':'')+capped,data:{values:all,screened,total,failed},...date};
  }

  /* ---------- Geography ---------- */
  function zcta(zip){
   return run('zcta',async()=>{
    const z=String(zip??'').trim();
    if(!/^\d{5}$/.test(z))return {status:'empty',message:'A ZIP code has 5 digits.',...undated('No request made')};
    const [j,meta]=await Promise.all([arcQuery(TIGER+'/2',{where:'ZCTA5='+sql(z),outFields:'ZCTA5,GEOID,INTPTLAT,INTPTLON',returnGeometry:'false'}),arcMeta(TIGER+'/2')]);
    const a=j.features[0]&&j.features[0].attributes,date=metaDate(meta);
    if(!a)return {status:'empty',message:'Not a valid or known ZIP code: '+z+' is not a 2020 Census ZIP Code Tabulation Area.',data:null,...date};
    const lat=num(a.INTPTLAT),lon=num(a.INTPTLON);
    if(lat==null||lon==null)throw new SourceError('ZIP area has no internal point');
    return {status:'ok',message:'ZIP '+z+' is a 2020 Census ZIP Code Tabulation Area.',data:{zip:z,lat,lon},...date};
   });
  }
  function zctaOverlap(zip){
   return run('zcta-overlap',async()=>{
    const z=String(zip??'').trim();
    if(!/^\d{5}$/.test(z))return {status:'empty',message:'A ZIP code has 5 digits.',...undated('No request made')};
    const [j,meta]=await Promise.all([arcQuery(TIGER+'/2',{where:'ZCTA5='+sql(z),outFields:'ZCTA5',returnGeometry:'true',outSR:'4326',geometryPrecision:'6'}),arcMeta(TIGER)]);
    const g=j.features[0]&&j.features[0].geometry;
    if(!g||!Array.isArray(g.rings))return {status:'empty',message:'Not a valid or known ZIP code: '+z+' is not a 2020 Census ZIP Code Tabulation Area.',data:null,...metaDate(meta)};
    const geometry=JSON.stringify({rings:g.rings,spatialReference:{wkid:4326}});
    let edgeTouching=false;
    async function layer(id){
     const base={where:'1=1',geometry,geometryType:'esriGeometryPolygon',inSR:'4326',outFields:'GEOID,NAME',returnGeometry:'false'};
     try{return await arcPost(TIGER+'/'+id,{...base,spatialRel:'esriSpatialRelRelation',relationParam:'T********'});}
     catch(e){edgeTouching=true;return arcPost(TIGER+'/'+id,{...base,spatialRel:'esriSpatialRelIntersects'});}
    }
    const [counties,incorporated,cdps]=await Promise.all([layer(82),layer(28),layer(30)]);
    const rows=(list,type)=>list.map(f=>f&&f.attributes).filter(a=>a&&a.GEOID).map(a=>type?{geoid:String(a.GEOID),name:String(a.NAME||''),type}:{fips:String(a.GEOID),name:String(a.NAME||'')});
    const data={counties:rows(counties),places:rows(incorporated,'incorporated').concat(rows(cdps,'cdp')),edgeTouching,
     method:edgeTouching?'Areas that intersect the ZIP area; some may only touch its edge.':'Areas whose land overlaps the inside of the ZIP area; areas that only touch its edge are left out.'};
    return {status:data.counties.length?'ok':'empty',message:'ZIP '+z+' shares land with '+plural(data.counties.length,'county','counties')+' and '+plural(data.places.length,'place')+'.'+(edgeTouching?' Some may only touch its edge.':''),data,...metaDate(meta)};
   });
  }
  function nameVariants(name){
   const base=String(name).trim().replace(/\s+/g,' ').toUpperCase(),out=new Set([base]);
   const swaps=[[/^(?:SAINT|ST\.?) /,['SAINT ','ST. ','ST ']],[/^(?:MOUNT|MT\.?) /,['MOUNT ','MT. ','MT ']],[/^(?:FORT|FT\.?) /,['FORT ','FT. ','FT ']]];
   for(const [re,alts] of swaps)if(re.test(base))for(const a of alts)out.add(base.replace(re,a));
   return [...out];
  }
  function placesByName(name,stateAbbr){
   return run('places',async()=>{
    const n=String(name??'').trim();
    if(!n)return {status:'empty',message:'Type a city, town or municipality name.',...undated('No request made')};
    const state=stateAbbr?stateOf(stateAbbr):null;
    const where='UPPER(BASENAME) IN ('+nameVariants(n).map(sql).join(',')+')'+(state?' AND STATE='+sql(state.fips):'');
    const layers=[[28,'incorporated'],[30,'cdp'],[22,'county-subdivision']].concat(state&&state.abbr==='PR'?[[82,'municipio']]:[]);
    const [settled,meta]=await Promise.all([Promise.allSettled(layers.map(([id])=>arcQuery(TIGER+'/'+id,{where,outFields:'GEOID,NAME,BASENAME,STATE,INTPTLAT,INTPTLON',returnGeometry:'false',resultRecordCount:'200'}))),arcMeta(TIGER)]);
    const items=[],failed=[];
    settled.forEach((s,i)=>{const type=layers[i][1];if(s.status!=='fulfilled'){failed.push(type);return;}
     for(const f of s.value.features){const a=f&&f.attributes;if(!a||!a.GEOID)continue;const st=stateOf(a.STATE);
      items.push({geoid:String(a.GEOID),name:String(a.NAME||''),basename:String(a.BASENAME||''),type,stateFips:String(a.STATE||''),stateAbbr:st?st.abbr:null,stateName:st?st.name:null,lat:num(a.INTPTLAT),lon:num(a.INTPTLON)});}});
    if(failed.length===layers.length)throw new SourceError('Every place layer failed');
    const order={incorporated:0,municipio:1,cdp:2,'county-subdivision':3};
    items.sort((a,b)=>order[a.type]-order[b.type]||String(a.stateName).localeCompare(String(b.stateName))||a.name.localeCompare(b.name));
    const where2=state?' in '+state.name:'';
    if(!items.length&&failed.length)throw new SourceError('Some place layers failed: '+failed.join(', '));
    if(!items.length)return {status:'empty',message:'No Census place or county subdivision named '+n+where2+' is listed in this source.',data:{items:[],failed},...metaDate(meta)};
    return {status:'ok',message:plural(items.length,'Census area')+' named '+n+where2+' found.'+(failed.length?' Not checked: '+failed.join(', ')+'.':''),data:{items,failed},...metaDate(meta)};
   });
  }
  function geocodeAddress(input,opts={}){
   const q=parseQuery(input);
   if(q.kind!=='address'){
    const message=q.kind==='empty'?'Type a street address to search.':q.kind==='name'?'Address search is for street addresses only; places are looked up in Census data.':'ZIP codes are looked up in Census ZIP Code Tabulation Areas, never in Nominatim.';
    return Promise.resolve(finish(SOURCES.nominatim,{status:'not-applicable',message,...undated('No request made'),data:null},iso(now())));
   }
   const key=nominatimKey(q.raw);
   if(nominatimCache.has(key))return nominatimCache.get(key).then(r=>r.status==='skipped'?geocodeAddress(input,opts):r);
   const promise=run('nominatim',async()=>{
    // A search the person has already replaced sends nothing.
    if(!(await nominatimTurn(opts.isCurrent)))return {status:'skipped',message:'A newer search replaced this one, so no address request was sent.',...undated('No request made'),data:null};
    const {json}=await request(NOMINATIM+'?'+qs({format:'jsonv2',addressdetails:'1',countrycodes:'us,pr,gu,vi,as,mp',limit:'5',q:q.raw.trim().replace(/\s+/g,' ')}));
    if(!Array.isArray(json))throw new SourceError('Unexpected answer');
    const items=json.map(r=>({lat:num(r&&r.lat),lon:num(r&&r.lon),displayName:String(r&&r.display_name||''),type:String(r&&(r.addresstype||r.type)||''),postcode:r&&r.address&&r.address.postcode||null,state:r&&r.address&&r.address.state||null})).filter(r=>r.lat!=null&&r.lon!=null);
    const data={items,attribution:ATTRIBUTION,policy:NOMINATIM_POLICY};
    if(!items.length)return {status:'empty',message:'No match for that address in OpenStreetMap. Try a ZIP code or a city name.',data,...undated('Nominatim search answers carry no data date')};
    return {status:'ok',message:plural(items.length,'address match','address matches')+' from OpenStreetMap. '+ATTRIBUTION+'.',data,...undated('Nominatim search answers carry no data date')};
   });
   nominatimCache.set(key,promise);
   // Only answers are cached; a failure or a dropped request can be tried again.
   promise.then(r=>{if(r.status!=='ok'&&r.status!=='empty'&&nominatimCache.get(key)===promise)nominatimCache.delete(key);});
   return promise;
  }
  function pointGeography(lat,lon){
   return run('point-geography',async()=>{
    checkPoint(lat,lon);
    const layers=[[80,'GEOID,STUSAB,NAME'],[82,'GEOID,NAME'],[28,'GEOID,NAME'],[30,'GEOID,NAME'],[22,'GEOID,NAME'],[8,'GEOID']];
    const [settled,meta]=await Promise.all([Promise.allSettled(layers.map(([id,fields])=>arcQuery(TIGER+'/'+id,{...pointParams(lat,lon),outFields:fields}))),arcMeta(TIGER)]);
    const first=i=>settled[i].status==='fulfilled'?(settled[i].value.features[0]&&settled[i].value.features[0].attributes)||null:undefined;
    const s=first(0),c=first(1),inc=first(2),cdp=first(3),sub=first(4),tr=first(5);
    let state=s?{fips:String(s.GEOID),abbr:String(s.STUSAB||(stateOf(s.GEOID)||{}).abbr||''),name:String(s.NAME||'')}:null;
    let county=c?{fips:String(c.GEOID),name:String(c.NAME||'')}:null,tract=tr?{geoid:String(tr.GEOID)}:null,fallback=null;
    if(!state||!county){
     try{const {json}=await request(FCC+'?'+qs({lat:String(lat),lon:String(lon),censusYear:'2020',format:'json'}));
      const r=json&&Array.isArray(json.results)?json.results[0]:null;
      if(r&&r.county_fips){fallback='FCC Area API';const st=stateOf(r.state_fips||r.state_code);
       if(!state&&st)state={fips:st.fips,abbr:st.abbr,name:st.name};
       if(!county)county={fips:String(r.county_fips),name:String(r.county_name||'')};
       if(!tract&&tr===undefined&&/^\d{15}$/.test(r.block_fips||''))tract={geoid:r.block_fips.slice(0,11)};}
     }catch(e){if(settled.every(x=>x.status!=='fulfilled'))throw e;}
    }
    const place=inc?{geoid:String(inc.GEOID),name:String(inc.NAME||''),type:'incorporated'}:cdp?{geoid:String(cdp.GEOID),name:String(cdp.NAME||''),type:'cdp'}:null;
    const data={state,county,place,subdivision:sub?{geoid:String(sub.GEOID),name:String(sub.NAME||'')}:null,tract,fallback};
    if(!county)return {status:'empty',message:'This point is not inside a U.S. county in Census data.',data,...metaDate(meta)};
    return {status:'ok',message:'Point is in '+county.name+(state?', '+state.name:'')+(fallback?' (state or county from the FCC Area API).':'.'),data,...metaDate(meta)};
   });
  }

  /* ---------- Ranking and history ---------- */
  function nriResult(attrs,meta,scope){
   const ver=text(attrs.NRI_VER),where=[text(attrs.COUNTY),text(attrs.STATEABBRV)||text(attrs.STATE)].filter(Boolean).join(', ');
   const isPR=String(attrs.STCOFIPS||'').startsWith('72');
   return {status:'ok',message:'FEMA National Risk Index'+(ver?' ('+ver+')':'')+' for '+(scope==='tract'?'census tract '+attrs.TRACTFIPS+' in ':'')+where+'.'+(isPR?' FEMA publishes no risk ratings, social vulnerability or resilience scores for Puerto Rico; expected annual loss is shown.':''),
    data:{attrs},...metaDate(meta,ver?'NRI version '+ver:'')};
  }
  function nriCounty(countyFips){
   return run('nri-county',async()=>{
    const fips=checkFips(countyFips,5);
    const [j,meta]=await Promise.all([arcQuery(NRI_COUNTY,{where:'STCOFIPS='+sql(fips),outFields:NRI_FIELDS.join(','),returnGeometry:'false'}),arcMeta(NRI_COUNTY)]);
    const a=j.features[0]&&j.features[0].attributes;
    if(!a)return {status:'empty',message:'No National Risk Index row for county '+fips+' in this source.',data:null,...metaDate(meta)};
    return nriResult(a,meta,'county');
   });
  }
  function nriTract(lat,lon){
   return run('nri-tract',async()=>{
    checkPoint(lat,lon);
    const [j,meta]=await Promise.all([arcQuery(NRI_TRACT,{...pointParams(lat,lon),outFields:'TRACTFIPS,'+NRI_FIELDS.join(',')}),arcMeta(NRI_TRACT)]);
    const a=j.features[0]&&j.features[0].attributes;
    if(!a)return {status:'empty',message:'No National Risk Index census tract contains this point.',data:null,...metaDate(meta)};
    return nriResult(a,meta,'tract');
   });
  }
  function femaMeta(){
   if(!femaMetaCache){
    femaMetaCache=request(OPENFEMA+'/v1/DataSets?$filter='+encodeURIComponent("name eq 'DisasterDeclarationsSummaries' and version eq 2")+'&$select=name,version,lastDataSetRefresh')
     .then(({json})=>{const row=json&&Array.isArray(json.DataSets)?json.DataSets[0]:null;const t=Date.parse(row&&row.lastDataSetRefresh||'');return finite(t)?t:null;}).catch(()=>null);
    femaMetaCache.then(v=>{if(v==null)femaMetaCache=null;});
   }
   return femaMetaCache;
  }
  function femaDeclarations(countyFips){
   return run('fema-declarations',async()=>{
    const fips=checkFips(countyFips,5);
    const filter=encodeURIComponent("fipsStateCode eq '"+fips.slice(0,2)+"' and fipsCountyCode eq '"+fips.slice(2)+"' and declarationDate ge ")+'2000-01-01T00:00:00.000Z';
    const url=OPENFEMA+'/v2/DisasterDeclarationsSummaries?$filter='+filter+'&$orderby='+encodeURIComponent('declarationDate desc')+'&$top=1000&$select=disasterNumber,declarationDate,declarationTitle,incidentType,declarationType,designatedArea';
    const [{json},refresh]=await Promise.all([request(url),femaMeta()]);
    const rows=json&&Array.isArray(json.DisasterDeclarationsSummaries)?json.DisasterDeclarationsSummaries:null;
    if(!rows)throw new SourceError('Missing declaration list');
    const seen=new Map();
    for(const r of rows)if(r&&r.disasterNumber!=null&&!seen.has(r.disasterNumber))seen.set(r.disasterNumber,r);
    const list=[...seen.values()].sort((a,b)=>String(b.declarationDate).localeCompare(String(a.declarationDate)));
    const byType={};for(const r of list){const t=text(r.incidentType)||'Other';byType[t]=(byType[t]||0)+1;}
    const top=list[0],date=fed(refresh,'OpenFEMA DataSets lastDataSetRefresh','Data refreshed');
    if(!top)return {status:'empty',message:'No federal disaster declarations naming this county since 2000 are listed in this source.',data:{total:0,byType:{},latest:null,since:'2000-01-01'},...date};
    const latest={date:text(top.declarationDate),title:text(top.declarationTitle),number:top.disasterNumber,type:text(top.incidentType),declarationType:text(top.declarationType)};
    return {status:'ok',message:plural(list.length,'federal disaster declaration')+' since 2000; the latest is '+(latest.title||'untitled')+' ('+String(latest.date||'').slice(0,10)+').',data:{total:list.length,byType,latest,since:'2000-01-01'},...date};
   });
  }

  /* ---------- Live ---------- */
  function nwsAlerts(lat,lon){
   return run('nws-alerts',async()=>{
    checkPoint(lat,lon);
    const {json}=await request(NWS+'/alerts/active?point='+c4(lat)+','+c4(lon),{headers:{Accept:'application/geo+json'}});
    if(!json||!Array.isArray(json.features))throw new SourceError('Missing alert collection');
    const t=now(),items=[];
    for(const f of json.features){const p=f&&f.properties;if(!p)continue;
     if(p.status&&p.status!=='Actual')continue;if(p.messageType==='Cancel')continue;
     const end=Math.max(Date.parse(p.ends||'')||-Infinity,Date.parse(p.expires||'')||-Infinity);if(finite(end)&&end<=t)continue;
     items.push({id:text(p.id)||text(f.id),event:text(p.event),severity:text(p.severity),certainty:text(p.certainty),urgency:text(p.urgency),headline:text(p.headline),areaDesc:text(p.areaDesc),
      onset:text(p.onset),effective:text(p.effective),ends:text(p.ends),expires:text(p.expires),sent:text(p.sent),senderName:text(p.senderName),instruction:text(p.instruction),geometry:f.geometry||null,uri:text(p['@id'])||text(f.id)});}
    items.sort((a,b)=>(SEVERITY[b.severity]||0)-(SEVERITY[a.severity]||0)||String(a.onset||a.effective).localeCompare(String(b.onset||b.effective)));
    const date=fed(Date.parse(json.updated||''),'alerts collection "updated"');
    if(!items.length)return {status:'empty',message:'No active National Weather Service alerts listed for this point. This does not establish safety from every hazard.',data:{items:[]},...date};
    return {status:'ok',message:plural(items.length,'active National Weather Service alert')+' for this point.',data:{items},...date};
   });
  }
  function nwsPoint(lat,lon){
   return run('nws-point',async()=>{
    checkPoint(lat,lon);
    let json;
    try{({json}=await request(NWS+'/points/'+c4(lat)+','+c4(lon),{headers:{Accept:'application/geo+json'}}));}
    catch(e){if(e.status===404)return {status:'not-covered',message:'The National Weather Service has no forecast point here.',...undated('No data returned')};throw e;}
    const p=json&&json.properties;
    if(!p||!p.cwa)throw new SourceError('Missing forecast office');
    const last=u=>typeof u==='string'&&u?u.split('/').pop():null,rel=p.relativeLocation&&p.relativeLocation.properties||{};
    return {status:'ok',message:'National Weather Service office '+p.cwa+'.',data:{office:String(p.cwa),forecastZone:last(p.forecastZone),countyZone:last(p.county),forecastLink:'https://forecast.weather.gov/MapClick.php?lat='+c4(lat)+'&lon='+c4(lon),city:text(rel.city),state:text(rel.state),timeZone:text(p.timeZone)},...undated('Reference lookup; the response carries no data date')};
   });
  }
  function spcOutlook(place){
   return run('spc-outlook',async()=>{
    if(place&&place.isConus===false)return {status:'not-covered',message:'The Storm Prediction Center outlook covers the lower 48 states only.',...undated('No request made')};
    const {json,header}=await request(SPC);
    if(!json||!Array.isArray(json.features))throw new SourceError('Missing outlook features');
    const props=(json.features.find(f=>f&&f.properties)||{}).properties||{};
    const features=json.features.filter(f=>f&&f.properties&&SPC_RANK[f.properties.LABEL]&&f.geometry).map(f=>({label:f.properties.LABEL,rank:SPC_RANK[f.properties.LABEL],geometry:f.geometry}));
    const issued=text(props.ISSUE_ISO),data={features,issued,valid:text(props.VALID_ISO),expires:text(props.EXPIRE_ISO)};
    const date=issued?fed(Date.parse(issued),'outlook ISSUE_ISO','Outlook issued'):fed(Date.parse(header('last-modified')||''),'Last-Modified header','File updated');
    if(!features.length)return {status:'empty',message:'No thunderstorm or severe weather risk areas in today\'s outlook.',data,...date};
    const top=features.reduce((a,b)=>b.rank>a.rank?b:a);
    return {status:'ok',message:'Today\'s outlook has '+plural(features.length,'risk area')+'; the highest category anywhere is '+top.label+'.',data,...date};
   });
  }
  async function heatCore(points,cap){
   const {list,rest,total}=capList(points,cap);
   const covered=list.map((p,i)=>p.lat!=null&&p.lon!=null&&inConus(p.lat,p.lon)?i:-1).filter(i=>i>=0);
   if(!covered.length)return {core:{status:'not-covered',message:'NWS HeatRisk covers the lower 48 states only.',data:{days:[]},...undated('No request made')},list,rest,total,levels:null};
   const geometry=JSON.stringify({points:covered.map(i=>[list[i].lon,list[i].lat]),spatialReference:{wkid:4326}});
   const {json}=await request(HEAT+'/getSamples?'+qs({geometry,geometryType:'esriGeometryMultipoint',returnFirstValueOnly:'false',outFields:'idp_validtime,idp_filedate',f:'json'}));
   if(!json||!Array.isArray(json.samples))throw new SourceError('Missing samples');
   const byTime=new Map();let issued=null;
   for(const s of json.samples){
    const a=s&&s.attributes||{},t=num(a.idp_validtime),loc=s&&s.locationId;
    if(!finite(t)||!Number.isInteger(loc)||loc<0||loc>=covered.length)continue;
    if(!byTime.has(t))byTime.set(t,list.map(()=>null));
    const v=num(s.value);byTime.get(t)[covered[loc]]=v!=null&&v>=0&&v<=4?Math.round(v):null;
    const f=num(a.idp_filedate);if(finite(f))issued=Math.max(issued??f,f);
   }
   const days=[...byTime.keys()].sort((a,b)=>a-b).map(t=>({validTime:iso(t),levels:byTime.get(t)}));
   const date=fed(issued,'HeatRisk raster idp_filedate','Forecast issued');
   if(!days.length)return {core:{status:'empty',message:'NWS HeatRisk returned no values here.',data:{days:[]},...date},list,rest,total,days};
   return {core:{status:'ok',message:'Experimental NWS HeatRisk for '+plural(days.length,'day')+'.',data:{days},...date},list,rest,total,days};
  }
  function heatRisk(points){return run('heatrisk',async()=>(await heatCore(points,50)).core);}
  function drought(countyFips){
   return run('drought',async()=>{
    const fips=checkFips(countyFips,5);
    const [j,meta]=await Promise.all([arcQuery(DROUGHT,{where:'admin_fips='+sql(fips),outFields:'admin_fips,name,state_abbr,period,ddate,d0,d1,d2,d3,d4,D0_D4,D1_D4,D2_D4,D3_D4',orderByFields:'ddate DESC',resultRecordCount:'1',returnGeometry:'false'}),arcMeta(DROUGHT)]);
    const a=j.features[0]&&j.features[0].attributes;
    if(!a)return {status:'empty',message:'No U.S. Drought Monitor row for this county in this source.',data:null,...metaDate(meta)};
    const pct=v=>{const n=num(v);return n==null?null:round(Math.max(0,Math.min(100,n)),2);};
    const d0=pct(a.D0_D4),mapDate=num(a.ddate);
    const data={mapDate:finite(mapDate)?iso(mapDate).slice(0,10):null,county:text(a.name),none:d0==null?null:round(100-d0,2),d0,d1:pct(a.D1_D4),d2:pct(a.D2_D4),d3:pct(a.D3_D4),d4:pct(a.d4)};
    if(d0==null)throw new SourceError('Drought row has no area values');
    const layer=meta&&finite(meta.edit)?' (layer updated '+dayText(meta.edit)+')':'';
    return {status:'ok',message:(data.d1>0?data.d1+'% of the county is in moderate drought (D1) or worse':d0>0?d0+'% of the county is abnormally dry (D0) or worse':'No drought or abnormal dryness on this map')+'.',data,...dated(mapDate,'U.S. Drought Monitor map of','newest county row ddate',layer)};
   });
  }
  function wildfires(lat,lon,radiusMi){
   return run('wildfires',async()=>{
    checkPoint(lat,lon);
    const miles=finite(radiusMi)&&radiusMi>0?Math.min(radiusMi,250):100,origin={lat,lon};
    const near=nearParams(lat,lon,miles,'esriSRUnit_StatuteMile');
    const [inc,per,meta]=await Promise.all([
     arcQuery(WFIGS_INCIDENTS,{where:'1=1',...near,outFields:'IncidentName,IncidentSize,PercentContained,FireDiscoveryDateTime,ModifiedOnDateTime_dt,IncidentTypeCategory',resultRecordCount:'500'}),
     arcQuery(WFIGS_PERIMETERS,{where:'1=1',...near,outFields:'poly_IncidentName,poly_GISAcres,poly_DateCurrent,attr_PercentContained,attr_IncidentTypeCategory',maxAllowableOffset:'0.001',geometryPrecision:'4',resultRecordCount:'100'}),
     arcMeta(WFIGS_INCIDENTS,true)]);
    let prescribedCount=0;const incidents=[];
    for(const f of inc.features){const a=f&&f.attributes||{},type=text(a.IncidentTypeCategory);
     if(type==='RX'){prescribedCount++;continue;}if(type!=='WF')continue;
     const g=f.geometry||{},y=num(g.y),x=num(g.x);
     incidents.push({name:text(a.IncidentName),type,acres:num(a.IncidentSize),containment:num(a.PercentContained),discovered:iso(num(a.FireDiscoveryDateTime)),modified:iso(num(a.ModifiedOnDateTime_dt)),lat:y,lon:x,distanceKm:km(origin,y,x)});}
    const perimeters=[];
    for(const f of per.features){const a=f&&f.attributes||{};if(text(a.attr_IncidentTypeCategory)==='RX')continue;
     const g=f.geometry||{};perimeters.push({name:text(a.poly_IncidentName),acres:num(a.poly_GISAcres),containment:num(a.attr_PercentContained),updated:iso(num(a.poly_DateCurrent)),distanceKm:pointInGeometry(g,lat,lon)?0:nearestVertexKm(origin,g.rings),geometry:Array.isArray(g.rings)?{rings:g.rings}:null});}
    nearestFirst(incidents);nearestFirst(perimeters);
    const data={incidents,perimeters,prescribedCount,radiusMi:miles},date=metaDate(meta,'',true);
    const rx=prescribedCount?' '+plural(prescribedCount,'prescribed burn')+' also listed.':'';
    if(!incidents.length&&!perimeters.length)return {status:'empty',message:'No wildfire incidents or perimeters within '+miles+' miles are listed in this source.'+rx,data,...date};
    return {status:'ok',message:plural(incidents.length,'wildfire incident')+' and '+plural(perimeters.length,'mapped perimeter')+' within '+miles+' miles.'+rx,data,...date};
   });
  }
  function airFile(){
   if(airCache&&now()-airCache.at<30*60000)return airCache.promise;
   const promise=request(AIRNOW,{text:true}).then(({text:body,header})=>{
    const rows=[];
    for(const line of body.split(/\r?\n/)){const f=line.split('|');if(f.length<14||f[5]!=='O')continue;
     const st=stateOf(f[8]),lat=num(f[9]),lon=num(f[10]),aqi=num(f[12]),stamp=airStamp(f[1],f[2],f[3],f[8]);
     if(!st||lat==null||lon==null||aqi==null||aqi<0||aqi>999||!finite(stamp))continue;
     rows.push({area:f[7].trim(),state:st.abbr,lat,lon,parameter:f[11].trim(),aqi,category:text(f[13]),validDate:f[1],validTime:f[2],tz:f[3],stamp});}
    if(!rows.length)throw new SourceError('No observation rows in the file');
    return {rows,modified:Date.parse(header('last-modified')||'')};
   });
   airCache={at:now(),promise};promise.catch(()=>{if(airCache&&airCache.promise===promise)airCache=null;});
   return promise;
  }
  function airQuality(lat,lon){
   return run('air-quality',async()=>{
    checkPoint(lat,lon);
    if(inPuertoRicoOrVI(lat,lon))return {status:'not-covered',message:'AirNow reporting areas do not include Puerto Rico or the U.S. Virgin Islands.',...undated('No request made')};
    const file=await airFile(),origin={lat,lon};let best=null;
    for(const r of file.rows){const d=distanceKm(origin,r);if(!best||d<best.d)best={d,key:r.area+'|'+r.state+'|'+r.lat+'|'+r.lon,row:r};}
    const date=fed(file.modified,'reportingarea.dat Last-Modified header','File updated');
    if(!best||best.d>100)return {status:'empty',message:'No AirNow reporting area within 100 km is listed in this source.',data:null,...date};
    const latest=new Map();
    for(const r of file.rows)if(r.area+'|'+r.state+'|'+r.lat+'|'+r.lon===best.key){const old=latest.get(r.parameter);if(!old||r.stamp>old.stamp)latest.set(r.parameter,r);}
    const items=[...latest.values()].sort((a,b)=>b.aqi-a.aqi).map(r=>({parameter:r.parameter,aqi:r.aqi,category:r.category,validDate:r.validDate,validTime:r.validTime,tz:r.tz,observedAt:iso(r.stamp)}));
    const newest=Math.max(...[...latest.values()].map(r=>r.stamp)),stale=now()-newest>6*3600000;
    const data={area:best.row.area,state:best.row.state,lat:best.row.lat,lon:best.row.lon,distanceKm:round(best.d,2),observedAt:iso(newest),stale,items};
    return {status:'ok',message:'Nearest AirNow reporting area: '+data.area+', '+data.state+(stale?'; its latest hourly observation is more than 6 hours old.':'.'),data,...date};
   });
  }
  function tropical(lat,lon){
   return run('tropical',async()=>{
    checkPoint(lat,lon);
    const [j,meta]=await Promise.all([arcQuery(HURRICANES,{where:'1=1',outFields:'STORMID,STORMNAME,DTG,BASIN,INTENSITY,STORMTYPE,LAT,LON',orderByFields:'DTG DESC',resultRecordCount:'1000',returnGeometry:'false'}),arcMeta(HURRICANES,true)]);
    const latest=new Map(),origin={lat,lon},t=now();
    for(const f of j.features){const a=f&&f.attributes||{},id=text(a.STORMID),dtg=num(a.DTG);if(!id||!finite(dtg))continue;const old=latest.get(id);if(!old||dtg>num(old.DTG))latest.set(id,a);}
    const storms=[...latest.values()].filter(a=>t-num(a.DTG)<3*86400000).map(a=>({id:text(a.STORMID),name:text(a.STORMNAME),basin:text(a.BASIN),type:text(a.STORMTYPE),intensity:num(a.INTENSITY),lat:num(a.LAT),lon:num(a.LON),distanceKm:km(origin,num(a.LAT),num(a.LON)),advisoryTime:iso(num(a.DTG))}));
    nearestFirst(storms);
    const date=metaDate(meta,'',true);
    if(!storms.length)return {status:'empty',message:'No active tropical cyclones are listed in this source.',data:{storms:[]},...date};
    return {status:'ok',message:plural(storms.length,'active tropical cyclone')+' worldwide; the nearest is '+(storms[0].name||storms[0].id)+', about '+Math.round(storms[0].distanceKm)+' km away.',data:{storms},...date};
   });
  }
  function earthquakes(lat,lon){
   return run('earthquakes',async()=>{
    checkPoint(lat,lon);
    const start=new Date(Math.floor((now()-30*86400000)/3600000)*3600000).toISOString().slice(0,19);
    const base={format:'geojson',latitude:String(lat),longitude:String(lon),maxradiuskm:'250',minmagnitude:'2.5',starttime:start};
    const [{json},count]=await Promise.all([request(FDSN+'query?'+qs({...base,orderby:'time',limit:'20'})),request(FDSN+'count?'+qs(base)).then(r=>num(r.json&&r.json.count)).catch(()=>null)]);
    if(!json||!Array.isArray(json.features))throw new SourceError('Missing event list');
    const origin={lat,lon};
    const items=json.features.map(f=>{const p=f&&f.properties||{},c=f&&f.geometry&&f.geometry.coordinates||[];return {id:text(f&&f.id),mag:num(p.mag),place:text(p.place),time:iso(num(p.time)),depthKm:num(c[2]),distanceKm:km(origin,num(c[1]),num(c[0])),url:text(p.url),tsunami:p.tsunami===1};}).sort((a,b)=>String(b.time).localeCompare(String(a.time)));
    const total=count??items.length,date=fed(num(json.metadata&&json.metadata.generated),'FDSN metadata.generated');
    const data={items,count:total,countExact:count!=null,since:start+'Z'};
    if(!items.length)return {status:'empty',message:'No earthquakes of magnitude 2.5 or more within 250 km in the past 30 days are listed in this source.',data,...date};
    return {status:'ok',message:plural(total,'earthquake')+' of magnitude 2.5 or more within 250 km in the past 30 days'+(total>items.length?'; the newest '+items.length+' are listed.':'.'),data,...date};
   });
  }
  function volcanoes(stateAbbr){
   return run('volcanoes',async()=>{
    const st=stateOf(stateAbbr),obs=st&&VOLCANO_OBSERVATORIES[st.abbr];
    if(!obs)return {status:'not-applicable',message:'No USGS volcano observatory covers '+(st?st.name:'this place')+'.',data:{items:[],located:false},...undated('No request made')};
    const {json}=await request(HANS);
    if(!Array.isArray(json))throw new SourceError('Unexpected answer');
    const newest=Math.max(...json.map(v=>num(v&&v.sent_unixtime)).filter(finite).map(s=>s*1000),-Infinity);
    const items=json.filter(v=>v&&obs.includes(String(v.obs_abbr||'').toLowerCase())).map(v=>({name:text(v.volcano_name),vnum:text(v.vnum),observatory:text(v.obs_fullname),colorCode:text(v.color_code),alertLevel:text(v.alert_level),sent:iso(num(v.sent_unixtime)*1000),url:text(v.notice_url)}));
    const date=finite(newest)?fed(newest,'newest sent_unixtime in the elevated-volcano list','Newest notice'):undated('The elevated-volcano list is empty and carries no data date');
    if(!items.length)return {status:'empty',message:'No volcano above normal alert level is listed for the observatory that covers '+st.name+'.',data:{items:[],located:false},...date};
    return {status:'ok',message:plural(items.length,'volcano','volcanoes')+' above normal alert level for the observatory that covers '+st.name+'. The feed gives no locations.',data:{items,located:false},...date};
   });
  }
  function riverGauges(lat,lon){
   return run('river-gauges',async()=>{
    checkPoint(lat,lon);
    const dy=0.25,dx=round(0.25/Math.max(0.2,Math.cos(lat*Math.PI/180)),4),origin={lat,lon};
    const b={xmin:round(lon-dx,4),xmax:round(lon+dx,4),ymin:round(lat-dy,4),ymax:round(lat+dy,4)};
    const [{json},thresholds]=await Promise.all([
     request(NWPS+'?'+qs({srid:'EPSG_4326','bbox.xmin':b.xmin,'bbox.xmax':b.xmax,'bbox.ymin':b.ymin,'bbox.ymax':b.ymax})),
     arcQuery(RIVER_GAUGES,{geometry:[b.xmin,b.ymin,b.xmax,b.ymax].join(','),geometryType:'esriGeometryEnvelope',inSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'gaugelid,units,action,flood,moderate,major,idp_filedate',returnGeometry:'false'}).catch(()=>null)]);
    if(!json||!Array.isArray(json.gauges))throw new SourceError('Missing gauge list');
    const levels=new Map();
    for(const f of thresholds?thresholds.features:[]){const a=f&&f.attributes||{};if(a.gaugelid)levels.set(String(a.gaugelid).toUpperCase(),a);}
    const reading=s=>{const v=num(s&&s.primary),t=Date.parse(s&&s.validTime||'');return s&&s.primaryUnit==='ft'&&v!=null&&v>-999&&finite(t)&&t>0?{v,t:iso(t)}:{v:null,t:null};};
    const items=[];
    for(const g of json.gauges){const lid=text(g&&g.lid),glat=num(g&&g.latitude),glon=num(g&&g.longitude);if(!lid||glat==null||glon==null)continue;
     const d=km(origin,glat,glon);if(d>25)continue;
     const st=g.status||{},ob=reading(st.observed),fc=reading(st.forecast),lv=levels.get(lid.toUpperCase())||{},ft=lv.units==null||lv.units==='ft';
     items.push({lid,name:text(g.name),category:text(st.observed&&st.observed.floodCategory),observedFt:ob.v,observedTime:ob.t,forecastFt:fc.v,forecastTime:fc.t,
      action:ft?num(lv.action):null,minor:ft?num(lv.flood):null,moderate:ft?num(lv.moderate):null,major:ft?num(lv.major):null,lat:glat,lon:glon,distanceKm:d,link:'https://water.noaa.gov/gauges/'+encodeURIComponent(lid.toLowerCase())});}
    nearestFirst(items);
    const newest=Math.max(...items.map(i=>Date.parse(i.observedTime||'')).filter(finite),-Infinity);
    const date=finite(newest)?fed(newest,'newest observed validTime among listed gauges','Newest reading'):undated('No gauge reading time in range');
    const note=thresholds?'':' Flood thresholds were unavailable.';
    if(!items.length)return {status:'empty',message:'No NOAA river gauge within 25 km is listed in this source.',data:{items:[]},...date};
    return {status:'ok',message:plural(items.length,'NOAA river gauge')+' within 25 km.'+note,data:{items,thresholdsAvailable:!!thresholds},...date};
   });
  }
  function coopsStations(){
   if(!coopsCache){
    coopsCache=request(COOPS+'/mdapi/prod/webapi/stations.json?type=waterlevels').then(({json})=>{
     if(!json||!Array.isArray(json.stations))throw new SourceError('Missing station list');
     return json.stations.map(s=>({id:String(s&&s.id||''),name:text(s&&s.name),state:text(s&&s.state),lat:num(s&&s.lat),lon:num(s&&s.lng)})).filter(s=>s.id&&s.lat!=null&&s.lon!=null);});
    coopsCache.catch(()=>{coopsCache=null;});
   }
   return coopsCache;
  }
  function tideStation(lat,lon,stationId){
   return run('tide-station',async()=>{
    const pinned=stationId!=null&&stationId!=='';
    if(!pinned)checkPoint(lat,lon);
    const stations=await coopsStations();
    let station=null;
    if(pinned)station=stations.find(s=>s.id===String(stationId))||null;
    else for(const s of stations){const d=distanceKm({lat,lon},s);if(d<=25&&(!station||d<station.d))station={...s,d};}
    if(!station)return pinned?{status:'empty',message:'Station '+stationId+' is not in the NOAA water-level station list.',data:null,...undated('No reading requested')}:{status:'not-applicable',message:'No NOAA water-level station within 25 km of this place.',data:null,...undated('No reading requested')};
    const id=encodeURIComponent(station.id),dist=finite(lat)&&finite(lon)?km({lat,lon},station.lat,station.lon):null;
    const [latestR,floodR,datumR]=await Promise.all([
     request(COOPS+'/api/prod/datagetter?'+qs({date:'latest',station:station.id,product:'water_level',datum:'MLLW',units:'english',time_zone:'gmt',format:'json',application:'community_resilience'}),{keepError:true}),
     request(COOPS+'/mdapi/prod/webapi/stations/'+id+'/floodlevels.json').then(r=>r.json).catch(()=>null),
     request(COOPS+'/mdapi/prod/webapi/stations/'+id+'/datums.json?units=english').then(r=>r.json).catch(()=>null)]);
    if(latestR.json&&latestR.json.error&&!noData(latestR.json.error))throw new SourceError('Service error: '+String(latestR.json.error.message||latestR.json.error).slice(0,160));
    const row=latestR.json&&Array.isArray(latestR.json.data)?latestR.json.data[0]:null,t=coopsTime(row&&row.t),v=num(row&&row.v);
    const latest=finite(t)&&v!=null?{t:iso(t),v,datum:'MLLW',ageMinutes:Math.round((now()-t)/60000)}:null;
    const mllw=datumR&&Array.isArray(datumR.datums)?num((datumR.datums.find(d=>d&&d.name==='MLLW')||{}).value):null;
    const fl=floodR||{};
    const floodLevels={nosMinor:num(fl.nos_minor),nosModerate:num(fl.nos_moderate),nosMajor:num(fl.nos_major),nwsMinor:num(fl.nws_minor),nwsModerate:num(fl.nws_moderate),nwsMajor:num(fl.nws_major),action:num(fl.action),
     datumNote:'NOAA publishes these flood levels without naming a datum. They appear to be in station datum (STND); subtracting mllwInStationDatum gives an approximate MLLW value (inferred, not stated by NOAA).',mllwInStationDatum:mllw,available:!!floodR};
    const data={station:{id:station.id,name:station.name,state:station.state,lat:station.lat,lon:station.lon,distanceKm:dist},latest,floodLevels};
    if(!latest)return {status:'empty',message:'No recent water level reading from NOAA station '+station.id+' ('+(station.name||'unnamed')+').',data,...undated('No reading returned')};
    return {status:'ok',message:'NOAA station '+station.id+' ('+(station.name||'unnamed')+') read '+v+' ft MLLW.'+(latest.ageMinutes>60?' The reading is more than an hour old.':''),data,...fed(t,'water_level latest t (GMT)','Reading at')};
   });
  }
  function ofsForecast(stationId){
   return run('ofs-forecast',async()=>{
    const id=String(stationId??'').trim();
    if(!/^\d{7}$/.test(id))throw new SourceError('Invalid station id');
    const t=now();
    const {json}=await request(COOPS+'/api/prod/datagetter?'+qs({station:id,product:'ofs_water_level',datum:'MLLW',units:'english',time_zone:'gmt',format:'json',application:'community_resilience',begin_date:ymd(t),end_date:ymd(t+2*86400000)}),{keepError:true});
    if(json&&json.error){if(!noData(json.error))throw new SourceError('Service error: '+String(json.error.message||json.error).slice(0,160));return {status:'empty',message:'No NOAA OFS forecast is published for station '+id+'.',data:{rows:[]},...undated('No forecast returned')};}
    const raw=json&&Array.isArray(json.data)?json.data:null;
    if(!raw)throw new SourceError('Missing forecast rows');
    const seen=new Map();
    for(const r of raw){const ms=coopsTime(r&&r.t);if(!finite(ms))throw new SourceError('Invalid source timestamp');
     const v=num(r.v);if(v==null||v===-9999)continue;
     if(seen.has(ms)&&seen.get(ms)!==v)throw new SourceError('Conflicting source timestamps');seen.set(ms,v);}
    const rows=[...seen.entries()].sort((a,b)=>a[0]-b[0]).map(([ms,v])=>({t:ms,v,unit:'ft',datum:'MLLW'}));
    if(!rows.length)return {status:'empty',message:'The NOAA OFS forecast for station '+id+' has no values.',data:{rows:[]},...undated('No forecast values')};
    return {status:'ok',message:'NOAA OFS model guidance for station '+id+': '+plural(rows.length,'value')+' in ft MLLW.',data:{rows},...fed(rows[0].t,'first ofs_water_level time; the response publishes no model cycle time','Forecast series starts')};
   });
  }

  /* ---------- Exposure at a point ---------- */
  function floodZone(lat,lon){
   return run('flood-zone',async()=>{
    checkPoint(lat,lon);
    const j=await arcQuery(NFHL+'/28',{...pointParams(lat,lon),outFields:'FLD_ZONE,SFHA_TF,ZONE_SUBTY,DFIRM_ID,STATIC_BFE'});
    const a=j.features[0]&&j.features[0].attributes;
    if(!a||!a.FLD_ZONE)return {status:'empty',message:'FEMA has no flood map at this point. Unmapped does not mean safe.',data:{unmapped:true},...undated('No flood map feature at this point')};
    let panel=null,effective=null;
    try{const p=await arcQuery(NFHL+'/3',{...pointParams(lat,lon),outFields:'FIRM_PAN,EFF_DATE,DFIRM_ID'});const pa=p.features[0]&&p.features[0].attributes;if(pa){panel=text(pa.FIRM_PAN);effective=num(pa.EFF_DATE);}}catch(e){}
    const bfe=num(a.STATIC_BFE),subtype=text(a.ZONE_SUBTY);
    const data={zone:String(a.FLD_ZONE),subtype,sfha:a.SFHA_TF==='T',bfe:bfe!=null&&bfe>-9000?bfe:null,panel,effectiveDate:finite(effective)?iso(effective).slice(0,10):null,dfirmId:text(a.DFIRM_ID)};
    const date=finite(effective)?dated(effective,'FIRM panel '+(panel||'')+' effective','FIRM panel EFF_DATE'):undated('No FIRM panel date at this point');
    return {status:'ok',message:'FEMA flood zone '+data.zone+(subtype?' ('+subtype.toLowerCase()+')':'')+(data.sfha?', a Special Flood Hazard Area':'')+' at this point.',data,...date};
   });
  }
  function elevation(lat,lon){
   return run('elevation',async()=>{
    checkPoint(lat,lon);
    const {json}=await request(EPQS+'?'+qs({x:String(lon),y:String(lat),wkid:'4326',units:'Feet',includeDate:'true'}));
    const v=num(json&&json.value),acq=text(json&&json.attributes&&json.attributes.AcquisitionDate);
    const date=acq?{dataDate:null,dataDateText:'Elevation source acquired '+acq+' (as published by USGS)',dataDateBasis:'attributes.AcquisitionDate'}:undated('No acquisition date in the response');
    if(v==null||v<-1e5)return {status:'empty',message:'USGS has no ground elevation value at this point.',data:null,...date};
    return {status:'ok',message:'Ground elevation about '+round(v,1)+' ft.',data:{feet:round(v,2),resolution:num(json.resolution),acquisitionDate:acq},...date};
   });
  }
  function surge(lat,lon){
   return run('surge',async()=>{
    checkPoint(lat,lon);
    if(inAlaska(lat,lon))return {status:'not-covered',message:'The NHC storm surge risk maps do not cover Alaska.',data:{byCategory:{1:null,2:null,3:null,4:null,5:null}},...undated('No request made')};
    const reg=SURGE_REGIONS.find(r=>box(lat,lon,r[1]));
    if(!reg)return {status:'not-covered',message:'The NHC storm surge risk maps do not cover this area.',data:{byCategory:{1:null,2:null,3:null,4:null,5:null}},...undated('No request made')};
    const layers=reg[2],category=new Map(layers.map((l,i)=>[l,i+1]));
    const ext=[lon-0.01,lat-0.01,lon+0.01,lat+0.01].map(v=>round(v,5)).join(',');
    const {json}=await request(SURGE+'/identify?'+qs({geometry:lon+','+lat,geometryType:'esriGeometryPoint',sr:'4326',layers:'all:'+layers.join(','),tolerance:'2',mapExtent:ext,imageDisplay:'400,400,96',returnGeometry:'false',f:'json'}),{timeout:slowTimeoutMs});
    if(!json||!Array.isArray(json.results))throw new SourceError('Missing identify results');
    const byCategory={1:null,2:null,3:null,4:null,5:null};
    for(const r of json.results){const c=category.get(r&&r.layerId);if(!c)continue;const a=r.attributes||{},v=num(a['Service Pixel Value']??a['Pixel Value']);byCategory[c]=v!=null&&SURGE_CLASSES[v]?v:null;}
    const any=Object.values(byCategory).some(v=>v!=null),data={byCategory,classes:SURGE_CLASSES,region:reg[0]};
    const date=undated('The identify response carries no data date');
    if(!any)return {status:'empty',message:json.results.length?'No storm surge flooding is mapped at this point for any hurricane category.':'This point is outside the mapped storm surge area for '+reg[0]+'.',data,...date};
    const lowest=[1,2,3,4,5].find(c=>byCategory[c]!=null);
    return {status:'ok',message:'Storm surge flooding is mapped here starting at a Category '+lowest+' hurricane (worst case, not a forecast).',data,...date};
   });
  }
  async function seismicValues(lat,lon){
   const {json}=await request(SEISMIC+'?'+qs({latitude:String(lat),longitude:String(lon),riskCategory:'II',siteClass:'Default',title:'CommunityResilience'}));
   const d=json&&json.response&&json.response.data;
   if(!d||typeof d!=='object')throw new SourceError('Missing design values');
   return {ss:num(d.ss),s1:num(d.s1),sds:num(d.sds),sd1:num(d.sd1),sdc:text(d.sdc),modelVersion:text(json.response.metadata&&json.response.metadata.modelVersion)};
  }
  function seismicDesign(lat,lon){
   return run('seismic-design',async()=>{
    checkPoint(lat,lon);
    const data=await seismicValues(lat,lon),date=undated('The response carries no data date; model version '+(data.modelVersion||'not stated'));
    if(data.ss==null&&data.sds==null)return {status:'empty',message:'USGS returned no seismic design values at this point.',data,...date};
    return {status:'ok',message:'ASCE 7-22 design values: Ss '+data.ss+', S1 '+data.s1+', Seismic Design Category '+(data.sdc||'not stated')+' (default site class).',data,...date};
   });
  }

  /* ---------- Lifelines ---------- */
  const countyBase=name=>String(name??'').replace(/\s+(County|Parish|Borough|Census Area|City and Borough|Municipality|Municipio|city)$/i,'').trim();
  function waterSystems(stateAbbr,countyName){
   return run('water-systems',async()=>{
    const st=stateOf(stateAbbr),base=countyBase(countyName);
    if(!st||!base)throw new SourceError('State and county are required');
    const {json}=await request(SDWIS+'GEOGRAPHIC_AREA/STATE_SERVED/'+st.abbr+'/COUNTY_SERVED/CONTAINING/'+encodeURIComponent(base)+'/WATER_SYSTEM/PWS_TYPE_CODE/CWS/PWS_ACTIVITY_CODE/A/rows/0:400/JSON');
    if(!Array.isArray(json))throw new SourceError('Unexpected answer');
    const want=base.toLowerCase(),seen=new Map();
    for(const r of json){if(!r||!r.pwsid||seen.has(r.pwsid))continue;
     const counties=String(r.county_served||'').split(',').map(c=>countyBase(c).toLowerCase());if(!counties.includes(want))continue;
     seen.set(r.pwsid,{pwsid:String(r.pwsid),name:text(r.pws_name),populationServed:num(r.population_served_count),source:WATER_SOURCES[r.primary_source_code]||text(r.primary_source_code)||text(r.gw_sw_code),status:r.pws_activity_code==='A'?'Active':text(r.pws_activity_code),distanceKm:null});}
    const items=[...seen.values()].sort((a,b)=>(b.populationServed||0)-(a.populationServed||0)),date=undated('SDWIS rows carry no data date or quarter');
    const data={items,truncated:json.length>=400};
    if(!items.length)return {status:'empty',message:'No active community water system listing this county is in this source.',data,...date};
    return {status:'ok',message:plural(items.length,'active community water system')+' list '+countyName+'. Population served is a record, not live status.',data,...date};
   });
  }
  function odinStates(){
   if(!odinStatesCache){
    odinStatesCache=request(ODIN+'/records?'+qs({select:'state',group_by:'state',limit:'100'})).then(({json})=>{if(!json||!Array.isArray(json.results))throw new SourceError('Missing state list');return json.results.map(r=>String(r&&r.state||'')).filter(Boolean);});
    odinStatesCache.catch(()=>{odinStatesCache=null;});
   }
   return odinStatesCache;
  }
  function outages(stateName,countyName,countyFips){
   return run('outages',async()=>{
    const st=stateOf(stateName),base=countyBase(countyName);
    if(!st||!base)throw new SourceError('State and county are required');
    const q=s=>'"'+String(s).replace(/"/g,'')+'"',either=(field,v)=>'('+[...new Set([v,v.replace(/\s+/g,'')])].map(x=>field+'='+q(x)).join(' OR ')+')';
    let where=either('state',st.name)+' AND '+either('county',base);
    if(/^\d{5}$/.test(String(countyFips||'')))where='('+where+') OR communitydescriptor='+q(countyFips);
    const [{json},live,meta]=await Promise.all([
     request(ODIN+'/records?'+qs({select:'name,utility_id,metersaffected,reportedstarttime,estimatedrestorationtime,county,state,communitydescriptor',where,limit:'100'})),
     odinStates().catch(()=>[]),
     request(ODIN).then(r=>Date.parse(r.json&&r.json.metas&&r.json.metas.default&&r.json.metas.default.modified||'')).catch(()=>NaN)]);
    if(!json||!Array.isArray(json.results))throw new SourceError('Missing outage records');
    const norm=s=>String(s).replace(/\s+/g,'').toLowerCase();
    const reportingStates=[...new Set(ODIN_STATES_2026_10.concat(live.map(s=>stateOf(s)?stateOf(s).name:STATES.find(x=>norm(x[2])===norm(s))?.[2]).filter(Boolean)))].sort();
    const reporting=reportingStates.some(s=>norm(s)===norm(st.name));
    const items=json.results.map(r=>({utility:text(String(r&&r.name||'').replace(/,\s*\d+$/,'')),utilityId:text(r&&r.utility_id),metersAffected:num(r&&r.metersaffected),start:text(r&&r.reportedstarttime),updated:null,estimatedRestoration:text(r&&r.estimatedrestorationtime),distanceKm:null})).sort((a,b)=>(b.metersAffected||0)-(a.metersAffected||0));
    const coverage='Only utilities that report to ODIN appear, in '+reportingStates.length+' states ('+reportingStates.join(', ')+'); other utilities and states are not covered, and absence does not mean power is on.';
    const date=fed(meta,'ODIN dataset metas.default.modified','Feed updated'),data={reporting,items,reportingStates};
    if(items.length)return {status:'ok',message:plural(items.length,'outage record')+' for '+countyName+', '+plural(items.reduce((s,i)=>s+(i.metersAffected||0),0),'meter')+' affected.',data,coverage,...date};
    if(!reporting)return {status:'not-covered',message:'No utility in '+st.name+' reports outages to ODIN, so this source cannot show outages here.',data,coverage,...date};
    return {status:'empty',message:'No outage listed for '+countyName+' in this source. A utility that does not report to ODIN would not appear.',data,coverage,...date};
   });
  }
  async function nearby(layer,lat,lon,meters,unit,fields,extra){
   return arcQuery(layer,{where:'1=1',...nearParams(lat,lon,meters,unit),outFields:fields,resultRecordCount:'2000',...extra});
  }
  const xy=f=>{const g=f&&f.geometry||{};return {lat:num(g.y),lon:num(g.x)};};
  function powerPlants(lat,lon,radiusKm){
   return run('power-plants',async()=>{
    checkPoint(lat,lon);
    const r=finite(radiusKm)&&radiusKm>0?Math.min(radiusKm,200):50,origin={lat,lon};
    const [j,meta]=await Promise.all([nearby(PLANTS,lat,lon,r*1000,null,'Plant_Code,Plant_Name,Utility_Na,sector_nam,PrimSource,tech_desc,Total_MW,Period'),arcMeta(PLANTS)]);
    let period=null;
    const items=nearestFirst(j.features.map(f=>{const a=f&&f.attributes||{},p=xy(f);const per=num(a.Period);if(per!=null)period=Math.max(period??per,per);
     return {id:text(a.Plant_Code),name:text(a.Plant_Name),utility:text(a.Utility_Na),sector:text(a.sector_nam),primarySource:text(a.PrimSource),technology:text(a.tech_desc),totalMw:num(a.Total_MW),lat:p.lat,lon:p.lon,distanceKm:km(origin,p.lat,p.lon)};}));
    const date=metaDate(meta,period?'EIA-860M period '+period:''),data={items,radiusKm:r,truncated:!!j.exceededTransferLimit};
    if(!items.length)return {status:'empty',message:'No power plants within '+r+' km are listed in this source.',data,...date};
    return {status:'ok',message:plural(items.length,'power plant')+' within '+r+' km. A listing is a record, not operating status.',data,...date};
   });
  }
  function hospitalsUSGS(lat,lon,radiusKm){
   return run('hospitals-usgs',async()=>{
    checkPoint(lat,lon);
    const r=finite(radiusKm)&&radiusKm>0?Math.min(radiusKm,200):25,origin={lat,lon};
    const j=await nearby(USGS_HOSPITALS,lat,lon,r*1000,null,'NAME,ADDRESS,CITY,STATE,ZIPCODE,LOADDATE');
    let loaded=null;
    const items=nearestFirst(j.features.map(f=>{const a=f&&f.attributes||{},p=xy(f),ld=num(attr(a,'LOADDATE'));if(ld!=null)loaded=Math.max(loaded??ld,ld);
     return {name:text(attr(a,'NAME')),address:text(attr(a,'ADDRESS')),city:text(attr(a,'CITY')),state:text(attr(a,'STATE')),zip:text(attr(a,'ZIPCODE')),lat:p.lat,lon:p.lon,distanceKm:km(origin,p.lat,p.lon)};}));
    const date=finite(loaded)?dated(loaded,'Records loaded as late as','newest LOADDATE among listed records'):undated('No LOADDATE in the answer');
    if(!items.length)return {status:'empty',message:'No hospitals within '+r+' km are listed in this source.',data:{items,radiusKm:r},...date};
    return {status:'ok',message:plural(items.length,'hospital')+' within '+r+' km. No beds, capacity or current status.',data:{items,radiusKm:r},...date};
   });
  }
  function hospitalsCMS(lat,lon,radiusKm){
   return run('hospitals-cms',async()=>{
    checkPoint(lat,lon);
    const r=finite(radiusKm)&&radiusKm>0?Math.min(radiusKm,200):25,origin={lat,lon};
    const [j,meta]=await Promise.all([nearby(CMS_HOSPITALS,lat,lon,r*1000,null,'USER_Facility_ID,USER_Facility_Name,USER_Address,USER_City_Town,USER_State,USER_Hospital_Type,USER_Emergency_Services,USER_Hospital_overall_rating'),arcMeta(CMS_HOSPITALS)]);
    const items=nearestFirst(j.features.map(f=>{const a=f&&f.attributes||{},p=xy(f);
     return {id:text(a.USER_Facility_ID),name:text(a.USER_Facility_Name),address:text(a.USER_Address),city:text(a.USER_City_Town),state:text(a.USER_State),type:text(a.USER_Hospital_Type),emergencyServices:a.USER_Emergency_Services==null?null:/^(yes|true|y)$/i.test(String(a.USER_Emergency_Services)),rating:text(a.USER_Hospital_overall_rating),lat:p.lat,lon:p.lon,distanceKm:km(origin,p.lat,p.lon)};}));
    const date=metaDate(meta);
    if(!items.length)return {status:'empty',message:'No Medicare hospitals within '+r+' km are listed in this source.',data:{items,radiusKm:r},...date};
    return {status:'ok',message:plural(items.length,'Medicare hospital')+' within '+r+' km, '+items.filter(i=>i.emergencyServices).length+' with emergency services.',data:{items,radiusKm:r},...date};
   });
  }
  function healthCenters(lat,lon,radiusMi){
   return run('health-centers',async()=>{
    checkPoint(lat,lon);
    const r=finite(radiusMi)&&radiusMi>0?Math.min(radiusMi,100):15,origin={lat,lon};
    const j=await nearby(HRSA,lat,lon,r,'esriSRUnit_StatuteMile','SITE_NM,SITE_ADDRESS,SITE_CITY,SITE_STATE_ABBR,HCC_TYP_DESC,HCC_STATUS_DESC,GRANTEE_NM');
    const items=nearestFirst(j.features.map(f=>{const a=f&&f.attributes||{},p=xy(f);
     return {name:text(a.SITE_NM),address:text(a.SITE_ADDRESS),city:text(a.SITE_CITY),state:text(a.SITE_STATE_ABBR),type:text(a.HCC_TYP_DESC),status:text(a.HCC_STATUS_DESC),operator:text(a.GRANTEE_NM),lat:p.lat,lon:p.lon,distanceKm:km(origin,p.lat,p.lon)};}));
    const date=undated('The HRSA layer publishes no edit date');
    if(!items.length)return {status:'empty',message:'No HRSA health center sites within '+r+' miles are listed in this source.',data:{items,radiusMi:r},...date};
    return {status:'ok',message:plural(items.length,'HRSA health center site')+' within '+r+' miles.',data:{items,radiusMi:r},...date};
   });
  }
  function shelters(lat,lon){
   return run('shelters',async()=>{
    checkPoint(lat,lon);
    const origin={lat,lon};
    const j=await arcQuery(SHELTERS,{where:'1=1',outFields:'shelter_id,shelter_name,address,city,state,zip,shelter_status,evacuation_capacity,post_impact_capacity,total_population,org_name,pet_accommodations_code,ada_compliant,wheelchair_accessible',returnGeometry:'true',outSR:'4326',resultRecordCount:'2000'});
    const items=nearestFirst(j.features.map(f=>{const a=f&&f.attributes||{},p=xy(f);
     return {id:text(a.shelter_id),name:text(a.shelter_name),address:text(a.address),city:text(a.city),state:text(a.state),zip:text(a.zip),status:text(a.shelter_status),evacuationCapacity:num(a.evacuation_capacity),postImpactCapacity:num(a.post_impact_capacity),population:num(a.total_population),organization:text(a.org_name),pets:text(a.pet_accommodations_code),ada:text(a.ada_compliant),wheelchair:text(a.wheelchair_accessible),lat:p.lat,lon:p.lon,distanceKm:km(origin,p.lat,p.lon)};}));
    const date=undated('The shelter layer publishes no edit date; FEMA states it synchronizes each morning with the American Red Cross shelter database');
    if(!items.length)return {status:'empty',message:'No open shelters are listed in the FEMA National Shelter System right now.',data:{items,total:0},...date};
    return {status:'ok',message:plural(items.length,'open shelter')+' listed nationally; the nearest is about '+Math.round(items[0].distanceKm)+' km away.',data:{items,total:items.length},...date};
   });
  }
  function bridges(lat,lon,radiusKm){
   return run('bridges',async()=>{
    checkPoint(lat,lon);
    const r=finite(radiusKm)&&radiusKm>0?Math.min(radiusKm,50):10,origin={lat,lon};
    const stats=JSON.stringify([{statisticType:'count',onStatisticField:'OBJECTID',outStatisticFieldName:'n'}]);
    const [j,counts,meta]=await Promise.all([
     nearby(NBI,lat,lon,r*1000,null,'STRUCTURE_NUMBER_008,BRIDGE_CONDITION,LOWEST_RATING,YEAR_BUILT_027,ADT_029,FEATURES_DESC_006A,FACILITY_CARRIED_007'),
     arcQuery(NBI,{where:'1=1',...nearParams(lat,lon,r*1000),returnGeometry:'false',outSR:undefined,groupByFieldsForStatistics:'BRIDGE_CONDITION',outStatistics:stats}).catch(()=>null),
     arcMeta(NBI)]);
    const items=nearestFirst(j.features.map(f=>{const a=f&&f.attributes||{},p=xy(f);
     return {id:text(a.STRUCTURE_NUMBER_008),condition:{G:'good',F:'fair',P:'poor'}[a.BRIDGE_CONDITION]||null,lowestRating:num(a.LOWEST_RATING),yearBuilt:num(a.YEAR_BUILT_027),dailyTraffic:num(a.ADT_029),crosses:text(a.FEATURES_DESC_006A),carries:text(a.FACILITY_CARRIED_007),lat:p.lat,lon:p.lon,distanceKm:km(origin,p.lat,p.lon)};}));
    const tally={good:0,fair:0,poor:0};let total=items.length;
    if(counts&&counts.features.length){total=0;for(const f of counts.features){const a=f.attributes||{},n=num(a.n)||0,k={G:'good',F:'fair',P:'poor'}[a.BRIDGE_CONDITION];total+=n;if(k)tally[k]+=n;}}
    else for(const i of items)if(i.condition)tally[i.condition]++;
    const data={total,...tally,items,radiusKm:r,truncated:!!j.exceededTransferLimit},date=metaDate(meta);
    if(!total)return {status:'empty',message:'No bridges within '+r+' km are listed in this source.',data,...date};
    return {status:'ok',message:plural(total,'bridge')+' within '+r+' km, '+tally.poor+' rated poor. A poor rating is a structural score, not a closure.',data,...date};
   });
  }

  /* ---------- Context ---------- */
  function communityContext(place){
   return run('community-context',async()=>{
    const county=place&&place.county&&String(place.county.fips||''),tract=place&&place.tract&&String(place.tract.geoid||'');
    if(!/^\d{5}$/.test(county||''))throw new SourceError('A county is required');
    const isPR=county.startsWith('72');
    const st=STATES.find(s=>s[0]===county.slice(0,2));
    if(!isPR&&(!st||['60','66','69','78'].includes(st[0])))return {status:'not-covered',message:'CDC/ATSDR SVI covers the 50 states and DC only.',...undated('No request made')};
    const pct=v=>{const n=num(v);return n==null||n<0?null:round(n,1);};
    if(isPR){
     const fields='GEOID,NAME,B01001_001E,B01001_calc_pctGE65E,B08201_calc_pctNoVehE,B18101_calc_pctDE,B28002_calc_pctNoIntE,B16004_calc_pctGE18LEAE';
     const q=(layer,id)=>arcQuery(ACS+layer,{where:'GEOID='+sql(id),outFields:fields,returnGeometry:'false'});
     const [c,t,meta]=await Promise.all([q(1,county),/^\d{11}$/.test(tract||'')?q(2,tract).catch(()=>null):null,arcMeta(ACS+'1')]);
     const v=meta&&/(\d{4})-(\d{4}) 5-year/.exec(meta.copyright),vintage=v?'ACS '+v[1]+'-'+v[2]+' 5-year estimates (Esri)':'ACS 5-year estimates (Esri)';
     const shape=a=>a&&{vintage,geography:text(a.NAME),geoid:text(a.GEOID),population:num(a.B01001_001E),pctAge65:pct(a.B01001_calc_pctGE65E),pctNoVehicle:pct(a.B08201_calc_pctNoVehE),pctDisability:pct(a.B18101_calc_pctDE),pctNoInternet:pct(a.B28002_calc_pctNoIntE),pctPoverty150:null,pctLimitedEnglish:pct(a.B16004_calc_pctGE18LEAE),sviPercentile:null};
     const row=c.features[0]&&c.features[0].attributes;
     if(!row)return {status:'empty',message:'No ACS row for this municipio in this source.',data:null,hostedBy:'Esri',owner:'U.S. Census Bureau ACS',...metaDate(meta)};
     const data={...shape(row),tract:t&&t.features[0]?shape(t.features[0].attributes):null};
     return {status:'ok',message:'Census ACS context for '+data.geography+'. Not published for Puerto Rico here: share below 150% of the poverty level and the CDC social vulnerability percentile.',data,hostedBy:'Esri',owner:'U.S. Census Bureau ACS',title:'Community context (Esri ACS, Puerto Rico)',...metaDate(meta,vintage)};
    }
    const fields='FIPS,LOCATION,E_TOTPOP,EP_AGE65,EP_NOVEH,EP_DISABL,EP_NOINT,EP_POV150,EP_LIMENG,RPL_THEMES';
    const q=(layer,id)=>arcQuery(SVI+layer,{where:'FIPS='+sql(id),outFields:fields,returnGeometry:'false'});
    const [c,t,meta]=await Promise.all([q(1,county),/^\d{11}$/.test(tract||'')?q(2,tract).catch(()=>null):null,arcMeta(SVI+'1')]);
    const vintage='CDC/ATSDR SVI 2022 (ACS 2018-2022)';
    const shape=a=>{if(!a)return null;const r=num(a.RPL_THEMES);return {vintage,geography:text(a.LOCATION),geoid:text(a.FIPS),population:num(a.E_TOTPOP),pctAge65:pct(a.EP_AGE65),pctNoVehicle:pct(a.EP_NOVEH),pctDisability:pct(a.EP_DISABL),pctNoInternet:pct(a.EP_NOINT),pctPoverty150:pct(a.EP_POV150),pctLimitedEnglish:pct(a.EP_LIMENG),sviPercentile:r==null||r<0?null:round(r*100,1)};};
    const row=c.features[0]&&c.features[0].attributes;
    if(!row)return {status:'empty',message:'No SVI row for this county in this source.',data:null,...metaDate(meta)};
    const data={...shape(row),tract:t&&t.features[0]?shape(t.features[0].attributes):null};
    const names={population:'population',pctAge65:'share age 65 and over',pctNoVehicle:'households without a vehicle',pctDisability:'share with a disability',pctNoInternet:'households without internet',pctPoverty150:'share below 150% of the poverty level',pctLimitedEnglish:'limited English',sviPercentile:'SVI percentile'};
    const missing=Object.keys(names).filter(k=>data[k]==null).map(k=>names[k]);
    return {status:'ok',message:'CDC/ATSDR SVI 2022 context for '+(data.geography||county)+'.'+(missing.length?' Not published here: '+missing.join(', ')+'.':''),data,...metaDate(meta,vintage)};
   });
  }

  /* ---------- Per-asset screens (on demand, capped, concurrency 3) ---------- */
  function screenFloodZones(points){
   return run('screen-flood-zones',async()=>{
    const {list,rest,total}=capList(points,25);
    const values=await pool(list,3,async p=>{
     if(p.lat==null||p.lon==null)return {id:p.id,value:null,reason:'no coordinates'};
     try{const j=await arcQuery(NFHL+'/28',{...pointParams(p.lat,p.lon),outFields:'FLD_ZONE,ZONE_SUBTY,SFHA_TF'});const a=j.features[0]&&j.features[0].attributes;
      return a&&a.FLD_ZONE?{id:p.id,value:String(a.FLD_ZONE),subtype:text(a.ZONE_SUBTY),sfha:a.SFHA_TF==='T'}:{id:p.id,value:null,reason:'unmapped'};}
     catch(e){return {id:p.id,value:null,reason:'unavailable'};}});
    return screenResult('Flood zones',values,rest,total,undated('Effective dates are per FIRM panel and are not requested in a screen'));
   });
  }
  function screenSeismic(points){
   return run('screen-seismic',async()=>{
    const {list,rest,total}=capList(points,15);
    const values=await pool(list,3,async p=>{
     if(p.lat==null||p.lon==null)return {id:p.id,value:null,reason:'no coordinates'};
     try{const d=await seismicValues(p.lat,p.lon);return {id:p.id,value:d.sds,detail:d,reason:d.sds==null?'no value':undefined};}
     catch(e){return {id:p.id,value:null,reason:'unavailable'};}});
    return screenResult('Seismic design values (SDS)',values,rest,total,undated('The response carries no data date'));
   });
  }
  function screenNriTract(points,hazardCode){
   return run('screen-nri-tract',async()=>{
    const code=String(hazardCode||'').toUpperCase();
    if(!NRI_HAZARDS.includes(code))throw new SourceError('Unknown NRI hazard code');
    const {list,rest,total}=capList(points,25);
    const [values,meta]=await Promise.all([pool(list,3,async p=>{
     if(p.lat==null||p.lon==null)return {id:p.id,value:null,reason:'no coordinates'};
     try{const j=await arcQuery(NRI_TRACT,{...pointParams(p.lat,p.lon),outFields:'TRACTFIPS,'+code+'_RISKS,'+code+'_RISKR,'+code+'_EALT'});const a=j.features[0]&&j.features[0].attributes;
      if(!a)return {id:p.id,value:null,reason:'no tract'};
      return {id:p.id,value:num(a[code+'_RISKS']),rating:text(a[code+'_RISKR']),eal:num(a[code+'_EALT']),tract:text(a.TRACTFIPS)};}
     catch(e){return {id:p.id,value:null,reason:'unavailable'};}}),arcMeta(NRI_TRACT)]);
    return screenResult('National Risk Index tract scores',values,rest,total,metaDate(meta));
   });
  }
  function screenHeatRisk(points){
   return run('screen-heatrisk',async()=>{
    const h=await heatCore(points,50);
    if(h.core.status==='not-covered')return {...h.core,data:{values:h.list.concat(h.rest).map(p=>({id:p.id,value:null,reason:'outside the lower 48 states'})),screened:0,total:h.total,failed:0}};
    const days=h.days||[];
    const values=h.list.map((p,i)=>{const levels=days.map(d=>d.levels[i]),known=levels.filter(v=>v!=null);return {id:p.id,value:known.length?Math.max(...known):null,byDay:levels,reason:known.length?undefined:(p.lat!=null&&inConus(p.lat,p.lon)?'no value':'outside the lower 48 states')};});
    const date={dataDate:h.core.dataDate,dataDateText:h.core.dataDateText,dataDateBasis:h.core.dataDateBasis};
    return screenResult('HeatRisk levels (highest of the next 7 days)',values,h.rest,h.total,date);
   });
  }

  /* ---------- Local tier ---------- */
  async function sha256Hex(s){
   const subtle=root.crypto&&root.crypto.subtle;if(!subtle||typeof TextEncoder!=='function')return null;
   const digest=await subtle.digest('SHA-256',new TextEncoder().encode(s));
   return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  }
  function loadLocal(config,baseUrl){
   return run('local',async()=>{
    const files=config&&config.files||{};
    if(!files.stations||!files.context)return {status:'not-applicable',message:'This place has no local data files.',...undated('No local files configured')};
    let stationsUrl,contextUrl;
    try{stationsUrl=new URL(files.stations,baseUrl).href;contextUrl=new URL(files.context,baseUrl).href;}catch(e){throw new SourceError('Invalid local file address');}
    if(/^file:/i.test(stationsUrl))throw new SourceError('file:// page','', 'Local files cannot be read when the page is opened from a file; open it from its web address to see the local tier.');
    const blocked=e=>new SourceError(e.message,e.status,'The local data files could not be loaded ('+e.message+'). The national tier is shown without them.');
    const [s,c]=await Promise.all([request(stationsUrl,{text:true}),request(contextUrl,{text:true})]).catch(e=>{throw blocked(e);});
    let inventory,context;
    try{inventory=JSON.parse(s.text);context=JSON.parse(c.text);}catch(e){throw new SourceError('Malformed JSON');}
    if(!inventory||inventory.schemaVersion!==1||!Array.isArray(inventory.stations)||!context||context.schemaVersion!==1)throw new SourceError('Unsupported local file schema');
    const expected=context.inventoryFingerprint||{};
    let hash=null;try{hash=await sha256Hex(canonicalJson(s.text));}catch(e){hash=null;}
    const fingerprintOk=!!hash&&hash===expected.sha256&&expected.capturedAt===inventory.capturedAt;
    const {stations,...meta}=inventory;
    const data={stations,context,fingerprintOk,capturedAt:text(inventory.capturedAt),inventory:meta,files:{stations:stationsUrl,context:contextUrl}};
    const why=hash?'The context file does not match this station register, so population figures are withheld.':'This browser cannot check the file fingerprint, so population figures are withheld.';
    return {status:'ok',message:plural(stations.length,'published station record')+' loaded.'+(fingerprintOk?'':' '+why),data,...dated(Date.parse(inventory.capturedAt||''),'Local files captured','station register capturedAt')};
   });
  }

  return {zcta,zctaOverlap,placesByName,geocodeAddress,pointGeography,nriCounty,nriTract,femaDeclarations,
   nwsAlerts,nwsPoint,spcOutlook,heatRisk,drought,wildfires,airQuality,tropical,earthquakes,volcanoes,riverGauges,tideStation,ofsForecast,
   floodZone,elevation,surge,seismicDesign,waterSystems,outages,powerPlants,hospitalsUSGS,hospitalsCMS,healthCenters,shelters,bridges,
   communityContext,screenFloodZones,screenSeismic,screenNriTract,screenHeatRisk,loadLocal};
 }

 root.CRSources=Object.freeze({create,parseQuery,spcCategoryAt,pointInGeometry,canonicalJson,stateOf,distanceKm,
  SOURCES:Object.freeze(SOURCES),STATES:Object.freeze(STATES.map(s=>Object.freeze({fips:s[0],abbr:s[1],name:s[2]}))),NRI_HAZARDS:Object.freeze(NRI_HAZARDS.slice()),
  NO_DATE,NOMINATIM_GAP_MS,ATTRIBUTION,NOMINATIM_POLICY,SURGE_CLASSES:Object.freeze({...SURGE_CLASSES})});
})(typeof window!=='undefined'?window:globalThis);
