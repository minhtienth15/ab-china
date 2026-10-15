/*
 * Runtime English translation layer for AB China.
 *
 * Almost all user-facing text is live text (FairyGUI text fields, plus a couple of
 * Laya.Text labels on the loading screen), not baked into images, so instead of
 * binary-patching the .fui packages we wrap the text setters and translate at
 * render time.
 *
 * Matching, in order, for every string that contains Chinese:
 *   1. exact dictionary hit                                (window.__AB_I18N)
 *   2. regex rules for strings assembled in code from numbers/names
 *        e.g. "3倍领取" -> "Claim 3x", "2天5小时" -> "2d 5h"
 *   3. dictionary key ending in a colon used as a prefix   ("今日剩余次数：2")
 *   4. line by line (multi-line text), and text between UBB/HTML tags
 *   5. longest-phrase replacement of known dictionary phrases inside the string
 * Anything still containing Chinese is recorded in window.__i18nMiss; call
 * dumpMiss() in the console (or watch the "?log=1" panel) to collect gaps.
 * Text baked into images (e.g. some titles/banners) is out of scope here.
 *
 * Fonts: fairygui.js ships UIConfig.defaultFont = "SimSun" (a Chinese serif). Where SimSun is
 * missing the browser draws Chinese with the device's CJK font but Latin with Times New Roman.
 * The English build therefore switches to a system sans stack (each device uses its own UI font,
 * like the Chinese build does) and maps CJK/serif font names set by the .fui packages to it.
 *
 * Loaded only in the English build (index-en.html), after the game bundle.
 */
