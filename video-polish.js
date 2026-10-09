(() => {
  const FRAME = 1 / 30;
  let boundVideo = null;
  let resizeTimer = null;

  const $ = (s, root = document) => root.querySelector(s);

  function getVideo() { return $('#reviewVideo'); }
  function getStage() { return $('#mediaStage'); }
  function getLayer() { return $('#pinLayer'); }

  function isTypingTarget(target) {
    return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));
  }

  function cancelTransientUi() {
    const cancel = $('[data-v2-cancel]');
    if (cancel) { cancel.click(); return true; }
    const editCancel = $('[data-action="v2-cancel-edit"]');
    if (editCancel) { editCancel.click(); return true; }
    return false;
  }

  function displayedContentRect(video) {
    const r = video.getBoundingClientRect();
    if (!r.width || !r.height) return r;

    const controls = 44;
    const availableHeight = Math.max(1, r.height - controls);
    const mediaRatio = (video.videoWidth && video.videoHeight) ? video.videoWidth / video.videoHeight : r.width / availableHeight;
    const boxRatio = r.width / availableHeight;

    let width, height, left, top;
    if (boxRatio > mediaRatio) {
      height = availableHeight;
      width = height * mediaRatio;
      left = r.left + (r.width - width) / 2;
      top = r.top;
    } else {
      width = r.width;
      height = width / mediaRatio;
      left = r.left;
      top = r.top + (availableHeight - height) / 2;
    }
    return { left, top, width, height, right: left + width, bottom: top + height };
  }

  function adjustAnnotationLayer() {
    const stage = getStage();
    const video = getVideo();
    const layer = getLayer();
    if (!stage || !video || !layer || video.hidden) return;

    const sr = stage.getBoundingClientRect();
    const cr = displayedContentRect(video);
    Object.assign(layer.style, {
      left: `${cr.left - sr.left}px`,
      top: `${cr.top - sr.top}px`,
      width: `${cr.width}px`,
      height: `${cr.height}px`,
      right: 'auto',
      bottom: 'auto',
    });
    renderGutters(stage, sr, cr);
    renderShortcutHint(stage);
  }

  function renderGutters(stage, sr, cr) {
    let gutters = $('#v3Gutters', stage);
    if (!gutters) {
      gutters = document.createElement('div');
      gutters.id = 'v3Gutters';
      stage.appendChild(gutters);
    }
    gutters.innerHTML = '';

    const x = cr.left - sr.left;
    const y = cr.top - sr.top;
    const w = cr.width;
    const h = cr.height;
    const stageW = sr.width;
    const stageH = sr.height;

    const rects = [
      { left: 0, top: 0, width: Math.max(0, x), height: stageH },
      { left: x + w, top: 0, width: Math.max(0, stageW - (x + w)), height: stageH },
      { left: x, top: 0, width: w, height: Math.max(0, y) },
      { left: x, top: y + h, width: w, height: Math.max(0, stageH - (y + h)) },
    ].filter(r => r.width > 1 && r.height > 1);

    rects.forEach(rect => {
      const el = document.createElement('div');
      el.className = 'v3-gutter';
      Object.assign(el.style, {
        left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
      });
      el.title = 'Play / pause';
      el.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        togglePlayback();
      });
      gutters.appendChild(el);
    });
  }

  function renderShortcutHint(stage) {
    if ($('#v3Shortcuts', stage)) return;
    const hint = document.createElement('div');
    hint.id = 'v3Shortcuts';
    hint.className = 'v3-shortcuts';
    hint.innerHTML = '<span>Space · Play/Pause</span><span>Esc · Cancel</span><span>← → · Frame</span>';
    stage.appendChild(hint);
  }

  function flashPlayback(paused) {
    const stage = getStage();
    if (!stage) return;
    $('.v3-play-flash', stage)?.remove();
    const flash = document.createElement('div');
    flash.className = 'v3-play-flash';
    flash.textContent = paused ? '▶' : 'Ⅱ';
    stage.appendChild(flash);
    setTimeout(() => flash.remove(), 440);
  }

  function togglePlayback() {
    const video = getVideo();
    if (!video || video.hidden) return;
    cancelTransientUi();
    if (video.paused) {
      video.play().catch(() => {});
      flashPlayback(false);
    } else {
      video.pause();
      flashPlayback(true);
    }
  }

  function stepFrames(direction, count = 1) {
    const video = getVideo();
    if (!video || video.hidden || !Number.isFinite(video.duration)) return;
    cancelTransientUi();
    video.pause();
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + direction * FRAME * count));
  }

  function bindVideo(video) {
    if (!video || boundVideo === video) return;
    boundVideo = video;
    const adjust = () => requestAnimationFrame(adjustAnnotationLayer);
    video.addEventListener('loadedmetadata', adjust);
    video.addEventListener('loadeddata', adjust);
    video.addEventListener('play', adjust);
    video.addEventListener('pause', adjust);
    video.addEventListener('timeupdate', adjust);
    adjust();
  }

  function bindCurrentVideoSoon() {
    requestAnimationFrame(() => bindVideo(getVideo()));
  }

  document.addEventListener('keydown', event => {
    const video = getVideo();
    if (!video || video.hidden) return;

    if (event.key === 'Escape') {
      if (cancelTransientUi()) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      const saveDraft = $('[data-v2-save]');
      const saveEdit = $('[data-action="v2-save-edit"]');
      if (saveDraft || saveEdit) {
        event.preventDefault();
        (saveDraft || saveEdit).click();
      }
      return;
    }

    if (isTypingTarget(event.target)) return;

    if (event.code === 'Space') {
      event.preventDefault();
      togglePlayback();
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stepFrames(-1, event.shiftKey ? 10 : 1);
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      stepFrames(1, event.shiftKey ? 10 : 1);
      return;
    }

    if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      const stage = getStage();
      if (!document.fullscreenElement) stage?.requestFullscreen?.();
      else document.exitFullscreen?.();
    }
  }, true);

  document.addEventListener('click', event => {
    const video = getVideo();
    const stage = getStage();
    if (!video || !stage || video.hidden || !stage.contains(event.target)) return;

    // Saved marks, annotation controls, native controls and gutters own their clicks.
    if (event.target.closest('.v2-radial,.v2-note,.v2-saved-mark,.v3-gutter,button,input,textarea,select')) return;

    // While playing, clicking the visible video body should pause it.
    // When paused, the annotation layer owns clicks inside actual video content.
    if (!video.paused && event.target === video) {
      event.preventDefault();
      togglePlayback();
    }
  }, true);

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(adjustAnnotationLayer, 30);
  });
  document.addEventListener('fullscreenchange', () => requestAnimationFrame(adjustAnnotationLayer));

  const observer = new MutationObserver(() => bindCurrentVideoSoon());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  bindCurrentVideoSoon();
})();
