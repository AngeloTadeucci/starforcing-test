// Per-star plan optimizer. Pure logic, no DOM. Sits on top of the engine in
// simulator.js and scores plans with the *exact* same rates/costs the Monte
// Carlo uses (SF.applyRateModifiers / costMultiplier / baseCost / boomDropStar),
// so an analytic recommendation and a simulated run agree.
//
// Expected cost and expected booms both have a closed form even though a boom
// drops the star and forces a re-climb. From star i you pay c_i per attempt;
// success (s_i) advances, maintain stays, boom (b_i) drops to d_i = dropTo(i)
// and you must climb d_i → i again. Let R_i be the expected cost of that
// re-climb. Then the expected cost and booms to clear star i once are
//     G_i  = (c_i + b_i · R_i) / s_i
//     GB_i = (b_i · (1 + RB_i)) / s_i
// with R_i = Σ_{k=d_i}^{i-1} G_k  and  RB_i = Σ_{k=d_i}^{i-1} GB_k (prefix sums).
// The run total over current → target is Σ_{i=current}^{target-1} of each. This
// is exact (matches the MC means within sampling error) and O(stars) per plan,
// so the entire 15–21 search space scores in a few milliseconds.

(function (global) {
  const SF = global.SF;
  // Stars where Enhancement Modes exist (15–21); safeguard only on 15–17.
  const PLAN_STARS = [15, 16, 17, 18, 19, 20, 21];

  // The choices the optimizer can assign to one star. 15–17 get an extra
  // "Mode 1 + Safeguard" entry (safeguard only stacks on Mode 1); 18–21 are
  // plain Mode 1–4.
  function starOptions(star) {
    const opts = [
      { mode: 1, safeguard: false },
      { mode: 2, safeguard: false },
      { mode: 3, safeguard: false },
      { mode: 4, safeguard: false },
    ];
    if (star <= 17) opts.splice(1, 0, { mode: 1, safeguard: true });
    return opts;
  }

  // Enhance stars whose mode affects the run: every 15–21 star below target.
  // Stars below `current` are still included — a boom can drop the item beneath
  // the current star (21★ → 17★, 20★ → 15★) and force a re-climb through them,
  // so their mode genuinely matters even though they read as "off" in the matrix.
  function optimizableStars(targetStar) {
    return PLAN_STARS.filter((s) => s < targetStar);
  }

  // Per-star constants for stars 0..target-1 under `opts`. Honours opts.starPlan
  // exactly as the engine does, plus the 5/10/15★ guarantee (which the sim loop —
  // not applyRateModifiers — applies: cost is still paid, success is certain).
  function buildTables(targetStar, itemLevel, opts) {
    const cost = new Float64Array(targetStar);
    const succ = new Float64Array(targetStar);
    const boom = new Float64Array(targetStar);
    const dropTo = new Int32Array(targetStar);
    const ff = opts.event === "fivetenfifteen";
    for (let s = 0; s < targetStar; s++) {
      cost[s] = Math.round(
        SF.baseCost(s, itemLevel) * SF.costMultiplier(s, opts),
      );
      if (ff && (s === 5 || s === 10 || s === 15)) {
        succ[s] = 1;
        boom[s] = 0;
      } else {
        const [sc, , bm] = SF.applyRateModifiers(s, opts);
        succ[s] = sc;
        boom[s] = bm;
      }
      dropTo[s] = SF.boomDropStar(s);
    }
    return { cost, succ, boom, dropTo };
  }

  // Closed-form expected cost & booms over [current, target). prefG/prefB are
  // reused scratch buffers (length target+1) to avoid per-candidate allocation.
  function metrics(currentStar, targetStar, t, prefG, prefB) {
    const { cost, succ, boom, dropTo } = t;
    prefG[0] = 0;
    prefB[0] = 0;
    for (let i = 0; i < targetStar; i++) {
      const s = succ[i];
      const b = boom[i];
      const d = dropTo[i];
      const R = prefG[i] - prefG[d];
      const RB = prefB[i] - prefB[d];
      const G = (cost[i] + b * R) / s;
      const GB = (b * (1 + RB)) / s;
      prefG[i + 1] = prefG[i] + G;
      prefB[i + 1] = prefB[i] + GB;
    }
    return {
      expCost: prefG[targetStar] - prefG[currentStar],
      expBooms: prefB[targetStar] - prefB[currentStar],
    };
  }

  // Public: expected cost & booms for one fully-specified plan (opts.starPlan).
  function planMetrics(currentStar, targetStar, itemLevel, opts) {
    const tables = buildTables(targetStar, itemLevel, opts);
    const prefG = new Float64Array(targetStar + 1);
    const prefB = new Float64Array(targetStar + 1);
    return metrics(currentStar, targetStar, tables, prefG, prefB);
  }

  // Precompute, per optimizable star, the (cost, succ, boom) triple for each of
  // its mode choices — once, instead of 16k+ times inside the enumeration loop.
  function optionTriples(stars, itemLevel, baseOpts) {
    const ff = baseOpts.event === "fivetenfifteen";
    return stars.map((star) => {
      const guaranteed = ff && star === 15;
      return starOptions(star).map((choice) => {
        const opts = Object.assign({}, baseOpts, { starPlan: { [star]: choice } });
        const cost = Math.round(
          SF.baseCost(star, itemLevel) * SF.costMultiplier(star, opts),
        );
        let succ, boom;
        if (guaranteed) {
          succ = 1;
          boom = 0;
        } else {
          const [s, , b] = SF.applyRateModifiers(star, opts);
          succ = s;
          boom = b;
        }
        return { choice, cost, succ, boom };
      });
    });
  }

  // Enumerate every per-star mode combination (mixed-radix over the option
  // lists), patch the optimizable stars into a shared table, score it, and hand
  // the result to `visit(choices, metricsResult)`. Invariant stars (< 15, ≥ 22,
  // and the baseline fill) are computed once.
  function enumerate(currentStar, targetStar, itemLevel, baseOpts, visit) {
    const stars = optimizableStars(targetStar);
    // Baseline with no plan and no global mode, so any enhance star we don't
    // overwrite stays vanilla (all optimizable stars are overwritten anyway).
    const base = Object.assign({}, baseOpts, { starPlan: null, enhanceMode: 0 });
    const tables = buildTables(targetStar, itemLevel, base);
    const { cost, succ, boom } = tables;
    const triples = optionTriples(stars, itemLevel, baseOpts);
    const radices = triples.map((o) => o.length);
    let total = 1;
    for (const r of radices) total *= r;

    const prefG = new Float64Array(targetStar + 1);
    const prefB = new Float64Array(targetStar + 1);

    for (let idx = 0; idx < total; idx++) {
      let n = idx;
      const choices = new Array(stars.length);
      for (let j = 0; j < stars.length; j++) {
        const r = radices[j];
        const o = triples[j][n % r];
        n = (n - (n % r)) / r;
        const star = stars[j];
        cost[star] = o.cost;
        succ[star] = o.succ;
        boom[star] = o.boom;
        choices[j] = o.choice;
      }
      visit(stars, choices, metrics(currentStar, targetStar, tables, prefG, prefB));
    }
    return { stars, total };
  }

  // Assemble a full plan ({15:{mode,safeguard}, …, 21:{…}}) from a choice list.
  // Stars not optimized (≥ target) default to Mode 1 / no safeguard.
  function planFromChoices(stars, choices) {
    const plan = {};
    PLAN_STARS.forEach((s) => (plan[s] = { mode: 1, safeguard: false }));
    stars.forEach((s, j) => {
      plan[s] = { mode: choices[j].mode, safeguard: !!choices[j].safeguard };
    });
    return plan;
  }

  // For "best odds" we need the joint distribution of (cost, booms), which has no
  // tidy closed form — so we Monte-Carlo, but only a handful of candidates. The
  // mean-(cost, booms) Pareto frontier holds the plans worth simulating: lowering
  // either mean can only help P(cost ≤ budget AND booms ≤ spares). Returns those
  // candidate plans (capped, sampled evenly) for the caller to simulate.
  function optimizeFrontier(params, maxCandidates) {
    const { currentStar, targetStar, itemLevel, opts } = params;
    if (optimizableStars(targetStar).length === 0) return { empty: true };
    const cap = maxCandidates || 24;

    const all = [];
    enumerate(currentStar, targetStar, itemLevel, opts, (stars, choices, m) => {
      all.push({ choices: choices.slice(), expCost: m.expCost, expBooms: m.expBooms });
    });
    let stars = optimizableStars(targetStar);

    // Pareto-min on (expCost, expBooms): sort by cost, keep strictly-lower booms.
    all.sort((a, b) => a.expCost - b.expCost || a.expBooms - b.expBooms);
    const frontier = [];
    let minBooms = Infinity;
    for (const c of all) {
      if (c.expBooms < minBooms - 1e-9) {
        frontier.push(c);
        minBooms = c.expBooms;
      }
    }

    let picked = frontier;
    if (frontier.length > cap) {
      picked = [];
      const step = (frontier.length - 1) / (cap - 1);
      for (let i = 0; i < cap; i++) picked.push(frontier[Math.round(i * step)]);
    }

    return {
      candidates: picked.map((c) => ({
        plan: planFromChoices(stars, c.choices),
        expCost: c.expCost,
        expBooms: c.expBooms,
      })),
      frontierSize: frontier.length,
      evaluated: all.length,
    };
  }

  // Monte-Carlo P(total cost ≤ budget AND booms ≤ spares) for one plan, reusing
  // the same fast trial kernel the main simulation uses.
  function successProb(input, budgetMesos, spares, trials) {
    const opts = {
      starCatching: !!input.starCatching,
      safeguard: !!input.safeguard,
      mvp: input.mvp || "none",
      event: input.event || "none",
      enhanceMode: input.enhanceMode || 0,
      starPlan: input.starPlan || null,
    };
    const tables = SF.buildStarTables(input.targetStar, input.itemLevel, opts);
    let ok = 0;
    for (let i = 0; i < trials; i++) {
      const t = SF.simulateOnceFast(input.currentStar, input.targetStar, tables);
      if (t.totalCost <= budgetMesos && t.booms <= spares) ok++;
    }
    return ok / trials;
  }

  SF.optimizer = {
    PLAN_STARS,
    starOptions,
    optimizableStars,
    planMetrics,
    optimizeFrontier,
    successProb,
  };
})(window);
