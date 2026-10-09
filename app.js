const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const STORAGE_KEY = 'fidbachr-loop1-state-v2';

const severity = {
  blocker: { label: 'Blocker', color: '#ff5b63' },
  major: { label: 'Major', color: '#ff9b4a' },
  minor: { label: 'Minor', color: '#f3cd54' },
  suggestion: { label: 'Suggestion', color: '#98a0ad' },
};

const demoState = {
  role: 'reviewer',
  pinMode: false,
  pendingPin: null,
  comments: [
    {
      id: 1,
      text: 'The opening pause feels long. Tighten this before the first line lands.',
      severity: 'major', category: 'Editing', time: 3.6, status: 'open', pin: null,
      replies: [{ author: 'Shashwat', role: 'creator', text: 'Got it. I can trim roughly 0.6s here.', at: Date.now() - 1000 * 60 * 18 }]
    },
    {
      id: 2,
      text: 'This statistic needs to be verified before we publish.',
      severity: 'blocker', category: 'Content', time: 12.2, status: 'ready', pin: {x: 70, y: 24},
      replies: [{ author: 'Shashwat', role: 'creator', text: 'Updated the copy from the source doc. Can you verify?', at: Date.now() - 1000 * 60 * 7 }]
    },
    {
      id: 3,
      text: 'Raise the subtitle slightly so it clears the platform UI.',
      severity: 'minor', category: 'Design', time: 22.8, status: 'resolved', pin: {x: 50, y: 78},
      replies: [{ author: 'Rohan', role: 'reviewer', text: 'Looks good now.', at: Date.now() - 1000 * 60 * 2 }]
    },
  ],
  activity: [
    { icon: '↻', copy: '<b>Shashwat</b> marked “This statistic needs to be verified…” ready for review.', at: Date.now() - 1000 * 60 * 7 },
    { icon: '💬', copy: '<b>Shashwat</b> replied to an editing change.', at: Date.now() - 1000 * 60 * 18 },
    { icon: '✓', copy: '<b>Rohan</b> resolved the subtitle position feedback.', at: Date.now() - 1000 * 60 * 2 },
  ],
  unread: 3,
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.comments) return { ...demoState, ...saved };
  } catch (_) {}
  return structuredClone(demoState);
}
let state = loadState();
let media = { type: null, duration: 30 };

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ role: state.role, comments: state.comments, activity: state.activity, unread: state.unread }));
}
function fmtTime(sec=0) {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}
function ago(ts) {
  const m = Math.max(0, Math.round((Date.now()-ts)/60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m/60); return `${h}h ago`;
}
function escapeHtml(v='') {
  return v.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
}
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(()=>el.classList.remove('show'), 1900);
}
function addActivity(icon, copy) {
  state.activity.unshift({ icon, copy, at: Date.now() });
  state.unread += 1; save(); renderActivity(); updateBadge();
}
function currentTime() { return media.type === 'video' ? ($('#video').currentTime || 0) : 0; }
function currentDuration() { return media.type === 'video' ? ($('#video').duration || media.duration) : 1; }

