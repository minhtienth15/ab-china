/*
 * Browser shim for the WeChat (wx) AND QQ (qq) mini-game APIs.
 *
 * The bundle only registers its platform module when `window.wx` / `window.qq`
 * exists (`window.qq && Ui.initPf(class ... flag="qq", _adp=qq ...)`). We expose
 * one shared object under both names. Ads/share/analytics are inert no-ops.
 *
 * QQ-specific: the login chain (qq.checkSession -> qq.login -> doLoginComplete)
 * waits on callbacks. A generic no-op would never call them and boot would stall
 * on the splash screen, so checkSession/login/getSetting/authorize answer
 * immediately ("no session, no code") and the game proceeds as a guest.
 * Must load BEFORE js/bundle.js.
 */
(function () {
  "use strict";
  var noop = function () {};

  // ------------------------------------------------------------------------
  // 1) Dead-host short-circuit. The game calls IP lookup / ad strategy /
  //    analytics / account servers that no longer exist. The boot chain waits on
  //    these callbacks, and a request that hangs (instead of failing) leaves the
  //    game stuck on the logo. Fail them immediately and asynchronously, exactly
  //    like a network error, so the game's own error handlers run.
  // ------------------------------------------------------------------------
  var DEAD = /(^|\.)(sohu\.com|126\.net|pconline\.com\.cn|gametdd\.com|manhuang\.org|hrgame\.com\.cn|kbb805\.com)$/i;
  var XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    var xOpen = XHR.prototype.open, xSend = XHR.prototype.send;
    XHR.prototype.open = function (m, u) {
      try { this.__dead = DEAD.test(new URL(u, location.href).hostname); this.__url = u; } catch (e) { this.__dead = false; }
      return xOpen.apply(this, arguments);
    };
    XHR.prototype.send = function () {
      if (this.__dead) {
        var x = this;
        console.warn("[platform-shim] blocked dead host:", x.__url);
        setTimeout(function () {
          try { x.dispatchEvent(typeof ProgressEvent === "function" ? new ProgressEvent("error") : new Event("error")); } catch (e) {}
        }, 0);
        return;
      }
      return xSend.apply(this, arguments);
    };
  }

  // ------------------------------------------------------------------------
  // 2) On-screen log: add ?log=1 to the URL. Shows console output, uncaught
  //    errors and failed resource loads so a stuck boot can be diagnosed
  //    without DevTools (handy on phones). Never blocks input.
  // ------------------------------------------------------------------------
  if (/[?&]log=1\b/.test(location.search)) {
    var lines = [], box = null;
    var paint = function () {
      if (!box) {
        if (!document.body) return;
        box = document.createElement("pre");
        box.style.cssText = "position:fixed;left:0;top:0;max-width:100%;max-height:60%;overflow:hidden;margin:0;padding:4px;" +
          "font:11px/1.25 monospace;color:#0f0;background:rgba(0,0,0,.65);z-index:2147483647;pointer-events:none;white-space:pre-wrap;word-break:break-all";
        document.body.appendChild(box);
      }
      box.textContent = lines.slice(-40).join("\n");
    };
    var push = function (tag, args) {
      var t = Array.prototype.map.call(args, function (a) {
        try { return typeof a === "string" ? a : (a && a.stack) || JSON.stringify(a); } catch (e) { return String(a); }
      }).join(" ");
      lines.push(tag + " " + t.slice(0, 300));
      paint();
    };
    ["log", "info", "warn", "error"].forEach(function (k) {
      var orig = console[k];
      console[k] = function () { push(k === "error" ? "[ERR]" : k === "warn" ? "[warn]" : "[log]", arguments); return orig.apply(console, arguments); };
    });
    window.addEventListener("error", function (e) {
      var tgt = e.target;
      if (tgt && tgt !== window && (tgt.src || tgt.href)) push("[LOAD FAIL]", [tgt.src || tgt.href]);
      else push("[UNCAUGHT]", [e.message + " @" + (e.filename || "").split("/").pop() + ":" + e.lineno]);
    }, true);
    window.addEventListener("unhandledrejection", function (e) { push("[REJECT]", [e.reason]); });
    window.addEventListener("DOMContentLoaded", paint);
    setInterval(paint, 1000);
  }

  function noopNamespace() { return new Proxy({}, { get: function () { return noop; } }); }

  function fakeAd() {
    return {
      show: function () { return Promise.resolve(); },
      hide: noop,
      load: function () { return Promise.resolve(); },
      destroy: noop,
      onLoad: noop, offLoad: noop, onError: noop, offError: noop,
      onClose: noop, offClose: noop, onResize: noop, offResize: noop,
      showed: false, style: {}
    };
  }

  // Invoke an options object's callbacks the way the real API does on failure.
  function failFast(msg) {
    return function (o) {
      o = o || {};
      var r = { errMsg: msg };
      if (o.fail) o.fail(r);
      if (o.complete) o.complete(r);
    };
  }

  var w = window.innerWidth || 1280, h = window.innerHeight || 720,
      dpr = window.devicePixelRatio || 1;

  var real = {
    getSystemInfoSync: function () {
      return {
        // >= 1.15.0 (the game shows a warning modal for older QQ libs)
        SDKVersion: "1.20.0",
        // >= 8.3.9 keeps pixelRatio at 1 (see preInit). AppPlatform is left
        // unset on purpose so the game never takes the "real QQ" paths
        // (subscribeAppMsg / account reporting).
        version: "9.0.0",
        platform: "android", system: "Android 10", brand: "web", model: "web",
        language: "zh_CN",
        screenWidth: w, screenHeight: h, windowWidth: w, windowHeight: h,
        pixelRatio: dpr, devicePixelRatio: dpr, statusBarHeight: 0,
        safeArea: { top: 0, left: 0, right: w, bottom: h, width: w, height: h }
      };
    },
    getLaunchOptionsSync: function () { return { scene: 1001, query: {}, path: "", referrerInfo: {} }; },

    // --- lifecycle ------------------------------------------------------
    onShow: function (cb) {
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden && cb) cb({ scene: 1001 });
      });
    },
    onHide: function (cb) {
      document.addEventListener("visibilitychange", function () {
        if (document.hidden && cb) cb();
      });
    },
    offShow: noop, offHide: noop,

    // --- login chain: answer immediately so boot never waits -------------
    checkSession: failFast("checkSession:fail guest"),
    login: failFast("login:fail guest"),
    getSetting: function (o) {
      o = o || {};
      var r = { authSetting: {} };
      if (o.success) o.success(r);
      if (o.complete) o.complete(r);
    },
    authorize: failFast("authorize:fail guest"),
    getUserInfo: failFast("getUserInfo:fail guest"),
    subscribeAppMsg: failFast("subscribeAppMsg:fail guest"),
    addRecentColorSign: failFast("addRecentColorSign:fail guest"),

    // --- share / social (inert) -----------------------------------------
    showShareMenu: noop, hideShareMenu: noop, shareAppMessage: noop,
    onShareAppMessage: noop, offShareAppMessage: noop, onAddToFavorites: noop,

    // --- ui --------------------------------------------------------------
    showModal: function (o) {
      if (o && o.content) console.warn("[platform-shim] showModal:", o.content);
      if (o && o.success) o.success({ confirm: false, cancel: true });
    },
    showToast: noop, hideToast: noop, showLoading: noop, hideLoading: noop,

    // --- navigation / analytics / misc (inert) --------------------------
    navigateToMiniProgram: function (o) { if (o && o.success) o.success(); return Promise.resolve(); },
    aldStage: noopNamespace(), aldSendEvent: noop, onHtGame: noop, ht: noop,
    setKeepScreenOn: noop, triggerGC: noop,

    // --- ads (QQ adds block ads and app boxes) ---------------------------
    createBannerAd: fakeAd, createInterstitialAd: fakeAd, createRewardedVideoAd: fakeAd,
    createCustomAd: fakeAd, createGridAd: fakeAd, createBlockAd: fakeAd, createAppBox: fakeAd,

    // --- storage -> localStorage ----------------------------------------
    getStorageSync: function (k) {
      try { var v = localStorage.getItem("pf_" + k); return v === null ? "" : JSON.parse(v); } catch (e) { return ""; }
    },
    setStorageSync: function (k, v) { try { localStorage.setItem("pf_" + k, JSON.stringify(v)); } catch (e) {} },
    removeStorageSync: function (k) { try { localStorage.removeItem("pf_" + k); } catch (e) {} },
    clearStorageSync: noop,
    getStorageInfoSync: function () { return { keys: [], currentSize: 0, limitSize: 10240 }; },
    env: { USER_DATA_PATH: "" }
  };

  // Properties that must read as ABSENT, not as a fake function:
  //  - webglPlus: laya.core.js / laya.d3.js test `window.qq && window.qq.webglPlus`
  //    to switch to the native "WebGL Plus" renderer. A truthy fake makes Laya
  //    pick that path in a plain browser and the canvas stays black.
  //  - then / symbols: keep the object from looking like a thenable/iterable.
  var ABSENT = { webglPlus: 1, then: 1 };
  var proxy = new Proxy(real, {
    get: function (t, p) {
      if (typeof p === "symbol" || ABSENT[p]) return undefined;
      if (p in t) return t[p];
      return function () { return fakeAd(); };
    }
  });
  window.wx = proxy;
  window.qq = proxy;
})();