(function () {
  "use strict";
  var DICT = window.__AB_I18N || {};
  var CJK = /[\u3400-\u9fff\uff00-\uffef]/;
  var CACHE = Object.create(null);
  window.__i18nMiss = window.__i18nMiss || {};

  // ---- helpers -------------------------------------------------------------
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function plural(n, name) {
    return (Number(n) === 1 || /s$/i.test(name)) ? name : name + "s";
  }
  // Full-width punctuation -> ASCII; only applied to text we assembled ourselves.
  function ascii(s) {
    return s.replace(/\uff08/g, "(").replace(/\uff09/g, ")").replace(/\uff1a/g, ": ")
      .replace(/\uff0c|\u3001/g, ", ").replace(/\u3002/g, ". ").replace(/\uff01/g, "!")
      .replace(/\uff1f/g, "?").replace(/\uff5e/g, "~").replace(/\u3000/g, " ")
      .replace(/ {2,}/g, " ").replace(/\s+([,.!?:)])/g, "$1").replace(/\(\s+/g, "(").trim();
  }

  // Keys usable as prefixes: they end with a colon, e.g. "高分榜：".
  var PREFIX = Object.keys(DICT).filter(function (k) { return /[:：]\s*$/.test(k); })
    .sort(function (a, b) { return b.length - a.length; });

  // Longest-first alternation of every multi-character dictionary key.
  var PHRASE_RE = (function () {
    var keys = Object.keys(DICT).filter(function (k) { return k.length >= 2 && CJK.test(k); })
      .sort(function (a, b) { return b.length - a.length; });
    return keys.length ? new RegExp(keys.map(esc).join("|"), "g") : null;
  })();

  // ---- regex rules for strings built in code ------------------------------------
  function R(re, fn) { return [re, fn]; }
  var RULES = [
    R(/^(\d+)倍领取$/, function (m) { return "Claim " + m[1] + "x"; }),
    R(/^(\d+)天(\d+)小时$/, function (m) { return m[1] + "d " + m[2] + "h"; }),
    R(/^前(\d+)%$/, function (m) { return "Top " + m[1] + "%"; }),
    R(/^\(当前(\d+)%\)$/, function (m) { return "(Current " + m[1] + "%)"; }),
    R(/^第(\d+)天$/, function (m) { return "Day " + m[1]; }),
    R(/^第(\d+)章$/, function (m) { return "Chapter " + m[1]; }),
    R(/^第(\d+)关$/, function (m) { return "Level " + m[1]; }),
    R(/^救命啊有人在吗？快来(\d+-\d+)救救我！$/, function (m) { return "Help! Anyone there? Come save me in " + m[1] + "!"; }),
    R(/^通过(分享|观看视频)可额外获得(\d+)个"(.*)"$/, function (m, T) {
      return "Get " + m[2] + " extra \"" + T(m[3]) + "\" by " + (m[1] === "分享" ? "sharing" : "watching a video");
    }),
    R(/^观看视频即可获得(\d+)个(.+)$/, function (m, T) { return "Watch a video to get " + m[1] + " " + plural(m[1], T(m[2])); }),
    R(/^分享即可获得(\d+)个(.+)$/, function (m, T) { return "Share to get " + m[1] + " " + plural(m[1], T(m[2])); }),
    R(/^恭喜获得积分 ?(\d+)[！!]?$/, function (m) { return "You earned " + m[1] + " points!"; }),
    R(/^恭喜获得(\d+)个([^（(]+)(.*)$/, function (m, T) {
      var tail = m[3] ? " " + T(m[3]) : "";
      return "You got " + m[1] + " " + plural(m[1], T(m[2])) + tail;
    }),
    R(/^当前积分[ ：:]\s*(\d+)$/, function (m) { return "Current points: " + m[1]; }),
    R(/^当前进度[：:]\s*(.+)$/, function (m) { return "Progress: " + m[1]; }),
    R(/^您已完成第(\d+)章所有关卡！$/, function (m) { return "You have completed every level of Chapter " + m[1] + "!"; }),
    R(/^花费(\d+)羽毛$/, function (m) { return "Costs " + m[1] + " feathers"; }),
    R(/^Lv\.(\d+)特权礼包$/, function (m) { return "Lv." + m[1] + " Privilege Pack"; }),
    R(/^射手特权 ?Lv\.(\d+)$/, function (m) { return "Archer Privilege Lv." + m[1]; }),
    R(/^解锁下一关(\d+)羽毛购买$/, function (m) { return "Unlock the next level for " + m[1] + " feathers"; }),
    R(/^解锁下个(\d+)关(\d+)羽毛购买$/, function (m) { return "Unlock the next " + m[1] + " levels for " + m[2] + " feathers"; }),
    R(/^解锁整个篇章(\d+)羽毛购买$/, function (m) { return "Unlock the whole chapter for " + m[1] + " feathers"; }),
    R(/^您需要在上一关得到(\d+)颗星才能开启或者$/, function (m) {
      return "You need " + m[1] + " stars on the previous level to unlock this, or";
    }),
    R(/^免费\((.*)\)$/, function (m) { return "Free(" + m[1] + ")"; }),
    R(/^(\d+)羽毛入场$/, function (m) { return m[1] + " feathers to enter"; }),
    R(/^(\d+)个$/, function (m) { return m[1]; }),
    R(/^(\d+)个(.+)$/, function (m, T) { return m[1] + " " + plural(m[1], T(m[2])); })
  ];

  // ---- core -----------------------------------------------------------------
  var TAG_RE = /(\[\/?[a-zA-Z]+(?:=[^\]]*)?\]|<[^>]+>)/;

  function translateCore(core) {
    if (!CJK.test(core)) return core;
    if (DICT[core] != null) return DICT[core];                        // 1. exact

    for (var i = 0; i < RULES.length; i++) {                           // 2. rules
      var m = RULES[i][0].exec(core);
      if (m) return ascii(RULES[i][1](m, translateCore));
    }
    for (var p = 0; p < PREFIX.length; p++) {                          // 3. prefix
      if (core.indexOf(PREFIX[p]) === 0) {
        return DICT[PREFIX[p]] + translateCore(core.slice(PREFIX[p].length));
      }
    }
    if (core.indexOf("\n") >= 0) {                                     // 4a. lines
      return core.split("\n").map(translateCore).join("\n");
    }
    if (TAG_RE.test(core)) {                                           // 4b. tags
      return core.split(TAG_RE).map(function (part, k) {
        return k % 2 ? part : translateCore(part);
      }).join("");
    }
    if (PHRASE_RE) {                                                   // 5. phrases
      PHRASE_RE.lastIndex = 0;
      var out = core.replace(PHRASE_RE, function (hit) { return " " + DICT[hit] + " "; });
      if (out !== core) return ascii(out);
    }
    return core;
  }

  function translate(v) {
    if (typeof v !== "string" || !v || !CJK.test(v)) return v;
    var c = CACHE[v];
    if (c !== undefined) return c;
    var lead = /^\s*/.exec(v)[0], trail = /\s*$/.exec(v)[0];
    var core = v.slice(lead.length, v.length - trail.length);
    var out = DICT[v] != null ? DICT[v] : lead + translateCore(core) + trail;
    if (CJK.test(out)) window.__i18nMiss[v] = (window.__i18nMiss[v] || 0) + 1;
    CACHE[v] = out;
    return out;
  }
  window.__i18nTranslate = translate;

  // ---- hooks ------------------------------------------------------------------
  function patchProp(cls, prop, map) {
    map = map || translate;
    if (!cls || !cls.prototype) return false;
    // The accessor may live on a base class; walk up to find it.
    var proto = cls.prototype, desc = null;
    while (proto && !(desc = Object.getOwnPropertyDescriptor(proto, prop))) proto = Object.getPrototypeOf(proto);
    if (!desc || !desc.set) return false;
    Object.defineProperty(cls.prototype, prop, {
      configurable: true, enumerable: desc.enumerable,
      get: desc.get,
      set: function (v) { desc.set.call(this, map(v)); }
    });
    return true;
  }

  // ---- fonts ------------------------------------------------------------------
  var SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  var BAD_FONT = /^\s*(SimSun|NSimSun|\u5b8b\u4f53|\u65b0\u5b8b\u4f53|FangSong|\u4eff\u5b8b|KaiTi|\u6977\u4f53|SimHei|\u9ed1\u4f53|Microsoft ?YaHei|\u5fae\u8f6f\u96c5\u9ed1|YaHei|PingFang[^,]*|\u82f9\u65b9[^,]*|STHeiti|Heiti[^,]*|Songti[^,]*|Noto (Sans|Serif) (CJK|SC)[^,]*|Times[^,]*|serif)\s*$/i;
  function fixFont(v) {
    if (typeof v !== "string" || !v || v.indexOf("ui://") === 0) return v;   // keep bitmap-font URLs
    return BAD_FONT.test(v) ? SANS : v;
  }
  window.__i18nFixFont = fixFont;

  function install() {
    var fg = window.fgui || window.fairygui;
    if (!fg || !window.Laya) return setTimeout(install, 120);
    ["GBasicTextField", "GTextField", "GRichTextField", "GTextInput"].forEach(function (n) { patchProp(fg[n], "text"); });
    ["GButton", "GLabel"].forEach(function (n) { patchProp(fg[n], "title"); });
    patchProp(fg.GButton, "selectedTitle");
    patchProp(fg.GTextInput, "promptText");

    // Fonts (see header). Fields created from now on pick up UIConfig.defaultFont; the .fui
    // packages may set an explicit CJK font, so map those too.
    if (fg.UIConfig) fg.UIConfig.defaultFont = SANS;
    ["GBasicTextField", "GRichTextField", "GTextInput"].forEach(function (n) { patchProp(fg[n], "font", fixFont); });
    (function sweep(o, depth) {            // fields created before this hook ran (e.g. loading UI)
      if (!o || depth > 12) return;
      try { if (o instanceof fg.GBasicTextField || o instanceof fg.GRichTextField) o.font = o.font; } catch (e) {}
      var kids = o._children;
      if (kids) for (var i = 0; i < kids.length; i++) sweep(kids[i], depth + 1);
    })(fg.GRoot && fg.GRoot.inst, 0);
    // Loading screen / any plain Laya label (not FairyGUI): Laya.Text backs Laya.Label too.
    patchProp(Laya.Text, "text");

    console.log("[i18n] translation installed (" + Object.keys(DICT).length + " entries, " + RULES.length + " rules)");
    window.dumpMiss = function () { console.log(JSON.stringify(Object.keys(window.__i18nMiss).sort())); };
    // Report anything still untranslated, visible in the ?log=1 panel.
    setInterval(function () {
      var n = Object.keys(window.__i18nMiss).length;
      if (n && n !== install.lastN) {
        install.lastN = n;
        console.warn("[i18n] " + n + " untranslated string(s), latest: " + Object.keys(window.__i18nMiss).slice(-3).join(" | "));
      }
    }, 4000);
  }
  install();
})();
