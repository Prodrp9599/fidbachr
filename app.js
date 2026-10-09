(() => {
  'use strict';
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const KEY = 'fidbachr-video-clean-v1';
  const FRAME = 1/30;
  const types = { blocker:'Must fix', major:'Change', suggestion:'Suggestion' };

  const fresh = () => ({ review:null, role:'reviewer', feedback:[], selectedId:null, editingId:null });
  let state = load();
  let videoUrl = null;
  let duration = 0;
  let ctrlDown = false;
  let draft = null;
  let gesture = null;

  function load(){ try{const v=JSON.parse(localStorage.getItem(KEY)); return v?.version===1 ? {...fresh(),...v.state} : fresh();}catch{return fresh();} }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify({version:1,state:{...state,review:state.review?{...state.review,fileName:state.review.fileName}:null}})); }catch(_){} }
  function toast(t){const el=$('#toast'); if(!el)return; el.textContent=t; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),1500);}
  function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function ft(s=0){const m=Math.floor(s/60), sec=Math.floor(s%60), tenth=Math.floor((s%1)*10); return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${tenth}`;}
  function sevClass(s){return s==='blocker'?'blocker':s==='suggestion'?'suggestion':'';}

  function render(){
    $('#app').innerHTML = state.review ? reviewHtml() : homeHtml();
    if(state.review) bindReview(); else bindHome();
  }

  function homeHtml(){return `<div class="home"><div class="home-card"><div class="eyebrow">FIDBACHR · VIDEO PROTOTYPE</div><h1>Review video by pointing at it.</h1><p>Normal mouse controls playback. Hold <b>Ctrl</b> (or ⌘ on Mac) while clicking or dragging over the video to create feedback.</p><div class="upload"><div><strong>Upload a video / reel</strong><span>MP4, WebM, MOV if your browser can play it.</span></div><button class="btn primary" id="uploadBtn">Choose video</button></div></div></div>`;}
  function bindHome(){
    $('#uploadBtn').onclick=()=>$('#videoPicker').click();
    $('#videoPicker').onchange=e=>{const f=e.target.files?.[0]; if(!f)return; attachNew(f); e.target.value='';};
  }
  function attachNew(file){ if(videoUrl) URL.revokeObjectURL(videoUrl); videoUrl=URL.createObjectURL(file); state=fresh(); state.review={title:file.name.replace(/\.[^.]+$/,''),fileName:file.name,version:1}; save(); render(); }

  function reviewHtml(){
    const resolved=state.feedback.filter(x=>x.status==='resolved').length;
    return `<div class="shell"><header class="topbar"><div class="brand"><b>f</b>fidbachr</div><div class="crumb">${esc(state.review.title)} · V${state.review.version}</div><div class="top-actions"><div class="role-switch"><button data-role="reviewer" class="${state.role==='reviewer'?'active':''}">Reviewer</button><button data-role="creator" class="${state.role==='creator'?'active':''}">Creator preview</button></div><button class="btn" id="newBtn">New video</button></div></header><main class="layout"><section class="workspace"><div class="asset-head"><div><div class="eyebrow">VIDEO / REEL</div><h1>${esc(state.review.title)}</h1></div><div class="meta">${resolved} / ${state.feedback.length} resolved</div></div><div class="player-shell" id="playerShell"><div class="video-wrap" id="videoWrap"><video id="video" controls playsinline></video><div class="annotation-layer" id="layer"></div><div id="gutters"></div><div class="keyboard-hint">Space Play/Pause · Esc Cancel · ← → Frame · Ctrl+mouse Review</div></div></div><div class="timeline-wrap"><div class="timeline-meta"><span id="timeRead">00:00.0 / 00:00.0</span><span>Ctrl + click/drag to comment</span></div><div class="timeline" id="timeline"><div class="played" id="played"></div><div id="timelineMarks"></div></div></div></section><aside class="side"><div class="side-head"><div><div class="eyebrow">${state.role==='reviewer'?'YOUR REVIEW':'CHANGE LIST'}</div><h2>Feedback</h2></div><span class="count">${state.feedback.length}</span></div><div id="feedbackHost">${feedbackHtml()}</div></aside></main></div>`;
  }

  function feedbackHtml(){
    if(!state.feedback.length) return `<div class="empty">No feedback yet.<br><br>Hold <b>Ctrl</b> and click or drag directly on the video.</div>`;
    return `<div class="feedback-list">${state.feedback.map(item=>feedbackCard(item)).join('')}</div>`;
  }
  function feedbackCard(item){
    if(state.editingId===item.id && state.role==='reviewer') return `<article class="feedback editbox"><div class="fmeta"><span>${ft(item.start)}</span><b>Edit feedback</b></div><textarea data-edit-text="${item.id}">${esc(item.text)}</textarea><div class="editrow"><select data-edit-sev="${item.id}">${Object.entries(types).map(([k,v])=>`<option value="${k}" ${k===item.severity?'selected':''}>${v}</option>`).join('')}</select><select data-edit-cat="${item.id}">${['Editing','Content','Design','Audio','Branding','Technical'].map(v=>`<option ${v===item.category?'selected':''}>${v}</option>`).join('')}</select></div><div class="actions"><button class="small" data-act="cancel-edit" data-id="${item.id}">Cancel</button><button class="small primary" data-act="save-edit" data-id="${item.id}">Save</button></div></article>`;
    const range=item.end-item.start>.12;
    const where=range?`${ft(item.start)} → ${ft(item.end)}`:ft(item.start);
    const shape=item.mark.type==='area'?'Selected area':'Point';
    let statusActions='';
    if(state.role==='creator'){
      if(item.status==='open') statusActions=`<button class="small" data-act="working" data-id="${item.id}">Start work</button><button class="small primary" data-act="ready" data-id="${item.id}">Ready</button>`;
      else if(item.status==='working') statusActions=`<button class="small primary" data-act="ready" data-id="${item.id}">Ready for review</button>`;
      else if(item.status==='ready') statusActions=`<button class="small" data-act="working" data-id="${item.id}">Continue</button>`;
      else statusActions=`<span class="loc">Verified</span>`;
    } else {
      if(item.status==='ready') statusActions=`<button class="small primary" data-act="resolve" data-id="${item.id}">Verify & resolve</button><button class="small" data-act="reopen" data-id="${item.id}">Send back</button>`;
      else if(item.status==='resolved') statusActions=`<button class="small" data-act="reopen" data-id="${item.id}">Reopen</button>`;
      else statusActions=`<button class="small" data-act="resolve" data-id="${item.id}">Resolve</button>`;
    }
    return `<article class="feedback ${state.selectedId===item.id?'selected':''} ${item.status==='resolved'?'resolved':''}" data-card="${item.id}"><button class="feedback-jump" data-act="jump" data-id="${item.id}" style="all:unset;display:block;cursor:pointer;width:100%"><div class="fmeta"><span class="sev ${sevClass(item.severity)}"></span><span>${types[item.severity]}</span><span>· ${esc(item.category)}</span><span class="status">${item.status}</span></div><p>${esc(item.text)}</p><div class="loc">${where} · ${shape}</div></button><div class="actions">${state.role==='reviewer'?`<button class="small" data-act="edit" data-id="${item.id}">Edit</button><button class="small danger" data-act="delete" data-id="${item.id}">Delete</button>`:''}${statusActions}</div></article>`;
  }

  function bindReview(){
    $$('.role-switch button').forEach(b=>b.onclick=()=>{state.role=b.dataset.role; save(); rerenderKeepingPlayback();});
    $('#newBtn').onclick=()=>{if(videoUrl)URL.revokeObjectURL(videoUrl);videoUrl=null;state=fresh();save();render();setTimeout(()=>$('#videoPicker').click(),0)};
    $('#videoPicker').onchange=e=>{const f=e.target.files?.[0];if(!f)return;if(videoUrl)URL.revokeObjectURL(videoUrl);videoUrl=URL.createObjectURL(f);state.review.fileName=f.name;save();mountVideo();e.target.value='';};
    bindFeedbackActions();
    mountVideo();
  }

  let restorePlayback=null;
  function rerenderKeepingPlayback(){
    const v=$('#video'); if(v) restorePlayback={time:v.currentTime,paused:v.paused,volume:v.volume}; render();
  }

  function mountVideo(){
    const v=$('#video'); if(!v)return;
    if(!videoUrl){ v.outerHTML=`<div style="display:grid;place-items:center;width:100%;height:100%;color:#8f98a7"><button class="btn primary" id="reselect">Re-select ${esc(state.review.fileName)}</button></div>`; $('#reselect').onclick=()=>$('#videoPicker').click(); return; }
    v.src=videoUrl;
    v.onloadedmetadata=()=>{duration=v.duration||0; if(restorePlayback){v.currentTime=Math.min(restorePlayback.time,duration||restorePlayback.time);v.volume=restorePlayback.volume??1;} syncGeometry(); updateTimeline(); if(restorePlayback&&!restorePlayback.paused)v.play().catch(()=>{}); restorePlayback=null;};
    v.ontimeupdate=()=>{updateTimeline(); renderMarks(); updateLiveRange();};
    v.onplay=()=>{updateCtrlVisual();}; v.onpause=()=>{updateCtrlVisual();};
    v.onclick=e=>{ if(ctrlDown)return; const r=v.getBoundingClientRect(); if(e.clientY-r.top>r.height-48)return; togglePlayback(); };
    $('#timeline').onclick=e=>{if(e.target.closest('[data-tl]'))return; const r=e.currentTarget.getBoundingClientRect(); v.currentTime=((e.clientX-r.left)/r.width)*(v.duration||duration||0);};
    setupAnnotation();
    syncGeometry(); renderFeedbackHost(); updateCtrlVisual();
  }

  function displayedContentRect(v){
    const r=v.getBoundingClientRect(); const controls=48; const ah=Math.max(1,r.height-controls); const mr=(v.videoWidth&&v.videoHeight)?v.videoWidth/v.videoHeight:r.width/ah; const br=r.width/ah;
    let w,h,l,t; if(br>mr){h=ah;w=h*mr;l=r.left+(r.width-w)/2;t=r.top;} else {w=r.width;h=w/mr;l=r.left;t=r.top+(ah-h)/2;} return {left:l,top:t,width:w,height:h,right:l+w,bottom:t+h};
  }
  function syncGeometry(){
    const shell=$('#playerShell'),v=$('#video'),layer=$('#layer'),gh=$('#gutters'); if(!shell||!v||!layer||!gh||!v.getBoundingClientRect)return;
    const sr=shell.getBoundingClientRect(), cr=displayedContentRect(v); Object.assign(layer.style,{left:`${cr.left-sr.left}px`,top:`${cr.top-sr.top}px`,width:`${cr.width}px`,height:`${cr.height}px`});
    gh.innerHTML=''; const x=cr.left-sr.left,y=cr.top-sr.top,w=cr.width,h=cr.height,SW=sr.width,SH=sr.height; const rects=[{l:0,t:0,w:x,h:SH},{l:x+w,t:0,w:SW-(x+w),h:SH},{l:x,t:0,w,t2:y,h:y},{l:x,t:y+h,w,h:SH-(y+h)}];
    rects.forEach(o=>{const ww=o.w??w,hh=o.h; if(ww<=1||hh<=1)return; const d=document.createElement('div');d.className='gutter';Object.assign(d.style,{left:`${o.l}px`,top:`${o.t}px`,width:`${ww}px`,height:`${hh}px`});d.onclick=togglePlayback;gh.appendChild(d);});
    updateCtrlVisual(); renderMarks();
  }

  function updateCtrlVisual(){
    const shell=$('#playerShell'), layer=$('#layer'); if(!shell||!layer)return; const active=ctrlDown&&state.role==='reviewer'; shell.classList.toggle('review-modifier',active); layer.classList.toggle('ctrl-active',active); layer.style.cursor=active?'crosshair':'default';
  }

  function setupAnnotation(){
    const layer=$('#layer'); if(!layer)return;
    layer.onpointerdown=e=>{
      if(!ctrlDown||state.role!=='reviewer'||e.target.closest('.popover,.mark-btn'))return;
      e.preventDefault(); e.stopPropagation(); layer.setPointerCapture?.(e.pointerId); const p=pt(e,layer); const v=$('#video'); gesture={pointerId:e.pointerId,startPoint:p,lastPoint:p,startTime:v?.currentTime||0,startedPlaying:!!v&&!v.paused}; draft=null; renderMarks(); updateLiveRange();
    };
    layer.onpointermove=e=>{ if(!gesture||gesture.pointerId!==e.pointerId)return; gesture.lastPoint=pt(e,layer); renderMarks(); };
    layer.onpointerup=e=>{ if(!gesture||gesture.pointerId!==e.pointerId)return; e.preventDefault(); e.stopPropagation(); const v=$('#video'); gesture.lastPoint=pt(e,layer); const start=gesture.startPoint,end=gesture.lastPoint; const box=boxFrom(start,end); const isArea=box.w>2||box.h>2; const endTime=Math.max(gesture.startTime,v?.currentTime||gesture.startTime); draft={start:gesture.startTime,end:endTime,mark:isArea?{type:'area',...box}:{type:'point',x:end.x,y:end.y},anchor:end,severity:'major',category:'Editing'}; gesture=null; renderMarks(); setTimeout(()=>$('#draftText')?.focus(),0); };
  }
  function pt(e,el){const r=el.getBoundingClientRect();return{x:Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)),y:Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100))};}
  function boxFrom(a,b){return{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)};}

  function renderMarks(){
    const layer=$('#layer'),v=$('#video');if(!layer||!v)return; const t=v.currentTime||0; const visible=state.feedback.filter(i=>i.mark&&(i.id===state.selectedId||(t>=i.start-.04&&t<=i.end+.04)||(i.end-i.start<=.12&&Math.abs(t-i.start)<=.15)));
    layer.innerHTML=visible.map((i,n)=>markHtml(i,n+1)).join('')+(gesture?gestureHtml():draft?draftHtml():''); bindMarkUi();
  }
  function markHtml(i,n){const cls=sevClass(i.severity); if(i.mark.type==='area')return `<button class="mark-btn mark-area ${cls} ${state.selectedId===i.id?'selected':''}" data-mark="${i.id}" style="left:${i.mark.x}%;top:${i.mark.y}%;width:${Math.max(i.mark.w,2.4)}%;height:${Math.max(i.mark.h,2.4)}%"><span class="mark-point ${cls}">${n}</span></button>`; return `<button class="mark-btn mark-point ${cls} ${state.selectedId===i.id?'selected':''}" data-mark="${i.id}" style="left:${i.mark.x}%;top:${i.mark.y}%">${n}</button>`;}
  function gestureHtml(){const b=boxFrom(gesture.startPoint,gesture.lastPoint); if(b.w>2||b.h>2)return `<div class="draft-shape draft-area" style="left:${b.x}%;top:${b.y}%;width:${Math.max(b.w,2)}%;height:${Math.max(b.h,2)}%"></div>`;return `<div class="draft-shape draft-point" style="left:${gesture.lastPoint.x}%;top:${gesture.lastPoint.y}%"></div>`;}
  function draftHtml(){const m=draft.mark;const shape=m.type==='area'?`<div class="draft-shape draft-area" style="left:${m.x}%;top:${m.y}%;width:${Math.max(m.w,2)}%;height:${Math.max(m.h,2)}%"></div>`:`<div class="draft-shape draft-point" style="left:${m.x}%;top:${m.y}%"></div>`; const left=Math.max(16,Math.min(84,draft.anchor.x)),top=Math.max(18,Math.min(76,draft.anchor.y));const isRange=draft.end-draft.start>.12;return `${shape}<div class="popover" style="left:${left}%;top:${top}%"><div class="quick-types">${Object.entries(types).map(([k,v])=>`<button data-dsev="${k}" class="${draft.severity===k?'active':''}">${v}</button>`).join('')}</div><textarea id="draftText" placeholder="What should change?"></textarea><div class="pop-row"><select id="draftCat">${['Editing','Content','Design','Audio','Branding','Technical'].map(x=>`<option ${draft.category===x?'selected':''}>${x}</option>`).join('')}</select><span class="range-chip">${isRange?`${ft(draft.start)} → ${ft(draft.end)}`:'Frame'}</span><button class="cancel" data-cancel>Esc</button><button class="save" data-save>Save</button></div></div>`;}
  function bindMarkUi(){
    $$('[data-mark]').forEach(b=>b.onclick=e=>{e.stopPropagation();jump(Number(b.dataset.mark));});
    $$('[data-dsev]').forEach(b=>b.onclick=e=>{e.stopPropagation();draft.severity=b.dataset.dsev;renderMarks();setTimeout(()=>$('#draftText')?.focus(),0)});
    $('[data-cancel]')?.addEventListener('click',e=>{e.stopPropagation();cancelTransient();});
    $('[data-save]')?.addEventListener('click',e=>{e.stopPropagation();saveDraft();});
  }
  function saveDraft(){const text=$('#draftText')?.value.trim();if(!text)return toast('Type the change first'); const item={id:Date.now(),text,severity:draft.severity,category:$('#draftCat')?.value||'Editing',start:draft.start,end:draft.end,mark:{...draft.mark},status:'open'};state.feedback.push(item);state.selectedId=item.id;draft=null;save();renderFeedbackHost();updateTimeline();renderMarks();toast('Feedback saved');}
  function cancelTransient(){if(gesture){gesture=null;renderMarks();return true}if(draft){draft=null;renderMarks();return true}if(state.editingId){state.editingId=null;renderFeedbackHost();return true}return false;}
  function updateLiveRange(){let el=$('#liveRange'); const shell=$('#playerShell'); if(!gesture){el?.remove();return;} if(!el){el=document.createElement('div');el.id='liveRange';el.className='range-live';shell?.appendChild(el);} const t=$('#video')?.currentTime||gesture.startTime;el.innerHTML=`<b>Review range</b> ${ft(gesture.startTime)} → ${ft(Math.max(t,gesture.startTime))}`;}

  function updateTimeline(){const v=$('#video');if(!v)return;const d=v.duration||duration||0,t=v.currentTime||0;$('#timeRead').textContent=`${ft(t)} / ${ft(d)}`;$('#played').style.width=d?`${t/d*100}%`:'0%';const host=$('#timelineMarks');if(!host)return;host.innerHTML=state.feedback.map(i=>{const s=d?i.start/d*100:0,e=d?i.end/d*100:s,range=i.end-i.start>.12;if(range)return `<button class="tl-range ${sevClass(i.severity)}" data-tl="${i.id}" style="left:${s}%;width:${Math.max(.6,e-s)}%"></button>`;return `<button class="tl-dot ${sevClass(i.severity)}" data-tl="${i.id}" style="left:${s}%"></button>`;}).join('');$$('[data-tl]').forEach(b=>b.onclick=e=>{e.stopPropagation();jump(Number(b.dataset.tl));});}
  function jump(id){const i=state.feedback.find(x=>x.id===id),v=$('#video');if(!i||!v)return;state.selectedId=id;v.currentTime=i.start;v.pause();save();renderFeedbackHost();renderMarks();updateTimeline();}
  function renderFeedbackHost(){const h=$('#feedbackHost');if(h){h.innerHTML=feedbackHtml();bindFeedbackActions();}const c=$('.count');if(c)c.textContent=state.feedback.length;}
  function bindFeedbackActions(){$$('[data-act]').forEach(b=>b.onclick=()=>act(b.dataset.act,Number(b.dataset.id)));}
  function act(a,id){const i=state.feedback.find(x=>x.id===id);if(!i)return;if(a==='jump')return jump(id);if(a==='edit'){state.editingId=id;renderFeedbackHost();return}if(a==='cancel-edit'){state.editingId=null;renderFeedbackHost();return}if(a==='save-edit'){const t=$(`[data-edit-text="${id}"]`)?.value.trim();if(!t)return;i.text=t;i.severity=$(`[data-edit-sev="${id}"]`)?.value||i.severity;i.category=$(`[data-edit-cat="${id}"]`)?.value||i.category;state.editingId=null;save();renderFeedbackHost();renderMarks();updateTimeline();return}if(a==='delete'){state.feedback=state.feedback.filter(x=>x.id!==id);if(state.selectedId===id)state.selectedId=null;save();renderFeedbackHost();renderMarks();updateTimeline();return}if(a==='working')i.status='working';if(a==='ready')i.status='ready';if(a==='resolve')i.status='resolved';if(a==='reopen')i.status='open';save();renderFeedbackHost();}

  function togglePlayback(){const v=$('#video');if(!v)return;if(v.paused){v.play().catch(()=>{});flash('Ⅱ')}else{v.pause();flash('▶')}}
  function flash(s){const sh=$('#playerShell');if(!sh)return;$('.play-flash')?.remove();const e=document.createElement('div');e.className='play-flash';e.textContent=s;sh.appendChild(e);setTimeout(()=>e.remove(),450);}
  function step(dir,count=1){const v=$('#video');if(!v)return;cancelTransient();v.pause();v.currentTime=Math.max(0,Math.min(v.duration||duration,v.currentTime+dir*FRAME*count));}
  function isTyping(t){return !!t?.closest?.('input,textarea,select,[contenteditable="true"]');}

  document.addEventListener('keydown',e=>{
    if(e.key==='Control'||e.key==='Meta'){ctrlDown=true;updateCtrlVisual();return;}
    if(!state.review)return;
    if(e.key==='Escape'){if(cancelTransient()){e.preventDefault();e.stopPropagation()}return;}
    if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&draft){e.preventDefault();saveDraft();return;}
    if(isTyping(e.target))return;
    if(e.code==='Space'){e.preventDefault();togglePlayback();return;}
    if(e.key==='ArrowLeft'){e.preventDefault();step(-1,e.shiftKey?10:1);return;}
    if(e.key==='ArrowRight'){e.preventDefault();step(1,e.shiftKey?10:1);return;}
  },true);
  document.addEventListener('keyup',e=>{if(e.key==='Control'||e.key==='Meta'){ctrlDown=false;updateCtrlVisual();}},true);
  window.addEventListener('blur',()=>{ctrlDown=false;updateCtrlVisual();});
  window.addEventListener('resize',()=>requestAnimationFrame(syncGeometry));

  window.__fidbachrTest={snapshot:()=>JSON.parse(JSON.stringify(state)),draft:()=>draft,gesture:()=>gesture,ctrl:()=>ctrlDown};
  render();
})();
