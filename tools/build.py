#!/usr/bin/env python3
"""
Materialize a WeChat (wx) or QQ (qq) mini-game build of AB China into a plain
static web tree.

The originals are LayaAir mini-games: every logical asset path is mapped to a
content-hashed filename by a version manifest (<platform>Ver_X_Y_Z.json).
The platform's Laya ResourceVersion layer rewrote logical->hashed paths at
runtime. A plain web server has no such layer, so we bake the mapping in by
copying each hashed file to its logical path, and write an identity
version.json so Laya does not rewrite them back to dead hashes.

Usage:
  python3 tools/build.py /path/to/qq/release                 # auto-detect platform + newest manifest
  python3 tools/build.py /path/to/qq/release --version 1_0_15
  python3 tools/build.py /path/to/wx/release --platform wx --out public-wx

Output: ./public (or --out)
"""
import argparse, glob, json, os, re, shutil, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Logical entries from the manifest that a browser build must NOT materialize:
#  - index.js: the mini-game's require() entry; replaced by web/index.html
#  - laya.<pf>mini.js: the mini-game platform adapter; we use the browser runtime
SKIP = re.compile(r"^(index\.js|libs/laya\.[a-z]+mini\.js)$")

# Targeted, documented replacements applied to js/bundle.js. Each must match
# exactly once, otherwise the build stops (the bundle is not the one we expect).
PATCHES = [
    # ThinkingAnalytics: its platform adapter is an unresolved webpack module in
    # a browser, so doTaInit() throws and aborts the onGameStart chain. TA is
    # pure analytics -> skip the init call.
    ("!GI.isDebug&&this.taCtrl.doTaInit()",
     "!GI.isDebug&&!1&&this.taCtrl.doTaInit()"),
]


def ver_key(path):
    return [int(x) for x in re.findall(r"\d+", os.path.basename(path))]


def detect(src, platform, version):
    if platform:
        pats = [f"{platform}Ver_*.json"]
    else:
        pats = ["qqVer_*.json", "wxVer_*.json"]
    found = {}
    for pat in pats:
        files = glob.glob(os.path.join(src, pat))
        if files:
            pf = pat.split("Ver_")[0]
            found[pf] = sorted(files, key=ver_key)
    if not found:
        sys.exit(f"no <platform>Ver_*.json manifest found in {src}")
    if len(found) > 1:
        sys.exit(f"several platforms found {list(found)}; pass --platform")
    pf, files = next(iter(found.items()))
    if version:
        want = os.path.join(src, f"{pf}Ver_{version}.json")
        if want not in files:
            sys.exit(f"{want} not found. Available: " +
                     ", ".join(os.path.basename(f) for f in files))
        return pf, want
    return pf, files[-1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", help="path to <platform>/release from the dump")
    ap.add_argument("--platform", choices=["wx", "qq"])
    ap.add_argument("--version", help="manifest version, e.g. 1_0_17 (default: newest)")
    ap.add_argument("--out", default="public")
    a = ap.parse_args()

    src = os.path.abspath(a.src)
    dst = os.path.join(REPO, a.out)
    pf, man_path = detect(src, a.platform, a.version)
    manifest = json.load(open(man_path))
    print(f"platform {pf}, manifest {os.path.basename(man_path)}: {len(manifest)} entries")

    if os.path.exists(dst):
        shutil.rmtree(dst)
    os.makedirs(dst)

    copied = skipped = 0
    missing = []
    kept = {}
    for logical, hashed in manifest.items():
        if SKIP.match(logical):
            skipped += 1
            continue
        s, d = os.path.join(src, hashed), os.path.join(dst, logical)
        if os.path.isfile(s):
            os.makedirs(os.path.dirname(d), exist_ok=True)
            shutil.copy2(s, d)
            copied += 1
            kept[logical] = logical
        else:
            missing.append((logical, hashed))
    print(f"copied {copied}, skipped {skipped}, missing {len(missing)}")
    for lg, hs in missing[:40]:
        print(f"  MISSING {lg} -> {hs}")

    # Plain (unhashed) extras the manifest does not list but the game loads.
    for extra in ("1stAsset",):
        s = os.path.join(src, extra)
        if os.path.isdir(s):
            shutil.copytree(s, os.path.join(dst, extra), dirs_exist_ok=True)
            print(f"copied plain dir: {extra}/")

    # Patch the entry bundle.
    bundle = os.path.join(dst, "js", "bundle.js")
    js = open(bundle, encoding="utf-8").read()
    for find, repl in PATCHES:
        n = js.count(find)
        if n != 1:
            sys.exit(f"PATCH ERROR: expected 1 match, found {n} for:\n  {find[:80]}")
        js = js.replace(find, repl)
        print(f"patched bundle: {find[:48]}...")
    open(bundle, "w", encoding="utf-8").write(js)

    # g.cfg.json ships the platform app secret in plaintext. The browser build
    # never needs it (no login code is ever produced, see platform-shim.js), so
    # blank it rather than republish it.
    cfg_path = os.path.join(dst, "res", "g.cfg.json")
    if os.path.isfile(cfg_path):
        cfg = json.load(open(cfg_path, encoding="utf-8"))
        n = [0]
        def scrub(o):
            if isinstance(o, dict):
                for k, v in o.items():
                    if k == "appSecret" and v:
                        o[k] = ""; n[0] += 1
                    else:
                        scrub(v)
            elif isinstance(o, list):
                for v in o: scrub(v)
        scrub(cfg)
        if n[0]:
            json.dump(cfg, open(cfg_path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
            print(f"blanked {n[0]} appSecret value(s) in res/g.cfg.json")

    # Overlay authored web entry files.
    web = os.path.join(REPO, "web")
    for n in sorted(os.listdir(web)):
        shutil.copy2(os.path.join(web, n), os.path.join(dst, n))
    print("overlaid web/:", ", ".join(sorted(os.listdir(web))))

    # English dictionary for index-en.html + translation.js
    dict_path = os.path.join(REPO, "translations", "zh-en.json")
    if os.path.isfile(dict_path):
        d = json.load(open(dict_path, encoding="utf-8"))
        with open(os.path.join(dst, "i18n-dict.js"), "w", encoding="utf-8") as f:
            f.write("window.__AB_I18N=" + json.dumps(d, ensure_ascii=False) + ";")
        print(f"wrote i18n-dict.js ({len(d)} entries)")

    # Identity version.json: every logical path maps to itself.
    with open(os.path.join(dst, "version.json"), "w") as f:
        json.dump(kept, f)
    print(f"wrote identity version.json ({len(kept)} entries)")


if __name__ == "__main__":
    main()
