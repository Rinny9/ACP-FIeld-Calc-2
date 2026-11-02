/* Home is a directory of the existing directives, not a second clinical engine. */
(() => {
  'use strict';
  const ui = window.FIELD_UI = window.FIELD_UI || {};
  const base = {
    renderResults: window.renderResults,
    selectCase: window.selectCase,
    updateCalcSearch: window.updateCalcSearch,
    useExactCalc: window.useExactCalc,
    newPatient: window.newPatient
  };
  const state = {mode:'directory',query:'',selectedId:null,directoryScroll:0,detailScroll:{}};
  const criticalIds = {
    arrest:'arrest',nrp:'newborn',rosc:'rosc',hyperk:'hyperk',brady:'brady',
    tachy:'tachy',cshock:'cshock',bronch:'bronch',acpe:'acpe',psed:'psed',
    allergy:'allergy',croup:'croup',seizure:'seizure',hypogly:'hypogly',
    opioid:'opioid',adrenal:'adrenal',analgesia:'pain',combative:'combative',ob:'ob'
  };
  const guardedCriticalRows = new Set(['brady','cshock','tachy']);
  const byName = (a,b) => a.n.localeCompare(b.n,'en',{sensitivity:'base'});
  const directives = DIR.slice().sort(byName);
  let container, browse, detail, search, directoryList, count;

  function shellSync(){ if(typeof ui.sync==='function')ui.sync(); }
  function rememberScroll(){
    if(activePane!=='calc')return;
    if(state.mode==='directory')state.directoryScroll=window.scrollY;
    else if(state.mode==='detail'&&state.selectedId)state.detailScroll[state.selectedId]=window.scrollY;
  }
  function ensureHome(){
    if(container?.isConnected)return;
    const workflow=document.getElementById('workflow');
    if(!workflow)return;
    container=document.createElement('section');
    container.id='homeDirectory';container.className='home-directory';
    container.setAttribute('aria-label','Medical directive directory');
    container.innerHTML=`<div id="homeDirectoryBrowse">
      <div class="home-heading"><div><h1>Medical directives</h1><p>All medical directives, A–Z.</p></div></div>
      <div class="home-search"><label for="homeSearch">Find a directive or medication</label><input id="homeSearch" type="search" inputmode="search" autocomplete="off" placeholder="Search directives or medications" style="font-size:16px"><button class="home-action" type="button" id="homeClearSearch" hidden>Clear search</button></div>
      <div class="home-directory-toolbar"><p id="homeDirectoryCount" role="status" aria-live="polite"></p><button class="home-action" type="button" data-home-all>All calculations</button></div><div id="homeDirectiveList"></div>
      </div><div id="homeDirectiveDetail" class="home-detail" hidden></div>`;
    workflow.before(container);
    browse=container.querySelector('#homeDirectoryBrowse');detail=container.querySelector('#homeDirectiveDetail');
    search=container.querySelector('#homeSearch');directoryList=container.querySelector('#homeDirectiveList');count=container.querySelector('#homeDirectoryCount');
    search.value=state.query;
    search.addEventListener('input',()=>{state.query=search.value;renderDirectory();});
    container.querySelector('#homeClearSearch').addEventListener('click',()=>{state.query='';search.value='';renderDirectory();search.focus({preventScroll:true});});
    container.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button||!container.contains(button))return;
      if(button.dataset.homeDirective)openDirective(button.dataset.homeDirective);
      else if(button.hasAttribute('data-home-back'))goHome();
      else if(button.hasAttribute('data-home-all'))showAllCalculations();
      else if(button.hasAttribute('data-home-edit'))editPatient();
    });
  }
  function renderDirectory(){
    if(!directoryList)return;
    const raw=state.query.toLocaleLowerCase().trim(),query=SEARCH_ALIASES[raw]||raw;
    const matches=directives.filter(d=>!query||[d.n,d.ind,...(d.tx||[]),d.cc||''].join(' ').toLocaleLowerCase().includes(query));
    let last='',html='';
    for(const d of matches){
      const letter=d.n.slice(0,1).toLocaleUpperCase();
      if(letter!==last){html+=`<h2 class="home-letter" id="home-letter-${esc(letter)}">${esc(letter)}</h2>`;last=letter;}
      html+=`<button type="button" class="home-directive-row" data-home-directive="${esc(d.id)}"><span>${esc(d.n)}</span><small>${d.tag==='core'?'ACP core':'Auxiliary'} · ${esc(d.pg)}</small><span aria-hidden="true">›</span></button>`;
    }
    directoryList.innerHTML=html||'<p class="home-empty">No directive matches. Try another condition or medication.</p>';
    count.textContent=`${matches.length} of ${directives.length} directives${raw?' · searching all directives':''}`;
    container.querySelector('#homeClearSearch').hidden=!state.query;
  }
  function mappedRows(d,p){
    const drugs=drugCalcs(p),rows=[];
    for(const [section,items] of Object.entries(drugs))for(const row of items||[]){
      const names=ROW_DIR[section+'|'+row.name]||ROW_DIR[row.name]||SEC_DIR_DEFAULT[section]||[];
      if(names.includes(d.n))rows.push(row);
    }
    return rows;
  }
  function calculationsFor(d,p){
    // The shared cardiac dopamine array also contains ROSC-eligible pediatric
    // values. Never merge that array back into adult Brady/shock destinations.
    if(guardedCriticalRows.has(d.id)){
      const data=critRowsForPath(p,criticalIds[d.id]);
      return{rows:data.rows,electrical:data.electrical||[]};
    }
    // Exact directive mapping retains all existing rows, including the complete
    // opioid-withdrawal reference and the additional medical-arrest branches.
    return{rows:mappedRows(d,p),electrical:[]};
  }
  function patientNotices(p,id){
    const criticalId=criticalIds[id];
    if(criticalId)return critWarnings(p,criticalId);
    let html='';
    if(S.validation.length)html+=`<div class="warnbanner red"><b>Verify patient:</b> ${S.validation.map(esc).join(' ')}</div>`;
    if(p?.weightSrc&&p.weightSrc!=='entered')html+=`<div class="warnbanner"><b>Estimated weight in use:</b> ${esc(fmt(p.weightKg))} kg from ${esc(p.weightSrc)}. Confirm an actual weight and independently cross-check every dose.</div>`;
    if(p?.ageYears==null)html+='<div class="warnbanner red"><b>Age unknown:</b> age-gated calculations remain unavailable. Do not infer adult eligibility from weight.</div>';
    if(p?.weightKg==null)html+='<div class="warnbanner"><b>Weight required:</b> weight-based doses and draw volumes cannot be populated.</div>';
    return html;
  }
  function renderDetail(){
    const d=DIR.find(item=>item.id===state.selectedId);
    if(!d){state.mode='directory';renderDirectory();return;}
    const p=S.pt,hasPatient=!!p&&(p.ageYears!=null||p.weightKg!=null),valid=hasPatient&&!S.validation.length;
    const data=valid?calculationsFor(d,p):{rows:[],electrical:[]};
    const pediatricChart=d.id==='tachy'&&p?.ageYears!=null&&p.ageYears<18;
    let html=`<div class="home-heading"><div><button type="button" class="home-back" data-home-back>‹ All directives</button><h1 id="homeDetailTitle" tabindex="-1">${esc(d.n)}</h1><p>${d.tag==='core'?'ACP core':'Auxiliary'} · ${esc(d.pg)}</p></div>${hasPatient?'':'<button type="button" class="home-action" data-home-edit>Enter patient</button>'}</div>`;
    if(!hasPatient)html+='<div class="warnbanner"><b>Enter the patient to see applicable calculations.</b> The complete directive reference remains available below; selecting a directive does not establish treatment eligibility.</div>';
    else html+=patientNotices(p,d.id);
    if(d.patch)html+=`<div class="warnbanner"><b>Patch point</b><br>${referenceHTML(d.patch)}</div>`;
    if(REFERENCE_REVIEW[d.id])html+=`<div class="warnbanner red">${referenceHTML(REFERENCE_REVIEW[d.id])}</div>`;
    if(data.rows.length){
      html+=`<section class="home-calculations" aria-labelledby="homeCalculationTitle"><h2 id="homeCalculationTitle">${pediatricChart?'Pediatric BHP patch-reference values':'Patient-specific calculations'}</h2><p>${pediatricChart?'Published chart-band values for BHP consultation, not exact patient calculations or authorization to treat.':'Apply the full directive conditions, contraindications and patch requirements. Calculated values do not establish eligibility.'}</p><div class="home-dose-list">${data.rows.map(row=>calculatorRowHTML({...row,directive:d.n})).join('')}</div></section>`;
    }else{
      html+=`<section class="home-calculations home-reference-only"><h2 id="homeCalculationTitle">${hasPatient?'No patient-specific treatment calculation available':'Directive reference'}</h2><p>${hasPatient?'No calculated treatment card is returned for this directive and the entered patient. Confirm patient data and directive eligibility; do not infer a dose from another pathway.':'Enter age and weight to populate supported calculations. This reference can still be read without a patient.'}</p><button type="button" class="home-action" data-home-all>Open all calculations</button></section>`;
    }
    if(data.electrical.length)html+=`<section class="home-calculations"><h2>Pediatric electrical therapy — BHP patch reference</h2>${data.electrical.map(calculatorRowHTML).join('')}</section>`;
    // The separate References tab contains its own copy of this card. Keep
    // accordion target IDs unique while preserving the original renderer.
    const reference=document.createElement('template');
    reference.innerHTML=dirCardHTML(d,true).replaceAll(`"directive-${d.id}"`,`"home-reference-directive-${d.id}"`);
    const referenceButton=reference.content.querySelector('button.dhead');
    if(referenceButton){
      const heading=document.createElement('div');heading.className=referenceButton.className;
      heading.append(...referenceButton.childNodes);heading.querySelector('.dchevron')?.remove();
      referenceButton.replaceWith(heading);
    }
    html+=`<section class="home-reference" aria-labelledby="homeReferenceTitle"><h2 id="homeReferenceTitle">Full directive reference</h2>${reference.innerHTML}</section>`;
    detail.innerHTML=html;
  }
  function renderHome(){
    ensureHome();if(!container)return;
    const calculations=state.mode==='calculations';
    container.hidden=calculations;
    document.getElementById('workflow').hidden=!calculations;
    document.getElementById('results').hidden=!calculations;
    if(calculations)return;
    browse.hidden=state.mode!=='directory';detail.hidden=state.mode!=='detail';
    container.dataset.homeMode=state.mode;
    container.dataset.selectedDirective=state.selectedId||'';
    if(state.mode==='directory')renderDirectory();else renderDetail();
  }
  function editPatient(){
    if(typeof ui.editPatient==='function'){ui.editPatient();return;}
    S.entryCollapsed=false;renderEntryState();switchPane('calc');
    requestAnimationFrame(()=>document.getElementById('ageIn')?.focus({preventScroll:true}));
  }
  function openDirective(id){
    if(!DIR.some(d=>d.id===id))return false;
    rememberScroll();state.mode='detail';state.selectedId=id;S.uiDirective=id;
    resetPedsExact();S.query='';document.getElementById('calcSearch').value='';
    switchPane('calc');renderResults();
    requestAnimationFrame(()=>{
      if(state.mode!=='detail'||state.selectedId!==id)return;
      window.scrollTo(0,state.detailScroll[id]||0);
      document.getElementById('homeDetailTitle')?.focus({preventScroll:true});
    });
    return true;
  }
  function goHome(){
    rememberScroll();state.mode='directory';S.uiDirective=null;
    switchPane('calc');renderResults();
    requestAnimationFrame(()=>{
      if(state.mode!=='directory')return;
      window.scrollTo(0,state.directoryScroll);
      const selected=state.selectedId&&container.querySelector(`[data-home-directive="${state.selectedId}"]`);
      (selected||search)?.focus({preventScroll:true});
    });
  }
  function leaveDirectory(){
    rememberScroll();state.mode='calculations';S.uiDirective=null;
    renderHome();
  }
  function showAllCalculations(){
    leaveDirectory();switchPane('calc');window.selectCase('all');
  }

  window.renderResults=function(...args){
    if(state.mode==='calculations'){
      const results=document.getElementById('results');
      if(S.validation.length){
        // Entry now lives in a dialog. Closing it must not hide a validation
        // failure while leaving partially populated treatment cards available.
        renderWorkflow();results.dataset.patientValidation='blocked';
        results.innerHTML=`<div class="warnbanner red" role="alert"><b>Verify patient details before using calculations.</b><p>${S.validation.map(esc).join(' ')}</p><button type="button" class="home-action" id="homeInvalidPatientEdit">Review patient details</button></div>`;
        results.querySelector('#homeInvalidPatientEdit').onclick=editPatient;
      }else{
        delete results.dataset.patientValidation;
        base.renderResults.apply(this,args);
      }
    }
    renderHome();shellSync();
  };
  window.selectCase=function(...args){leaveDirectory();return base.selectCase.apply(this,args);};
  window.updateCalcSearch=function(...args){leaveDirectory();return base.updateCalcSearch.apply(this,args);};
  window.useExactCalc=function(...args){
    leaveDirectory();const result=base.useExactCalc.apply(this,args);
    // The legacy handoff focuses inline inputs. They now live in a dialog:
    // open it when patient entry is needed without clearing the selected drug.
    if(!S.pt||(S.pt.ageYears==null&&S.pt.weightKg==null)||S.validation.length)editPatient();
    return result;
  };
  window.newPatient=function(...args){
    const before=S.pt,result=base.newPatient.apply(this,args);
    // Accepted resets rebuild S.pt; cancelling leaves the encounter untouched.
    if(S.pt!==before&&S.ageVal==null&&S.wtVal==null&&S.tool==null){
      Object.assign(state,{mode:'directory',query:'',selectedId:null,directoryScroll:0,detailScroll:{}});
      S.uiDirective=null;if(search)search.value='';renderResults();
    }
    return result;
  };
  const resetButton=document.getElementById('newPtTop');
  // Keep the shell's accepted-reset dialog/focus cleanup. Its handler calls the
  // wrapped global function; only a directly bound legacy handler needs repair.
  if(resetButton.onclick===base.newPatient)resetButton.onclick=window.newPatient;
  Object.assign(ui,{goHome,openDirective,showAllCalculations});
  Object.defineProperty(ui,'directoryState',{configurable:true,get:()=>({mode:state.mode,query:state.query,selectedId:state.selectedId,directoryScroll:state.directoryScroll})});
  // Exposed for read-only regression checks; values still come from the shared
  // engine, never from an alternate formula or hand-copied dose table.
  ui.directiveCalculations=(id,p=S.pt)=>{const d=DIR.find(item=>item.id===id);return d&&p?calculationsFor(d,p):{rows:[],electrical:[]};};
  renderResults();
})();
