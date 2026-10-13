/*
 * Real-time physics for the AB China mini-game. Loaded AFTER libs/laya.physics.js
 * and BEFORE js/bundle.js (the bundle calls Laya.Physics.enable() on load, which
 * registers Physics.prototype._update on the physics timer).
 *
 * Problem: LayaAir's Physics._update() does   world.Step(1/60, ...)   exactly once
 * per rendered frame. Simulation speed is therefore locked to the frame rate:
 *   60 fps -> real time (what the game was tuned for)
 *   30 fps -> half speed  (iPhone Low Power Mode, slow devices, busy tabs)
 *   120 Hz -> double speed
 * That is the "birds fly slowly, objects fall slowly" effect.
 *
 * Fix: step the world by elapsed real time with a fixed 1/60 s step (accumulator),
 * so the simulation runs at 60 steps per second whatever the frame rate. Each step
 * is still exactly the original Step(1/60), so physics behaviour is unchanged.
 *
 * URL options:
 *   ?speed=1.25   simulation speed multiplier (default 1). >1 = faster physics.
 *   ?physfix=0    disable this fix (original one-step-per-frame behaviour).
 *   ?log=1 / ?perf=1  print "[perf] fps=.. physics=../s" every 3 s.
 */
(function () {
  "use strict";
  var qs = location.search;
  if (/[?&]physfix=0\b/.test(qs)) { console.log("[physics-fix] disabled (?physfix=0)"); return; }

  var L = window.Laya;
  if (!(L && L.Physics && L.Physics.prototype && L.Physics.prototype._update)) {
    console.warn("[physics-fix] Laya.Physics not found; not applied");
    return;
  }

  var sp = /[?&]speed=([0-9.]+)/.exec(qs);
  var SPEED = sp ? Math.min(Math.max(parseFloat(sp[1]) || 1, 0.1), 4) : 1;
  var STEP = 1000 / 60;      // ms of simulated time per world step (the original dt)
  var SLACK = 0.2;           // absorbs rAF jitter so 60 Hz doesn't produce 0/2-step frames
  var MAX_STEPS = 5;         // never spend more than this many steps in one frame
  var HICCUP = 250;          // ms; a longer gap (tab hidden, GC, stall) isn't caught up

  var orig = L.Physics.prototype._update;
  var acc = 0, last = 0;
  var frames = 0, steps = 0, statT = 0;
  var perf = /[?&](log|perf)=1\b/.test(qs);
  var now = (window.performance && performance.now) ? function () { return performance.now(); } : Date.now;

  L.Physics.prototype._update = function () {
    var t = now();
    if (!last) last = t - STEP;
    var dt = t - last;
    last = t;
    if (dt > HICCUP) dt = STEP;           // after a stall just advance one normal step
    acc += dt * SPEED;

    var n = Math.floor(acc / STEP + SLACK);
    if (n > MAX_STEPS) { n = MAX_STEPS; acc = 0; } else { acc -= n * STEP; }
    if (acc < -STEP) acc = -STEP;         // never owe more than one step

    for (var i = 0; i < n; i++) orig.call(this);

    if (perf) {
      frames++; steps += n;
      if (!statT) statT = t;
      if (t - statT >= 3000) {
        var s = (t - statT) / 1000;
        console.log("[perf] fps=" + (frames / s).toFixed(1) + " physics=" + (steps / s).toFixed(1) +
                    "/s (target " + (60 * SPEED).toFixed(0) + ") speed=" + SPEED);
        frames = steps = 0; statT = t;
      }
    }
  };
  console.log("[physics-fix] real-time stepping active, speed x" + SPEED);
})();
