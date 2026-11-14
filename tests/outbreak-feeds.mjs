// Known-answer checks for the outbreak tracker's WHO mpox and CDC NNDSS measles parsers.
// The parsers are read from the shipped page, so these checks cover the code visitors run.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const html=await readFile(new URL('../consoles/global-outbreak-tracker/index.html',import.meta.url),'utf8');
const start=html.indexOf('const CLADE1='),end=html.indexOf('\n',html.indexOf('async function fetchMeasles('));
assert.ok(start>0&&end>start,'outbreak parser block present');
const P=vm.runInNewContext(html.slice(start,end)+'\n;({parseMpoxSnapshot,parseMeaslesSnapshot,mmwrWeekEnding,mmwrWeekCount,outbreakCount})',{console});
const SNAP=vm.runInNewContext('('+html.match(/let SNAP=([\s\S]*?);\s*\n/)[1]+')');
let count=0;
function check(name,fn){fn();count++;console.log('PASS outbreak feeds: '+name);}
const plain=v=>JSON.parse(JSON.stringify(v));

// WHO validated mpox table: one row per country and report date, cumulative counts, no World row.
const row=(iso,date,cases,deaths=0,name=iso)=>({ISO3:iso,COUNTRY:name,DATE:date,TOTAL_CONF_CASES:cases,TOTAL_CONF_DEATHS:deaths});
const who=(rows,extra={})=>({'@odata.context':'fixture',value:rows,...extra});
const base=()=>[row('AAA','2023-12-20',10,1,'Alpha'),row('AAA','2024-02-10',15,1,'Alpha'),row('BBB','2024-01-15',5,0,'Beta'),row('COD','2023-06-01',7,0,'Democratic Republic of the Congo')];

check('world total and month-end series carry each country’s latest report forward',()=>{
  const r=P.parseMpoxSnapshot(who(base()),null);
  assert.equal(r.asof,'2024-02-10');assert.equal(r.worldCases,27);assert.equal(r.worldDeaths,1);
  assert.deepEqual(plain(r.monthsLabels),['2024-01','2024-02']);
  assert.deepEqual(plain(r.monthsCases),[22,27],'January: AAA 10 carried from December + BBB 5 + COD 7');
  assert.deepEqual(plain(r.countries.map(c=>[c.iso,c.n,c.cases,c.asof,c.clade1])),[['AAA','Alpha',15,'2024-02-10',false],['COD','DR Congo',7,'2023-06-01',true],['BBB','Beta',5,'2024-01-15',false]]);
  assert.equal(r.sourceCountryCount,3);assert.deepEqual(plain(r.sourceCountryDates),{AAA:'2024-02-10',COD:'2023-06-01',BBB:'2024-01-15'});
});
check('a row without a report date is listed, never counted',()=>{
  const r=P.parseMpoxSnapshot(who([...base(),row('COD',null,12)]),null);
  assert.equal(r.worldCases,27);assert.deepEqual(plain(r.undated),[{iso:'COD',n:'DR Congo',cases:12}]);
});
check('unknown deaths stay unknown in the world sum; zero cases stay zero',()=>{
  const r=P.parseMpoxSnapshot(who([...base().slice(0,3),row('COD','2023-06-01',0,null)]),null);
  assert.equal(r.worldDeaths,null);assert.equal(r.worldCases,20);assert.equal(r.countries.find(c=>c.iso==='COD').cases,0);
});
check('retrospective downward revisions are accepted as the latest report',()=>{
  const r=P.parseMpoxSnapshot(who([...base(),row('AAA','2024-02-11',14,1)]),null);
  assert.equal(r.worldCases,26);assert.equal(r.countries[0].cases,14);
});
check('paged, truncated, duplicate, future, impossible-date and invalid-count responses are rejected',()=>{
  const bad={
    paged:who(base(),{'@odata.nextLink':'next'}),
    truncated:who(base().filter(r=>r.DATE>='2024-01-01')),
    duplicate:who([...base(),row('AAA','2024-02-10',15,1)]),
    future:who([...base(),row('AAA','2099-01-01',16)]),
    calendar:who([...base(),row('AAA','2026-02-30',16)]),
    negative:who([...base(),row('BBB','2024-02-01',-1)]),
    fraction:who([...base(),row('BBB','2024-02-01',1.5)]),
    overflow:who([...base(),row('BBB','2024-02-01',9007199254740992)]),
    missing:who([...base(),row('BBB','2024-02-01',null)]),
    identity:who([...base(),row('XX','2024-02-01',1)]),
    notTable:[]};
  const why={paged:/paged/,truncated:/history is truncated/,duplicate:/Duplicate mpox/,future:/future/,calendar:/Invalid or future/,negative:/Invalid outbreak count/,fraction:/Invalid outbreak count/,overflow:/Invalid outbreak count/,missing:/Missing outbreak count/,identity:/country identity/,notTable:/Invalid WHO mpox response/};
  for(const [name,data]of Object.entries(bad))assert.throws(()=>P.parseMpoxSnapshot(data,null),why[name],name);
});
check('date regression and lost country coverage against the retained snapshot are rejected',()=>{
  assert.throws(()=>P.parseMpoxSnapshot(who(base()),{asof:'2024-03-01',countries:[]}),/World reporting date regressed/);
  assert.throws(()=>P.parseMpoxSnapshot(who(base()),{countries:[{iso:'AAA',asof:'2024-02-20'}]}),/Country coverage\/date regressed: AAA/);
  assert.throws(()=>P.parseMpoxSnapshot(who(base()),{countries:[{iso:'ZZZ',asof:'2024-01-01'}]}),/Country coverage\/date regressed: ZZZ/);
  assert.throws(()=>P.parseMpoxSnapshot(who(base()),{sourceCountryCount:4,countries:[]}),/coverage decreased/);
  assert.throws(()=>P.parseMpoxSnapshot(who(base()),{monthsLabels:['2023-12','2024-01'],monthsCases:[1,2],countries:[]}),/history is truncated/);
});
check('the embedded mpox snapshot is internally consistent',()=>{
  const m=SNAP.mpox;assert.equal(m.monthsLabels.length,m.monthsCases.length);assert.equal(m.monthsCases.at(-1),m.worldCases);
  assert.equal(m.monthsLabels.at(-1),m.asof.slice(0,7));assert.ok(m.countries.every(c=>c.asof<=m.asof));
  assert.ok(m.monthsCases.every((v,i)=>i===0||v>=m.monthsCases[i-1]),'world cumulative series does not fall in this snapshot');
});

