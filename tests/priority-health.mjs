import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = p => readFile(new URL(p, root), 'utf8');
const [core, priorities, helpers, observed, wbRuntime, healthRuntime] = await Promise.all([
  'response-plans/core.js', 'response-plans/priorities/health.js', 'response-plans/domain-helpers.js',
  'response-plans/observed-series.js', 'public-data-runtime/worldbank.js', 'public-data-runtime/health-feeds.js'
].map(read));
const wb = ['global-air-pollution','global-demographic-transition','global-health-atlas','global-health-systems',
  'global-hiv-tb-malaria','global-immunization','global-maternal-child-health','global-mental-health',
  'global-ncd-burden','global-nutrition','global-road-safety','global-wash'];
const all = [...wb,'antimicrobial-resistance','global-cancer','global-ntds','global-outbreak-tracker',
  'us-respiratory-surveillance','us-overdose-surveillance','nhs-scotland-strain'];
const sourceDates = await Promise.all(['consoles/nhs-scotland-strain/data/latest.json',
  'consoles/us-respiratory-surveillance/data/cdc-context.json',
  'consoles/us-overdose-surveillance/data/cdc-context.json'].map(async p => Date.parse(JSON.parse(await read(p)).capturedAt)));
const now = Math.max(Date.now(), ...sourceDates) + 3600000;
let clockNow=now;
class Clock extends Date { constructor(...args){ super(...(args.length ? args : [clockNow])); } static now(){ return clockNow; } }
function runtime(globals = {}) {
  const c = vm.createContext({Date: Clock, URL, ...globals}); c.window = c;
  vm.runInContext(core, c); vm.runInContext(helpers, c); vm.runInContext(observed, c);
  vm.runInContext(wbRuntime, c); vm.runInContext(healthRuntime, c); vm.runInContext(priorities, c);
  return c;
}
const c = runtime();
const plan = input => c.ConsoleResponse.evaluate(input);
const featured = input => plan(input).actions.filter(a => a.featured && a.selected);
const audience = (input, track='public') => featured(input).filter(a => a.track === track);
const has = (input, text) => audience(input).find(a => a.id.includes(text));
const f = (id, value, label=id, measuredAt='2024', options={}) => ({id,label,value,unit:'%',measuredAt,
  checkedAt:new Date(now).toISOString(),quality:value==null?'missing':'historical',basis:'measured',
  source:'https://data.worldbank.org/indicator/TEST',...options});
