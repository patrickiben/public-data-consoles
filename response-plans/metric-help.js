/* Shared, self-contained plain-language help. No data, scoring or network access. */
(function(root){
 'use strict';
 var definitions = [
  {
    "id": 1,
    "name": "Population Balance",
    "meaning": "Checks whether comparison groups are alike in the characteristics or population/workload weights that matter to the question. Equal numbers of sites do not ensure comparable groups."
  },
  {
    "id": 2,
    "name": "Wasserstein Distance / Shape Imbalance",
    "meaning": "Measures how far apart two distributions are by how far their values would need to move to match. Read the distance in its stated units; a gap does not identify its cause."
  },
  {
    "id": 3,
    "name": "Density Symmetry",
    "meaning": "Compares how concentrated or spread out two groups are, using the stated density measure. Similar totals can hide different geographic or statistical patterns."
  },
  {
    "id": 4,
    "name": "Euler Characteristic / Contiguity",
    "meaning": "Describes connectedness using a declared spatial or graph definition. A component count is a proxy: the full Euler characteristic also accounts for holes."
  },
  {
    "id": 5,
    "name": "Persistence Gap",
    "meaning": "Checks which spatial clusters or gaps remain as you change how nearby points are connected. A count near a chosen threshold is a simpler sensitivity check."
  },
  {
    "id": 6,
    "name": "Spatial Mixing / Scale Stability",
    "meaning": "Checks whether a pattern changes when you change the spatial scale, grouping or comparison window. The dashboard states which scale it varies; this does not measure physical mixing."
  },
  {
    "id": 7,
    "name": "Variational Free Energy",
    "meaning": "Checks how well a model describes relationships between parts of a system, while accounting for model complexity. The research uses a fit-versus-complexity score (BIC); a dashboard’s link-count proxy is a different measure."
  },
  {
    "id": 8,
    "name": "Contamination AUC",
    "meaning": "Combines an exposure screen across a stated range of times, distances, thresholds or scenario levels into one summary: the area under the curve. It does not give the probability of contamination or damage."
  },
  {
    "id": 9,
    "name": "Frontier Risk / Buffer Depth AUC",
    "meaning": "Summarizes how much of the otherwise unexposed group lies near the exposed group as a chosen buffer grows. Its meaning depends on the weights and distance range; it does not give a failure probability or a safe buffer distance."
  },
  {
    "id": 10,
    "name": "Mobility Network Leakage",
    "meaning": "Measures or models movement between comparison groups along defined links. A cross-group link count alone does not establish actual volume, hydraulic flow or causal transmission."
  }
];
 var doc=root.document, tip=null, active=null, pinned=false, timer=null, overTip=false;
 function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
 function definition(id){return definitions.find(function(d){return d.id===Number(id);});}
 function label(id,text,context,contextTitle){
  var d=definition(id);if(!d)return esc(text);
  return '<span class="cmh-term" data-metric-term><span>'+esc(text)+'</span><button class="cmh-button" type="button" data-metric-help="'+d.id+'" data-metric-context="'+esc(context||'')+'" data-metric-context-title="'+esc(contextTitle||'In this view')+'" aria-label="Explain parameter '+d.id+': '+esc(d.name)+(contextTitle?' — '+esc(contextTitle):'')+'" aria-expanded="false"><span aria-hidden="true">?</span></button></span>';
 }
 function ensure(){
  if(tip)return tip;
  tip=doc.createElement('div');tip.id='console-metric-tooltip';tip.setAttribute('role','tooltip');tip.hidden=true;
  doc.body.appendChild(tip);
  tip.addEventListener('pointerenter',function(){overTip=true;root.clearTimeout(timer);});
  tip.addEventListener('pointerleave',function(){overTip=false;schedule();});
  return tip;
 }
 function close(){
  root.clearTimeout(timer);
  if(active){active.removeAttribute('aria-describedby');active.setAttribute('aria-expanded','false');}
  if(tip)tip.hidden=true;
  active=null;pinned=false;overTip=false;
 }
 function position(){
  if(!active||!tip||tip.hidden)return;
  if(!active.isConnected){close();return;}
  var r=active.getBoundingClientRect(),v=root.visualViewport,w=v?v.width:root.innerWidth,h=v?v.height:root.innerHeight,x=v?v.offsetLeft:0,y=v?v.offsetTop:0;
  if(r.bottom<y||r.top>y+h||r.right<x||r.left>x+w){close();return;}
  tip.style.maxWidth=Math.max(0,w-24)+'px';tip.style.maxHeight=Math.max(0,h-24)+'px';
  var box=tip.getBoundingClientRect(),below=Math.max(0,y+h-12-r.bottom-8),above=Math.max(0,r.top-y-12-8);
  // Keep the trigger outside the popup, including while touch focus precedes
  // click. Otherwise a long explanation can cover its own button mid-tap.
  var useBelow=box.height<=below||(box.height>above&&below>=above);
  tip.style.maxHeight=Math.min(h-24,useBelow?below:above)+'px';
  box=tip.getBoundingClientRect();
  var left=Math.max(x+12,Math.min(r.left,x+w-box.width-12)),top=useBelow?r.bottom+8:r.top-box.height-8;
  tip.style.left=left+'px';tip.style.top=top+'px';
 }
 function show(button,lock){
  var d=definition(button&&button.dataset.metricHelp);if(!d)return;
  root.clearTimeout(timer);
  if(active!==button){close();active=button;}
  pinned=!!lock||pinned;
  var el=ensure();el.replaceChildren();
  var title=doc.createElement('strong');title.textContent='#'+d.id+' '+d.name;el.appendChild(title);
  var meaning=doc.createElement('p');meaning.textContent=d.meaning;el.appendChild(meaning);
  if(button.dataset.metricContext){var context=doc.createElement('p'),lead=doc.createElement('b');lead.textContent=(button.dataset.metricContextTitle||'In this view')+': ';context.append(lead,doc.createTextNode(button.dataset.metricContext));el.appendChild(context);}
  var hint=doc.createElement('small');hint.textContent=pinned?'Tap ? again or elsewhere to close. Escape also closes.':'Tap ? to keep open. Press Escape to close.';el.appendChild(hint);
  el.hidden=false;button.setAttribute('aria-describedby',el.id);button.setAttribute('aria-expanded','true');position();
 }
 function schedule(){
  root.clearTimeout(timer);timer=root.setTimeout(function(){if(!pinned&&!overTip&&doc.activeElement!==active)close();},160);
 }
 function termButton(target){var term=target&&target.closest&&target.closest('[data-metric-term]');return term&&term.querySelector('[data-metric-help]');}
 function start(){
  doc.querySelectorAll('[data-metric-name]').forEach(function(el){el.innerHTML=label(el.dataset.metricName,el.textContent,el.dataset.metricContext);});
  ensure();
  doc.addEventListener('pointerover',function(e){if(e.pointerType==='touch')return;var b=termButton(e.target);if(b&&termButton(e.relatedTarget)!==b){if(active&&b!==active&&(pinned||doc.activeElement===active))return;show(b,false);}});
  doc.addEventListener('pointerout',function(e){var b=termButton(e.target);if(b&&termButton(e.relatedTarget)!==b&&!tip.contains(e.relatedTarget))schedule();});
  doc.addEventListener('focusin',function(e){if(e.target.matches('[data-metric-help]'))show(e.target,false);});
  doc.addEventListener('focusout',function(e){if(e.target===active){pinned=false;schedule();}});
  // Capture prevents help inside a summary/label from opening it or checking a box.
  doc.addEventListener('click',function(e){
   var b=e.target.closest('[data-metric-help]');
   if(b){e.preventDefault();e.stopPropagation();if(active===b&&pinned)close();else show(b,true);return;}
   if(!tip.contains(e.target))close();
  },true);
  doc.addEventListener('keydown',function(e){if(e.key==='Escape'&&active){close();e.preventDefault();e.stopPropagation();}},true);
  doc.addEventListener('scroll',function(e){if(e.target!==tip)position();},true);
  root.addEventListener('resize',position);
  if(root.visualViewport){root.visualViewport.addEventListener('resize',position);root.visualViewport.addEventListener('scroll',position);}
  if(root.MutationObserver)new root.MutationObserver(function(){if(active&&!active.isConnected)close();}).observe(doc.body,{childList:true,subtree:true});
  root.addEventListener('beforeprint',close);
 }
 root.ConsoleMetricHelp={label:label,definition:definition,close:close,definitions:definitions};
 if(doc){if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start,{once:true});else start();}
})(typeof window!=='undefined'?window:globalThis);
