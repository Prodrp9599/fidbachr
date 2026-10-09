(() => {
  const legacy = {
    render,
    homeHtml,
    reviewerComposerHtml,
    hydrateMedia,
    renderPins,
    feedbackCardHtml,
    handleFeedbackAction,
  };

  let playback = { time: 0, paused: true, volume: 1, rate: 1 };
  let draft = null;
  let drag = null;
  let selectedId = null;
  let editingId = null;

  function capturePlayback() {
    const video = document.querySelector('#reviewVideo');
    if (!video || video.hidden || !Number.isFinite(video.currentTime)) return;
    playback = {
      time: video.currentTime,
      paused: video.paused,
      volume: video.volume,
      rate: video.playbackRate,
    };
  }

  render = function () {
    capturePlayback();
    legacy.render();
  };

  homeHtml = function () {
    return `
      <div class="home-shell">
        <header class="home-nav">
          <button class="wordmark bare" id="v2Brand"><span class="mark">f</span><span>fidbachr</span></button>
          <div class="nav-actions">
            <span class="beta-pill">video prototype</span>
            ${state.review ? '<button class="ghost-btn" id="resumeBtn">Resume review</button>' : ''}
          </div>
        </header>
        <main class="onboarding-wrap">
          <section class="intro-copy">
            <div class="kicker">VIDEO REVIEW, WITHOUT THE MESS</div>
            <h1>Review the reel by pointing at it.</h1>
            <p>Upload a video, pause on the exact frame, then click or drag directly on the thing you want changed.</p>
          </section>

          <section class="type-grid">
            <button class="type-card v2-featured" id="newVideoBtn">
              <div class="type-icon">▶</div>
              <div class="type-copy"><h2>Upload video / reel</h2><p>Start with one reel, ad, cut or short.</p></div>
              <span class="arrow">→</span>
            </button>
            <div class="type-card v2-disabled">
              <div class="type-icon">▧</div>
              <div class="type-copy"><h2>Static / Carousel</h2><p>Paused while we perfect video feedback first.</p></div>
              <span class="v2-later">Later</span>
            </div>
          </section>

          <section class="how-row">
            <div><span>1</span><strong>Upload</strong><small>Start with one reel.</small></div>
            <div><span>2</span><strong>Pause + point</strong><small>Click or drag around the exact area.</small></div>
            <div><span>3</span><strong>Send changes</strong><small>Every mark becomes actionable feedback.</small></div>
          </section>
          <div class="prototype-note">Video loop · no sample data · visual feedback first</div>
        </main>
      </div>`;
  };

  reviewerComposerHtml = function () {
    return `
      <section class="v2-micro-help">
        <span class="v2-crosshair">⌖</span>
        <span><b>Pause the video.</b> Click a point or drag a box on the frame to leave feedback.</span>
      </section>`;
  };

  function syncLayer() {
    const stage = document.querySelector('#mediaStage');
    const video = document.querySelector('#reviewVideo');
    const layer = document.querySelector('#pinLayer');
    if (!stage || !video || !layer || video.hidden) return;

    const sr = stage.getBoundingClientRect();
    const vr = video.getBoundingClientRect();
    if (!vr.width || !vr.height) return;

    Object.assign(layer.style, {
      left: `${vr.left - sr.left}px`,
      top: `${vr.top - sr.top}px`,
      width: `${vr.width}px`,
      height: `${Math.max(1, vr.height - 44)}px`,
      right: 'auto',
      bottom: 'auto',
    });
  }

  function setLayerState() {
    const video = document.querySelector('#reviewVideo');
    const layer = document.querySelector('#pinLayer');
    if (!video || !layer) return;
    const active = state.role === 'reviewer' && video.paused && !video.hidden;
    layer.classList.toggle('v2-active', active);

    let hint = document.querySelector('#v2PauseHint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'v2PauseHint';
      hint.className = 'v2-pause-hint';
      hint.innerHTML = '<span>⌖</span> Click to point · drag to select an area';
      document.querySelector('#mediaStage')?.appendChild(hint);
    }
    hint.hidden = !active || Boolean(draft);
  }

  hydrateMedia = function () {
    if (state.review?.type !== 'video') return legacy.hydrateMedia();

    const missing = document.querySelector('#mediaMissing');
    const video = document.querySelector('#reviewVideo');
    if (!mediaUrls.length) {
      missing.hidden = false;
      video.hidden = true;
      return;
    }

    missing.hidden = true;
    video.hidden = false;
    video.src = mediaUrls[0];

    video.addEventListener('loadedmetadata', () => {
      mediaDuration = video.duration || 0;
      const restore = Math.min(playback.time || 0, Math.max(0, mediaDuration - .05));
      try { video.currentTime = restore; } catch (_) {}
      video.volume = playback.volume ?? 1;
      video.playbackRate = playback.rate || 1;
      syncLayer();
      updateTimeline();
      renderPins(selectedId);
      setLayerState();
      if (!playback.paused) video.play().catch(() => {});
    });

    video.addEventListener('loadeddata', syncLayer);
    video.addEventListener('timeupdate', () => {
      playback.time = video.currentTime;
      playback.paused = video.paused;
      updateTimeline();
      renderPins(selectedId);
    });
    video.addEventListener('pause', () => {
      playback.time = video.currentTime;
      playback.paused = true;
      syncLayer();
      renderPins(selectedId);
      setLayerState();
    });
    video.addEventListener('play', () => {
      playback.paused = false;
      draft = null;
      renderPins(selectedId);
      setLayerState();
    });

    document.querySelector('#timeline')?.addEventListener('click', event => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (!mediaDuration) return;
      video.currentTime = Math.max(0, Math.min(mediaDuration, (event.clientX - rect.left) / rect.width * mediaDuration));
      playback.time = video.currentTime;
      renderPins(selectedId);
    });

    setupAnnotationLayer();
    window.onresize = syncLayer;
    syncLayer();
    setLayerState();
    renderPins(selectedId);
    updateTimeline();
  };

  function setupAnnotationLayer() {
    const layer = document.querySelector('#pinLayer');
    if (!layer || layer.dataset.v2Bound) return;
    layer.dataset.v2Bound = '1';

    layer.addEventListener('pointerdown', event => {
      const video = document.querySelector('#reviewVideo');
      if (state.role !== 'reviewer' || !video || !video.paused) return;
      if (event.target.closest('button,input,textarea,select,.v2-radial,.v2-note,.v2-saved-mark')) return;

      event.preventDefault();
      layer.setPointerCapture?.(event.pointerId);
      const point = pointPct(event, layer.getBoundingClientRect());
      drag = { ...point, pointerId: event.pointerId };

      const preview = document.createElement('div');
      preview.id = 'v2DragPreview';
      preview.className = 'v2-drag-preview';
      preview.style.left = `${point.x}%`;
      preview.style.top = `${point.y}%`;
      layer.appendChild(preview);
    });

    layer.addEventListener('pointermove', event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const point = pointPct(event, layer.getBoundingClientRect());
      const box = boxFrom(drag, point);
      const preview = document.querySelector('#v2DragPreview');
      if (!preview) return;
      Object.assign(preview.style, {
        left: `${box.x}%`, top: `${box.y}%`,
        width: `${box.w}%`, height: `${box.h}%`,
      });
    });

    layer.addEventListener('pointerup', event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();

      const video = document.querySelector('#reviewVideo');
      const end = pointPct(event, layer.getBoundingClientRect());
      const start = drag;
      drag = null;
      document.querySelector('#v2DragPreview')?.remove();

      const isArea = Math.abs(end.x - start.x) > 2 || Math.abs(end.y - start.y) > 2;
      const mark = isArea
        ? { type: 'area', ...boxFrom(start, end) }
        : { type: 'point', x: end.x, y: end.y };

      draft = {
        time: video?.currentTime || playback.time || 0,
        mark,
        anchor: end,
        severity: null,
      };
      selectedId = null;
      renderPins();
    });

    layer.addEventListener('click', event => {
      const severity = event.target.closest('[data-v2-severity]');
      if (severity) {
        event.stopPropagation();
        draft.severity = severity.dataset.v2Severity;
        renderPins();
        setTimeout(() => document.querySelector('#v2DraftText')?.focus(), 0);
        return;
      }

      if (event.target.closest('[data-v2-cancel]')) {
        event.stopPropagation();
        draft = null;
        renderPins(selectedId);
        setLayerState();
        return;
      }

      if (event.target.closest('[data-v2-save]')) {
        event.stopPropagation();
        saveDraft();
        return;
      }

      const saved = event.target.closest('[data-v2-mark]');
      if (saved) {
        event.stopPropagation();
        jumpTo(Number(saved.dataset.v2Mark));
      }
    });
  }

  function pointPct(event, rect) {
    return {
      x: Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)),
      y: Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100)),
    };
  }

  function boxFrom(a, b) {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y),
    };
  }

  function radialHtml() {
    if (!draft) return '';
    const left = Math.max(14, Math.min(86, draft.anchor.x));
    const top = Math.max(17, Math.min(82, draft.anchor.y));

    if (!draft.severity) {
      return `
        <div class="v2-radial" style="left:${left}%;top:${top}%">
          <button class="v2-choice v2-must" data-v2-severity="blocker"><b>!</b><small>Must fix</small></button>
          <button class="v2-choice v2-change" data-v2-severity="major"><b>↗</b><small>Change</small></button>
          <button class="v2-choice v2-suggest" data-v2-severity="suggestion"><b>~</b><small>Suggest</small></button>
          <button class="v2-cancel" data-v2-cancel>×</button>
        </div>`;
    }

    return `
      <div class="v2-note" style="left:${left}%;top:${top}%">
        <div class="v2-note-head">
          <span class="severity-dot ${severityMap[draft.severity].tone}"></span>
          <strong>${severityMap[draft.severity].label}</strong>
          <span>${formatTime(draft.time)}</span>
          <button data-v2-cancel>×</button>
        </div>
        <textarea id="v2DraftText" placeholder="What should change?"></textarea>
        <div class="v2-note-foot">
          <select id="v2Category">
            <option>Editing</option><option>Content</option><option>Design</option>
            <option>Audio</option><option>Branding</option><option>Technical</option>
          </select>
          <button class="v2-save" data-v2-save>Save</button>
        </div>
      </div>`;
  }

  function draftShapeHtml() {
    if (!draft) return '';
    const m = draft.mark;
    if (m.type === 'area') {
      return `<div class="v2-draft-area" style="left:${m.x}%;top:${m.y}%;width:${Math.max(2.4,m.w)}%;height:${Math.max(2.4,m.h)}%"></div>`;
    }
    return `<div class="v2-draft-point" style="left:${m.x}%;top:${m.y}%">+</div>`;
  }

  renderPins = function (highlightId = null) {
    if (state.review?.type !== 'video') return legacy.renderPins(highlightId);

    const layer = document.querySelector('#pinLayer');
    const video = document.querySelector('#reviewVideo');
    if (!layer || !video) return;

    selectedId = highlightId ?? selectedId;
    const t = video.currentTime || playback.time || 0;
    const visible = state.feedback.filter(item =>
      item.pin && (item.id === selectedId || Math.abs((item.time || 0) - t) <= .45)
    );

    const saved = visible.map((item, index) => {
      const sev = severityMap[item.severity] || severityMap.major;
      const m = item.pin;
      if (m.type === 'area') {
        return `<button class="v2-saved-mark v2-area ${sev.tone} ${item.id === selectedId ? 'selected' : ''}" data-v2-mark="${item.id}" style="left:${m.x}%;top:${m.y}%;width:${Math.max(2.5,m.w)}%;height:${Math.max(2.5,m.h)}%"><span>${index + 1}</span></button>`;
      }
      return `<button class="v2-saved-mark v2-point ${sev.tone} ${item.id === selectedId ? 'selected' : ''}" data-v2-mark="${item.id}" style="left:${m.x}%;top:${m.y}%"><span>${index + 1}</span></button>`;
    }).join('');

    layer.innerHTML = saved + draftShapeHtml() + radialHtml();
    setLayerState();
  };

  function saveDraft() {
    const text = document.querySelector('#v2DraftText')?.value.trim();
    if (!text) {
      toast('Type the change first');
      document.querySelector('#v2DraftText')?.focus();
      return;
    }

    const item = {
      id: Date.now(),
      order: Date.now(),
      text,
      severity: draft.severity || 'major',
      category: document.querySelector('#v2Category')?.value || 'Editing',
      time: draft.time,
      slide: 0,
      pin: { ...draft.mark },
      status: 'open',
      replies: [],
    };

    state.feedback.push(item);
    state.activity.unshift({ type: 'feedback', itemId: item.id, at: Date.now() });
    selectedId = item.id;
    draft = null;
    persist();

    refreshSide();
    updateTimeline();
    renderPins(selectedId);
    toast('Feedback saved');
  }

  feedbackCardHtml = function (item) {
    if (state.review?.type !== 'video') return legacy.feedbackCardHtml(item);

    const meta = severityMap[item.severity] || severityMap.major;
    const statusText = { open: 'Open', working: 'In progress', ready: 'Ready for review', resolved: 'Resolved' }[item.status] || item.status;

    if (editingId === item.id && state.role === 'reviewer') {
      return `
        <article class="feedback-card v2-editing" data-feedback-card="${item.id}">
          <div class="v2-edit-head"><span>${formatTime(item.time)}</span><strong>Edit feedback</strong></div>
          <textarea data-v2-edit-text="${item.id}">${escapeHtml(item.text)}</textarea>
          <div class="v2-edit-controls">
            <select data-v2-edit-severity="${item.id}">
              <option value="blocker" ${item.severity === 'blocker' ? 'selected' : ''}>Must fix</option>
              <option value="major" ${item.severity === 'major' ? 'selected' : ''}>Change</option>
              <option value="suggestion" ${item.severity === 'suggestion' ? 'selected' : ''}>Suggestion</option>
            </select>
            <select data-v2-edit-category="${item.id}">
              ${['Editing','Content','Design','Audio','Branding','Technical'].map(x => `<option ${item.category === x ? 'selected' : ''}>${x}</option>`).join('')}
            </select>
          </div>
          <div class="card-actions">
            <button class="small" data-action="v2-cancel-edit" data-id="${item.id}">Cancel</button>
            <button class="small primary-small" data-action="v2-save-edit" data-id="${item.id}">Save changes</button>
          </div>
        </article>`;
    }

    const replies = item.replies.map(reply => `<div class="reply"><div class="reply-avatar">${escapeHtml(reply.author.slice(0,1).toUpperCase())}</div><div><div class="reply-meta">${escapeHtml(reply.author)} · ${timeAgo(reply.at)}</div><p>${escapeHtml(reply.text)}</p></div></div>`).join('');
    let actions = '';

    if (state.role === 'reviewer') {
      actions = item.status === 'ready'
        ? `<button class="small primary-small" data-action="resolve" data-id="${item.id}">Verify & resolve</button><button class="small" data-action="reopen" data-id="${item.id}">Needs another pass</button>`
        : item.status === 'resolved'
          ? `<button class="small" data-action="reopen" data-id="${item.id}">Reopen</button>`
          : `<button class="small" data-action="resolve" data-id="${item.id}">Resolve</button>`;
    } else {
      actions = item.status === 'open'
        ? `<button class="small" data-action="working" data-id="${item.id}">Start work</button><button class="small primary-small" data-action="ready" data-id="${item.id}">Mark ready</button>`
        : item.status === 'working'
          ? `<button class="small primary-small" data-action="ready" data-id="${item.id}">Ready for review</button>`
          : item.status === 'ready'
            ? `<button class="small" data-action="working" data-id="${item.id}">Continue working</button>`
            : `<span class="verified-copy">Verified by reviewer</span>`;
    }

    const markLabel = item.pin?.type === 'area' ? 'Selected area' : item.pin ? 'Pointed' : 'Frame';

    return `
      <article class="feedback-card ${item.status === 'resolved' ? 'resolved' : ''} ${selectedId === item.id ? 'v2-selected' : ''}" data-feedback-card="${item.id}">
        <button class="feedback-jump" data-action="jump" data-id="${item.id}">
          <div class="feedback-meta"><span class="severity-dot ${meta.tone}"></span><span>${meta.label}</span><span>·</span><span>${escapeHtml(item.category)}</span><span class="status-tag ${item.status}">${statusText}</span></div>
          <p class="feedback-copy">${escapeHtml(item.text)}</p>
          <span class="location">${formatTime(item.time)} · ${markLabel}</span>
        </button>
        <div class="card-actions">
          ${state.role === 'reviewer' ? `<button class="small" data-action="v2-edit" data-id="${item.id}">Edit</button>` : ''}
          ${actions}
        </div>
        <div class="thread">${replies}<div class="reply-box"><input data-reply="${item.id}" placeholder="Reply…"><button class="small" data-action="reply" data-id="${item.id}">Send</button></div></div>
      </article>`;
  };

  handleFeedbackAction = function (action, id) {
    const item = state.feedback.find(entry => entry.id === id);
    if (!item) return;

    if (action === 'jump') {
      jumpTo(id);
      return;
    }
    if (action === 'v2-edit') {
      editingId = id;
      refreshSide();
      setTimeout(() => document.querySelector(`[data-v2-edit-text="${id}"]`)?.focus(), 0);
      return;
    }
    if (action === 'v2-cancel-edit') {
      editingId = null;
      refreshSide();
      return;
    }
    if (action === 'v2-save-edit') {
      const text = document.querySelector(`[data-v2-edit-text="${id}"]`)?.value.trim();
      if (!text) return toast('Feedback cannot be empty');
      item.text = text;
      item.severity = document.querySelector(`[data-v2-edit-severity="${id}"]`)?.value || item.severity;
      item.category = document.querySelector(`[data-v2-edit-category="${id}"]`)?.value || item.category;
      editingId = null;
      persist();
      refreshSide();
      updateTimeline();
      renderPins(selectedId);
      toast('Feedback updated');
      return;
    }

    capturePlayback();
    legacy.handleFeedbackAction(action, id);
  };

  function jumpTo(id) {
    const item = state.feedback.find(entry => entry.id === id);
    const video = document.querySelector('#reviewVideo');
    if (!item || !video) return;
    selectedId = id;
    video.currentTime = item.time || 0;
    video.pause();
    playback.time = item.time || 0;
    playback.paused = true;
    updateTimeline();
    renderPins(id);
    document.querySelector(`[data-feedback-card="${id}"]`)?.scrollIntoView({ behavior:'smooth', block:'center' });
  }

  function bindSideActions() {
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.onclick = () => handleFeedbackAction(btn.dataset.action, Number(btn.dataset.id));
    });
    document.querySelectorAll('[data-reply]').forEach(input => {
      input.onkeydown = event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          handleFeedbackAction('reply', Number(input.dataset.reply));
        }
      };
    });
  }

  function refreshSide() {
    const rail = document.querySelector('.feedback-rail');
    if (!rail) return;
    rail.innerHTML = `
      <div class="rail-head">
        <div><div class="kicker">${state.role === 'reviewer' ? 'YOUR REVIEW' : 'CHANGE LIST'}</div><h2>${state.role === 'reviewer' ? 'Feedback' : 'Work to complete'}</h2></div>
        <span class="count-badge">${state.feedback.length}</span>
      </div>
      ${feedbackEmptyOrList()}`;
    bindSideActions();

    const progress = document.querySelector('#progressText');
    if (progress) {
      const resolved = state.feedback.filter(x => x.status === 'resolved').length;
      progress.textContent = `${resolved} of ${state.feedback.length} resolved`;
    }
  }

  const originalBindReview = bindReview;
  bindReview = function () {
    originalBindReview();
    bindSideActions();
  };

  render();
})();