// MMWR weeks: Sunday to Saturday; week 1 contains 4 January.
check('MMWR week-ending dates and week counts match the calendar rule',()=>{
  assert.equal(P.mmwrWeekEnding(2026,1),'2026-01-10');assert.equal(P.mmwrWeekEnding(2026,26),'2026-07-04');assert.equal(P.mmwrWeekEnding(2026,44),'2026-11-07');
  assert.equal(P.mmwrWeekEnding(2025,1),'2025-01-04');assert.equal(P.mmwrWeekEnding(2025,53),'2026-01-03');
  assert.deepEqual([2014,2019,2020,2025,2026].map(P.mmwrWeekCount),[53,52,53,53,52]);
});

// NNDSS national rows: m3 is the year-to-date count; blank m3 flagged '-' means no reported cases.
const nn=(year,week,ind,imp,flag='-')=>['Measles, Indigenous','Measles, Imported'].map((label,i)=>{const v=i?imp:ind;return {year:String(year),week:String(week),label,...(v==null?{m3_flag:flag}:{m3:Number(v).toFixed(1)})};});
const archive=()=>({years:[{y:'2024',cases:285},{y:'2025',cases:2289,prelim:true}]});
const rows=()=>[...nn(2025,53,1872,154),...nn(2026,1,null,null),...nn(2026,2,3,1)];
check('the year after CDC’s archive is read at its latest week with its week-ending date',()=>{
  const r=P.parseMeaslesSnapshot(rows(),archive());
  assert.deepEqual(plain(r.nndss),[{y:'2026',cases:4,week:2,weekEnding:'2026-01-17',partial:true}]);
  assert.deepEqual(plain(r.years),plain(archive().years),'CDC archive is kept unchanged');
});
check('a complete NNDSS year after the archive is marked full year, not partial',()=>{
  const r=P.parseMeaslesSnapshot(rows(),{years:[{y:'2024',cases:285}]});
  assert.deepEqual(plain(r.nndss[0]),{y:'2025',cases:2026,week:53,weekEnding:'2026-01-03',partial:false});
  assert.equal(r.nndss[1].y,'2026');
});
check('unavailable, incomplete, regressed, duplicate and malformed NNDSS responses are rejected',()=>{
  const bad={
    flagged:[...rows(),...nn(2026,3,null,1,'U')],
    incomplete:[...rows(),nn(2026,3,5,1)[0]],
    duplicate:[...rows(),nn(2026,2,3,1)[1]],
    week54:[...rows(),...nn(2026,54,9,1)],
    week53in52:[...rows(),...nn(2026,53,9,1)],
    future:[...rows(),...nn(2099,1,1,0)],
    negative:[...rows(),...nn(2026,3,-1,0)],
    label:[...rows(),{year:'2026',week:'3',label:'Mumps',m3:'1.0'}],
    noYearAfterArchive:nn(2025,53,1872,154),
    notArray:{}};
  const why={flagged:/count unavailable/,incomplete:/week is incomplete/,duplicate:/Duplicate NNDSS/,week54:/identity/,week53in52:/identity/,future:/future/,negative:/Invalid outbreak count/,label:/identity/,noYearAfterArchive:/after the CDC archive/,notArray:/Invalid NNDSS measles response/};
  for(const [name,data]of Object.entries(bad))assert.throws(()=>P.parseMeaslesSnapshot(data,archive()),why[name],name);
  assert.throws(()=>P.parseMeaslesSnapshot(rows(),{...archive(),nndss:[{y:'2026',week:3}]}),/week regressed/);
});
check('the embedded measles snapshot keeps CDC’s archive and NNDSS entries apart',()=>{
  const {years,nndss}=SNAP.measles;assert.ok(years.every(y=>!('week' in y)&&!y.partial));
  for(const r of nndss)assert.equal(P.mmwrWeekEnding(+r.y,r.week),r.weekEnding);
  assert.ok(+nndss[0].y>Math.max(...years.map(y=>+y.y)));
});
console.log('PASS '+count+' outbreak feed groups');
