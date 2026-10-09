const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const APP_KEY = 'fidbachr-zero-day-v1';

const severityMap = {
  blocker: { label: 'Blocker', tone: 'danger' },
  major: { label: 'Major', tone: 'major' },
  minor: { label: 'Minor', tone: 'minor' },
  suggestion: { label: 'Suggestion', tone: 'muted' },
};

const freshState = () => ({
  screen: 'home',
  role: 'reviewer',
  review: null,
  feedback: [],
  activity: [],
  currentSlide: 0,
  pendingPin: null,
  walkthroughDismissed: false,
});

let state = loadState();
let mediaUrls = [];
let mediaDuration = 0;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(APP_KEY));
    if (saved && saved.version === 1) return { ...freshState(), ...saved.state, screen: saved.state?.review ? saved.state.screen : 'home' };
  } catch (_) {}
  return freshState();
}

function persist() {
  const safe = {
    ...state,
    review: state.review ? { ...state.review, files: [] } : null,
  };
  localStorage.setItem(APP_KEY, JSON.stringify({ version: 1, state: safe }));
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1800);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function formatTime(seconds = 0) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function timeAgo(ts) {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

function setState(patch) {
  state = { ...state, ...patch };
  persist();
  render();
}

function resetAll() {
  mediaUrls.forEach(url => URL.revokeObjectURL(url));
  mediaUrls = [];
  mediaDuration = 0;
  localStorage.removeItem(APP_KEY);
  state = freshState();
  render();
  toast('Fresh workspace ready');
}

function render() {
  const app = $('#app');
  if (!state.review || state.screen === 'home') {
    app.innerHTML = homeHtml();
    bindHome();
    return;
  }
  app.innerHTML = reviewHtml();
  bindReview();
  hydrateMedia();
}

function homeHtml() {
  return `
    <div class="home-shell">
      <header class="home-nav">
        <a class="wordmark" href="#" aria-label="fidbachr home"><span class="mark">f</span><span>fidbachr</span></a>
        <div class="nav-actions">
          <span class="beta-pill">private beta</span>
          ${state.review ? '<button class="ghost-btn" id="resumeBtn">Resume draft</button>' : ''}
        </div>
      </header>

      <main class="onboarding-wrap">
        <section class="intro-copy">
          <div class="kicker">CREATIVE REVIEW, WITHOUT THE MESS</div>
          <h1>What do you want to review?</h1>
          <p>Upload a creative, leave feedback exactly where it matters, and turn every comment into a change your creator can actually complete.</p>
        </section>

        <section class="type-grid" aria-label="Choose creative type">
          <button class="type-card" id="newVideoBtn">
            <div class="type-icon">▶</div>
            <div class="type-copy"><h2>Video / Reel</h2><p>Review a reel, ad, short, cut or any browser-playable video.</p></div>
            <span class="arrow">→</span>
          </button>
          <button class="type-card" id="newStaticBtn">
            <div class="type-icon">▧</div>
            <div class="type-copy"><h2>Static / Carousel</h2><p>Review one image or upload several images as a carousel.</p></div>
            <span class="arrow">→</span>
          </button>
        </section>

        <section class="how-row">
          <div><span>1</span><strong>Upload</strong><small>Your file stays in this browser for this prototype.</small></div>
          <div><span>2</span><strong>Mark feedback</strong><small>Timestamp video or click directly on a static.</small></div>
          <div><span>3</span><strong>Send changes</strong><small>Creator replies, fixes, and submits work back for verification.</small></div>
        </section>

        <div class="prototype-note">Zero-day prototype · no account required · no sample data</div>
      </main>
    </div>`;
}

function bindHome() {
  $('#newVideoBtn')?.addEventListener('click', () => $('#videoPicker').click());
  $('#newStaticBtn')?.addEventListener('click', () => $('#imagePicker').click());
  $('#resumeBtn')?.addEventListener('click', () => setState({ screen: 'review' }));

  $('#videoPicker').onchange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    startReview('video', [file]);
    event.target.value = '';
  };

  $('#imagePicker').onchange = (event) => {
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    startReview(files.length > 1 ? 'carousel' : 'image', files);
    event.target.value = '';
  };
}

function startReview(type, files) {
  mediaUrls.forEach(url => URL.revokeObjectURL(url));
  mediaUrls = files.map(file => URL.createObjectURL(file));
  const firstName = files[0]?.name || 'Untitled creative';
  const base = firstName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  state = {
    ...freshState(),
    screen: 'review',
    review: {
      id: Date.now(),
      type,
      title: base || 'Untitled creative',
      fileNames: files.map(f => f.name),
      version: 1,
      createdAt: Date.now(),
    },
  };
  persist();
  render();
}

