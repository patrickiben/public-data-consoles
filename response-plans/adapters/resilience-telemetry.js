(function () {
  const R=window.ConsoleResponse,H=R.domain,authority='https://www.investor.gov/introduction-investing';
  const rows=[
    {requiredInputs:['Actual portfolio exposure weights','A declared comparison partition'],analyticalMitigation:'A count of tickers is not capital at risk; no personal holdings are read by this console.',publicAction:'Read the data scope before relating a market summary to your own circumstances.',operatorAction:'Compare approved exposure-weighted and equal-weight summaries in your own controlled system.'},
    {requiredInputs:['Aligned same-date returns','A declared reference instrument'],analyticalMitigation:'Use empirical W1 in daily log-return units; differences in volatility and asset type affect the distance.',publicAction:'Use the distribution comparison to understand what differs, not as a return-direction signal.',operatorAction:'Check calendar alignment, volatility scaling and reference choice before interpreting the distribution gap.'},
    {requiredInputs:['A declared feature-space measure','Comparable group denominators'],analyticalMitigation:'Market feature-space density requires a defined embedding and normalization; ticker counts do not establish symmetry.',publicAction:'Check whether market groups are comparable rather than assuming a dense chart is safer.',operatorAction:'Specify the representation and sampling scheme before estimating density balance.'},
    {requiredInputs:['Estimated edge selection rule','Declared cohort'],analyticalMitigation:'Count connected components in the high-fragility subgraph as a contiguity proxy; this is not a full Euler-characteristic estimate.',publicAction:'Read disconnected model groups as an explanation of the sample, not protected investments.',operatorAction:'Review whether inferred clusters are stable to estimation choices before using them in a risk discussion.'},
    {requiredInputs:['Fragility readings at one common date','Declared margin band'],analyticalMitigation:'Count readings within five points of the existing 60/85 descriptive bands; the band is not a probability interval.',publicAction:'Treat changes near a color boundary cautiously; the colors do not forecast a crash.',operatorAction:'Review classifications near the existing bands and compare with your approved independent measures.'},
    {requiredInputs:['Alternative edge-selection scales','One aligned estimation window'],analyticalMitigation:'Compare component counts under the pairwise gate and twice that gate; this is graph-threshold sensitivity, not physical spatial mixing.',publicAction:'Check whether a conclusion changes when weaker estimated links are removed.',operatorAction:'Record threshold-sensitive network conclusions and retest them out of sample.'},
    {requiredInputs:['A specified probabilistic model','Energy and entropy terms'],analyticalMitigation:'Lead-lag asymmetry or correlation is not variational free energy.',publicAction:'Separate explanatory analogies from measured prices and model quantities.',operatorAction:'Specify and validate the probabilistic model before interpreting a free-energy diagnostic.'},
    {requiredInputs:['A declared network source','An explicit link-threshold ladder'],analyticalMitigation:'Integrate model reachability over relative edge thresholds as a scenario exposure AUC, not causal contagion or a loss probability.',publicAction:'Use the scenario to inspect assumptions rather than to time investments.',operatorAction:'Document threshold and source sensitivity; compare the model with approved stress scenarios.',phase:'review'},
    {requiredInputs:['A declared high/other partition','Estimated edges','A buffer-depth window'],analyticalMitigation:'Integrate reach into the other group over one to three hops; a hop is not elapsed time.',publicAction:'Read the frontier result as a model dependency question, not a predicted sequence of market moves.',operatorAction:'Verify common-factor explanations and boundary sensitivity before relying on the inferred frontier.'},
    {requiredInputs:['A declared partition','Aligned directed association estimates'],analyticalMitigation:'A cross-group association fraction is a leakage proxy; no money flow, human mobility or causal transmission is observed.',publicAction:'Check the distinction between statistical links and actual financial exposures.',operatorAction:'Review cross-group estimates alongside documented exposures and multiple-testing/model limitations.',phase:'review'}
  ];
  const reach=(seeds,links,depth=Infinity)=>{
    const seen=new Set(seeds);let frontier=[...seeds],step=0;
    while(frontier.length&&step++<depth){const next=[];for(const [a,b]of links)if(frontier.includes(a)&&!seen.has(b)){seen.add(b);next.push(b);}frontier=next;}
    return seen;
  };
  R.connect(()=>{
    const S=NETSTATE,ready=!!(S&&S.n>=3*L_LAG&&S.scenario===SCEN&&S.dataVersion===DATA_VER&&Number.isFinite(S.asOf));
    const ids=ASSET_IDS.filter(id=>STORE[id]),date=ready?msToDateStr(dayToMs(S.asOf)):null;
    const age=date?(Date.now()-Date.parse(date+'T00:00:00Z'))/86400000:null;
    const quality=age==null||age<0?'missing':MODE==='backtest'||age>4?'historical':'current';
    const scenario=SCEN!=='none'||SURR;
    const aligned=ready?alignedReturns(S.asOf,W_IND):null;
    const reference=SEL==='SPY'?'TLT':'SPY';
    const distance=aligned?.mat[SEL]?.length&&aligned?.mat[reference]?.length?H.wasserstein(aligned.mat[SEL],aligned.mat[reference]):null;
    const frag=new Map();
    if(ready)for(const id of ids){const p=compAt(id,S.asOf),f=p>=0?COMP[id].F[p]:null;if(Number.isFinite(f))frag.set(id,f);}
    const high=[...frag].filter(([,f])=>f>=60).map(([id])=>id),highSet=new Set(high);
    const links=[],weights=[];
    if(ready)for(const a of ids)for(const b of ids)if(a!==b){const value=S.A[a]?.[b],gate=S.thrPair[a]?.[b];if(Number.isFinite(value)&&value>0&&Number.isFinite(gate)&&value>=gate){links.push([a,b]);weights.push(value);}}
    const complete=ready&&frag.size===ids.length;
    const comps=complete&&high.length&&links.length?H.components(high,links):null;
    const margin=complete?[...frag.values()].filter(f=>Math.abs(f-60)<=5||Math.abs(f-85)<=5).length:null;
    let sensitivity=null;
    if(ready&&links.length){const tighter=links.filter(([a,b])=>S.A[a][b]>=2*S.thrPair[a][b]);sensitivity=Math.abs(H.components(ids,tighter)-H.components(ids,links));}
    let auc=null,frontier=null,leakage=null;
    if(ready&&links.length&&ids.length>1){
      const max=Math.max(...weights),shares=[];
      for(let k=0;k<=10;k++){const cut=max*k/10,selected=links.filter(([a,b])=>S.A[a][b]>=cut);shares.push((reach([SEL],selected).size-1)/(ids.length-1));}
      auc=100*shares.slice(1).reduce((s,v,i)=>s+(v+shares[i])/2,0)/10;
      if(complete&&high.length&&high.length<ids.length){
        const depth=[0];for(let k=1;k<=3;k++)depth.push([...reach(high,links,k)].filter(id=>!highSet.has(id)).length/(ids.length-high.length));
        frontier=100*depth.slice(1).reduce((s,v,i)=>s+(v+depth[i])/2,0)/3;
        const total=weights.reduce((a,b)=>a+b,0);leakage=100*links.reduce((s,[a,b],i)=>s+(highSet.has(a)!==highSet.has(b)?weights[i]:0),0)/total;
      }
    }
    const source='https://finance.yahoo.com/';
    const fact=(id,label,value,unit)=>({id,label,value:value==null?null:+value.toFixed(5),unit,measuredAt:date,basis:scenario?'demo':'modeled',quality:value==null?'missing':quality,source,note:'Estimated from the same aligned return window; no current position or physical-flow data is supplied.'});
    const evidence=[fact('shape',SEL+' versus '+reference+' empirical return W1',distance,'daily log return'),fact('components','High-fragility subgraph components',comps,'components'),fact('margin','Readings near existing 60/85 bands',margin,'instruments'),fact('scale','Component-count change at twice pairwise gate',sensitivity,'components'),fact('auc','Selected-source network-threshold AUC proxy',auc,'% normalized reachability'),fact('frontier','One-to-three-hop frontier AUC proxy',frontier,'% normalized reachability'),fact('leakage','Cross-group gated association share',leakage,'% of positive estimated strength')];
    const mark=(id,value,rule,explanation)=>({status:value==null?'unknown':value>0?'triggered':'clear',value:evidence.find(e=>e.id===id)?.value,unit:evidence.find(e=>e.id===id)?.unit,evidenceIds:[id],rule,explanation});
    const roles=ready?ids.map(id=>({id,label:id,role:'estimated association node',inbound:links.reduce((s,[a,b],i)=>s+(b===id?weights[i]:0),0),outbound:links.reduce((s,[a,b],i)=>s+(a===id?weights[i]:0),0),unit:'Fisher-z asymmetry units'})):[];
    return H.build({slug:'resilience-telemetry',title:'Ten-parameter research and risk-review plan',context:SEL+' versus '+reference+' · network through '+(date||'unavailable')+' · '+MODE+' · scenario '+SCEN,scenario,rows,evidence,authorityUrl:authority,
      overrides:{2:mark('shape',distance,'Review a nonzero return-distribution gap.','Exact empirical W1 on common-calendar daily log returns; not a directional forecast.'),4:mark('components',comps==null?null:comps-1,'Review more than one high-fragility graph component.','Declared component-count proxy on estimated gated links.'),5:mark('margin',margin,'Review readings within five points of existing descriptive 60/85 bands.','Interpretive classification-sensitivity band, not a confidence interval.'),6:mark('scale',sensitivity,'Review component-count changes when the gate doubles.','Estimated graph-scale sensitivity; no geographic spatial-mixing estimator is fitted.'),8:mark('auc',auc,'Review positive source reachability across the declared threshold ladder.','AUC of a hypothetical reachability screen, not a measured contagion effect or loss probability.'),9:mark('frontier',frontier,'Review model reach across the high/other boundary within 1–3 hops.','Graph-depth exposure AUC proxy, with no timing or causal claim.'),10:mark('leakage',leakage,'Review estimated association strength crossing the declared partition.','Cross-group association proxy; no physical flow or portfolio transmission is measured.')},
      network:{label:'Estimated links supporting the ten-parameter review',basis:'modeled',semantics:'Positive antisymmetric lead-lag association, gated using the existing pairwise circular-shift reference; not money flow or causal contagion.',period:date,coverage:(S?.n||0)+' common return observations; '+links.length+' selected directed links',roles,limitations:['Pairwise gates do not by themselves establish family-wise significance.','Sources and sinks describe model asymmetry, not interventions or physical transmission.']},
      escalateWhen:'Escalate data/model discrepancies to the responsible analyst and use your own approved risk policy and current sources. This checklist never issues a trade or position change.',
      limitations:['All computed dimensions use the network’s common observation date, including in backtest mode.','Historical or mixed-vintage market inputs support research/planning only; a fresh partial feed does not make the whole model current.','No fitted CRT estimand or VAR/FEVD causal transmission analysis is supplied by this checklist.'],
      baseline:[{id:'market-scope',track:'public',phase:'verify',when:'always',title:'Check dates and the purpose of the model',nextStep:'Compare the observation window and assumptions with the question you are exploring. Review Investor.gov information and your own plan before making financial decisions.',escalateWhen:'Seek qualified advice for a decision that depends on your personal circumstances; this descriptive model does not determine it.',authorityUrl:authority}]
    });
  },['#thermo','#feeds','#scenout','#casc-body','#briefing']);
})();
