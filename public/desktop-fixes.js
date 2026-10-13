/*
 * Display + audio fixes for the AB China mini-game. Loaded after the bundle.
 *
 * The game is landscape-only (design 1280x720). LayaAir can play it sideways on
 * a portrait screen: with scaleMode "fixedauto" + screenMode "horizontal", a
 * portrait window makes Laya swap width/height and rotate the canvas 90deg via a
 * CSS transform (touch points are mapped back through stage._canvasTransform).
 *
 * Mode selection (re-evaluated on every resize / orientation change):
 *   - touch device (phone/tablet)  -> rotate mode
 *   - any window that is currently portrait (e.g. a narrow desktop window)
 *                                  -> rotate mode
 *   - otherwise (landscape desktop) -> letterboxed "showall", never rotated
 *
 * URL overrides:  ?rotate=1  always rotate mode
 *                 ?rotate=0  never rotate (plain letterbox)
 * With ?log=1 the chosen mode and the stage state are printed to the on-screen
 * log as "[display] ...".
 */
(function () {
  "use strict";

  var qs = location.search;
  var ua = navigator.userAgent || "";
  var coarse = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
  var mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
                 (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);   // iPadOS
  var TOUCH = coarse || mobileUA;

  function viewport() {
    var vv = window.visualViewport;
    return {
      w: Math.round((vv && vv.width) || window.innerWidth || document.documentElement.clientWidth || 0),
      h: Math.round((vv && vv.height) || window.innerHeight || document.documentElement.clientHeight || 0)
    };
  }

  function wantRotate() {
    if (/[?&]rotate=1\b/.test(qs)) return true;
    if (/[?&]rotate=0\b/.test(qs)) return false;
    var v = viewport();
    return TOUCH || v.h > v.w;
  }

  // 1) Stage scaling / orientation ------------------------------------------
  var lastKey = "";
  function apply(why) {
    var L = window.Laya;
    if (!(L && L.stage)) return false;
    var st = L.stage, rot = wantRotate();
    try {
      var scale = rot ? "fixedauto" : "showall";   // rotate: fill screen; else letterbox
      var mode  = rot ? "horizontal" : "none";     // horizontal: portrait window -> rotate canvas
      if (st.scaleMode !== scale) st.scaleMode = scale;
      if (st.screenMode !== mode) st.screenMode = mode;
      st.alignH = "center";
      st.alignV = "middle";
      if (st._resetCanvas) st._resetCanvas();      // apply now, not on the next callLater

      var v = viewport();
      var key = [rot, mode, scale, st.canvasRotation, v.w, v.h].join("|");
      if (key !== lastKey) {
        lastKey = key;
        console.log("[display] " + why + ": rotate=" + rot + " touch=" + TOUCH +
          " window=" + v.w + "x" + v.h + " dpr=" + (window.devicePixelRatio || 1) +
          " scale=" + st.scaleMode + " screenMode=" + st.screenMode +
          " canvasRotation=" + st.canvasRotation + " stage=" + st.width + "x" + st.height);
        if (rot && v.h > v.w && !st.canvasRotation) {
          console.warn("[display] portrait window but the canvas is NOT rotated");
        }
      }
    } catch (e) { console.warn("[display-fixes] stage:", e); }
    return true;
  }

  // Wait for the Laya stage, apply once, then keep it applied: iOS Safari reports
  // stale sizes right after load / rotation / toolbar collapse, and game code may
  // touch the stage settings during boot.
  (function boot() {
    if (!apply("boot")) return setTimeout(boot, 100);
    [400, 1200, 3000, 7000].forEach(function (ms) {
      setTimeout(function () { apply("recheck " + ms + "ms"); }, ms);
    });
  })();

  var timer = null;
  function settle(ev) {
    clearTimeout(timer);
    timer = setTimeout(function () { apply(ev && ev.type || "resize"); }, 150);
  }
  window.addEventListener("resize", settle);
  window.addEventListener("orientationchange", settle);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", settle);

  // 2) GI.gScale() (ad/effect placement) is derived from the window size without
  //    accounting for the 90deg swap. Recompute it with the swap applied.
  (function patchGScale() {
    var mgr = window.GI && GI.uiViewMgr;
    if (!(mgr && window.Laya && Laya.stage)) { return setTimeout(patchGScale, 200); }
    mgr.calcGScale = function () {
      var cw = Laya.Browser.clientWidth, ch = Laya.Browser.clientHeight;
      if (Laya.stage.canvasRotation) { var t = cw; cw = ch; ch = t; }
      this._gScale = Math.min(cw / Laya.stage.width, ch / Laya.stage.height);
    };
    mgr.calcGScale();
  })();

  // 3) Audio. Browsers suspend the WebAudio context until a user gesture, and
  //    this Laya build doesn't resume it, so music/sfx stay silent. Resume on
  //    the first interaction.
  function resumeAudio() {
    try {
      var ctx = (window.Laya && Laya.WebAudioSound && Laya.WebAudioSound.ctx) ||
                (window.Laya && Laya.SoundManager && Laya.SoundManager.ctx);
      if (ctx && ctx.state === "suspended" && ctx.resume) ctx.resume();
    } catch (e) {}
  }
  ["pointerdown", "touchstart", "mousedown", "keydown"].forEach(function (ev) {
    window.addEventListener(ev, resumeAudio, { capture: true });
  });
})();
