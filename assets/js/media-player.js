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
        /* Any rate but 1x is a state worth showing, and it is the only thing
         * in this group that holds one. Marking it lets the filled treatment
         * mean "speed is changed" rather than "the mouse is here". */
        rateBtn.toggleAttribute('data-rate-changed', RATES[rateIndex] !== 1);
        rateBtn.setAttribute('aria-label', 'Playback speed, currently ' + RATES[rateIndex] + ' times');
      });
    }

    /* Audio and video are one episode in two formats. Switching hands the
     * playhead over and pauses the other, so there is never a moment with two
     * copies of the same conversation playing. */
    var watchBtn = ui.querySelector('[data-transport-watch]');
    var videoPanel = document.querySelector('[data-transport-video-panel]');
    var video = videoPanel ? videoPanel.querySelector('video') : null;

    if (watchBtn && video && videoPanel) {
      /* The panel's visibility is owned by CSS keyed on [data-watching], so it
       * is already collapsed at first paint. Setting .hidden here instead made
       * the video flash in before this ran. */
      videoPanel.removeAttribute('data-watching');
      watchBtn.hidden = false;

      watchBtn.addEventListener('click', function () {
        var watching = !videoPanel.hasAttribute('data-watching');
        videoPanel.toggleAttribute('data-watching', watching);
        watchBtn.setAttribute('aria-pressed', String(watching));
        watchBtn.textContent = watching ? 'Listen' : 'Watch';

        if (watching) {
          var at = audio.currentTime;
          var wasPlaying = !audio.paused;
          audio.pause();
          video.currentTime = at;
          videoPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          if (wasPlaying) video.play().catch(function () {});
        } else {
          audio.currentTime = video.currentTime;
          var videoWasPlaying = !video.paused;
          video.pause();
          if (videoWasPlaying) audio.play().catch(function () {});
        }
      });

      // Playing the video directly should still silence the audio.
      video.addEventListener('play', function () {
        if (!audio.paused) {
          audio.currentTime = video.currentTime;
          audio.pause();
        }
      });
      audio.addEventListener('play', function () {
        if (!video.paused) video.pause();
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

    /* The native player is hidden at first paint under .js, so if wiring fails
     * the reader would be left with a custom transport that does nothing. Put
     * the native one back instead -- a working player beats a pretty dead one. */
    try {
      var transport = setupTransport(plate);
      if (!transport) throw new Error('transport did not initialise');
      setupTimestamps(transport);
    } catch (err) {
      var audio = plate.querySelector('[data-transport-audio]');
      if (audio) audio.setAttribute('controls', '');
      var section = plate.closest('.transport') || plate;
      section.classList.add('transport--fallback');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* Dock the player to the bottom edge once the reader scrolls past it, and
 * release it when they scroll back, so the controls stay reachable while you
 * are down in the chapters or the transcript.
 *
 * A plain scroll check rather than IntersectionObserver: the observer version
 * needed a sentinel element, and a zero-area sentinel never reports an
 * intersection change, so it fired once and never again. Comparing the
 * plate's own position is the same decision with none of that, and it behaves
 * the same in every browser. The read is batched into a rAF so a fast scroll
 * does not force layout on every event.
 *
 * The docked appearance lives in CSS under .is-docked. The class and that rule
 * are a pair: without the rule the spacer still reserved the plate's height
 * while the plate never left the flow, which left a player-sized hole in the
 * middle of the page.
 */
(function () {
  'use strict';

  function init() {
    var section = document.querySelector('.transport--audio');
    var plate = section ? section.querySelector('.transport__plate') : null;
    if (!section || !plate) return;

    var spacer = document.createElement('div');
    spacer.setAttribute('aria-hidden', 'true');
    spacer.style.display = 'none';
    section.appendChild(spacer);

    var RELEASE = 24;   // px of travel required before a docked bar lets go
    var docked = false;
    var queued = false;

    function measure() {
      queued = false;
      /* While docked the plate is out of flow, so the section is what still
       * holds a position in the document; undocked, the plate is the section's
       * content. Either way this is the top of where the player belongs. */
      var anchor = docked ? spacer : plate;
      var bottom = anchor.getBoundingClientRect().bottom;

      /* A deadband, not a single threshold. The first upward scroll on a phone
       * is also when the browser's URL bar animates back in, which changes the
       * viewport height and therefore every rect read mid-gesture. With one
       * threshold that wobble flips the state back and forth across a couple of
       * frames -- felt as a jerk exactly on that first scroll-up. Docking needs
       * the anchor fully off the top; releasing needs it clearly back on
       * screen, and viewport noise between the two changes nothing. */
      var passed = docked ? bottom < RELEASE : bottom < 0;
      if (passed === docked) return;

      if (passed) spacer.style.height = plate.offsetHeight + 'px';
      spacer.style.display = passed ? 'block' : 'none';
      section.classList.toggle('is-docked', passed);
      if (!passed) spacer.style.height = '';
      docked = passed;

      /* Reserve the bar's height at the foot of the document, or the bar sits
       * over the footer once you reach the bottom of the page. Measured after
       * the class lands, since the docked bar is slimmer than the plate. */
      var root = document.documentElement;
      root.classList.toggle('is-player-docked', passed);
      if (passed) {
        root.style.setProperty('--docked-height', plate.offsetHeight + 'px');
      } else {
        root.style.removeProperty('--docked-height');
      }

      anchorToVisualViewport();
    }

    /* `position: fixed; bottom: 0` anchors to the *layout* viewport. On a phone
     * that is not where the bottom of the screen is: the browser keeps the
     * layout viewport frozen while the URL bar slides in and out, and only the
     * *visual* viewport tracks what you can actually see. Chrome then
     * repositions fixed elements against that moving target, so the bar drifts
     * against the page during the toolbar animation.
     *
     * The fix production apps use: read the visual viewport and translate the
     * bar by the difference, so it sits on the visible bottom edge rather than
     * the layout one. The gap is zero on desktop and whenever the toolbar is at
     * rest, so this writes an identity transform almost all of the time.
     *
     * transform is the right property for it -- the bar is already promoted to
     * its own compositor layer while docked, so this costs no repaint. The
     * visualViewport events fire per frame during the animation, which is
     * exactly the cadence needed. */
    function anchorToVisualViewport() {
      var vv = window.visualViewport;
      if (!vv) return;

      /* Read the class, not the local flag: the class is what actually put the
       * plate into fixed positioning, so it is the thing this correction has to
       * agree with. Two sources of truth here would drift. */
      if (!section.classList.contains('is-docked')) {
        plate.style.transform = '';
        return;
      }

      var gap = window.innerHeight - vv.height - vv.offsetTop;
      plate.style.transform = gap > 0.5 ? 'translateY(' + -gap + 'px)' : '';
    }

    function onScroll() {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(measure);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', anchorToVisualViewport);
      window.visualViewport.addEventListener('scroll', anchorToVisualViewport);
    }

    measure();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
