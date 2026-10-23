import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const response = createRequire(import.meta.url)('../response-plans/core.js');
const payload = () => ({
  slug:'fixture', title:'Fixture plan', context:'Public fixture A',
  evidence:[{id:'demand',label:'Reported demand',value:80,unit:'MW',basis:'measured',quality:'current',measuredAt:'2026-10-23T12:00:00Z',source:'https://www.eia.gov/'}],
  diagnostics:[{id:'pressure',metricId:1,label:'Workload balance proxy',status:'triggered',evidenceIds:['demand'],rule:'Reported workload exceeds the declared planning threshold.',analyticalMitigation:'Verify denominator and compare the same reporting period.'}],
  actions:[
    {id:'public-verify',track:'public',phase:'verify',when:'triggered',metricIds:[1],title:'Verify the official report',nextStep:'Check source and observation time.',authorityUrl:'https://www.eia.gov/'},
    {id:'operator-review',track:'operator',phase:'prepare',when:'triggered',diagnosticIds:['pressure'],title:'Review the local SOP',nextStep:'Confirm capacity with verified telemetry.'},
    {id:'missing',track:'public',phase:'verify',when:'unknown',metricIds:[1],title:'Obtain missing evidence'},
  ],
});
let count=0;
function check(name, fn){fn();count++;console.log('PASS response core: '+name);}
check('all ten dimensions retain canonical identity and missing metrics are unknown',()=>{
  const plan=response.evaluate(payload());
  assert.deepEqual(plan.diagnostics.filter(d=>d.metricId).map(d=>d.metricId),[1,2,3,4,5,6,7,8,9,10]);
  assert.equal(plan.diagnostics.filter(d=>d.metricId&&d.status==='unknown').length,9);
  assert.ok(plan.diagnostics.filter(d=>d.metricId).every(d=>d.requiredInputs&&d.analyticalMitigation));
});
check('real condition selects triggered plan and a changed condition removes it',()=>{
  const p=payload();
  assert.equal(response.evaluate(p).actions.find(a=>a.id==='public-verify').selected,true);
  p.diagnostics[0].status='clear';
  assert.equal(response.evaluate(p).actions.find(a=>a.id==='public-verify').selected,false);
});
check('missing, stale, invalid and absent linked evidence are unknown rather than clear',()=>{
  for(const change of ['missing','stale',null,NaN,'absent']){
    const p=payload();p.diagnostics[0].status='clear';
    if(change==='absent')p.evidence=[];
    else if(change===null||Number.isNaN(change))p.evidence[0].value=change;
    else p.evidence[0].quality=change;
    const plan=response.evaluate(p),d=plan.diagnostics.find(d=>d.metricId===1);
    assert.equal(d.status,'unknown');assert.equal(plan.actions.find(a=>a.id==='missing').selected,true);
  }
});
check('valid zero stays measured zero',()=>{
  const p=payload();p.evidence[0].value=0;p.diagnostics[0].status='clear';
  const plan=response.evaluate(p);assert.equal(plan.evidence[0].value,0);assert.equal(plan.evidence[0].quality,'current');assert.equal(plan.diagnostics[0].status,'clear');
});
check('historical evidence requires explicit planning scope and cannot trigger current response',()=>{
  const p=payload();p.evidence[0].quality='historical';
  assert.equal(response.evaluate(p).diagnostics[0].status,'unknown');
  p.diagnostics[0].scope='planning';p.actions[0].phase='respond';
  const plan=response.evaluate(p);assert.equal(plan.diagnostics[0].status,'triggered');assert.equal(plan.actions[0].selected,false);assert.equal(plan.actions[0].withheld,true);
});
check('demo remains practice and never becomes measured current incident evidence',()=>{
  const p=payload();p.evidence[0].basis='demo';p.actions[0].phase='respond';
  const plan=response.evaluate(p);assert.equal(plan.actions[0].practice,true);assert.equal(plan.diagnostics[0].current,false);
});
check('unlabeled entity diagnostics are not arbitrarily assigned to canonical dimensions',()=>{
  const p=payload();delete p.diagnostics[0].metricId;
  const plan=response.evaluate(p);assert.equal(plan.diagnostics.filter(d=>d.metricId&&d.status==='unknown').length,10);assert.equal(plan.diagnostics.find(d=>d.id==='pressure').metricId,null);
});
check('duplicate canonical dimensions are unknown',()=>{
  const p=payload();p.diagnostics.push({...p.diagnostics[0],id:'conflicting'});
  assert.equal(response.evaluate(p).diagnostics.find(d=>d.metricId===1).status,'unknown');
});
check('unsupported empty dependencies cannot imply healthy',()=>{
  const p=payload();p.diagnostics[0].evidenceIds=[];p.diagnostics[0].status='clear';
  assert.equal(response.evaluate(p).diagnostics[0].status,'unknown');
});
check('nonfinite metric value becomes unknown',()=>{
  const p=payload();p.diagnostics[0].value=Infinity;
  assert.equal(response.evaluate(p).diagnostics[0].status,'unknown');
});
check('no graph stays absent rather than inventing source/sink roles',()=>{
  assert.equal(response.evaluate(payload()).network,null);
});
check('unsafe source/action URLs are withheld',()=>{
  const p=payload();p.evidence[0].source='javascript:alert(1)';p.actions[0].authorityUrl='data:text/html,x';
  const plan=response.evaluate(p);assert.equal(plan.evidence[0].source,'');assert.equal(plan.actions[0].authorityUrl,'');
});
check('exact empirical W1 handles unequal cohorts, ties, units and missing input',()=>{
  assert.equal(response.math.wasserstein1([0,2],[1]),1);
  assert.equal(response.math.wasserstein1([0,0],[0,2]),1);
  assert.equal(response.math.wasserstein1([4,8],[4,8]),0);
  assert.equal(response.math.wasserstein1([0],[3]),3);
  assert.equal(response.math.wasserstein1([], [1]),null);
  assert.equal(response.math.wasserstein1([NaN],[1]),null);
});
console.log('PASS '+count+' response core regressions');
