import { upload } from 'https://esm.sh/@vercel/blob@2.8.1/client';

(() => {
  'use strict';
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const FRAME = 1/30;
  const types = { blocker:'Must fix', major:'Change', suggestion:'Suggestion' };
  const params = new URLSearchParams(location.search);
  const reviewId = params.get('review');
  const accessKey = params.get('key');
  const isMock = (location.hostname === '127.0.0.1' || location.hostname === 'localhost') && params.get('mock') === '1';

  let state = { review:null, capability:null, feedback:[], selectedId:null, editingId:null, reviewerKey:null, loading:Boolean(reviewId), saving:false };
  let videoUrl = null;
  let duration = 0;
  let ctrlDown = false;
  let draft = null;
  let gesture = null;
  let restorePlayback = null;
  let uploadProgress = 0;

  function toast(t){const el=$('#toast'); if(!el)return; el.textContent=t; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),1800);}
  function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function ft(s=0){const m=Math.floor(s/60), sec=Math.floor(s%60), tenth=Math.floor((s%1)*10); return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${tenth}`;}
  function sevClass(s){return s==='blocker'?'blocker':s==='suggestion'?'suggestion':'';}
  function role(){ return state.capability === 'creator' ? 'creator' : 'reviewer'; }
  function uid(){ return (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9-]/g,''); }

  async function api(path, options={}){
    const res = await fetch(path, { ...options, headers:{'Content-Type':'application/json', ...(options.headers||{})} });
    const data = await res.json().catch(()=>({}));
    if(!res.ok){ const e = new Error(data.error || `Request failed (${res.status})`); e.status=res.status; e.data=data; throw e; }
    return data;
  }

  async function loadReview(){
    if(isMock){
      const mock = JSON.parse(localStorage.getItem('fidbachr-mock-review')||'null');
      if(!mock){state.loading=false;render();return;}
      state={...state,review:mock.review,feedback:mock.review.feedback||[],capability:params.get('role')==='creator'?'creator':'reviewer',reviewerKey:'mock-reviewer',loading:false}; videoUrl=mock.review.videoUrl; render(); return;
    }
    try{
      const data=await api(`/api/review?id=${encodeURIComponent(reviewId)}&key=${encodeURIComponent(accessKey||'')}`,{headers:{}});
      state={...state,review:data.review,feedback:data.review.feedback||[],capability:data.capability,reviewerKey:data.reviewerKey||null,loading:false};
      videoUrl=data.review.videoUrl; render();
    }catch(e){state.loading=false;state.error=e.message;render();}
  }

  function render(){
    if(state.loading){ $('#app').innerHTML=`<div class="home"><div class="home-card center"><div class="spinner"></div><h2>Opening review…</h2></div></div>`; return; }
    if(state.error){ $('#app').innerHTML=`<div class="home"><div class="home-card"><div class="eyebrow">FIDBACHR</div><h1>Couldn’t open this review.</h1><p>${esc(state.error)}</p><a class="btn primary inline" href="/">Start a new review</a></div></div>`; return; }
    $('#app').innerHTML = state.review ? reviewHtml() : homeHtml();
    state.review ? bindReview() : bindHome();
  }

  function homeHtml(){return `<div class="home"><div class="home-card"><div class="eyebrow">FIDBACHR · PRIVATE BETA</div><h1>Send a reel for review.</h1><p>The creator uploads the video once. Fidbachr gives you a reviewer link that opens the same video and feedback on any device.</p><label class="field"><span>Review title</span><input id="titleInput" placeholder="e.g. MyEthos Reel 07"></label><div class="upload ${uploadProgress?'busy':''}"><div><strong id="fileLabel">Choose a video / reel</strong><span>MP4, WebM or MOV · up to 250 MB for this beta.</span>${uploadProgress?`<div class="upload-progress"><i style="width:${uploadProgress}%"></i></div>`:''}</div><button class="btn" id="chooseBtn">Choose file</button></div><button class="btn primary create-review" id="createBtn" disabled>Create review link</button><div class="beta-note">No reviewer account required. Google Drive import comes after this upload→share loop is proven.</div></div></div>`;}
  function bindHome(){
    let chosen=null;
    $('#chooseBtn').onclick=()=>$('#videoPicker').click();
    $('#videoPicker').onchange=e=>{chosen=e.target.files?.[0]||null;if(!chosen)return;$('#fileLabel').textContent=chosen.name;$('#titleInput').value ||= chosen.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ');$('#createBtn').disabled=false;e.target.value='';};
    $('#createBtn').onclick=async()=>{
      if(!chosen)return;
      const btn=$('#createBtn');btn.disabled=true;btn.textContent='Uploading…';
      try{
        let blob;
        if(isMock){ blob={url:URL.createObjectURL(chosen)}; }
        else {
          blob=await upload(`reviews/${Date.now()}-${chosen.name}`,chosen,{access:'public',handleUploadUrl:'/api/upload',multipart:true,onUploadProgress:p=>{uploadProgress=Math.round(p.percentage||0);const bar=$('.upload-progress i');if(bar)bar.style.width=`${uploadProgress}%`;}});
        }
        const title=$('#titleInput').value.trim()||chosen.name.replace(/\.[^.]+$/,'');
        let data;
        if(isMock){
          const id='mock12345',ownerKey='mock-owner',reviewerKey='mock-reviewer';const review={id,title,fileName:chosen.name,videoUrl:blob.url,videoSize:chosen.size,version:1,feedback:[],revision:1,createdAt:Date.now(),updatedAt:Date.now()};localStorage.setItem('fidbachr-mock-review',JSON.stringify({review}));data={id,ownerKey,reviewerKey,review,capability:'creator'};
        } else data=await api('/api/review',{method:'POST',body:JSON.stringify({action:'create',title,fileName:chosen.name,videoUrl:blob.url,videoSize:chosen.size})});
        location.href=`/?review=${encodeURIComponent(data.id)}&key=${encodeURIComponent(data.ownerKey)}&role=creator${isMock?'&mock=1':''}`;
      }catch(e){toast(e.message);btn.disabled=false;btn.textContent='Create review link';}
    };
  }

  function reviewerUrl(){
    if(role()!=='creator'||!state.reviewerKey)return null;
    const u=new URL(location.origin);u.searchParams.set('review',state.review.id);u.searchParams.set('key',state.reviewerKey);u.searchParams.set('role','reviewer');return u.toString();
  }
  function reviewHtml(){
    const resolved=state.feedback.filter(x=>x.status==='resolved').length;
    const creator=role()==='creator';
    return `<div class="shell"><header class="topbar"><div class="brand"><b>f</b>fidbachr</div><div class="crumb">${esc(state.review.title)} · V${state.review.version}</div><div class="top-actions"><span class="role-pill">${creator?'Creator / owner':'Reviewer'}</span>${creator?`<button class="btn" id="shareBtn">Share reviewer link</button>`:''}<a class="btn" href="/">New review</a></div></header><main class="layout"><section class="workspace"><div class="asset-head"><div><div class="eyebrow">VIDEO / REEL</div><h1>${esc(state.review.title)}</h1></div><div class="meta"><span id="saveState">${state.saving?'Saving…':'Synced'}</span> · ${resolved} / ${state.feedback.length} resolved</div></div><div class="player-shell" id="playerShell"><div class="video-wrap" id="videoWrap"><video id="video" controls playsinline></video><div class="annotation-layer" id="layer"></div><div id="gutters"></div><div class="keyboard-hint">Space Play/Pause · Esc Cancel · ← → Frame${creator?'':' · Ctrl+mouse Review'}</div></div></div><div class="timeline-wrap"><div class="timeline-meta"><span id="timeRead">00:00.0 / 00:00.0</span><span>${creator?'Creator view · work through the change list':'Hold Ctrl + click/drag to comment'}</span></div><div class="timeline" id="timeline"><div class="played" id="played"></div><div id="timelineMarks"></div></div></div></section><aside class="side"><div class="side-head"><div><div class="eyebrow">${creator?'CHANGE LIST':'YOUR REVIEW'}</div><h2>Feedback</h2></div><span class="count">${state.feedback.length}</span></div><div id="feedbackHost">${feedbackHtml()}</div></aside></main></div>`;
  }

  function feedbackHtml(){
    if(!state.feedback.length)return `<div class="empty">${role()==='creator'?'No feedback yet. Share the reviewer link and comments will appear here.':'No feedback yet.<br><br>Hold <b>Ctrl</b> and click or drag directly on the video.'}</div>`;
    return `<div class="feedback-list">${state.feedback.map(feedbackCard).join('')}</div>`;
  }
  function repliesHtml(item){return (item.replies||[]).map(r=>`<div class="thread-reply"><b>${esc(r.author)}</b><span>${esc(r.text)}</span></div>`).join('');}
  function feedbackCard(item){
    const creator=role()==='creator';
    if(state.editingId===item.id&&!creator)return `<article class="feedback editbox"><div class="fmeta"><span>${ft(item.start)}</span><b>Edit feedback</b></div><textarea data-edit-text="${item.id}">${esc(item.text)}</textarea><div class="editrow"><select data-edit-sev="${item.id}">${Object.entries(types).map(([k,v])=>`<option value="${k}" ${k===item.severity?'selected':''}>${v}</option>`).join('')}</select><select data-edit-cat="${item.id}">${['Editing','Content','Design','Audio','Branding','Technical'].map(v=>`<option ${v===item.category?'selected':''}>${v}</option>`).join('')}</select></div><div class="actions"><button class="small" data-act="cancel-edit" data-id="${item.id}">Cancel</button><button class="small primary" data-act="save-edit" data-id="${item.id}">Save</button></div></article>`;
    const range=item.end-item.start>.12,where=range?`${ft(item.start)} → ${ft(item.end)}`:ft(item.start),shape=item.mark?.type==='area'?'Selected area':'Point';
    let statusActions='';
    if(creator){if(item.status==='open')statusActions=`<button class="small" data-act="working" data-id="${item.id}">Start work</button><button class="small primary" data-act="ready" data-id="${item.id}">Ready</button>`;else if(item.status==='working')statusActions=`<button class="small primary" data-act="ready" data-id="${item.id}">Ready for review</button>`;else if(item.status==='ready')statusActions=`<button class="small" data-act="working" data-id="${item.id}">Continue</button>`;else statusActions=`<span class="loc">Verified by reviewer</span>`;}
    else {if(item.status==='ready')statusActions=`<button class="small primary" data-act="resolve" data-id="${item.id}">Verify & resolve</button><button class="small" data-act="reopen" data-id="${item.id}">Send back</button>`;else if(item.status==='resolved')statusActions=`<button class="small" data-act="reopen" data-id="${item.id}">Reopen</button>`;else statusActions=`<button class="small" data-act="resolve" data-id="${item.id}">Resolve</button>`;}
    return `<article class="feedback ${state.selectedId===item.id?'selected':''} ${item.status==='resolved'?'resolved':''}" data-card="${item.id}"><button class="feedback-jump" data-act="jump" data-id="${item.id}" style="all:unset;display:block;cursor:pointer;width:100%"><div class="fmeta"><span class="sev ${sevClass(item.severity)}"></span><span>${types[item.severity]}</span><span>· ${esc(item.category)}</span><span class="status">${item.status}</span></div><p>${esc(item.text)}</p><div class="loc">${where} · ${shape}</div></button><div class="actions">${!creator?`<button class="small" data-act="edit" data-id="${item.id}">Edit</button><button class="small danger" data-act="delete" data-id="${item.id}">Delete</button>`:''}${statusActions}</div><div class="thread">${repliesHtml(item)}<div class="reply-compose"><input data-reply="${item.id}" placeholder="${creator?'Reply or ask a question…':'Reply…'}"><button class="small" data-act="reply" data-id="${item.id}">Send</button></div></div></article>`;
  }

  function bindReview(){
    $('#shareBtn')?.addEventListener('click',async()=>{const url=reviewerUrl();if(!url)return;try{await navigator.clipboard.writeText(url);toast('Reviewer link copied');}catch{prompt('Copy reviewer link',url);}});
    bindFeedbackActions(); mountVideo();
  }

  function capturePlayback(){const v=$('#video');if(v)restorePlayback={time:v.currentTime,paused:v.paused,volume:v.volume};}
  function rerenderKeepingPlayback(){capturePlayback();render();}

  function mountVideo(){
    const v=$('#video');if(!v)return;v.src=videoUrl||state.review.videoUrl;
    v.onloadedmetadata=()=>{duration=v.duration||0;if(restorePlayback){v.currentTime=Math.min(restorePlayback.time,duration||restorePlayback.time);v.volume=restorePlayback.volume??1;}syncGeometry();updateTimeline();if(restorePlayback&&!restorePlayback.paused)v.play().catch(()=>{});restorePlayback=null;};
    v.ontimeupdate=()=>{updateTimeline();renderMarks();updateLiveRange();};v.onplay=updateCtrlVisual;v.onpause=updateCtrlVisual;
    v.onclick=e=>{if(ctrlDown&&role()==='reviewer')return;const r=v.getBoundingClientRect();if(e.clientY-r.top>r.height-48)return;togglePlayback();};
    $('#timeline').onclick=e=>{if(e.target.closest('[data-tl]'))return;const r=e.currentTarget.getBoundingClientRect();v.currentTime=((e.clientX-r.left)/r.width)*(v.duration||duration||0);};
    setupAnnotation();syncGeometry();renderFeedbackHost();updateCtrlVisual();
  }

  function displayedContentRect(v){const r=v.getBoundingClientRect(),controls=48,ah=Math.max(1,r.height-controls),mr=(v.videoWidth&&v.videoHeight)?v.videoWidth/v.videoHeight:r.width/ah,br=r.width/ah;let w,h,l,t;if(br>mr){h=ah;w=h*mr;l=r.left+(r.width-w)/2;t=r.top;}else{w=r.width;h=w/mr;l=r.left;t=r.top+(ah-h)/2;}return{left:l,top:t,width:w,height:h,right:l+w,bottom:t+h};}
  function syncGeometry(){const shell=$('#playerShell'),v=$('#video'),layer=$('#layer'),gh=$('#gutters');if(!shell||!v||!layer||!gh)return;const sr=shell.getBoundingClientRect(),cr=displayedContentRect(v);Object.assign(layer.style,{left:`${cr.left-sr.left}px`,top:`${cr.top-sr.top}px`,width:`${cr.width}px`,height:`${cr.height}px`});gh.innerHTML='';[{l:0,t:0,w:cr.left-sr.left,h:sr.height},{l:cr.right-sr.left,t:0,w:sr.width-(cr.right-sr.left),h:sr.height},{l:cr.left-sr.left,t:0,w:cr.width,h:cr.top-sr.top},{l:cr.left-sr.left,t:cr.bottom-sr.top,w:cr.width,h:sr.height-(cr.bottom-sr.top)}].filter(r=>r.w>2&&r.h>2).forEach(r=>{const d=document.createElement('div');d.className='gutter';Object.assign(d.style,{left:`${r.l}px`,top:`${r.t}px`,width:`${r.w}px`,height:`${r.h}px`});d.onclick=togglePlayback;gh.appendChild(d);});updateCtrlVisual();renderMarks();}
  function updateCtrlVisual(){const shell=$('#playerShell'),layer=$('#layer');if(!shell||!layer)return;const active=ctrlDown&&role()==='reviewer';shell.classList.toggle('review-modifier',active);layer.classList.toggle('ctrl-active',active);layer.style.cursor=active?'crosshair':'default';}
  function setupAnnotation(){const layer=$('#layer');if(!layer||role()!=='reviewer')return;layer.onpointerdown=e=>{if(!ctrlDown||e.target.closest('.popover,.mark-btn'))return;e.preventDefault();e.stopPropagation();layer.setPointerCapture?.(e.pointerId);const p=pt(e,layer),v=$('#video');gesture={pointerId:e.pointerId,startPoint:p,lastPoint:p,startTime:v?.currentTime||0};draft=null;renderMarks();updateLiveRange();};layer.onpointermove=e=>{if(!gesture||gesture.pointerId!==e.pointerId)return;gesture.lastPoint=pt(e,layer);renderMarks();};layer.onpointerup=e=>{if(!gesture||gesture.pointerId!==e.pointerId)return;e.preventDefault();e.stopPropagation();const v=$('#video'),end=pt(e,layer),start=gesture.startPoint,box=boxFrom(start,end),isArea=box.w>2||box.h>2,endTime=Math.max(gesture.startTime,v?.currentTime||gesture.startTime);draft={start:gesture.startTime,end:endTime,mark:isArea?{type:'area',...box}:{type:'point',x:end.x,y:end.y},anchor:end,severity:'major',category:'Editing'};gesture=null;renderMarks();setTimeout(()=>$('#draftText')?.focus(),0);};}
  function pt(e,el){const r=el.getBoundingClientRect();return{x:Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)),y:Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100))};}
  function boxFrom(a,b){return{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)};}
  function renderMarks(){const layer=$('#layer'),v=$('#video');if(!layer||!v)return;const t=v.currentTime||0,visible=state.feedback.filter(i=>i.mark&&(i.id===state.selectedId||(t>=i.start-.04&&t<=i.end+.04)||(i.end-i.start<=.12&&Math.abs(t-i.start)<=.15)));layer.innerHTML=visible.map((i,n)=>markHtml(i,n+1)).join('')+(gesture?gestureHtml():draft?draftHtml():'');bindMarkUi();}
  function markHtml(i,n){const cls=sevClass(i.severity);if(i.mark.type==='area')return `<button class="mark-btn mark-area ${cls} ${state.selectedId===i.id?'selected':''}" data-mark="${i.id}" style="left:${i.mark.x}%;top:${i.mark.y}%;width:${Math.max(i.mark.w,2.4)}%;height:${Math.max(i.mark.h,2.4)}%"><span class="mark-point ${cls}">${n}</span></button>`;return `<button class="mark-btn mark-point ${cls} ${state.selectedId===i.id?'selected':''}" data-mark="${i.id}" style="left:${i.mark.x}%;top:${i.mark.y}%">${n}</button>`;}
  function gestureHtml(){const b=boxFrom(gesture.startPoint,gesture.lastPoint);if(b.w>2||b.h>2)return `<div class="draft-shape draft-area" style="left:${b.x}%;top:${b.y}%;width:${Math.max(b.w,2)}%;height:${Math.max(b.h,2)}%"></div>`;return `<div class="draft-shape draft-point" style="left:${gesture.lastPoint.x}%;top:${gesture.lastPoint.y}%"></div>`;}
  function draftHtml(){const m=draft.mark,shape=m.type==='area'?`<div class="draft-shape draft-area" style="left:${m.x}%;top:${m.y}%;width:${Math.max(m.w,2)}%;height:${Math.max(m.h,2)}%"></div>`:`<div class="draft-shape draft-point" style="left:${m.x}%;top:${m.y}%"></div>`,left=Math.max(16,Math.min(84,draft.anchor.x)),top=Math.max(18,Math.min(76,draft.anchor.y)),isRange=draft.end-draft.start>.12;return `${shape}<div class="popover" style="left:${left}%;top:${top}%"><div class="quick-types">${Object.entries(types).map(([k,v])=>`<button data-dsev="${k}" class="${draft.severity===k?'active':''}">${v}</button>`).join('')}</div><textarea id="draftText" placeholder="What should change?"></textarea><div class="pop-row"><select id="draftCat">${['Editing','Content','Design','Audio','Branding','Technical'].map(x=>`<option ${draft.category===x?'selected':''}>${x}</option>`).join('')}</select><span class="range-chip">${isRange?`${ft(draft.start)} → ${ft(draft.end)}`:'Frame'}</span><button class="cancel" data-cancel>Esc</button><button class="save" data-save>Save</button></div></div>`;}
  function bindMarkUi(){$$('[data-mark]').forEach(b=>b.onclick=e=>{e.stopPropagation();jump(b.dataset.mark);});$$('[data-dsev]').forEach(b=>b.onclick=e=>{e.stopPropagation();draft.severity=b.dataset.dsev;renderMarks();setTimeout(()=>$('#draftText')?.focus(),0)});$('[data-cancel]')?.addEventListener('click',e=>{e.stopPropagation();cancelTransient();});$('[data-save]')?.addEventListener('click',e=>{e.stopPropagation();saveDraft();});}
  async function saveDraft(){const text=$('#draftText')?.value.trim();if(!text)return toast('Type the change first');const item={id:uid(),text,severity:draft.severity,category:$('#draftCat')?.value||'Editing',start:draft.start,end:draft.end,mark:{...draft.mark},status:'open',replies:[]};state.feedback.push(item);state.selectedId=item.id;draft=null;renderFeedbackHost();updateTimeline();renderMarks();await sync();toast('Feedback saved');}
  function cancelTransient(){if(gesture){gesture=null;renderMarks();return true}if(draft){draft=null;renderMarks();return true}if(state.editingId){state.editingId=null;renderFeedbackHost();return true}return false;}
  function updateLiveRange(){let el=$('#liveRange'),shell=$('#playerShell');if(!gesture){el?.remove();return;}if(!el){el=document.createElement('div');el.id='liveRange';el.className='range-live';shell?.appendChild(el);}const t=$('#video')?.currentTime||gesture.startTime;el.innerHTML=`<b>Review range</b> ${ft(gesture.startTime)} → ${ft(Math.max(t,gesture.startTime))}`;}
  function updateTimeline(){const v=$('#video');if(!v)return;const d=v.duration||duration||0,t=v.currentTime||0;$('#timeRead').textContent=`${ft(t)} / ${ft(d)}`;$('#played').style.width=d?`${t/d*100}%`:'0%';const host=$('#timelineMarks');if(!host)return;host.innerHTML=state.feedback.map(i=>{const s=d?i.start/d*100:0,e=d?i.end/d*100:s,range=i.end-i.start>.12;if(range)return `<button class="tl-range ${sevClass(i.severity)}" data-tl="${i.id}" style="left:${s}%;width:${Math.max(.6,e-s)}%"></button>`;return `<button class="tl-dot ${sevClass(i.severity)}" data-tl="${i.id}" style="left:${s}%"></button>`;}).join('');$$('[data-tl]').forEach(b=>b.onclick=e=>{e.stopPropagation();jump(b.dataset.tl);});}
  function jump(id){const i=state.feedback.find(x=>String(x.id)===String(id)),v=$('#video');if(!i||!v)return;state.selectedId=i.id;v.currentTime=i.start;v.pause();renderFeedbackHost();renderMarks();updateTimeline();}
  function renderFeedbackHost(){const h=$('#feedbackHost');if(h){h.innerHTML=feedbackHtml();bindFeedbackActions();}const c=$('.count');if(c)c.textContent=state.feedback.length;}
  function bindFeedbackActions(){$$('[data-act]').forEach(b=>b.onclick=()=>act(b.dataset.act,b.dataset.id));$$('[data-reply]').forEach(input=>input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();act('reply',input.dataset.reply);}});}
  async function act(a,id){const i=state.feedback.find(x=>String(x.id)===String(id));if(!i)return;if(a==='jump')return jump(id);if(a==='edit'){state.editingId=i.id;renderFeedbackHost();return}if(a==='cancel-edit'){state.editingId=null;renderFeedbackHost();return}if(a==='save-edit'){const t=$(`[data-edit-text="${id}"]`)?.value.trim();if(!t)return;i.text=t;i.severity=$(`[data-edit-sev="${id}"]`)?.value||i.severity;i.category=$(`[data-edit-cat="${id}"]`)?.value||i.category;state.editingId=null;}else if(a==='delete'){state.feedback=state.feedback.filter(x=>String(x.id)!==String(id));if(String(state.selectedId)===String(id))state.selectedId=null;}else if(a==='working')i.status='working';else if(a==='ready')i.status='ready';else if(a==='resolve')i.status='resolved';else if(a==='reopen')i.status='open';else if(a==='reply'){const input=$(`[data-reply="${id}"]`),text=input?.value.trim();if(!text)return;i.replies ||= [];i.replies.push({id:uid(),author:role()==='creator'?'Creator':'Reviewer',role:role(),text,at:Date.now()});}
    renderFeedbackHost();renderMarks();updateTimeline();await sync();
  }

  async function sync(){
    if(isMock){const mock=JSON.parse(localStorage.getItem('fidbachr-mock-review')||'{}');state.review.feedback=state.feedback;state.review.revision=(state.review.revision||1)+1;mock.review=state.review;localStorage.setItem('fidbachr-mock-review',JSON.stringify(mock));return;}
    if(!state.review||!accessKey)return;state.saving=true;const s=$('#saveState');if(s)s.textContent='Saving…';
    try{const data=await api('/api/review',{method:'POST',body:JSON.stringify({action:'save',id:state.review.id,key:accessKey,revision:state.review.revision,feedback:state.feedback})});state.review=data.review;state.feedback=data.review.feedback||[];state.reviewerKey=data.reviewerKey||state.reviewerKey;}
    catch(e){if(e.status===409&&e.data?.review){state.review=e.data.review;state.feedback=e.data.review.feedback||[];toast('Review changed elsewhere. Latest version loaded.');renderFeedbackHost();renderMarks();updateTimeline();}else toast(e.message);}finally{state.saving=false;const el=$('#saveState');if(el)el.textContent='Synced';}
  }

  function togglePlayback(){const v=$('#video');if(!v)return;if(v.paused){v.play().catch(()=>{});flash('Ⅱ')}else{v.pause();flash('▶')}}
  function flash(s){const sh=$('#playerShell');if(!sh)return;$('.play-flash')?.remove();const e=document.createElement('div');e.className='play-flash';e.textContent=s;sh.appendChild(e);setTimeout(()=>e.remove(),450);}
  function step(dir,count=1){const v=$('#video');if(!v)return;cancelTransient();v.pause();v.currentTime=Math.max(0,Math.min(v.duration||duration,v.currentTime+dir*FRAME*count));}
  function isTyping(t){return!!t?.closest?.('input,textarea,select,[contenteditable="true"]');}

  document.addEventListener('keydown',e=>{if(e.key==='Control'||e.key==='Meta'){ctrlDown=true;updateCtrlVisual();return;}if(!state.review)return;if(e.key==='Escape'){if(cancelTransient()){e.preventDefault();e.stopPropagation()}return;}if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&draft){e.preventDefault();saveDraft();return;}if(isTyping(e.target))return;if(e.code==='Space'){e.preventDefault();togglePlayback();return;}if(e.key==='ArrowLeft'){e.preventDefault();step(-1,e.shiftKey?10:1);return;}if(e.key==='ArrowRight'){e.preventDefault();step(1,e.shiftKey?10:1);return;}},true);
  document.addEventListener('keyup',e=>{if(e.key==='Control'||e.key==='Meta'){ctrlDown=false;updateCtrlVisual();}},true);
  window.addEventListener('blur',()=>{ctrlDown=false;updateCtrlVisual();});window.addEventListener('resize',()=>requestAnimationFrame(syncGeometry));

  window.__fidbachrTest={snapshot:()=>JSON.parse(JSON.stringify(state)),draft:()=>draft,gesture:()=>gesture,ctrl:()=>ctrlDown,loadMock:(review,cap='reviewer')=>{state={...state,review,feedback:review.feedback||[],capability:cap,loading:false};videoUrl=review.videoUrl;render();}};
  reviewId ? loadReview() : render();
})();