function renderAll() {
  renderRole(); renderFeedback(); renderChecklist(); renderActivity(); renderTimeline(); renderPins(); updateProgress(); updateBadge();
}
function renderRole() {
  $$('.role-btn').forEach(b => b.classList.toggle('active', b.dataset.role === state.role));
  $('#finishBtn').textContent = state.role === 'reviewer' ? 'Finish review' : 'Notify reviewer';
  $('#reviewerComposer').hidden = state.role !== 'reviewer';
  $('#pinModeBtn').hidden = state.role !== 'reviewer';
  if (state.role !== 'reviewer' && state.pinMode) { state.pinMode = false; state.pendingPin = null; }
}
function updateBadge() {
  $('#activityBadge').textContent = state.unread;
  $('#activityBadge').hidden = state.unread === 0;
}
function counts() {
  const out = { blocker:0, major:0, minor:0, suggestion:0 };
  state.comments.filter(c => c.status !== 'resolved').forEach(c => out[c.severity]++);
  return out;
}
function renderFeedback() {
  const status = $('#statusFilter').value;
  const cat = $('#categoryFilter').value;
  const list = state.comments
    .filter(c => status === 'all' || c.status === status)
    .filter(c => cat === 'all' || c.category === cat)
    .sort((a,b) => a.time-b.time);
  $('#feedbackCount').textContent = state.comments.length;
  const cs = counts();
  $('#summaryGrid').innerHTML = ['blocker','major','minor','suggestion'].map(k => `
    <div class="summary-card"><div class="n" style="color:${severity[k].color}">${cs[k]}</div><div class="l">${severity[k].label}</div></div>`).join('');

  const note = `<div class="role-note">${state.role === 'reviewer'
    ? '<b>Reviewer mode:</b> you own priority and final resolution. Creators can mark changes ready for you.'
    : '<b>Creator mode:</b> reply inside a change, start work, then mark it ready for reviewer verification.'}</div>`;

  $('#feedbackList').innerHTML = note + (list.length ? list.map(cardHtml).join('') : '<div class="empty-list">No feedback matches these filters.</div>');
  bindCardActions();
}
function cardHtml(c) {
  const statusLabels = { open: 'Open', working: 'In progress', ready: 'Ready for review', resolved: 'Resolved' };
  const st = statusLabels[c.status] || c.status;
  const replies = c.replies.map(r => `<div class="reply"><div class="avatar">${r.author[0]}</div><div><div class="reply-head">${escapeHtml(r.author)} · ${ago(r.at)}</div><div class="reply-copy">${escapeHtml(r.text)}</div></div></div>`).join('');
  const location = media.type === 'image' ? (c.pin ? 'Pinned to creative' : 'General') : `At ${fmtTime(c.time)}${c.pin ? ' · pinned' : ''}`;
  let actions = '';
  if (state.role === 'creator') {
    if (c.status === 'open') actions = `<button class="small-btn" data-action="working" data-id="${c.id}">Start work</button><button class="small-btn accent" data-action="ready" data-id="${c.id}">Mark ready</button>`;
    if (c.status === 'working') actions = `<button class="small-btn accent" data-action="ready" data-id="${c.id}">Mark ready for review</button><button class="small-btn" data-action="reopen" data-id="${c.id}">Back to open</button>`;
    if (c.status === 'ready') actions = `<button class="small-btn" data-action="working" data-id="${c.id}">Continue working</button>`;
    if (c.status === 'resolved') actions = `<span class="meta-text">Verified by reviewer</span>`;
  } else {
    if (c.status === 'ready') actions = `<button class="small-btn accent" data-action="resolve" data-id="${c.id}">Verify & resolve</button><button class="small-btn" data-action="reopen" data-id="${c.id}">Needs another pass</button>`;
    else if (c.status !== 'resolved') actions = `<button class="small-btn accent" data-action="resolve" data-id="${c.id}">Resolve</button><button class="small-btn" data-action="reopen" data-id="${c.id}">Keep open</button>`;
    else actions = `<button class="small-btn" data-action="reopen" data-id="${c.id}">Reopen</button>`;
  }
  return `<article class="feedback-item" data-card-id="${c.id}">
    <div class="feedback-main">
      <div class="feedback-top"><div class="feedback-meta"><span class="sev-dot" style="background:${severity[c.severity].color}"></span><span class="meta-text">${severity[c.severity].label}</span><span class="meta-text">· ${escapeHtml(c.category)}</span></div><span class="status-pill status-${c.status}">${st}</span></div>
      <div class="feedback-copy">${escapeHtml(c.text)}</div>
      <div class="feedback-location">${location}</div>
      <div class="item-actions">${actions}<button class="small-btn" data-action="jump" data-id="${c.id}">Jump to</button></div>
    </div>
    <div class="thread">${replies || '<div class="meta-text">No replies yet</div>'}
      <div class="thread-compose"><input data-reply-input="${c.id}" placeholder="Reply in thread…"><button data-action="reply" data-id="${c.id}">Send</button></div>
    </div>
  </article>`;
}
function bindCardActions() {
  $$('[data-action]').forEach(btn => btn.onclick = () => handleAction(btn.dataset.action, Number(btn.dataset.id)));
  $$('[data-reply-input]').forEach(inp => inp.onkeydown = e => {
    if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); handleAction('reply', Number(inp.dataset.replyInput)); }
  });
}
function handleAction(action,id) {
  const c = state.comments.find(x=>x.id===id); if(!c) return;
  if (action === 'jump') {
    if (media.type === 'video') { $('#video').currentTime = c.time; $('#video').pause(); }
    document.querySelector(`[data-card-id="${id}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});
    renderPins(); return;
  }
  if (action === 'reply') {
    const inp = document.querySelector(`[data-reply-input="${id}"]`);
    const text = inp?.value.trim(); if(!text) return;
    const author = state.role === 'reviewer' ? 'Rohan' : 'Creator';
    c.replies.push({author, role:state.role, text, at:Date.now()});
    addActivity('💬', `<b>${author}</b> replied: “${escapeHtml(text.slice(0,45))}${text.length>45?'…':''}”`);
    save(); renderFeedback(); return;
  }
  if (action === 'working') {
    c.status='working'; addActivity('●', `<b>Creator</b> started work on “${escapeHtml(c.text.slice(0,46))}${c.text.length>46?'…':''}”.`); toast('Marked in progress');
  }
  if (action === 'ready') {
    c.status='ready'; addActivity('↻', `<b>Creator</b> marked “${escapeHtml(c.text.slice(0,46))}${c.text.length>46?'…':''}” ready for review.`); toast('Reviewer notified');
  }
  if (action === 'resolve') {
    c.status='resolved'; addActivity('✓', `<b>Rohan</b> resolved “${escapeHtml(c.text.slice(0,46))}${c.text.length>46?'…':''}”.`); toast('Feedback resolved');
  }
  if (action === 'reopen') {
    c.status='open'; addActivity('↺', `<b>${state.role === 'reviewer' ? 'Rohan' : 'Creator'}</b> moved a feedback item back to open.`);
  }
  save(); renderAll();
}
function renderChecklist() {
  const sorted = [...state.comments].sort((a,b) => {
    const rank={blocker:0,major:1,minor:2,suggestion:3}; return rank[a.severity]-rank[b.severity] || a.time-b.time;
  });
  $('#checklist').innerHTML = sorted.length ? sorted.map(c => `<div class="check-row">
    <button class="check-circle ${c.status==='resolved'?'done':''}" data-check-id="${c.id}" title="${state.role==='reviewer'?'Toggle resolved':'Open feedback item'}">${c.status==='resolved'?'✓':''}</button>
    <div><div class="check-copy">${escapeHtml(c.text)}</div><div class="check-sub"><span style="color:${severity[c.severity].color}">${severity[c.severity].label}</span> · ${escapeHtml(c.category)} · ${fmtTime(c.time)}</div></div>
    <span class="status-pill status-${c.status}">${c.status==='ready'?'Ready':c.status==='working'?'Working':c.status}</span>
  </div>`).join('') : '<div class="empty-list">Add feedback and it will become a change checklist automatically.</div>';
  $$('[data-check-id]').forEach(btn => btn.onclick = () => {
    const id = Number(btn.dataset.checkId);
    if (state.role === 'reviewer') {
      const c = state.comments.find(x => x.id === id);
      handleAction(c?.status === 'resolved' ? 'reopen' : 'resolve', id);
    } else {
      setTab('feedback');
      setTimeout(() => document.querySelector(`[data-card-id="${id}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}), 0);
    }
  });
}
function renderActivity() {
  $('#activityList').innerHTML = state.activity.length ? state.activity.map(a => `<div class="activity-row"><div class="activity-icon">${a.icon}</div><div><div class="activity-copy">${a.copy}</div><div class="activity-time">${ago(a.at)}</div></div></div>`).join('') : '<div class="empty-list">No activity yet.</div>';
}
function updateProgress() {
  const total=state.comments.length, resolved=state.comments.filter(c=>c.status==='resolved').length;
  $('#progressText').textContent=`${resolved} of ${total} resolved`;
  $('#progressFill').style.width=total?`${resolved/total*100}%`:'0%';
}
function renderTimeline() {
  const duration=currentDuration();
  $('#timelineMarkers').innerHTML = state.comments.map(c => {
    const left = media.type === 'video' ? Math.min(100,c.time/duration*100) : 0;
    return `<button class="t-marker" data-tid="${c.id}" title="${escapeHtml(c.text)}" style="left:${left}%;background:${severity[c.severity].color}"></button>`;
  }).join('');
  $$('[data-tid]').forEach(m=>m.onclick=e=>{e.stopPropagation();handleAction('jump',Number(m.dataset.tid));});
}
function renderPins() {
  const layer=$('#pinLayer');
  layer.classList.toggle('pin-mode', state.pinMode);
  const pins=state.comments.filter(c=>c.pin && c.status!=='resolved');
  layer.innerHTML=pins.map((c,i)=>`<button class="pin" data-pin-id="${c.id}" style="left:${c.pin.x}%;top:${c.pin.y}%;background:${severity[c.severity].color}">${i+1}</button>`).join('') + (state.pendingPin ? `<div class="pin" style="left:${state.pendingPin.x}%;top:${state.pendingPin.y}%;background:#b8f46c">+</div>`:'');
  $$('[data-pin-id]').forEach(p=>p.onclick=e=>{e.stopPropagation();handleAction('jump',Number(p.dataset.pinId));});
}
function updateContext() {
  const t=currentTime();
  $('#contextChip').textContent = `${media.type==='image'?'Image':`At ${fmtTime(t)}`}${state.pendingPin?' · pinned':''}`;
  $('#clearPinBtn').hidden=!state.pendingPin;
}
function addFeedback() {
  if (state.role !== 'reviewer') { toast('Creators reply inside feedback threads'); return; }
  const text=$('#feedbackInput').value.trim(); if(!text){toast('Write feedback first');return;}
  const c={ id:Date.now(), text, severity:$('#severitySelect').value, category:$('#categorySelect').value, time:currentTime(), status:'open', pin:state.pendingPin, replies:[] };
  state.comments.push(c); state.pendingPin=null; $('#feedbackInput').value='';
  addActivity('＋', `<b>Rohan</b> added ${severity[c.severity].label.toLowerCase()} ${escapeHtml(c.category.toLowerCase())} feedback.`);
  save(); updateContext(); renderAll(); toast('Feedback added');
}
function setTab(name) {
  $$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name));
  $$('.tab-panel').forEach(p=>p.classList.remove('active'));
  $(`#${name}Panel`).classList.add('active');
  if(name==='activity'){state.unread=0;save();updateBadge();}
}
function checklistText() {
  return state.comments.filter(c=>c.status!=='resolved').sort((a,b)=>a.time-b.time).map(c=>`[${severity[c.severity].label}] ${c.category} ${fmtTime(c.time)} — ${c.text}`).join('\n');
}
function showSummary() {
  const cs=counts(); const open=state.comments.filter(c=>c.status!=='resolved');
  $('#dialogSummary').innerHTML=`<div class="dialog-statline">${['blocker','major','minor','suggestion'].map(k=>`<div class="dialog-stat"><strong style="color:${severity[k].color}">${cs[k]}</strong><span>${severity[k].label}</span></div>`).join('')}</div>
    <ol class="dialog-list">${open.map(c=>`<li><b>${severity[c.severity].label}</b> · ${escapeHtml(c.category)} · ${fmtTime(c.time)} — ${escapeHtml(c.text)}</li>`).join('') || '<li>Everything is resolved.</li>'}</ol>`;
  $('#summaryDialog').showModal();
}

