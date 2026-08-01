/* Transport plate — custom audio controls, and the timestamp list as a seek index.
 *
 * Progressive enhancement throughout: the markup ships a working native <audio
 * controls>. This file removes that attribute only once it has successfully
 * wired the custom UI, so any failure leaves the native player in place rather
 * than a dead plate.
 */
(function () {
  'use strict';

  var RATES = [1, 1.25, 1.5, 1.75, 2];

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '00:00';
    var whole = Math.floor(seconds);
    var h = Math.floor(whole / 3600);
    var m = Math.floor((whole % 3600) / 60);
    var s = whole % 60;
    var mm = h ? String(m).padStart(2, '0') : String(m).padStart(2, '0');
    return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
  }

  /** "1:02:15" or "58:44" -> seconds. Returns null when it is not a timecode. */
  function parseTime(text) {
    var m = String(text).trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return (parseInt(m[1] || '0', 10) * 3600) + (parseInt(m[2], 10) * 60) + parseInt(m[3], 10);
  }

  function setupTransport(plate) {
    var audio = plate.querySelector('[data-transport-audio]');
    var ui = plate.querySelector('[data-transport-ui]');
    if (!audio || !ui) return null;

    var playBtn = ui.querySelector('[data-transport-play]');
    var scrub = ui.querySelector('[data-transport-scrub]');
    var elapsed = ui.querySelector('[data-transport-elapsed]');
    var total = ui.querySelector('[data-transport-total]');
    var rateBtn = ui.querySelector('[data-transport-rate]');
    if (!playBtn || !scrub || !elapsed || !total) return null;

    var scrubbing = false;
    var rateIndex = 0;

    // Hand over from native controls only now that the custom UI is known good.
    audio.removeAttribute('controls');
    ui.hidden = false;

    function syncPlayButton() {
      var playing = !audio.paused && !audio.ended;
      plate.classList.toggle('is-playing', playing);
      playBtn.setAttribute('aria-label', playing ? 'Pause episode' : 'Play episode');
    }

    function syncProgress() {
      if (!scrubbing && audio.duration) {
        scrub.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
      }
      elapsed.textContent = formatTime(audio.currentTime);
      // The scrub thumb position drives a CSS variable so the filled portion of
      // the rule can be painted without a second element.
      var pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
      scrub.style.setProperty('--progress', pct + '%');
      scrub.setAttribute('aria-valuetext', formatTime(audio.currentTime) + ' of ' + formatTime(audio.duration));
    }

    playBtn.addEventListener('click', function () {
      if (audio.paused) {
        audio.play().catch(function () { /* user gesture rules vary; ignore */ });
      } else {
        audio.pause();
      }
    });

    audio.addEventListener('play', syncPlayButton);
    audio.addEventListener('pause', syncPlayButton);
    audio.addEventListener('ended', syncPlayButton);
    audio.addEventListener('timeupdate', syncProgress);

    // A missing or unreachable file otherwise leaves the plate frozen at 00:00
    // with no signal that anything went wrong.
    var errorBox = plate.querySelector('[data-transport-error]');
    audio.addEventListener('error', function () {
      if (errorBox) errorBox.hidden = false;
      ui.setAttribute('aria-disabled', 'true');
      playBtn.disabled = true;
      scrub.disabled = true;
    });

    audio.addEventListener('loadedmetadata', function () {
      if (isFinite(audio.duration)) total.textContent = formatTime(audio.duration);
      syncProgress();
    });

    scrub.addEventListener('input', function () {
      scrubbing = true;
      var pct = Number(scrub.value) / 1000;
      scrub.style.setProperty('--progress', pct * 100 + '%');
      if (audio.duration) elapsed.textContent = formatTime(pct * audio.duration);
    });

    scrub.addEventListener('change', function () {
      if (audio.duration) audio.currentTime = (Number(scrub.value) / 1000) * audio.duration;
      scrubbing = false;
    });

    ui.querySelectorAll('[data-transport-skip]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var delta = Number(btn.getAttribute('data-transport-skip'));
        var next = audio.currentTime + delta;
        audio.currentTime = Math.max(0, Math.min(next, audio.duration || next));
      });
    });

    if (rateBtn) {
      rateBtn.addEventListener('click', function () {
        rateIndex = (rateIndex + 1) % RATES.length;
        audio.playbackRate = RATES[rateIndex];
        rateBtn.textContent = RATES[rateIndex] + '×';
      });
    }

    syncPlayButton();
    syncProgress();

    return {
      seek: function (seconds) {
        audio.currentTime = seconds;
        if (audio.paused) audio.play().catch(function () {});
        plate.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    };
  }

  /**
   * Every episode page already lists timestamps. Wire them to the player so the
   * list becomes a chapter index instead of decoration. Without this script the
   * timestamps remain readable text, which is what they were before.
   */
  function setupTimestamps(transport) {
    if (!transport) return;

    document.querySelectorAll('.timestamps-list .timestamp').forEach(function (node) {
      var seconds = parseTime(node.textContent);
      if (seconds === null) return;

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'timestamp timestamp--seek';
      button.textContent = node.textContent.trim();
      button.setAttribute('aria-label', 'Play from ' + node.textContent.trim());
      button.addEventListener('click', function () { transport.seek(seconds); });

      node.replaceWith(button);
    });
  }

  function init() {
    var plate = document.querySelector('[data-transport]');
    if (!plate) return;
    setupTimestamps(setupTransport(plate));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
