(function () {
  const $ = (id) => document.getElementById(id);

  function fmtMesos(n) {
    if (!Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1e12) return (n / 1e12).toFixed(2) + " T";
    if (abs >= 1e9) return (n / 1e9).toFixed(2) + " B";
    if (abs >= 1e6) return (n / 1e6).toFixed(2) + " M";
    return Math.round(n).toLocaleString("en-US");
  }

  function fmtInt(n) {
    if (!Number.isFinite(n)) return "—";
    return Math.round(n).toLocaleString("en-US");
  }

  function readInputs() {
    return {
      itemLevel: parseInt($("itemLevel").value, 10),
      currentStar: parseInt($("currentStar").value, 10),
      targetStar: parseInt($("targetStar").value, 10),
      trials: parseInt($("trials").value, 10),
      mvp: $("mvp").value,
      event: $("event").value,
      starCatching: $("starCatching").checked,
      safeguard: $("safeguard").checked,
      enhanceMode: parseInt($("enhanceMode").value, 10),
      enhanceModeBoomReduction: $("enhanceModeBoomReduction").checked,
    };
  }

  function validate(input) {
    if (
      !Number.isFinite(input.itemLevel) ||
      input.itemLevel < 1 ||
      input.itemLevel > 300
    )
      return "Item level must be between 1 and 300.";
    if (
      !Number.isFinite(input.currentStar) ||
      input.currentStar < 0 ||
      input.currentStar > 29
    )
      return "Current ★ must be between 0 and 29.";
    if (
      !Number.isFinite(input.targetStar) ||
      input.targetStar < 1 ||
      input.targetStar > 30
    )
      return "Target ★ must be between 1 and 30.";
    if (input.targetStar <= input.currentStar)
      return "Target ★ must be greater than Current ★.";
    if (
      !Number.isFinite(input.trials) ||
      input.trials < 1 ||
      input.trials > 100000
    )
      return "Trials must be between 1 and 100000.";
    return null;
  }

  function renderStatList(elId, rows) {
    const el = $(elId);
    el.innerHTML = rows
      .map(({ label, value, accent, divider }) => {
        const cls = [
          "stat-line",
          accent ? "stat-line--accent" : "",
          divider ? "stat-line--divider" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `<div class="${cls}"><dt>${label}</dt><dd>${value}</dd></div>`;
      })
      .join("");
  }

  function renderResults(stats, expected) {
    $("m-avg").textContent = fmtMesos(stats.avgCost);
    $("m-median").textContent = fmtMesos(stats.medianCost);
    $("m-booms").textContent = stats.avgBooms.toFixed(2);
    $("m-attempts").textContent = stats.medianAttempts.toFixed(1);
    $("m-avg-expected").textContent =
      fmtMesos(expected.expectedCost) + " expected";
    $("m-booms-expected").textContent =
      expected.expectedBooms.toFixed(2) + " expected";

    renderStatList("cost-pct", [
      { label: "Min", value: fmtMesos(stats.minCost) },
      { label: "25th", value: fmtMesos(stats.p25) },
      { label: "Median", value: fmtMesos(stats.medianCost), accent: true },
      { label: "75th", value: fmtMesos(stats.p75) },
      { label: "95th", value: fmtMesos(stats.p95) },
      { label: "Max", value: fmtMesos(stats.maxCost), divider: true },
      { label: "Average", value: fmtMesos(stats.avgCost) },
    ]);

    renderStatList("booms-pct", [
      { label: "Min", value: fmtInt(stats.minBooms) },
      { label: "25th", value: fmtInt(stats.p25Booms) },
      { label: "Median", value: fmtInt(stats.medianBooms), accent: true },
      { label: "75th", value: fmtInt(stats.p75Booms) },
      { label: "95th", value: fmtInt(stats.p95Booms) },
      { label: "Max", value: fmtInt(stats.maxBooms), divider: true },
      { label: "Average", value: stats.avgBooms.toFixed(2) },
    ]);
  }

  function fmtAxis(n) {
    if (n >= 1e12) return (n / 1e12).toFixed(1) + "T";
    if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(0) + "k";
    return String(Math.round(n));
  }

  function drawHistogram(canvasId, buckets, formatX, opts = {}) {
    const canvas = $(canvasId);
    const ctx = canvas.getContext("2d");

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    // Get or create the tooltip element for this chart.
    let tooltip = canvas.parentElement.querySelector(".hist-tooltip");
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "hist-tooltip";
      canvas.parentElement.appendChild(tooltip);
    }
    tooltip.style.display = "none";

    if (!buckets || buckets.length === 0) return;

    const padL = 36,
      padR = 12,
      padT = 12,
      padB = 24;
    const w = cssW - padL - padR;
    const h = cssH - padT - padB;

    const maxCount = buckets.reduce((m, b) => Math.max(m, b.count), 0) || 1;
    const barW = w / buckets.length;

    ctx.fillStyle = "#d4a259";
    for (let i = 0; i < buckets.length; i++) {
      const barH = (buckets[i].count / maxCount) * h;
      const x = padL + i * barW;
      const y = padT + (h - barH);
      ctx.fillRect(x + 1, y, Math.max(1, barW - 2), barH);
    }

    ctx.strokeStyle = "#24272e";
    ctx.beginPath();
    ctx.moveTo(padL, padT + h + 0.5);
    ctx.lineTo(padL + w, padT + h + 0.5);
    ctx.stroke();

    ctx.fillStyle = "#8a8d96";
    ctx.font = '10.5px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(formatX(buckets[0].from), padL, padT + h + 6);
    ctx.textAlign = "right";
    ctx.fillText(
      formatX(buckets[buckets.length - 1].to),
      padL + w,
      padT + h + 6,
    );

    ctx.textAlign = "right";
    ctx.fillText(String(maxCount), padL - 6, padT);

    // Pre-compute prefix sums for cumulative percentages.
    const prefixSums = new Array(buckets.length + 1).fill(0);
    for (let k = 0; k < buckets.length; k++) {
      prefixSums[k + 1] = prefixSums[k] + buckets[k].count;
    }

    // Hover: show percentage for the bar under the cursor.
    canvas.onmousemove = (e) => {
      const i = Math.floor((e.offsetX - padL) / barW);
      if (i < 0 || i >= buckets.length) {
        tooltip.style.display = "none";
        return;
      }
      const b = buckets[i];
      const range =
        opts.singleValue || b.from === b.to
          ? formatX(b.from)
          : `${formatX(b.from)} – ${formatX(b.to)}`;
      const pct = ((b.count / opts.total) * 100).toFixed(1);
      const cumLeft = ((prefixSums[i + 1] / opts.total) * 100).toFixed(1);
      const cumRight = (
        ((opts.total - prefixSums[i]) / opts.total) *
        100
      ).toFixed(1);
      tooltip.textContent = `${range}: ${pct}%  ·  ≤${cumLeft}%  ·  ≥${cumRight}%`;
      tooltip.style.display = "block";
      const chartRect = canvas.parentElement.getBoundingClientRect();
      const tipW = tooltip.offsetWidth;
      const chartW = canvas.parentElement.clientWidth;
      let tipLeft = e.clientX - chartRect.left - tipW / 2;
      tipLeft = Math.max(4, Math.min(tipLeft, chartW - tipW - 4));
      tooltip.style.left = tipLeft + "px";
    };

    canvas.onmouseleave = () => {
      tooltip.style.display = "none";
    };
  }

  async function onSubmit(e) {
    e.preventDefault();
    const errEl = $("error");
    errEl.textContent = "";

    const input = readInputs();
    const err = validate(input);
    if (err) {
      errEl.textContent = err;
      return;
    }

    const btn = $("calc");
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.classList.add("is-running");
    btn.textContent = `Running 0 / ${input.trials.toLocaleString("en-US")}`;

    try {
      const stats = await SF.runTrials(input, {
        onProgress: (done, total) => {
          btn.textContent = `Running ${done.toLocaleString("en-US")} / ${total.toLocaleString("en-US")}`;
        },
      });
      const expected = SF.analyticalExpected(input);
      $("results").classList.remove("hidden");
      renderResults(stats, expected);
      drawHistogram("histogram", stats.buckets, fmtAxis, {
        total: stats.trials,
      });
      drawHistogram(
        "histogram-booms",
        stats.boomBuckets,
        (n) => String(Math.round(n)),
        { total: stats.trials, singleValue: true },
      );
    } finally {
      btn.disabled = false;
      btn.classList.remove("is-running");
      btn.textContent = originalLabel;
    }
  }

  const ENHANCE_MODE_LABELS = {
    1: "Mode 1 — 1× cost · baseline (uses Safeguard)",
    2: "Mode 2 — 1.5× cost (15–17★) | 2× cost (18–21★)",
    3: "Mode 3 — 2.5× cost (15–17★) | 3.5× cost (18–21★)",
    4: "Mode 4 — 3× cost (15–17★) | 6.5× cost (18–21★) · no boom",
  };

  function syncRateCostTable() {
    const itemLevel = parseInt($("itemLevel").value, 10) || 200;
    $("rate-cost-unit").textContent =
      "% success · M mesos per attempt · lv. " + itemLevel;

    const stars = [15, 16, 17, 18, 19, 20, 21];
    $("rate-cost-table-body").innerHTML = stars
      .map((star) => {
        const cols = [1, 2, 3, 4]
          .map((m) => {
            const opts = {
              enhanceMode: m,
              mvp: $("mvp").value,
              event: $("event").value,
              safeguard: $("safeguard").checked,
              starCatching: $("starCatching").checked,
              enhanceModeBoomReduction: $("enhanceModeBoomReduction").checked,
            };
            const [s] = SF.applyRateModifiers(star, opts);
            const cost = Math.round(
              SF.baseCost(star, itemLevel) * SF.costMultiplier(star, opts),
            );
            const pct = (s * 100).toFixed(1) + "%";
            const costM = (cost / 1e6).toFixed(2) + " M";
            // Gradient: amber #d4a259 (30%+) → red #c97a7a (8% and below)
            const t = Math.max(0, Math.min(1, (s - 0.08) / (0.3 - 0.08)));
            const pctColor = `rgb(${Math.round(201 + 11 * t)},${Math.round(122 + 40 * t)},${Math.round(122 - 33 * t)})`;
            return `<td class="num" data-mode-col="${m}"><span style="color:${pctColor}">${pct}</span><br><span class="table-sub">${costM}</span></td>`;
          })
          .join("");
        return `<tr><td>${star} → ${star + 1}</td>${cols}</tr>`;
      })
      .join("");

    // Re-apply column highlight after rebuilding the table body.
    const v = parseInt($("enhanceMode").value, 10) || 1;
    document.querySelectorAll("[data-mode-col]").forEach((el) => {
      el.classList.toggle("active-mode-col", el.dataset.modeCol === String(v));
    });
  }

  function syncEnhanceMode() {
    const v = parseInt($("enhanceMode").value, 10) || 1;
    $("enhanceModeLabel").textContent =
      ENHANCE_MODE_LABELS[v] || ENHANCE_MODE_LABELS[1];

    // Safeguard is always available — in modes 2–4 it means "safeguard to 18".
    const sg = $("safeguard");
    sg.disabled = false;
    sg.closest(".check").classList.remove("is-disabled");

    syncRateCostTable();
  }

  // Collects any modelling caveats that apply to the current inputs and renders
  // them as separate lines in the notice box. Nothing is shown on Mode 1 — the
  // classic path is fully known. On Modes 2–4, up to two can apply:
  //   • Mode boom rate — Modes 2 and 3 carry an estimated, unconfirmed boom rate
  //     (Mode 4 has no boom). Flagged only alongside a boom event, when boom
  //     outcomes are front of mind.
  //   • Event cost reduction — event discounts (30% off, Shining Star Force) use
  //     an assumed stacking formula; the real behaviour isn't confirmed.
  function syncEventNote() {
    const mode = parseInt($("enhanceMode").value, 10) || 1;
    const event = $("event").value;
    const note = $("eventNote");
    const isBoomEvent =
      event === "boomReduction" || event === "shiningStarForce";
    const isCostEvent = event === "thirtyOff" || event === "shiningStarForce";
    const lines = [];

    // Mode 1 is the classic, fully-known path — no modelling caveats apply there.
    if (mode !== 1) {
      if ((mode === 2 || mode === 3) && isBoomEvent) {
        lines.push(
          "<strong>Boom rate is an estimate.</strong> We don't know exactly how " +
            "Mode " +
            mode +
            "'s boom rate will behave yet — for now boom is being " +
            "applied as it normally would, so treat boom counts as approximate.",
        );
      }

      if (isCostEvent) {
        lines.push(
          "<strong>Cost reduction is an estimate.</strong> We don't know for sure " +
            "how event cost reductions will be calculated — the discount is currently " +
            "applied as a straight percentage off each star's cost, so treat totals " +
            "as approximate.",
        );
      }
    }

    if (lines.length === 0) {
      note.classList.add("hidden");
      note.innerHTML = "";
      return;
    }

    note.innerHTML = lines.map((l) => "<p>" + l + "</p>").join("");
    note.classList.remove("hidden");
  }

  function syncBoomTable() {
    const ev = $("event").value;
    const boomEventActive = ev === "boomReduction" || ev === "shiningStarForce";
    const safeguardChecked = $("safeguard").checked;
    const enhModeBoomRed = $("enhanceModeBoomReduction").checked;
    document.querySelectorAll(".boom-cell").forEach((cell) => {
      const base = parseFloat(cell.dataset.base);
      const star = parseInt(cell.closest("tr").cells[0].textContent);
      // Safeguard to 18: stars 15–17 always have 0% boom when safeguard is on.
      if (safeguardChecked && star >= 15 && star <= 17) {
        cell.innerHTML = `<span style="text-decoration:line-through;color:var(--muted-2)">${base.toFixed(2)}%</span> 0%`;
        return;
      }
      // Boom reduction applies to Mode 1 always; to modes 2–3 only if the option is on.
      const reduced =
        boomEventActive && (cell.dataset.modeCol === "1" || enhModeBoomRed);
      if (reduced) {
        const reducedVal = (base * 0.7).toFixed(2);
        cell.innerHTML = `<span style="text-decoration:line-through;color:var(--muted-2)">${base.toFixed(2)}%</span> ${reducedVal}%`;
      } else {
        cell.textContent = base.toFixed(2) + "%";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("sf-form").addEventListener("submit", onSubmit);
    $("enhanceMode").addEventListener("input", () => {
      syncEnhanceMode();
      syncEventNote();
    });
    $("event").addEventListener("change", () => {
      syncBoomTable();
      syncRateCostTable();
      syncEventNote();
    });
    $("mvp").addEventListener("change", syncRateCostTable);
    $("itemLevel").addEventListener("change", syncEnhanceMode);
    $("starCatching").addEventListener("change", syncEnhanceMode);
    $("safeguard").addEventListener("change", () => {
      syncEnhanceMode();
      syncBoomTable();
    });
    $("enhanceModeBoomReduction").addEventListener("change", () => {
      syncBoomTable();
      syncRateCostTable();
    });
    syncEnhanceMode();
    syncBoomTable();
    syncEventNote();
  });
})();
