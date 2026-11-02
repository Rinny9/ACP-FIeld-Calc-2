// Presentation/navigation layer. Clinical engine and reference data stay in index.html.
(()=>{
  'use strict';
  document.body.classList.add('field-interface');
  const svg=content=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${content}</svg>`;
  const icons={settings:svg('<circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 4 2 2v4l4 2 3-1 3 1 4-2v-4l2-2-2-4-3-1-1-3H9Z"/>'),close:svg('<path d="m6 6 12 12M18 6 6 18"/>'),arrow:svg('<path d="m14 6-6 6 6 6"/>'),heart:svg('<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11Z"/><path d="M4 11h4l2-4 3 8 2-4h5"/>')};
  let opener=null,openerAction=null,clickTrigger=null;
  document.addEventListener('click',e=>{const trigger=e.target.closest('button');clickTrigger=trigger;setTimeout(()=>{if(clickTrigger===trigger)clickTrigger=null;},0);},true);
  const UI=window.FIELD_UI={icons,sync,editPatient:openPatient};
  const header=document.querySelector('body>header');header.classList.add('field-header');
  header.querySelector('h1').textContent='ACP Field';header.querySelector('.subtitle').textContent='Ontario ALS PCS 5.4';header.querySelector('.logo').innerHTML=icons.heart;
  const globalDisplay=document.createElement('div');globalDisplay.id='globalDisplay';globalDisplay.innerHTML=displayControlHTML('global');header.querySelector('.hdr-right').prepend(globalDisplay);
  $('settingsTop').innerHTML=icons.settings;$('settingsTop').setAttribute('aria-label','Settings, service stock and app information');
  const offlineRow=document.createElement('div');offlineRow.className='settingsrow';offlineRow.innerHTML='<div class="sl">Offline pack<small>Source PDFs need internet or downloaded copies</small></div>';offlineRow.append($('offlineStatus'));$('pane-info').querySelector('.inputcard').prepend(offlineRow);

  const dialog=document.createElement('dialog');dialog.id='patientDialog';dialog.setAttribute('aria-labelledby','patientDialogTitle');
  dialog.innerHTML=`<div class="field-dialog-head"><h2 id="patientDialogTitle">Patient details</h2><button type="button" id="closePatientDialog" aria-label="Close patient details">${icons.close}</button></div><div id="patientDialogBody"></div><div class="field-dialog-footer"></div>`;
  document.body.append(dialog);$('patientDialogBody').append($('patientEntry'));dialog.querySelector('.field-dialog-footer').append($('newPtTop'));
  $('newPtTop').textContent='New patient';$('patientContinue').textContent='Done';
  $('patientContinue').onclick=()=>{if(!S.pt||(S.pt.ageYears==null&&S.pt.weightKg==null)||S.validation.length){$(S.mode==='wt'?'wtIn':'ageIn').focus();return;}S.entryCollapsed=true;renderEntryState();renderResults();closePatient();};
  $('closePatientDialog').onclick=closePatient;dialog.addEventListener('cancel',e=>{e.preventDefault();closePatient();});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePatient();}});
  document.addEventListener('keydown',e=>{if(dialog.open&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closePatient();}},true);
  function openPatient(){if(dialog.open)return;opener=clickTrigger?.isConnected?clickTrigger:document.activeElement;if(opener===document.body||opener===document.documentElement)opener=null;openerAction=activePane==='critical'?'critical':'normal';S.entryCollapsed=false;renderEntryState();renderEstNote();dialog.showModal();$(S.mode==='wt'?'wtIn':'ageIn').focus({preventScroll:true});}
  function closePatient(){if(!dialog.open)return;dialog.close();S.entryCollapsed=true;renderEntryState();const target=opener?.isConnected?opener:openerAction==='critical'?$('critical').querySelector('.crit-edit'):$('fieldEditPatient');target?.focus({preventScroll:true});}
  window.editPatient=openPatient;window.criticalEditPatient=openPatient;
  $('newPtTop').onclick=()=>{const before=S.pt;newPatient();if(S.pt!==before){closePatient();UI.goHome?.();}};

  renderPtBar=function(){
    const p=S.pt,has=p&&(p.weightKg!=null||p.ageYears!=null),weight=p?.weightKg!=null?`${fmt(p.weightKg)}<span>kg</span>`:'—';
    const age=p?.ageYears!=null?critAgeLabel(p):'Age not entered';
    const kind=p?.isPeds==null?'Age required':p.isPeds?'Pediatric':'Adult',source=p?.weightKg!=null?(p.weightSrc==='entered'?'Entered weight':`ESTIMATED · ${p.weightSrc}`):'Weight not entered';
    const markup=`<div class="field-patient-main"><div class="field-weight num">${weight}</div><div class="field-patient-meta">${has?esc(age)+' · '+esc(kind):'Patient not entered'}<small>${esc(source)}</small></div></div><button id="fieldEditPatient" type="button" class="ptedit" onclick="editPatient()">${has?'Edit patient':'Enter patient'}</button>`;
    // Stock input blur can recompute between pointerdown and click. Keep an
    // unchanged patient strip (and its actual button) alive through that event.
    if($('ptcard').innerHTML!==markup)$('ptcard').innerHTML=markup;
    $('ptcard').classList.toggle('field-estimated',!!p?.weightKg&&p.weightSrc!=='entered');
  };
  const baseRow=rowHTML;
  rowHTML=function(r){
    const template=document.createElement('template');template.innerHTML=baseRow(r).replace('✓ Conditions','Conditions').replace('✗ Contraindications','Contraindications');
    const hasVolume=!!r.ml||(r.lines||[]).some(l=>/mL\b/.test(l.m||''));
    const stockText=hasVolume&&!/^PDC/.test(r.src||'')?[r.name,...(r.lines||[]).map(l=>l.l)].join(' ').toLowerCase():'';
    const stock=[...new Set(Object.entries(STOCK_NAMES).filter(([name])=>stockText.includes(name)).map(([,key])=>`${CONC[key].label}: ${fmt(CONC[key].v)} ${CONC[key].unit}`))].join(' · ');
    if(String(r.dose||'').length>18||String(r.ml||'').length>20||/\/kg/.test(r.dose||''))template.content.querySelector('.rmain')?.classList.add('field-long-dose');
    if(stock&&!/epinephrine/i.test(r.name||'')){const line=document.createElement('div');line.className='field-stock';line.textContent='Concentration used · '+stock;template.content.querySelector('.rname')?.after(line);}
    for(const route of template.content.querySelectorAll('.rline'))if(route.querySelector('.rlM .draw-label')){const label=document.createElement('span');label.className='field-dose-label';label.textContent='Dose';route.querySelector('.rlD')?.prepend(label);route.classList.add('field-dose-pair');}
    return template.innerHTML;
  };
  const basePeds=renderPeds;
  renderPeds=function(){
    basePeds();
    // Published chart/equipment strings remain exact. Protect each quantity
    // and its unit from breaking across lines, including Large text.
    for(const element of $('pedBody').querySelectorAll('.rdose,.rml,.pedeq .cvv')){
      const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT),nodes=[];
      while(walker.nextNode())if(!walker.currentNode.parentElement.closest('.dose-amount,a,button'))nodes.push(walker.currentNode);
      for(const node of nodes){const span=document.createElement('span');span.innerHTML=doseTextHTML(node.textContent);node.replaceWith(span);}
    }
  };

  for(const [paneId,tabId]of [['pane-dir','referenceTabs'],['pane-peds','pedsReferenceTabs']]){
    const tabs=document.createElement('div');tabs.className='field-reference-header';tabs.innerHTML=`<div class="field-page-kicker">REFERENCE LIBRARY</div><h1>Find the source.</h1><div id="${tabId}" class="field-reference-tabs" role="group" aria-label="Reference collection"><button type="button" data-reference-pane="dir">Directives</button><button type="button" data-reference-pane="peds">Pediatric charts</button></div>`;$(paneId).prepend(tabs);tabs.querySelectorAll('[data-reference-pane]').forEach(b=>b.onclick=()=>switchPane(b.dataset.referencePane));
  }
  const toolsTitle=document.createElement('div');toolsTitle.className='field-page-intro';toolsTitle.innerHTML='<div class="field-page-kicker">PRACTICAL FIELD TOOLS</div><h1>Tools, not clutter.</h1><p>Assessment, infusion and equipment references.</p>';$('pane-tools').prepend(toolsTitle);
  const baseSwitch=switchPane;switchPane=function(id){baseSwitch(id);sync();};
  scrollToCalculations=function(){requestAnimationFrame(()=>{
    const target=$('results').querySelector('.pathway-notice,.sec:not([data-sec="summary"])')||$('workflow');
    const offset=header.getBoundingClientRect().height+$('ptbar').getBoundingClientRect().height+12;
    window.scrollTo({top:Math.max(0,target.getBoundingClientRect().top+window.scrollY-offset),behavior:'instant'});
  });};
  const nav=$('fieldNav');nav.querySelector('[data-pane="peds"]')?.remove();nav.querySelector('[data-pane="calc"]').after(nav.querySelector('[data-pane="critical"]'));
  const refButton=nav.querySelector('[data-pane="dir"]');refButton.childNodes.forEach(n=>{if(n.nodeType===Node.TEXT_NODE)n.textContent='Reference';});
  for(const b of nav.querySelectorAll('button')){b.type='button';b.onclick=()=>b.dataset.pane==='calc'&&UI.goHome?UI.goHome():switchPane(b.dataset.pane);}
  $('critClose').innerHTML=icons.arrow+'Calculator';$('critClose').onclick=()=>UI.goHome?UI.goHome():switchPane('calc');$('critClose').setAttribute('aria-label','Exit Critical and return to the Calculator home');
  const basePaths=renderCritPaths;renderCritPaths=function(){
    basePaths();$('critChangeLabel').textContent=critPickerMode?'Close chooser':'Change condition';
    for(const button of $('critical').querySelectorAll('[data-path]')){const path=CRIT_PATHS.find(p=>p.id===button.dataset.path);if(path)button.innerHTML=esc(path.label).replace('Bronchoconstriction','Broncho<wbr>constriction');}
  };
  const baseCritical=renderCritGrid;
  renderCritGrid=function(){
    baseCritical();const path=critPath();
    // Keep resuscitation timing/checklists at the top. In other pathways the
    // unchanged supporting overview follows treatment, without hiding it.
    if(path&&!['arrest','rosc'].includes(path.id)){
      const overview=$('critContent').querySelector('.crit-overview'),treatment=$('crit-treatment');
      if(overview&&treatment)treatment.after(overview);
    }
    sync();
  };
  function sync(){
    document.body.dataset.fieldPane=activePane;
    for(const b of nav.querySelectorAll('[data-pane]')){const on=b.dataset.pane===(activePane==='peds'?'dir':activePane);b.classList.toggle('on',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
    for(const b of document.querySelectorAll('[data-reference-pane]'))b.setAttribute('aria-pressed',String(b.dataset.referencePane===activePane));
    nav.inert=false;nav.setAttribute('aria-label',activePane==='critical'?'App navigation — Critical active':'App navigation');
  }
  if('ResizeObserver'in window)new ResizeObserver(()=>document.documentElement.style.setProperty('--field-header-height',header.getBoundingClientRect().height+'px')).observe(header);
  if(readFieldProfile().daylight==null)applyDaylight(true);
  S.entryCollapsed=true;renderEntryState();renderPtBar();renderPeds();syncDisplayControls();sync();
})();
