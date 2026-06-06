// Pure simulation logic. No DOM access. Uses GMS_RATES and COST_COEFS from rates.js.

(function (global) {
  function baseCost(currentStar, itemLevel) {
    const c = global.COST_COEFS[currentStar];
    if (!c) throw new Error("No cost coefficient for star " + currentStar);
    const levelTier = Math.floor(itemLevel / 10) * 10;
    const raw =
      (c.mult * Math.pow(levelTier, 3) * Math.pow(currentStar + 1, c.expo)) /
        c.divisor +
      10;
    return 100 * Math.round(raw);
  }

  function boomDropStar(star) {
    if (star < 20) return 12;
    if (star === 20) return 15;
    if (star < 23) return 17;
    if (star < 26) return 19;
    return 20;
  }

  // Resolve the { mode, safeguard } decision for a single star. When a per-star
  // plan is supplied (opts.starPlan — the "Per-star" tab), each star reads its own
  // entry; otherwise every star shares the global slider/checkbox scalars, which
  // is the classic "Quick" tab and reproduces the original behaviour exactly.
  function planFor(currentStar, opts) {
    const plan = opts.starPlan && opts.starPlan[currentStar];
    if (plan) return plan;
    return { mode: opts.enhanceMode || 0, safeguard: !!opts.safeguard };
  }

  // Returns the Enhancement Mode entry { mult, success, boom } for this star, or
  // null when the new system does not apply. Only modes 2–4 engage it (and
  // override Safeguard). Mode 0 (off) and Mode 1 both fall through to the classic
  // path - Mode 1 is 1× cost with vanilla rates, so it is identical to "off" and
  // still honours the Safeguard toggle. Stars outside 15–21 also return null.
  function enhanceEntry(currentStar, opts) {
    const mode = planFor(currentStar, opts).mode;
    if (!mode || mode < 2 || mode > 4) return null;
    const table = global.ENHANCE_MODE[currentStar];
    return table ? table[mode - 1] : null;
  }

  function applyRateModifiers(currentStar, opts) {
    const plan = planFor(currentStar, opts);
    // Safeguard-to-18: when safeguard is checked in modes 2–4, stars 15–17
    // use the classic Mode 1 + safeguard path (boom = 0) instead of ENHANCE_MODE.
    const sgOverride =
      plan.safeguard &&
      (plan.mode || 0) >= 2 &&
      currentStar >= 15 &&
      currentStar <= 17;
    const em = sgOverride ? null : enhanceEntry(currentStar, opts);
    let s, m, b;

    if (em) {
      // New system: the mode entry is authoritative for this star's base triple.
      // Classic Safeguard does not apply (handled by sgOverride above).
      s = em.success;
      b = em.boom;
      m = 1 - s - b;
      // Event boom reduction reaches Enhancement Mode rates only when the
      // experimental "apply events to enhance modes" toggle is on — it's
      // unconfirmed whether event boom reduction applies under the new system.
      if (opts.enhanceModeEvents) {
        const boomReductionActive =
          opts.event === "boomReduction" || opts.event === "shiningStarForce";
        if (boomReductionActive && currentStar <= 21) {
          m += b * 0.3;
          b *= 0.7;
        }
      }
    } else {
      const base = global.GMS_RATES[currentStar];
      s = base[0];
      m = base[1];
      b = base[2];

      const boomReductionActive =
        opts.event === "boomReduction" || opts.event === "shiningStarForce";
      if (boomReductionActive && currentStar <= 21) {
        m += b * 0.3;
        b *= 0.7;
      }

      const sgActive =
        plan.safeguard &&
        currentStar >= 15 &&
        currentStar <= 17 &&
        !(opts.event === "fivetenfifteen" && currentStar === 15);
      if (sgActive) {
        m += b;
        b = 0;
      }
    }

    if (opts.starCatching) {
      s = Math.min(1, s * 1.05);
      const left = 1 - s;
      const denom = m + b;
      m = denom > 0 ? (m * left) / denom : left;
      b = left - m;
    }

    return [s, m, b];
  }

  function costMultiplier(currentStar, opts) {
    const plan = planFor(currentStar, opts);
    const sgOverride =
      plan.safeguard &&
      (plan.mode || 0) >= 2 &&
      currentStar >= 15 &&
      currentStar <= 17;
    const em = sgOverride ? null : enhanceEntry(currentStar, opts);
    let mult = em ? em.mult : 1;

    if (currentStar <= 15) {
      if (opts.mvp === "silver") mult -= 0.03;
      if (opts.mvp === "gold") mult -= 0.05;
      if (opts.mvp === "diamond") mult -= 0.1;
    }
    // Event cost discount (30% off — thirtyOff and shiningStarForce both grant it).
    // The base (1×) cost is always discounted. Whether the discount also scales the
    // Enhancement Mode premium (modes 2–4) is unconfirmed, so it's gated behind the
    // experimental "apply events to enhance modes" toggle:
    //   • toggle off → mult -= 0.30  (discounts the base 1× cost only:
    //       baseCost × enhMult − 0.30 × baseCost, premium untouched)
    //   • toggle on  → mult *= 0.70  (discounts the full enhanced cost)
    // For Mode 1 (em null, mult = 1) both branches are identical, so it's unchanged.
    const costEvent =
      opts.event === "thirtyOff" || opts.event === "shiningStarForce";
    if (costEvent) {
      if (em && opts.enhanceModeEvents) {
        mult *= 0.7;
      } else {
        mult -= 0.3;
      }
    }

    if (!em) {
      const sgActive =
        plan.safeguard &&
        currentStar >= 15 &&
        currentStar <= 17 &&
        !(opts.event === "fivetenfifteen" && currentStar === 15);
      if (sgActive) mult += 2;
    }

    return mult;
  }

  function simulateOnce(currentStar, targetStar, itemLevel, opts) {
    let star = currentStar;
    let totalCost = 0;
    let attempts = 0;
    let booms = 0;

    while (star < targetStar) {
      const guaranteed =
        opts.event === "fivetenfifteen" &&
        (star === 5 || star === 10 || star === 15);

      const cost = Math.round(
        baseCost(star, itemLevel) * costMultiplier(star, opts),
      );
      totalCost += cost;
      attempts += 1;

      if (guaranteed) {
        star += 1;
        continue;
      }

      const [s, m] = applyRateModifiers(star, opts);
      const r = Math.random();
      if (r < s) {
        star += 1;
      } else if (r < s + m) {
        // maintain
      } else {
        star = boomDropStar(star);
        booms += 1;
      }
    }

    return { totalCost, attempts, booms };
  }

  // Precompute every per-star quantity that stays constant across all trials.
  // cost/rates depend only on the star index and the (fixed) item level + opts,
  // so computing them once — instead of on every attempt — turns the hot loop
  // into pure array lookups. Tables cover stars 0..targetStar-1 because a boom
  // can drop the star below currentStar (e.g. a 22★ boom drops to 17★).
  function buildStarTables(targetStar, itemLevel, opts) {
    const cost = new Float64Array(targetStar);
    const succ = new Float64Array(targetStar); // P(success)
    const succMaint = new Float64Array(targetStar); // P(success) + P(maintain)
    const boomTo = new Int32Array(targetStar);
    const guaranteed = new Uint8Array(targetStar);

    const fiveTenFifteen = opts.event === "fivetenfifteen";
    for (let star = 0; star < targetStar; star++) {
      cost[star] = Math.round(baseCost(star, itemLevel) * costMultiplier(star, opts));
      const [s, m] = applyRateModifiers(star, opts);
      succ[star] = s;
      succMaint[star] = s + m;
      boomTo[star] = boomDropStar(star);
      guaranteed[star] =
        fiveTenFifteen && (star === 5 || star === 10 || star === 15) ? 1 : 0;
    }
    return { cost, succ, succMaint, boomTo, guaranteed };
  }

  // Hot path: a single trial driven entirely by the precomputed tables. No
  // Math.pow, no object/array allocation, no branching on opts — just indexed
  // reads, one Math.random(), and three comparisons per attempt.
  function simulateOnceFast(currentStar, targetStar, t) {
    const { cost, succ, succMaint, boomTo, guaranteed } = t;
    let star = currentStar;
    let totalCost = 0;
    let attempts = 0;
    let booms = 0;

    while (star < targetStar) {
      totalCost += cost[star];
      attempts++;

      if (guaranteed[star]) {
        star++;
        continue;
      }

      const r = Math.random();
      if (r < succ[star]) {
        star++;
      } else if (r < succMaint[star]) {
        // maintain
      } else {
        star = boomTo[star];
        booms++;
      }
    }

    return { totalCost, attempts, booms };
  }

  function percentile(sortedAsc, p) {
    if (sortedAsc.length === 0) return 0;
    const idx = Math.min(
      sortedAsc.length - 1,
      Math.floor(p * sortedAsc.length),
    );
    return sortedAsc[idx];
  }

  function bucketize(sortedAsc, bucketCount) {
    if (sortedAsc.length === 0) return [];
    const min = sortedAsc[0];
    const max = sortedAsc[sortedAsc.length - 1];
    if (max === min) return [{ from: min, to: max, count: sortedAsc.length }];
    const width = (max - min) / bucketCount;
    const buckets = [];
    for (let i = 0; i < bucketCount; i++) {
      buckets.push({
        from: min + i * width,
        to: min + (i + 1) * width,
        count: 0,
      });
    }
    for (const v of sortedAsc) {
      let i = Math.floor((v - min) / width);
      if (i >= bucketCount) i = bucketCount - 1;
      buckets[i].count += 1;
    }
    return buckets;
  }

  function bucketizeIntegers(sortedAsc, maxBuckets) {
    if (sortedAsc.length === 0) return [];
    const min = sortedAsc[0];
    const max = sortedAsc[sortedAsc.length - 1];
    const span = max - min + 1;
    if (span <= maxBuckets) {
      const buckets = [];
      for (let v = min; v <= max; v++)
        buckets.push({ from: v, to: v, count: 0 });
      for (const v of sortedAsc) buckets[v - min].count += 1;
      return buckets;
    }
    return bucketize(sortedAsc, maxBuckets);
  }

  function runTrials(input, options) {
    // Time-sliced scheduling: run trials until a wall-clock budget elapses, then
    // yield — rather than a fixed trial count per chunk. A fixed count blocks for
    // wildly different durations depending on the star range (a 26★ trial is ~100×
    // heavier than a 5★ one), so it can freeze the host thread for hundreds of ms;
    // a time budget keeps every slice short regardless. Default 12ms ≈ under one
    // frame, so the page stays responsive even on the main thread.
    const sliceMs = (options && options.sliceMs) || 12;
    const onProgress = options && options.onProgress;

    return new Promise((resolve) => {
      const { currentStar, targetStar, itemLevel, trials } = input;
      const opts = {
        starCatching: !!input.starCatching,
        safeguard: !!input.safeguard,
        mvp: input.mvp || "none",
        event: input.event || "none",
        enhanceMode: input.enhanceMode || 0,
        enhanceModeEvents: !!input.enhanceModeEvents,
        starPlan: input.starPlan || null,
      };

      // Typed arrays: numeric .sort() with no comparator (faster), and no GC
      // churn from boxed numbers across up to 100k trials.
      const costs = new Float64Array(trials);
      const booms = new Int32Array(trials);
      const attempts = new Int32Array(trials);
      let sumCost = 0,
        sumBooms = 0,
        sumAttempts = 0;
      let i = 0;

      // Precompute per-star cost/rate tables once for the whole run.
      const tables = buildStarTables(targetStar, itemLevel, opts);

      function runChunk() {
        const sliceStart = Date.now();
        while (i < trials) {
          const t = simulateOnceFast(currentStar, targetStar, tables);
          costs[i] = t.totalCost;
          booms[i] = t.booms;
          attempts[i] = t.attempts;
          sumCost += t.totalCost;
          sumBooms += t.booms;
          sumAttempts += t.attempts;
          i++;
          // Check the clock every 32 trials — frequent enough to honour the
          // budget even when trials are heavy, rare enough that Date.now()
          // overhead stays negligible when they're cheap.
          if ((i & 31) === 0 && Date.now() - sliceStart >= sliceMs) break;
        }

        if (onProgress) onProgress(i, trials);

        if (i < trials) {
          setTimeout(runChunk, 0);
          return;
        }

        costs.sort();
        booms.sort();
        attempts.sort();

        resolve({
          trials,
          avgCost: sumCost / trials,
          medianCost: percentile(costs, 0.5),
          p25: percentile(costs, 0.25),
          p75: percentile(costs, 0.75),
          p95: percentile(costs, 0.95),
          minCost: costs[0],
          maxCost: costs[costs.length - 1],

          avgBooms: sumBooms / trials,
          medianBooms: percentile(booms, 0.5),
          p25Booms: percentile(booms, 0.25),
          p75Booms: percentile(booms, 0.75),
          p95Booms: percentile(booms, 0.95),
          minBooms: booms[0],
          maxBooms: booms[booms.length - 1],

          avgAttempts: sumAttempts / trials,
          medianAttempts: percentile(attempts, 0.5),
          buckets: bucketize(costs, 30),
          boomBuckets: bucketizeIntegers(booms, 30),
        });
      }

      runChunk();
    });
  }

  global.SF = global.SF || {};
  global.SF.baseCost = baseCost;
  global.SF.boomDropStar = boomDropStar;
  global.SF.enhanceEntry = enhanceEntry;
  global.SF.applyRateModifiers = applyRateModifiers;
  global.SF.costMultiplier = costMultiplier;
  global.SF.simulateOnce = simulateOnce;
  global.SF.buildStarTables = buildStarTables;
  global.SF.simulateOnceFast = simulateOnceFast;
  global.SF.runTrials = runTrials;
})(window);
