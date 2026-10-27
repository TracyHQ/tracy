/* Post actual replay time so file and HTTP previews share the same clock. */
(() => {
  'use strict';
  if (parent === window) return;
  function frame() {
    if (window.welcomeEngine) {
      const state = window.welcomeEngine.status();
      parent.postMessage({
        type: 'welcome-playback-progress', source: location.href,
        time: state.time, total: state.total ?? state.duration,
        motion: state.motion, paused: state.paused
      }, '*');
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