function reviewHtml() {
  const count = state.feedback.length;
  const resolved = state.feedback.filter(item => item.status === 'resolved').length;
  const needsReview = state.feedback.filter(item => item.status === 'ready').length;
  const isReviewer = state.role === 'reviewer';
  const isCarousel = state.review.type === 'carousel';
  const mediaLabel = state.review.type === 'video' ? 'VIDEO / REEL' : isCarousel ? 'CAROUSEL' : 'STATIC';

  return `
    <div class="product-shell">
      <header class="topbar">
        <button class="wordmark bare" id="homeBtn"><span class="mark">f</span><span>fidbachr</span></button>
        <div class="review-title-wrap">
          <span class="crumb">My reviews /</span>
          <strong>${escapeHtml(state.review.title)}</strong>
          <span class="version-pill">V${state.review.version}</span>
        </div>
        <div class="top-actions">
          <div class="role-switch">
            <button class="role-btn ${isReviewer ? 'active' : ''}" data-role="reviewer">Reviewer</button>
            <button class="role-btn ${!isReviewer ? 'active' : ''}" data-role="creator">Creator preview</button>
          </div>
          <button class="ghost-btn" id="startOverBtn">Start over</button>
          <button class="primary-btn" id="finishBtn">${isReviewer ? 'Finish review' : 'Notify reviewer'}</button>
        </div>
      </header>

      ${!state.walkthroughDismissed ? walkthroughHtml(count) : ''}

      <main class="review-layout">
        <section class="canvas-column">
          <div class="asset-header">
            <div><div class="kicker">${mediaLabel}</div><h1>${escapeHtml(state.review.title)}</h1></div>
            <div class="asset-stats"><span>${resolved}/${count} resolved</span>${needsReview ? `<span class="attention">${needsReview} ready for you</span>` : ''}</div>
          </div>

          <div class="media-stage ${state.review.type}" id="mediaStage">
            <div class="media-missing" id="mediaMissing" hidden>
              <div class="missing-icon">↥</div>
              <h3>Re-select your file to continue</h3>
              <p>Files are intentionally not uploaded to a server in this zero-day prototype.</p>
              <button class="primary-btn" id="reselectBtn">Choose file again</button>
            </div>
            <video id="reviewVideo" controls playsinline hidden></video>
            <img id="reviewImage" alt="Creative being reviewed" hidden />
            <div class="pin-layer" id="pinLayer"></div>
          </div>

          ${state.review.type === 'carousel' ? carouselStripHtml() : ''}
          ${state.review.type === 'video' ? timelineHtml() : ''}

          ${isReviewer ? reviewerComposerHtml() : creatorHelperHtml()}
        </section>

        <aside class="feedback-rail">
          <div class="rail-head">
            <div><div class="kicker">${isReviewer ? 'YOUR REVIEW' : 'CHANGE LIST'}</div><h2>${isReviewer ? 'Feedback' : 'Work to complete'}</h2></div>
            <span class="count-badge">${count}</span>
          </div>
          ${feedbackEmptyOrList()}
        </aside>
      </main>
    </div>

    <dialog id="finishDialog" class="finish-dialog">
      <div class="dialog-top"><div><div class="kicker">REVIEW SUMMARY</div><h2>${count ? `${count} change${count === 1 ? '' : 's'} captured` : 'Nothing added yet'}</h2></div><button class="icon-close" id="closeDialog">×</button></div>
      <div id="finishSummary">${summaryHtml()}</div>
      <div class="dialog-actions">
        <button class="ghost-btn" id="copyListBtn">Copy change list</button>
        <button class="primary-btn" id="simulateSendBtn" ${count ? '' : 'disabled'}>${isReviewer ? 'Send to creator' : 'Notify reviewer'}</button>
      </div>
    </dialog>`;
}

function walkthroughHtml(count) {
  const step = !mediaUrls.length ? 1 : count === 0 ? 2 : 3;
  return `
    <div class="walkthrough">
      <div class="walk-copy"><span class="walk-badge">FIRST REVIEW</span><strong>${step === 1 ? 'Your creative is ready.' : step === 2 ? 'Now leave your first piece of feedback.' : 'Nice — keep reviewing or finish when you are done.'}</strong><span>${step === 2 ? (state.review.type === 'video' ? 'Play or scrub to the exact moment, then type what should change.' : 'Click anywhere on the creative to pin feedback, then describe the change.') : 'This guide disappears once you are comfortable.'}</span></div>
      <div class="walk-steps"><span class="${step >= 1 ? 'done' : ''}">1 Upload</span><span class="${step >= 2 ? 'done' : ''}">2 Review</span><span class="${step >= 3 ? 'done' : ''}">3 Send</span></div>
      <button class="walk-close" id="dismissGuide">Got it</button>
    </div>`;
}

