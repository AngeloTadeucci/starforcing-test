// Pure simulation logic. No DOM access. Uses KMS_RATES and COST_COEFS from rates.js.

(function (global) {
  function baseCost(currentStar, itemLevel) {
    const c = global.COST_COEFS[currentStar];
    if (!c) throw new Error("No cost coefficient for star " + currentStar);
    const levelTier = Math.floor(itemLevel / 10) * 10;
    const raw = c.mult * Math.pow(levelTier, 3) * Math.pow(currentStar + 1, c.expo) / c.divisor + 10;
    return 100 * Math.round(raw);
  }

  function boomDropStar(star) {
    if (star < 20) return 12;
    if (star === 20) return 15;
    if (star < 23) return 17;
    if (star < 26) return 19;
    return 20;
  }

  function applyRateModifiers(currentStar, opts) {
    const base = global.KMS_RATES[currentStar];
    let s = base[0], m = base[1], d = base[2], b = base[3];

    const sgActive =
      opts.safeguard &&
      currentStar >= 15 && currentStar <= 17 &&
      !(opts.event === "fivetenfifteen" && currentStar === 15);
    if (sgActive) {
      m += b;
      b = 0;
    }

    if (opts.starCatching) {
      s = Math.min(1, s * 1.05);
      const left = 1 - s;
      if (d > 0) {
        const denom = d + b;
        d = denom > 0 ? d * left / denom : 0;
        b = left - d;
      } else {
        const denom = m + b;
        m = denom > 0 ? m * left / denom : left;
        b = left - m;
      }
    }

    return [s, m, d, b];
  }

  global.SF = global.SF || {};
  global.SF.baseCost = baseCost;
  global.SF.boomDropStar = boomDropStar;
  global.SF.applyRateModifiers = applyRateModifiers;
})(window);
