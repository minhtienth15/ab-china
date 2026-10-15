/*
 * English artwork swap (English build only). Text baked into the FairyGUI atlas PNGs is redrawn by
 * tools/i18n_images.py into res-en/UI/<atlas>.png; the replaced atlases are listed in en-assets-list.js.
 * Laya loads atlases via `new window.Image(); img.src = url`, so we redirect those URLs in the `src`
 * setter. Must load BEFORE the Laya libs.
 */
(function () {
  "use strict";
  var LIST = window.__AB_EN_ASSETS || [];
  var proto = window.HTMLImageElement && HTMLImageElement.prototype;
  var desc = proto && Object.getOwnPropertyDescriptor(proto, "src");
  if (!LIST.length || !desc || !desc.set) return;
  var seen = {};
  function swap(v) {
    if (typeof v !== "string" || /^(data|blob):/i.test(v)) return v;
    var path, query = "";
    try { path = new URL(v, location.href).pathname; } catch (e) { return v; }
    var q = v.indexOf("?"); if (q >= 0) query = v.slice(q);
    for (var i = 0; i < LIST.length; i++) {
      var key = LIST[i];                                   // e.g. res/UI/GameUI_atlas3.png
      if (path === "/" + key || path.slice(-(key.length + 1)) === "/" + key) {
        if (!seen[key]) { seen[key] = 1; console.log("[en-assets] English art: " + key); }
        return path.slice(0, path.length - key.length) + "res-en/" + key.slice(4) + query;
      }
    }
    return v;
  }
  Object.defineProperty(proto, "src", { configurable: true, enumerable: desc.enumerable, get: desc.get,
    set: function (v) { desc.set.call(this, swap(v)); } });
  console.log("[en-assets] hook active for " + LIST.length + " atlases");
})();