function carouselStripHtml() {
  return `<div class="carousel-strip">${state.review.fileNames.map((name, index) => `<button class="slide-thumb ${index === state.currentSlide ? 'active' : ''}" data-slide="${index}"><span>${index + 1}</span><small>${escapeHtml(name)}</small></button>`).join('')}</div>`;
}

function timelineHtml() {
  return `
    <div class="timeline-block">
      <div class="timeline-meta"><span id="timeReadout">00:00 / 00:00</span><span>Feedback markers appear here</span></div>
      <div class="timeline" id="timeline"><div class="timeline-played" id="timelinePlayed"></div><div class="timeline-markers" id="timelineMarkers"></div></div>
    </div>`;
}

function reviewerComposerHtml() {
  const context = state.review.type === 'video'
    ? `At <strong id="composerTime">00:00</strong>`
    : state.pendingPin
      ? `<strong>Pinned</strong> to this creative`
      : 'General feedback · click the creative to pin it';
  return `
    <section class="composer">
      <div class="composer-context" id="composerContext">${context}</div>
      <textarea id="feedbackText" placeholder="What should change? Be as natural as you like…"></textarea>
      <div class="composer-footer">
        <div class="selects">
          <select id="severitySelect"><option value="major">Major</option><option value="blocker">Blocker</option><option value="minor">Minor</option><option value="suggestion">Suggestion</option></select>
          <select id="categorySelect"><option>Editing</option><option>Content</option><option>Design</option><option>Audio</option><option>Branding</option><option>Technical</option></select>
        </div>
        <button class="primary-btn" id="addFeedbackBtn">Add feedback</button>
      </div>
    </section>`;
}

function creatorHelperHtml() {
  return `<section class="creator-helper"><div><div class="kicker">CREATOR PREVIEW</div><strong>This is what the person doing the work sees.</strong><p>Reply to a change, mark it in progress, then submit it back to the reviewer.</p></div><button class="ghost-btn" id="backReviewerBtn">Back to reviewer</button></section>`;
}

function feedbackEmptyOrList() {
  if (!state.feedback.length) {
    return `<div class="rail-empty"><div class="empty-orbit"><span>+</span></div><h3>No feedback yet</h3><p>${state.role === 'reviewer' ? 'Your comments will appear here and automatically become a change list.' : 'The reviewer has not added any changes yet.'}</p><div class="empty-tip">${state.review.type === 'video' ? 'Tip: play the video to the exact moment you want to discuss.' : 'Tip: click directly on the creative to attach feedback to a specific area.'}</div></div>`;
  }
  return `<div class="feedback-list">${[...state.feedback].sort((a, b) => a.order - b.order).map(feedbackCardHtml).join('')}</div>`;
}

function feedbackCardHtml(item) {
  const meta = severityMap[item.severity];
  const location = state.review.type === 'video' ? formatTime(item.time) : item.pin ? `Pinned · ${state.review.type === 'carousel' ? `Slide ${(item.slide ?? 0) + 1}` : 'Static'}` : 'General';
  const statusText = { open: 'Open', working: 'In progress', ready: 'Ready for review', resolved: 'Resolved' }[item.status] || item.status;
  const replies = item.replies.map(reply => `<div class="reply"><div class="reply-avatar">${escapeHtml(reply.author.slice(0, 1).toUpperCase())}</div><div><div class="reply-meta">${escapeHtml(reply.author)} · ${timeAgo(reply.at)}</div><p>${escapeHtml(reply.text)}</p></div></div>`).join('');
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

  return `<article class="feedback-card ${item.status === 'resolved' ? 'resolved' : ''}" data-feedback-card="${item.id}">
    <button class="feedback-jump" data-action="jump" data-id="${item.id}">
      <div class="feedback-meta"><span class="severity-dot ${meta.tone}"></span><span>${meta.label}</span><span>·</span><span>${escapeHtml(item.category)}</span><span class="status-tag ${item.status}">${statusText}</span></div>
      <p class="feedback-copy">${escapeHtml(item.text)}</p>
      <span class="location">${location}</span>
    </button>
    <div class="card-actions">${actions}</div>
    <div class="thread">${replies}<div class="reply-box"><input data-reply="${item.id}" placeholder="Reply…"><button class="small" data-action="reply" data-id="${item.id}">Send</button></div></div>
  </article>`;
}