$('#fileInput').addEventListener('change', e => {
  const f=e.target.files?.[0]; if(!f)return; const url=URL.createObjectURL(f);
  $('#emptyState').hidden=true;
  if(f.type.startsWith('video/')){
    media.type='video'; $('#image').hidden=true; const v=$('#video'); v.hidden=false; v.src=url;
    v.onloadedmetadata=()=>{media.duration=v.duration||30;renderTimeline();updateContext();};
    v.ontimeupdate=()=>{ const d=v.duration||1; $('#timeLabel').textContent=`${fmtTime(v.currentTime)} / ${fmtTime(d)}`; $('#timelineProgress').style.width=`${v.currentTime/d*100}%`; updateContext();};
  } else {
    media.type='image'; $('#video').hidden=true; const img=$('#image'); img.hidden=false; img.src=url; $('#timeLabel').textContent='Image review'; renderTimeline(); updateContext();
  }
  toast(`${f.name} loaded locally`);
});
$('#timeline').onclick=e=>{
  if(media.type!=='video')return; const r=e.currentTarget.getBoundingClientRect(); const ratio=(e.clientX-r.left)/r.width; $('#video').currentTime=ratio*currentDuration();
};
$('#pinModeBtn').onclick=()=>{state.pinMode=!state.pinMode;$('#pinModeBtn').textContent=state.pinMode?'✕ Exit pin mode':'⌖ Pin feedback';renderPins();toast(state.pinMode?'Click the creative to place a pin':'Pin mode off');};
$('#pinLayer').onclick=e=>{
  if(!state.pinMode)return; const r=e.currentTarget.getBoundingClientRect(); state.pendingPin={x:((e.clientX-r.left)/r.width*100).toFixed(2),y:((e.clientY-r.top)/r.height*100).toFixed(2)}; state.pinMode=false; $('#pinModeBtn').textContent='⌖ Pin feedback'; updateContext();renderPins();$('#feedbackInput').focus();
};
$('#clearPinBtn').onclick=()=>{state.pendingPin=null;updateContext();renderPins();};
$('#addFeedbackBtn').onclick=addFeedback;
$('#feedbackInput').onkeydown=e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter')addFeedback();};
$('#statusFilter').onchange=renderFeedback; $('#categoryFilter').onchange=renderFeedback;
$$('.role-btn').forEach(b=>b.onclick=()=>{state.role=b.dataset.role;save();renderAll();toast(`${state.role==='reviewer'?'Reviewer':'Creator'} mode`);});
$$('.tab').forEach(t=>t.onclick=()=>setTab(t.dataset.tab));
$('#activityBtn').onclick=()=>setTab('activity');
$('#finishBtn').onclick=()=> state.role==='reviewer' ? showSummary() : (toast('Reviewer pinged'), addActivity('↻','<b>Creator</b> pinged the reviewer to check submitted fixes.'));
$('#closeDialogBtn').onclick=()=>$('#summaryDialog').close();
$('#copyChecklistBtn').onclick=async()=>{await navigator.clipboard.writeText(checklistText());toast('Checklist copied');};
$('#copySummaryBtn').onclick=async()=>{await navigator.clipboard.writeText(checklistText());toast('Change list copied');};
$('#sendCreatorBtn').onclick=()=>{$('#summaryDialog').close();addActivity('✉','<b>Rohan</b> sent the change list to the creator.');toast('Creator notified');};
$('#shareBtn').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast('Review link copied');}catch{toast('Share link ready');}};
$('#micBtn').onclick=()=>toast('Voice capture comes in Loop 2 — this button is intentionally placed now.');

renderAll(); updateContext();
