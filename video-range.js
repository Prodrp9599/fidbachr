(() => {
  let gesture = null;
  let draft = null;
  let selectedId = null;
  let overlay = null;
  const originalRenderPins = renderPins;
  const originalUpdateTimeline = updateTimeline;
  const originalReviewerComposerHtml = reviewerComposerHtml;

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  function fmtPrecise(sec = 0) {
    const total = Math.max(0, Number(sec) || 0);
    const m = Math.floor(total / 60);
    const s = total - m * 60;
    return `${String(m).padStart(2,'0')}:${s.toFixed(1).padStart(4,'0')}`;
  }

  function contentRect(video) {
    const r = video.getBoundingClientRect();
    const controls = 44;
    const hAvail = Math.max(1, r.height - controls);
    const mediaRatio = (video.videoWidth && video.videoHeight) ? video.videoWidth / video.videoHeight : r.width / hAvail;
    const boxRatio = r.width / hAvail;
    let width, height, left, top;
    if (boxRatio > mediaRatio) {
      height = hAvail; width = height * mediaRatio; left = r.left + (r.width - width) / 2; top = r.top;
    } else {
      width = r.width; height = width / mediaRatio; left = r.left; top = r.top + (hAvail - height) / 2;
    }
    return { left, top, width, height, right: left + width, bottom: top + height };
  }

  function insideRect(event, r) {
    return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
  }

  function pointPct(event, r) {
    return {
      x: Math.max(0, Math.min(100, (event.clientX - r.left) / r.width * 100)),
      y: Math.max(0, Math.min(100, (event.clientY - r.top) / r.height * 100)),
    };
  }

  function boxFrom(a, b) {
    return { x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), w: Math.abs(a.x-b.x), h: Math.abs(a.y-b.y) };
  }

  function ensureOverlay() {
    const stage = $('#mediaStage');
    const video = $('#reviewVideo');
    if (!stage || !video || video.hidden) return null;
    if (!overlay || !stage.contains(overlay)) {
      overlay = document.createElement('div');
      overlay.id = 'v4Overlay';
      overlay.className = 'v4-overlay';
      stage.appendChild(overlay);
      overlay.addEventListener('click', onOverlayClick);
    }
    const sr = stage.getBoundingClientRect();
    const cr = contentRect(video);
    Object.assign(overlay.style, {
      left: `${cr.left - sr.left}px`, top: `${cr.top - sr.top}px`, width: `${cr.width}px`, height: `${cr.height}px`
    });
    return overlay;
  }

  function urgencyLabel(level) {
    return level === 'blocker' ? 'Must fix' : level === 'suggestion' ? 'Suggestion' : 'Change';
  }

  function rangeEnd(item) {
    return Math.max(Number(item.endTime ?? item.time ?? 0), Number(item.time ?? 0));
  }

  function isVisibleNow(item, t) {
    const start = Number(item.time || 0);
    const end = rangeEnd(item);
    if (selectedId === item.id) return true;
    if (end - start > .12) return t >= start - .12 && t <= end + .12;
    return Math.abs(t - start) <= .42;
  }

  function markHtml(item, index) {
    const m = item.pin;
    const cls = item.severity === 'blocker' ? 'blocker' : item.severity === 'suggestion' ? 'suggestion' : 'major';
    if (m?.type === 'area') {
      return `<button class="v4-mark area ${cls} ${selectedId===item.id?'selected':''}" data-v4-mark="${item.id}" style="left:${m.x}%;top:${m.y}%;width:${Math.max(2.4,m.w)}%;height:${Math.max(2.4,m.h)}%"><span>${index+1}</span></button>`;
    }
    if (m) return `<button class="v4-mark point ${cls} ${selectedId===item.id?'selected':''}" data-v4-mark="${item.id}" style="left:${m.x}%;top:${m.y}%"><span>${index+1}</span></button>`;
    return '';
  }

  function previewHtml() {
    const source = draft?.mark || gesture?.mark;
    if (!source) return '';
    if (source.type === 'area') return `<div class="v4-preview-area" style="left:${source.x}%;top:${source.y}%;width:${Math.max(2.2,source.w)}%;height:${Math.max(2.2,source.h)}%"></div>`;
    return `<div class="v4-preview-point" style="left:${source.x}%;top:${source.y}%"></div>`;
  }

  function draftNoteHtml() {
    if (!draft) return '';
    const m = draft.mark;
    const anchorX = m.type === 'area' ? m.x + m.w/2 : m.x;
    const anchorY = m.type === 'area' ? m.y + m.h + 2 : m.y + 2;
    const left = Math.max(14, Math.min(86, anchorX));
    const top = Math.max(5, Math.min(82, anchorY));
    const duration = Math.max(0, draft.endTime - draft.time);
    return `<div class="v4-note" style="left:${left}%;top:${top}%">
      <div class="v4-note-head"><strong>${fmtPrecise(draft.time)}${duration>.12 ? ` → ${fmtPrecise(draft.endTime)}` : ''}</strong><span class="v4-range-readout">${duration>.12 ? `${duration.toFixed(1)}s range` : 'single frame'}</span><span class="spacer"></span><button data-v4-cancel data-v2-cancel>×</button></div>
      <textarea id="v4Text" placeholder="What should change?"></textarea>
      <div class="v4-row">
        <div class="v4-seg">
          <button data-v4-severity="blocker" class="${draft.severity==='blocker'?'active':''}">Must fix</button>
          <button data-v4-severity="major" class="${draft.severity==='major'?'active':''}">Change</button>
          <button data-v4-severity="suggestion" class="${draft.severity==='suggestion'?'active':''}">Suggest</button>
        </div>
        <div class="v4-duration">
          <button data-v4-duration="0" class="${duration<=.12?'active':''}">Frame</button>
          <button data-v4-duration="3" class="${Math.abs(duration-3)<.2?'active':''}">+3s</button>
          <button data-v4-duration="5" class="${Math.abs(duration-5)<.2?'active':''}">+5s</button>
        </div>
      </div>
      <div class="v4-row">
        <select id="v4Category" class="v4-category"><option>Editing</option><option>Content</option><option>Design</option><option>Audio</option><option>Branding</option><option>Technical</option></select>
        <button class="v4-save" data-v4-save data-v2-save>Save</button>
      </div>
    </div>`;
  }

  function liveBadgeHtml() {
    if (!gesture) return '';
    const video = $('#reviewVideo');
    const elapsed = Math.max(0, (video?.currentTime || gesture.startTime) - gesture.startTime);
    return `<div class="v4-live-badge"><i></i><span>${elapsed > .12 ? `Range ${elapsed.toFixed(1)}s` : 'Ctrl annotation'}</span></div>`;
  }

  function renderOverlay() {
    const video = $('#reviewVideo');
    const root = ensureOverlay();
    if (!video || !root) return;
    const t = Number(video.currentTime || 0);
    const visible = state.feedback.filter(item => item.pin && isVisibleNow(item,t));
    root.innerHTML = visible.map(markHtml).join('') + previewHtml() + liveBadgeHtml() + draftNoteHtml();
  }

  renderPins = function(highlightId = null) {
    if (state.review?.type !== 'video') return originalRenderPins(highlightId);
    if (highlightId != null) selectedId = highlightId;
    $('#pinLayer') && ($('#pinLayer').innerHTML = '');
    renderOverlay();
  };

  reviewerComposerHtml = function() {
    if (state.review?.type !== 'video') return originalReviewerComposerHtml();
    return `<section class="v4-ctrl-hint"><kbd>Ctrl</kbd><span><strong>Hold Ctrl + click/drag</strong> to comment. Normal mouse controls playback. Keep holding while the video plays to create a time range.</span></section>`;
  };

  function refreshSide() {
    const rail = $('.feedback-rail');
    if (!rail) return;
    rail.innerHTML = `<div class="rail-head"><div><div class="kicker">${state.role==='reviewer'?'YOUR REVIEW':'CHANGE LIST'}</div><h2>${state.role==='reviewer'?'Feedback':'Work to complete'}</h2></div><span class="count-badge">${state.feedback.length}</span></div>${feedbackEmptyOrList()}`;
    $$('[data-action]',rail).forEach(btn => btn.onclick = () => handleFeedbackAction(btn.dataset.action, Number(btn.dataset.id)));
    $$('[data-reply]',rail).forEach(input => input.onkeydown = event => {
      if (event.key === 'Enter') { event.preventDefault(); handleFeedbackAction('reply', Number(input.dataset.reply)); }
    });
    decorateRangeLabels();
  }

  function decorateRangeLabels() {
    state.feedback.forEach(item => {
      const card = document.querySelector(`[data-feedback-card="${item.id}"]`);
      const loc = card?.querySelector('.location');
      if (!loc) return;
      const end = rangeEnd(item);
      const span = end - Number(item.time||0);
      const mark = item.pin?.type === 'area' ? 'Selected area' : item.pin ? 'Pointed' : 'Frame';
      loc.textContent = span > .12 ? `${fmtPrecise(item.time)} → ${fmtPrecise(end)} · ${mark}` : `${fmtPrecise(item.time)} · ${mark}`;
    });
  }

  function saveDraft() {
    const text = $('#v4Text')?.value.trim();
    if (!text) { toast('Type the change first'); $('#v4Text')?.focus(); return; }
    const item = {
      id: Date.now(), order: Date.now(), text,
      severity: draft.severity || 'major', category: $('#v4Category')?.value || 'Editing',
      time: draft.time, endTime: draft.endTime, slide: 0, pin: { ...draft.mark }, status:'open', replies:[]
    };
    state.feedback.push(item);
    state.activity.unshift({type:'feedback', itemId:item.id, at:Date.now()});
    selectedId = item.id;
    draft = null;
    persist();
    refreshSide();
    updateTimeline();
    renderOverlay();
    toast('Feedback saved');
  }

  function onOverlayClick(event) {
    const mark = event.target.closest('[data-v4-mark]');
    if (mark) { event.preventDefault(); event.stopPropagation(); selectedId = Number(mark.dataset.v4Mark); handleFeedbackAction('jump', selectedId); renderOverlay(); return; }
    const cancel = event.target.closest('[data-v4-cancel]');
    if (cancel) { event.preventDefault(); event.stopPropagation(); draft = null; renderOverlay(); return; }
    const sev = event.target.closest('[data-v4-severity]');
    if (sev && draft) { event.preventDefault(); event.stopPropagation(); draft.severity = sev.dataset.v4Severity; renderOverlay(); setTimeout(()=>$('#v4Text')?.focus(),0); return; }
    const dur = event.target.closest('[data-v4-duration]');
    if (dur && draft) { event.preventDefault(); event.stopPropagation(); const seconds = Number(dur.dataset.v4Duration); draft.endTime = draft.time + seconds; renderOverlay(); setTimeout(()=>$('#v4Text')?.focus(),0); return; }
    const save = event.target.closest('[data-v4-save]');
    if (save) { event.preventDefault(); event.stopPropagation(); saveDraft(); }
  }

  function beginGesture(event) {
    const stage = $('#mediaStage');
    const video = $('#reviewVideo');
    if (!stage || !video || video.hidden || state.role !== 'reviewer') return false;
    if (!(event.ctrlKey || event.metaKey)) return false;
    if (event.target.closest('button,input,textarea,select,.v4-note,.v4-mark')) return false;
    const cr = contentRect(video);
    if (!insideRect(event,cr)) return false;

    event.preventDefault();
    event.stopImmediatePropagation();
    const p = pointPct(event,cr);
    gesture = { pointerId:event.pointerId, start:p, last:p, startTime:Number(video.currentTime||0), wasPlaying:!video.paused, mark:{type:'point',x:p.x,y:p.y} };
    selectedId = null;
    try { stage.setPointerCapture?.(event.pointerId); } catch(_) {}
    renderOverlay();
    return true;
  }

  function moveGesture(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const video = $('#reviewVideo');
    if (!video) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const cr = contentRect(video);
    const p = pointPct(event,cr);
    gesture.last = p;
    const dx = Math.abs(p.x-gesture.start.x), dy = Math.abs(p.y-gesture.start.y);
    gesture.mark = (dx>1.5 || dy>1.5) ? {type:'area',...boxFrom(gesture.start,p)} : {type:'point',x:gesture.start.x,y:gesture.start.y};
    renderOverlay();
  }

  function endGesture(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const video = $('#reviewVideo');
    if (!video) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const endTime = Number(video.currentTime||gesture.startTime);
    draft = { time:gesture.startTime, endTime:Math.abs(endTime-gesture.startTime)>.12 ? endTime : gesture.startTime, mark:{...gesture.mark}, severity:'major' };
    const wasPlaying = gesture.wasPlaying;
    gesture = null;
    if (wasPlaying) video.pause();
    renderOverlay();
    setTimeout(()=>$('#v4Text')?.focus(),0);
  }

  document.addEventListener('pointerdown', beginGesture, true);
  document.addEventListener('pointermove', moveGesture, true);
  document.addEventListener('pointerup', endGesture, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && draft) { draft = null; renderOverlay(); }
  }, true);

  updateTimeline = function() {
    originalUpdateTimeline();
    if (state.review?.type !== 'video') return;
    const markers = $('#timelineMarkers');
    const video = $('#reviewVideo');
    const duration = Number(video?.duration || mediaDuration || 0);
    if (!markers || !duration) return;
    state.feedback.forEach(item => {
      const end = rangeEnd(item);
      if (end - Number(item.time||0) <= .12) return;
      const bar = document.createElement('button');
      bar.className = 'v4-range-bar';
      bar.style.left = `${Math.max(0,Math.min(100,item.time/duration*100))}%`;
      bar.style.width = `${Math.max(.7,Math.min(100,(end-item.time)/duration*100))}%`;
      bar.title = `${fmtPrecise(item.time)} → ${fmtPrecise(end)} · ${item.text}`;
      bar.onclick = e => { e.stopPropagation(); selectedId=item.id; handleFeedbackAction('jump',item.id); renderOverlay(); };
      markers.appendChild(bar);
    });
  };

  const observer = new MutationObserver(() => {
    ensureOverlay();
    decorateRangeLabels();
    const help = $('.v2-micro-help');
    if (help && !help.classList.contains('v4-rewritten')) {
      help.classList.add('v4-rewritten');
      help.outerHTML = reviewerComposerHtml();
    }
    renderOverlay();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});

  window.addEventListener('resize',()=>{ ensureOverlay(); renderOverlay(); });
  document.addEventListener('fullscreenchange',()=>setTimeout(()=>{ensureOverlay();renderOverlay();},0));

  // Existing reviews may have no endTime; treat them as single-frame notes.
  state.feedback.forEach(item => { if (item.endTime == null) item.endTime = item.time; });
  persist();
  ensureOverlay();
  refreshSide();
  updateTimeline();
  renderOverlay();
})();
