import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../public-data-runtime/worldbank.js',import.meta.url),'utf8');
const sandbox=vm.createContext({Date,URL});vm.runInContext(source,sandbox);
const make=(indicator,value=20,year='2024',population=100000)=>({embedded:'2026-10-23',indMeta:{x:{ind:indicator,name:'Source metric',unit:indicator==='SH.STA.AIRP.P5'?'per 100,000 (age standardized)':indicator==='SH.DYN.NCOM.ZS'?'% lifetime risk':indicator.includes('.ZS')?'% of source population':'source units'}},cty:{AAA:{name:'Country A',latest:{x:{v:value,y:year}}}},responseAnnualContext:{capturedAt:'2026-10-23T12:00:00Z',countries:{AAA:{population:{'2024':population}}}}});
const read=snap=>sandbox.WorldBankPublicData.countryImpacts(snap,'AAA'),item=snap=>read(snap).impacts.items[0];
let count=0;
function check(name,fn){fn();console.log('PASS health impact math: '+name);count++;}
check('TB rate uses exact-year total residents',()=>{const s=make('SH.TBS.INCD',100);assert.equal(item(s).value,100);assert.equal(item(s).unit,'episodes/year');assert.match(item(s).note,/new and relapse/);assert.equal(read(s).evidence.find(e=>e.id==='impact-population-2024').value,100000);});
check('crude road and suicide rates scale to annual context',()=>{for(const code of ['SH.STA.TRAF.P5','SH.STA.SUIC.P5'])assert.equal(item(make(code,20)).value,20);});
check('service access complement counts and zero are valid',()=>{assert.equal(item(make('SH.H2O.SMDW.ZS',80)).value,20000);assert.equal(item(make('EG.CFT.ACCS.ZS',100)).value,0);assert.equal(item(make('SH.STA.ODFC.ZS',0)).value,0);});
check('declared demographic age shares use same-year residents',()=>{for(const code of ['SP.POP.65UP.TO.ZS','SP.POP.0014.TO.ZS'])assert.equal(item(make(code,20)).value,20000);});
check('inventory counts do not imply available capacity',()=>{assert.equal(item(make('SH.MED.BEDS.ZS',3)).value,300);assert.match(item(make('SH.MED.BEDS.ZS',3)).note,/not occupied, staffed/);assert.equal(item(make('SH.MED.PHYS.ZS',2)).value,200);});
check('direct HIV counts need no total-population multiplier',()=>{const s=make('SH.HIV.INCD',55);delete s.responseAnnualContext;assert.equal(item(s).value,55);assert.match(item(s).method,/directly/);});
check('missing exact-year population never borrows a neighboring year',()=>{assert.equal(item(make('SH.TBS.INCD',100,'2023')).value,null);assert.match(item(make('SH.TBS.INCD',100,'2023')).method,/no nearest-year/);});
check('missing first rate cannot poison a shared same-year denominator',()=>{const s=make('SH.MED.PHYS.ZS',null);s.indMeta.y={ind:'SH.TBS.INCD',name:'TB',unit:'per100,000'};s.cty.AAA.latest.y={v:100,y:'2024'};const r=read(s);assert.equal(r.impacts.items.find(i=>i.id==='quantity-y').value,100);const denominator=r.evidence.find(e=>e.id==='impact-population-2024');assert.equal(denominator.value,100000);assert.equal(denominator.measuredAt,'2024');assert.equal(denominator.quality,'historical');});
check('invalid or future years cannot create a count',()=>{assert.equal(item(make('SH.TBS.INCD',100,String(new Date().getUTCFullYear()+1))).value,null);assert.equal(item(make('SH.TBS.INCD',100,'not-a-year')).value,null);});
check('age-standardized air mortality retains original rate',()=>{const i=item(make('SH.STA.AIRP.P5',40));assert.equal(i.value,40);assert.equal(i.unit,'per 100,000 (age standardized)');assert.match(i.note,/cannot be multiplied/);assert.doesNotMatch(i.label,/deaths/);});
check('lifetime NCD probability is not annual deaths',()=>{const i=item(make('SH.DYN.NCOM.ZS',15));assert.equal(i.value,15);assert.equal(i.unit,'% lifetime risk');assert.match(i.note,/not an annual/);});
check('censored nutrition and cohort measures are not multiplied by residents',()=>{for(const code of ['SN.ITK.DEFC.ZS','SH.IMM.IDPT','SH.DYN.MORT','SH.DYN.AIDS.ZS','SH.MLR.INCD.P3']){const i=item(make(code,2.5));assert.equal(i.value,2.5);assert.match(i.method,/no count conversion/);}});
check('population and product overflow do not become numeric impacts',()=>{assert.equal(item(make('SH.XPD.CHEX.PC.CD',1e308,'2024',Number.MAX_SAFE_INTEGER)).value,null);assert.equal(item(make('SH.TBS.INCD',100,'2024',Number.MAX_SAFE_INTEGER+1)).value,null);assert.equal(item(make('SH.HIV.INCD',1e308)).value,null);});
check('negative, boolean and invalid percentages remain unavailable',()=>{for(const v of [-1,true,101,Infinity])assert.equal(item(make('SH.H2O.SMDW.ZS',v)).value,null);});
check('historical PM2.5 population reference remains10µg not current5µg',()=>{const i=item(make('EN.ATM.PM25.MC.ZS',80));assert.equal(i.value,80000);assert.match(i.note,/10 µg/);assert.match(i.note,/not the WHO 2021 annual 5/);});
check('every quantity and record links dated source evidence',()=>{const r=read(make('SH.TBS.INCD',100)),facts=new Map(r.evidence.map(f=>[f.id,f]));for(const row of [...r.impacts.items,...r.impacts.records]){assert.equal(row.kind,'context');assert.ok(row.evidenceIds.length);for(const id of row.evidenceIds){assert.ok(facts.has(id));assert.ok(facts.get(id).source.startsWith('https://'));assert.equal(facts.get(id).measuredAt,'2024');}}});
console.log(count+' health impact conversion/definition checks passed');
