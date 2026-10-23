import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const context=vm.createContext({window:{}});
vm.runInContext(await readFile(new URL('../response-plans/core.js',import.meta.url),'utf8'),context);
vm.runInContext(await readFile(new URL('../response-plans/domain-helpers.js',import.meta.url),'utf8'),context);
const R=context.window.ConsoleResponse,H=R.domain;
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS response domain helper: '+name);}
check('exact empirical Wasserstein alias preserves unequal-cohort distances and missingness',()=>{
  assert.equal(H.wasserstein([0,2],[1]),1);
  assert.equal(H.wasserstein([0,0],[0,2]),1);
  assert.equal(H.wasserstein([], [1]),null);
  assert.equal(H.wasserstein([1,NaN],[1]),null);
});
check('component contiguity includes isolates and handles cycles without directed causal inference',()=>{
  assert.equal(H.components(['A','B','C'],[['A','B']]),2);
  assert.equal(H.components(['A','B','C'],[['A','B'],['B','C'],['C','A']]),1);
  assert.equal(H.components(['A','B','C'],[['B','A'],['A','B'],['B','A']]),2);
  assert.equal(H.components(['A','B'],[['A','outside']]),2);
  assert.equal(H.components([],[]),null);
});
check('authoring helper creates exactly ten stable dimensions and both audience tracks',()=>{
  const p=H.build({slug:'fixture',title:'Fixture',rows:[],authorityUrl:'https://www.eia.gov/'});
  assert.equal(p.diagnostics.length,10);
  assert.deepEqual(Array.from(p.diagnostics,d=>d.metricId),[1,2,3,4,5,6,7,8,9,10]);
  const normalized=R.evaluate(p);
  assert.ok(normalized.diagnostics.every(d=>d.status==='unknown'));
  assert.ok(normalized.diagnostics.every(d=>typeof d.requiredInputs==='string'&&d.requiredInputs.length>0));
  for(const track of ['public','operator'])assert.equal(normalized.actions.filter(a=>a.track===track&&a.selected).length,10);
});
check('unsupported clear override cannot bypass missing-evidence safeguards',()=>{
  const p=H.build({slug:'fixture',rows:[],overrides:{1:{status:'clear',evidenceIds:['absent']}}});
  const plan=R.evaluate(p);
  assert.equal(plan.diagnostics[0].status,'unknown');
  assert.ok(plan.actions.some(a=>a.metricIds?.includes(1)&&a.when==='unknown'&&a.selected));
});
check('numeric zero and explicit planning values survive canonical construction',()=>{
  const p=H.build({slug:'fixture',rows:[],evidence:[{id:'zero',label:'Observed zero',value:0,basis:'measured',quality:'historical'}],
    overrides:{2:{value:0,unit:'MW',status:'clear',evidenceIds:['zero'],scope:'planning'}}});
  const d=R.evaluate(p).diagnostics.find(d=>d.metricId===2);
  assert.equal(d.value,0);assert.equal(d.status,'clear');assert.equal(d.scope,'planning');
});
check('authoring does not copy unrelated private context fields',()=>{
  const p=H.build({slug:'fixture',rows:[],privateInput:'USER_PRIVATE_SENTINEL',statusOverride:{patient:'USER_PRIVATE_SENTINEL'}});
  assert.equal(JSON.stringify(p).includes('USER_PRIVATE_SENTINEL'),false);
});
console.log('PASS '+passed+' response domain-helper regressions');
