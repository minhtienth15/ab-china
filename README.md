# AB China (QQ build) — browser-playable restoration

Same approach as the WeChat restoration, but built from the **`qq/release`**
folder of https://archive.org/details/angrybirdsmp (LayaAir, Talkweb).

- Manifest used: `qqVer_1_0_17.json` (newest; 347 entries, 345 materialized). Entry bundle: `js/bundle-5993539b4e.js`.
- `tools/build.py` auto-detects the platform and picks the newest manifest; works for `wx/release` too (`--platform wx`).
- `web/platform-shim.js` exposes one fake object as both `window.wx` and `window.qq`.
  QQ's login chain (`qq.checkSession` -> `qq.login`) waits on callbacks, so the
  shim answers them immediately and the game boots as a guest.
- Bundle patch (1, verified to match exactly once): ThinkingAnalytics `doTaInit()` is skipped.
- `res/g.cfg.json`: the platform `appSecret` is blanked at build time.

```bash
python3 tools/build.py /path/to/qq/release      # regenerates public/
cd public && python3 -m http.server 8767        # open http://localhost:8767  (English: /index-en.html)
```

Status: statically verified (all manifest files present, bundle patch matched, shim login chain
simulated in Node). Not yet run in a real browser — run `node tools/smoketest.mjs`
(edit the Chrome path inside) and check the console.