function summaryHtml() {
  if (!state.feedback.length) return '<div class="summary-empty">Add feedback before sending a review.</div>';
  const groups = ['blocker', 'major', 'minor', 'suggestion'].map(level => ({ level, items: state.feedback.filter(item => item.severity === level && item.status !== 'resolved') })).filter(group => group.items.length);
  const unresolved = state.feedback.filter(item => item.status !== 'resolved').length;
  return `<div class="summary-count"><strong>${unresolved}</strong><span>changes still open</span></div>${groups.map(group => `<section class="summary-group"><h3><span class="severity-dot ${severityMap[group.level].tone}"></span>${severityMap[group.level].label} · ${group.items.length}</h3>${group.items.map(item => `<div class="summary-line"><span>${state.review.type === 'video' ? formatTime(item.time) : item.pin ? 'Pinned' : 'General'}</span><p>${escapeHtml(item.text)}</p></div>`).join('')}</section>`).join('')}`;
}

function bindReview() {
  $('#homeBtn')?.addEventListener('click', () => setState({ screen: 'home' }));
  $('#startOverBtn')?.addEventListener('click', resetAll);
  $('#dismissGuide')?.addEventListener('click', () => setState({ walkthroughDismissed: true }));
  $('#backReviewerBtn')?.addEventListener('click', () => setState({ role: 'reviewer' }));
  $$('.role-btn').forEach(btn => btn.addEventListener('click', () => setState({ role: btn.dataset.role })));
  $('#finishBtn')?.addEventListener('click', () => $('#finishDialog').showModal());
  $('#closeDialog')?.addEventListener('click', () => $('#finishDialog').close());
  $('#copyListBtn')?.addEventListener('click', copyChangeList);
  $('#simulateSendBtn')?.addEventListener('click', () => {
    $('#finishDialog').close();
    state.activity.unshift({ type: 'send', at: Date.now() });
    persist();
    toast(state.role === 'reviewer' ? 'Creator link simulated — backend comes next' : 'Reviewer notified');
  });
  $('#addFeedbackBtn')?.addEventListener('click', addFeedback);
  $('#reselectBtn')?.addEventListener('click', () => state.review.type === 'video' ? $('#videoPicker').click() : $('#imagePicker').click());

  $('#videoPicker').onchange = (event) => {
    const file = event.target.files?.[0];
    if (file) attachFiles([file]);
    event.target.value = '';
  };
  $('#imagePicker').onchange = (event) => {
    const files = [...(event.target.files || [])];
    if (files.length) attachFiles(files);
    event.target.value = '';
  };

  $$('.slide-thumb').forEach(btn => btn.addEventListener('click', () => {
    state.currentSlide = Number(btn.dataset.slide);
    state.pendingPin = null;
    persist();
    render();
  }));

  $$('[data-action]').forEach(btn => btn.addEventListener('click', () => handleFeedbackAction(btn.dataset.action, Number(btn.dataset.id))));
  $$('[data-reply]').forEach(input => input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); handleFeedbackAction('reply', Number(input.dataset.reply)); }
  }));
}

function attachFiles(files) {
  mediaUrls.forEach(url => URL.revokeObjectURL(url));
  mediaUrls = files.map(file => URL.createObjectURL(file));
  state.review.fileNames = files.map(file => file.name);
  if (state.review.type !== 'video') state.review.type = files.length > 1 ? 'carousel' : 'image';
  state.currentSlide = 0;
  persist();
  render();
}

function hydrateMedia() {
  const missing = $('#mediaMissing');
  if (!mediaUrls.length) {
    missing.hidden = false;
    return;
  }
  missing.hidden = true;
  if (state.review.type === 'video') {
    const video = $('#reviewVideo');
    video.hidden = false;
    video.src = mediaUrls[0];
    video.addEventListener('loadedmetadata', () => {
      mediaDuration = video.duration || 0;
      updateTimeline();
    });
    video.addEventListener('timeupdate', () => {
      updateTimeline();
      const t = $('#composerTime');
      if (t) t.textContent = formatTime(video.currentTime);
    });
    $('#timeline')?.addEventListener('click', event => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (!mediaDuration) return;
      video.currentTime = Math.max(0, Math.min(mediaDuration, (event.clientX - rect.left) / rect.width * mediaDuration));
    });
  } else {
    const image = $('#reviewImage');
    image.hidden = false;
    image.src = mediaUrls[state.currentSlide] || mediaUrls[0];
    $('#mediaStage').addEventListener('click', event => {
      if (state.role !== 'reviewer' || event.target.closest('button')) return;
      const rect = $('#mediaStage').getBoundingClientRect();
      state.pendingPin = {
        x: Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)),
        y: Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100)),
      };
      persist();
      renderPins();
      const context = $('#composerContext');
      if (context) context.innerHTML = '<strong>Pinned</strong> to this creative';
      $('#feedbackText')?.focus();
    });
  }
  renderPins();
  updateTimeline();
}