const input = (slug,evidence=[],scope='Alpha') => ({slug,context:scope,evidence,diagnostics:[],actions:[],impacts:{scope,items:[],records:[],limitations:[]}});
let n=0;
function check(name, fn) { fn(); n++; console.log('PASS health priorities: '+name); }
const wash = () => input('global-wash',[
  f('selected-value',80,'Alpha · Safely managed drinking water'),
  f('impact-source-smdw',80,'Alpha · Safely managed drinking water'),
  f('impact-source-basw',95,'Alpha · Basic drinking water'),
  f('impact-source-smss',50,'Alpha · Safely managed sanitation'),
  f('impact-source-bass',90,'Alpha · Basic sanitation'),
  f('impact-source-hygn',70,'Alpha · Basic handwashing'),
  f('impact-source-odfc',4,'Alpha · Open defecation')
], 'Alpha · each record retains its own observation year');
check('same-country/year resident coverage gaps rank supported standards, not health harm',()=>{
  const a=audience(wash()); assert.match(a[0].target,/Alpha.*Safely managed sanitation/);
  assert.match(a[0].reason,/50%.*total residents.*2024/); assert.match(a[0].reason,/6 compatible/);
  assert.match(a[1].target,/Basic handwashing/); assert.match(a[0].reason,/not health harm/);
  assert.ok(a.every(x=>x.priority==='planned'&&!x.requiresCurrent));
});
check('country/value selection changes named target and priority sequence',()=>{
  const p=wash();p.impacts.scope='Beta · annual';p.evidence.forEach(x=>x.label=x.label.replace('Alpha','Beta'));
  p.evidence.find(x=>x.id==='impact-source-smss').value=99;p.evidence.find(x=>x.id==='impact-source-smdw').value=5;
  const a=audience(p);assert.match(a[0].target,/Beta.*Safely managed drinking water/);assert.match(a[0].reason,/95%/);
});
check('different years are never ranked against the latest year',()=>{
  const p=wash();p.evidence.find(x=>x.id==='impact-source-smss').measuredAt='2023';
  const a=audience(p);assert.match(a[0].target,/Basic handwashing.*2024/);assert.doesNotMatch(a[0].target,/sanitation/);
  p.evidence.filter(x=>x.id.startsWith('impact-source-')).forEach((x,i)=>x.measuredAt=String(2010+i));
  assert.ok(has(p,'coverage-alignment'));assert.ok(!has(p,'coverage-smss'));
});
check('vaccine coverage ranking excludes newborn and one-year-old cohorts',()=>{
  const p=input('global-immunization',[f('selected-value',80,'Alpha · DTP3'),f('impact-source-dtp',80,'Alpha · DTP3'),
    f('impact-source-mcv',90,'Alpha · Measles first dose'),f('impact-source-hepb',1,'Alpha · HepB3'),f('impact-source-ttns',0,'Alpha · Protected newborns')]);
  const a=audience(p);assert.match(a[0].target,/DTP3/);assert.match(a[0].reason,/children aged 12–23 months/);
  assert.ok(!a.some(x=>/coverage-(hepb|ttns)/.test(x.id)));
});
check('unknown percentages, wrong dates, duplicate identities and invalid sources cannot win a gap ranking',()=>{
  for(const mode of ['null','stale','duplicate','invalid-date','unsafe-source','range','boolean']){
    const p=wash(),row=p.evidence.find(x=>x.id==='impact-source-smss');
    if(mode==='null')row.value=null;if(mode==='stale')row.quality='stale';if(mode==='duplicate')p.evidence.push({...row});
    if(mode==='invalid-date')row.measuredAt='2024-02-30';if(mode==='unsafe-source')row.source='javascript:alert(1)';
    if(mode==='range')row.value=-1;if(mode==='boolean')row.value=false;
    assert.ok(!has(p,'coverage-smss'),mode);
  }
});
check('exact-year converted count carries all denominator facts; absent denominator stays a raw rate',()=>{
  const p=input('global-health-systems',[f('selected-value',2,'Alpha · Physicians','2024',{unit:'per 1,000'}),
    f('impact-source-phys',2,'Alpha · Physicians','2024',{unit:'per 1,000'}),f('impact-population-2024',100000,'Alpha residents','2024',{unit:'residents'})]);
  p.impacts.items=[{id:'quantity-phys',value:200,unit:'physicians',method:'Same-year source rate × residents ÷ 1,000; inventory, not staffed availability.',evidenceIds:['impact-source-phys','impact-population-2024']}];
  assert.match(has(p,'selected-context').reason,/200 physicians/);assert.ok(has(p,'selected-context').evidenceIds.includes('impact-population-2024'));
  p.evidence.find(x=>x.id==='impact-population-2024').quality='missing';assert.doesNotMatch(has(p,'selected-context').reason,/200 physicians/);
});
function nhs() {return input('nhs-scotland-strain',[
  f('impact-site-A-att',1000,'Hospital Alpha · att','2026-10-11',{unit:'attendances'}),
  f('impact-site-A-o12',100,'Hospital Alpha · o12','2026-10-11',{unit:'attendances'}),
  f('impact-site-B-att',800,'Hospital Beta · att','2026-10-11',{unit:'attendances'}),
  f('impact-site-B-o12',200,'Hospital Beta · o12','2026-10-11',{unit:'attendances'}),
  f('impact-site-C-att',500,'Hospital Older · att','2026-10-04',{unit:'attendances'}),
  f('impact-site-C-o12',400,'Hospital Older · o12','2026-10-04',{unit:'attendances'}),
  f('impact-ae-att',2300,'Reported attendances','2026-10-11',{unit:'attendances'}),
  f('impact-delayed',30,'Delayed discharge','2026-08',{unit:'people aged 18+'}),
  f('impact-delay-B',30,'Board Beta · delayed discharge','2026-08',{unit:'people aged 18+'})
], 'NHS Scotland');}
check('NHS ranks reported same-week long-wait counts with attendances; older week excluded',()=>{
  const a=audience(nhs());assert.match(a[0].target,/Hospital Beta.*2026-10-11/);assert.match(a[0].reason,/200.*800 attendances/);
  assert.match(a[1].target,/Hospital Alpha/);assert.ok(!a.some(x=>x.id.includes('site-C')));
  assert.match(a[0].reason,/workload, not adjusted performance/);assert.ok(a.some(x=>/separately dated/.test(x.title)));
});
check('NHS changing source counts changes ordering; missing counts are a named source task',()=>{
  const p=nhs();p.evidence.find(x=>x.id==='impact-site-A-o12').value=300;assert.match(audience(p)[0].target,/Hospital Alpha/);
  p.evidence.find(x=>x.id==='impact-site-A-o12').value=null;const a=audience(p);assert.match(a[0].target,/Hospital Alpha.*over-12-hour/);
  assert.equal(a[0].signal,'data-gap');assert.ok(!a.some(x=>x.id.includes('site-impact-site-A')));
});
check('NHS wrong-week, unit mismatch, count-over-denominator and stale pairs cannot provide workload priorities',()=>{
  for(const mode of ['period','unit','count','stale']){const p=nhs(),row=p.evidence.find(x=>x.id==='impact-site-B-o12');
    if(mode==='period')row.measuredAt='2026-10-04';if(mode==='unit')row.unit='%';if(mode==='count')row.value=801;if(mode==='stale')row.quality='stale';
    assert.ok(!has(p,'site-impact-site-B'),mode);assert.match(has(p,'site-coverage').target,/Hospital Beta/);
  }
});
const at=new Date(now-7*86400000).toISOString().slice(0,10);
const cdcFact=(id,value,label,unit='%',period=at)=>f(id,value,label,period,{unit,quality:value==null?'missing':'current',source:'https://data.cdc.gov/resource/atcp-73re.json'});
function respiratory() {return input('us-respiratory-surveillance',[
  cdcFact('ed',3.2,'ED visits associated with Influenza'),cdcFact('four-week-change',1.2,'ED four-week change','percentage points'),
  cdcFact('wastewater',3,'Influenza derived wastewater category','ordinal category 1–5'),
  cdcFact('scale-coverage',2,'Paired state coverage','paired jurisdictions of 3 downloaded'),cdcFact('scale-disagreement',50,'Direction disagreement'),
  cdcFact('impact-state-Alpha',2,'Alpha · Influenza wastewater category','ordinal site-category mean'),
  cdcFact('impact-state-Beta',null,'Beta · Influenza wastewater category','ordinal site-category mean')
], 'Influenza · each signal retains its own week and reporting population');}
function overdose() {return input('us-overdose-surveillance',[
  cdcFact('selected-total',10000,'Predicted 12-month overdose deaths · All-drug overdoses','deaths in rolling 12 months ending','2026-03'),
  cdcFact('year-change',-10,'Same ending-month year-on-year change','%','2026-03'),
  cdcFact('impact-jurisdiction-NY',1000,'New York excluding NYC · All-drug predicted deaths','deaths','2026-03'),
  cdcFact('impact-jurisdiction-YC',500,'New York City · All-drug predicted deaths','deaths','2026-03'),
  cdcFact('scale-coverage',2,'Matched jurisdictions','paired jurisdictions of 2 downloaded','2026-03'),
  cdcFact('scale-disagreement',50,'Direction disagreement','%','2026-03')
], 'United States · All-drug overdoses · rolling 12-month periods');}
check('CDC selected-condition current trend is a next source review, never clinical triage or immediate',()=>{
  const a=audience(respiratory()),trend=a.find(x=>x.id.includes('selected-trend'));
  assert.equal(trend.priority,'next');assert.equal(trend.requiresCurrent,true);assert.match(trend.reason,/3.2 %.*1.2 percentage points/);
  assert.match(trend.target,/Influenza/);assert.ok(a.every(x=>x.priority!=='immediate'&&x.phase!=='respond'));
  assert.match(trend.nextStep,/no individual diagnosis or triage/);
});
check('CDC stale or undated source becomes a named gap, never a current quantitative trend',()=>{
  for(const mode of ['stale','undated','duplicate']){const p=respiratory(),main=p.evidence[0];if(mode==='stale')main.quality='stale';if(mode==='undated')main.measuredAt=null;if(mode==='duplicate')p.evidence.push({...main});
    assert.ok(!has(p,'selected-trend'));assert.equal(has(p,'surveillance-source').signal,'data-gap');
  }
});
check('CDC missing exact-week state is named; ordinal categories are not ranked as population burden',()=>{
  const a=audience(respiratory()),gap=a.find(x=>x.id.includes('geographic-coverage'));assert.match(gap.target,/Beta/);assert.match(gap.reason,/1 of 2.*exact-period/);
  assert.ok(!a.some(x=>x.id.includes('jurisdiction-workload')));assert.match(has(respiratory(),'direction-coverage').reason,/not concentration, prevalence/);
});
check('overdose same-category/count/window ordering changes with jurisdiction values, not stale display records',()=>{
  const p=overdose();assert.match(has(p,'jurisdiction-workload').target,/New York excluding NYC/);
  p.evidence.find(x=>x.id==='impact-jurisdiction-YC').value=2000;assert.match(has(p,'jurisdiction-workload').target,/New York City/);
  p.evidence.find(x=>x.id==='impact-jurisdiction-YC').measuredAt='2026-02';assert.match(has(p,'jurisdiction-workload').target,/excluding NYC/);
  assert.match(has(p,'geographic-coverage').target,/New York City/);assert.match(has(p,'selected-trend').reason,/not future deaths/);
});
check('selected condition change updates target; mismatched change periods are excluded',()=>{
  const p=respiratory();p.impacts.scope='RSV · source week';p.evidence[0].label='ED visits associated with RSV';p.evidence[1].measuredAt='2025-01-01';
  const a=has(p,'selected-trend');assert.match(a.target,/RSV/);assert.doesNotMatch(a.reason,/1.2 percentage points/);assert.match(a.reason,/matched change is unavailable/);
});
check('unchanged CDC payload expires at the maintained adapter age limit through actual core',()=>{
  for(const p of [respiratory(),overdose()]){
    const before=JSON.stringify(p),rows=featured(p).filter(a=>a.requiresCurrent);assert.ok(rows.length);
    for(const row of rows)assert.ok(Number.isFinite(Date.parse(row.validUntil)));
    const expiry=Math.max(...rows.map(a=>Date.parse(a.validUntil)));
    try{clockNow=expiry+1;assert.ok(!featured(p).some(a=>a.requiresCurrent));assert.ok(featured(p).some(a=>a.id.includes('applicability')));
      assert.equal(JSON.stringify(p),before);
      p.evidence.filter(x=>x.quality==='current').forEach(x=>x.quality='stale');assert.ok(has(p,'surveillance-source'));
    }finally{clockNow=now;}
  }
});
check('published reference follows the selected cancer/pathogen without survival or prescribing instructions',()=>{
  for(const slug of ['global-cancer','antimicrobial-resistance']){
    const p=input(slug,[f('published-estimate',100,'Selected Alpha',slug==='global-cancer'?'2022':'2019',{unit:slug==='global-cancer'?'new cases/year':'attributable deaths/year',basis:'modeled'})]);
    assert.equal(has(p,'selected-burden').target,'Selected Alpha');p.evidence[0].label='Selected Beta';assert.equal(has(p,'selected-burden').target,'Selected Beta');
    assert.ok(audience(p).every(x=>x.priority==='planned'));assert.ok(has(p,'applicability'));
  }
});
check('NTD priority names missing disease date while retaining the separately dated WHO headline',()=>{
  const p=input('global-ntds',[f('published-estimate',100,'Disease Alpha','approximately 2022–2023'),
    f('disease-specific-period',null,'Exact disease-specific year',null),f('intervention-headline',1400000000,'People requiring NTD interventions','2024',{unit:'people'})]);
  const a=audience(p);assert.match(a[0].target,/Disease Alpha/);assert.equal(a[0].signal,'data-gap');assert.match(a[1].reason,/1,400,000,000 people.*not infections/);
});
function outbreak() {return input('global-outbreak-tracker',[
  f('mpox-country-AA-cases',100,'Country Alpha · cumulative mpox cases','2026-04-01',{unit:'reported cases'}),
  f('mpox-country-BB-cases',200,'Country Beta · cumulative mpox cases','2026-04-11',{unit:'reported cases'}),
  f('measles-count',500,'Archived U.S. confirmed measles cases','2025',{unit:'confirmed cases',note:'Archived partial/year-to-date; cutoff not supplied.'}),
  f('annual','2025 · partial / year to date','Latest measles reporting window','2026-06-27')
]);}
check('outbreak priorities follow oldest reporting date, not largest cumulative cases; partial archive remains partial',()=>{
  const p=outbreak();assert.match(has(p,'country-alignment').target,/Country Alpha/);assert.match(has(p,'country-alignment').reason,/10 days apart/);
  p.evidence[0].measuredAt='2026-04-20';assert.match(has(p,'country-alignment').target,/Country Beta/);
  assert.match(has(p,'measles-window').reason,/cutoff is not supplied/);assert.match(has(p,'country-alignment').reason,/cannot establish active burden/);
});
check('explicit scenarios and demo facts become practice planning, not real urgent actions',()=>{
  for(const p of [respiratory(),overdose(),wash(),nhs()]){
    p.scenario=true;const a=featured(p);assert.ok(a.length>=4);assert.ok(a.every(x=>x.priority==='planned'&&x.practice&&x.signal==='scenario'&&!x.requiresCurrent));
  }
  const p=respiratory();p.evidence[0].basis='demo';assert.ok(!has(p,'selected-trend'));
});
check('derivation is deterministic, input-isolated and contains no network/DOM/private/native-state reads',()=>{
  const p=wash(),before=JSON.stringify(p),a=JSON.stringify(featured(p));assert.equal(JSON.stringify(featured(p)),a);assert.equal(JSON.stringify(p),before);
  assert.doesNotMatch(priorities,/\b(?:fetch|XMLHttpRequest)\s*\(|\b(?:document|localStorage|SNAP|CMPK|GLSEL)\s*[.\[]|Date\.now\s*\(/);
});

// Maintained adapter integration: real source defaults and their actual public IDs.
function element(tag='div') {const e={tag,children:[],style:{},value:'',textContent:'',appendChild(x){this.children.push(x);if(tag==='select'&&this.children.length===1)this.value=x.value;return x;}};Object.defineProperty(e,'selectedOptions',{get(){return this.children.filter(x=>x.value===this.value);}});return e;}
function documentFixture(iso) {const host=element(),map=new Map([['cysel',{value:iso}]]);return {body:host,createElement:element,querySelector:()=>host,getElementById(id){if(map.has(id))return map.get(id);const find=e=>e.id===id?e:e.children?.map(find).find(Boolean);return find(host)||null;}};}
async function adapterFixture(slug) {
  const html=await read('consoles/'+slug+'/index.html'), globals={GLSEL:'flu',SCEN:'none'};
  const match=html.match(/let SNAP=([\s\S]*?);\s*\n/);
  if(match)globals.SNAP=vm.runInNewContext('('+match[1]+')');
  if(wb.includes(slug)){
    globals.CMPK=html.match(/let CMPK='([^']+)'/)?.[1];
    const context=JSON.parse(html.match(/<script[^>]*id="worldbank-population-area"[^>]*>([\s\S]*?)<\/script>/)[1]);
    globals.SNAP.responseAnnualContext=context;
  }
  const key={'global-cancer':'INC','global-ntds':'BURDEN','antimicrobial-resistance':'PATHO'}[slug];
  if(key){globals[key]=vm.runInNewContext(html.match(new RegExp('const '+key+'=([\\s\\S]*?);'))[1]);if(slug==='global-cancer')globals.MORT=vm.runInNewContext(html.match(/const MORT=([\s\S]*?);/)[1]);}
  const context=runtime(globals);context.document=documentFixture(Object.keys(globals.SNAP?.cty||{})[0]||'AAA');
  let raw;context.ConsoleResponse.connect=fn=>raw=fn();
  vm.runInContext(await read('response-plans/adapters/'+slug+'.js'),context,{filename:slug+'.js'});
  return {context,raw};
}
const coverage=[];
for(const slug of all){
  const {context,raw}=await adapterFixture(slug),p=context.ConsoleResponse.evaluate(raw),actions=p.actions.filter(a=>a.featured&&a.selected);
  check(slug+' maintained public payload has 2–5 complete applicable priorities per audience',()=>{
    assert.ok(!actions.some(a=>a.id.startsWith('priority-reader-')),'selector must not fail into core fallback');
    for(const track of ['public','operator']){
      const rows=actions.filter(a=>a.track===track);assert.ok(rows.length>=2&&rows.length<=5,slug+' '+track+' '+rows.length);
      assert.deepEqual(Array.from(rows,a=>a.position),Array.from(rows,(_,i)=>i+1));
      for(const a of rows){for(const key of ['title','target','reason','nextStep','timing','escalateWhen','escalateTo','reviewAfter'])assert.ok(a[key]?.trim(),key);
        assert.ok(/^https:\/\//.test(a.authorityUrl));assert.ok(!a.withheld);assert.ok(a.priority!=='immediate');assert.ok(Number.isInteger(a.rank)&&a.rank>0);
        if(a.requiresCurrent)assert.ok(a.sources.every(s=>s.quality==='current'&&s.measuredAt&&s.source));
      }
    }
  });
  coverage.push({slug,public:actions.filter(a=>a.track==='public').map(a=>({id:a.id,rank:a.position,target:a.target,priority:a.priority,signal:a.signal,evidenceIds:a.evidenceIds})),operatorCount:actions.filter(a=>a.track==='operator').length});
}
check('all 19 wholly missing public payloads keep two named verification steps per audience',()=>{
  for(const slug of all){const p=input(slug);for(const track of ['public','operator']){const a=audience(p,track);assert.ok(a.length>=2&&a.length<=5,slug);assert.ok(a.every(x=>!x.requiresCurrent));}}
});
if(process.env.HEALTH_PRIORITY_QA){await mkdir(process.env.HEALTH_PRIORITY_QA,{recursive:true});await writeFile(process.env.HEALTH_PRIORITY_QA+'/coverage.json',JSON.stringify(coverage,null,2)+'\n');}
console.log('PASS '+n+' health priority regression groups across '+all.length+' adapters');