function addFeedback() {
  const text = $('#feedbackText')?.value.trim();
  if (!text) { toast('Write the feedback first'); return; }
  const video = $('#reviewVideo');
  const item = {
    id: Date.now(),
    order: Date.now(),
    text,
    severity: $('#severitySelect').value,
    category: $('#categorySelect').value,
    time: state.review.type === 'video' ? (video?.currentTime || 0) : 0,
    slide: state.review.type === 'carousel' ? state.currentSlide : 0,
    pin: state.review.type === 'video' ? null : state.pendingPin ? { ...state.pendingPin } : null,
    status: 'open',
    replies: [],
  };
  state.feedback.push(item);
  state.pendingPin = null;
  state.activity.unshift({ type: 'feedback', itemId: item.id, at: Date.now() });
  persist();
  render();
  toast('Feedback added');
}

function handleFeedbackAction(action, id) {
  const item = state.feedback.find(entry => entry.id === id);
  if (!item) return;
  if (action === 'jump') {
    if (state.review.type === 'video') {
      const video = $('#reviewVideo');
      if (video) { video.currentTime = item.time; video.pause(); }
    } else if (state.review.type === 'carousel' && state.currentSlide !== item.slide) {
      state.currentSlide = item.slide || 0;
      persist();
      render();
      return;
    }
    document.querySelector(`[data-feedback-card="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    renderPins(id);
    return;
  }
  if (action === 'reply') {
    const input = document.querySelector(`[data-reply="${id}"]`);
    const text = input?.value.trim();
    if (!text) return;
    item.replies.push({ author: state.role === 'reviewer' ? 'Reviewer' : 'Creator', role: state.role, text, at: Date.now() });
    state.activity.unshift({ type: 'reply', itemId: id, at: Date.now() });
  } else if (action === 'working') {
    item.status = 'working';
  } else if (action === 'ready') {
    item.status = 'ready';
    toast('Marked ready for reviewer');
  } else if (action === 'resolve') {
    item.status = 'resolved';
    toast('Resolved');
  } else if (action === 'reopen') {
    item.status = 'open';
  }
  persist();
  render();
}

function renderPins(highlightId = null) {
  const layer = $('#pinLayer');
  if (!layer || state.review.type === 'video') return;
  const relevant = state.feedback.filter(item => item.pin && (state.review.type !== 'carousel' || item.slide === state.currentSlide));
  layer.innerHTML = relevant.map((item, index) => `<button class="pin ${item.id === highlightId ? 'pulse' : ''}" data-pin-jump="${item.id}" style="left:${item.pin.x}%;top:${item.pin.y}%">${index + 1}</button>`).join('') + (state.pendingPin ? `<div class="pin pending" style="left:${state.pendingPin.x}%;top:${state.pendingPin.y}%">+</div>` : '');
  $$('[data-pin-jump]', layer).forEach(btn => btn.addEventListener('click', event => { event.stopPropagation(); handleFeedbackAction('jump', Number(btn.dataset.pinJump)); }));
}

function updateTimeline() {
  if (state.review?.type !== 'video') return;
  const video = $('#reviewVideo');
  const duration = video?.duration || mediaDuration || 0;
  const current = video?.currentTime || 0;
  const readout = $('#timeReadout');
  if (readout) readout.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
  const played = $('#timelinePlayed');
  if (played) played.style.width = duration ? `${current / duration * 100}%` : '0%';
  const markers = $('#timelineMarkers');
  if (markers) {
    markers.innerHTML = state.feedback.map(item => `<button class="timeline-dot ${severityMap[item.severity].tone}" data-marker="${item.id}" style="left:${duration ? Math.min(100, item.time / duration * 100) : 0}%" title="${escapeHtml(item.text)}"></button>`).join('');
    $$('[data-marker]', markers).forEach(btn => btn.addEventListener('click', event => { event.stopPropagation(); handleFeedbackAction('jump', Number(btn.dataset.marker)); }));
  }
}

async function copyChangeList() {
  const lines = state.feedback.map((item, index) => `${index + 1}. [${severityMap[item.severity].label}] ${item.category} — ${state.review.type === 'video' ? formatTime(item.time) : item.pin ? 'Pinned' : 'General'} — ${item.text}`);
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    toast('Change list copied');
  } catch (_) {
    toast('Copy was blocked by the browser');
  }
}

render();
