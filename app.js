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
      enhanceModeEvents: $("enhanceModeEvents").checked,
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
    1: "Mode 1 — 1× cost · baseline",
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
              enhanceModeEvents: $("enhanceModeEvents").checked,
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

    syncEnhanceEventsToggle();
    syncRateCostTable();
  }

  // The experimental "apply events to enhance modes" toggle is a no-op outside
  // Modes 2–4 with a cost- or boom-reducing event active: Mode 1 already applies
  // events via the classic path, and stars need a discount/boom event to scale.
  // Cost reduction can apply in Modes 2–4; boom reduction only in Modes 2–3 (Mode
  // 4 has no boom). Grey it out and say why when it can't do anything, otherwise
  // ticking it looks like it does nothing.
  function syncEnhanceEventsToggle() {
    const mode = parseInt($("enhanceMode").value, 10) || 1;
    const ev = $("event").value;
    const costEvent = ev === "thirtyOff" || ev === "shiningStarForce";
    const boomEvent = ev === "boomReduction" || ev === "shiningStarForce";

    const affectsCost = costEvent && mode >= 2;
    const affectsBoom = boomEvent && (mode === 2 || mode === 3);
    const usable = affectsCost || affectsBoom;

    const cb = $("enhanceModeEvents");
    cb.disabled = !usable;
    cb.closest(".check").classList.toggle("is-disabled", !usable);

    const hint = $("enhanceModeEventsHint");
    if (hint) {
      if (usable) hint.textContent = "(experimental)";
      else if (mode === 1) hint.textContent = "(modes 2–4 only)";
      else if (!costEvent && !boomEvent)
        hint.textContent = "(needs a cost or boom event)";
      else hint.textContent = "(no effect with this event)";
    }
  }

  // Explains, in plain language, how the selected event interacts with the new
  // Enhancement Modes (2–4) — the common point of confusion. Star events are only
  // confirmed for the classic system (Mode 1); whether they carry over to the new
  // modes is unknown, so by default they're NOT applied there. That can make a
  // higher mode look boomier/pricier than Mode 1 with the same event, which is
  // why the message spells out exactly what is and isn't being applied, and how
  // the "apply events to enhance modes" toggle changes it. Nothing shows on Mode
  // 1 (fully known) or when no cost/boom event is selected.
  function syncEventNote() {
    const mode = parseInt($("enhanceMode").value, 10) || 1;
    const event = $("event").value;
    const applied = $("enhanceModeEvents").checked;
    const note = $("eventNote");

    const isBoomEvent =
      event === "boomReduction" || event === "shiningStarForce";
    const isCostEvent = event === "thirtyOff" || event === "shiningStarForce";

    if (mode < 2 || !(isBoomEvent || isCostEvent)) {
      note.classList.add("hidden");
      note.innerHTML = "";
      return;
    }

    // Which of this event's effects could actually touch this mode?
    // (Mode 4 has no booms, so boom reduction can't do anything there.)
    const effects = [];
    if (isCostEvent) effects.push("cost discount");
    if (isBoomEvent && mode !== 4) effects.push("boom reduction");

    let msg;
    if (effects.length === 0) {
      // Mode 4 + a boom-only event: nothing to reduce.
      msg =
        "This event only reduces booms, and <strong>Mode 4 never booms</strong>, " +
        "so it has no effect here.";
    } else if (applied) {
      msg =
        "<strong>Experimental — this event is being applied to Mode " +
        mode +
        ".</strong> Its " +
        effects.join(" and ") +
        " is layered on top of the new mode's rates. It isn't confirmed that star " +
        "events carry over to Enhancement Modes, so treat these numbers as a what-if.";
    } else {
      msg =
        "<strong>This event is NOT being applied to Mode " +
        mode +
        ".</strong> Star events are only confirmed for the classic system (Mode 1); " +
        "it's unknown whether they carry over to the new modes, so they're left off " +
        "by default. That's why Mode " +
        mode +
        " can show more booms or higher cost here than Mode 1 with the same event. " +
        "Tick <em>“Apply event cost &amp; boom reductions to enhance modes”</em> below " +
        "to apply it anyway (experimental).";
    }

    note.innerHTML = "<p>" + msg + "</p>";
    note.classList.remove("hidden");
  }

  function syncBoomTable() {
    const ev = $("event").value;
    const boomEventActive = ev === "boomReduction" || ev === "shiningStarForce";
    const safeguardChecked = $("safeguard").checked;
    const enhModeEvents = $("enhanceModeEvents").checked;
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
        boomEventActive && (cell.dataset.modeCol === "1" || enhModeEvents);
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
      syncEnhanceEventsToggle();
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
    $("enhanceModeEvents").addEventListener("change", () => {
      syncBoomTable();
      syncRateCostTable();
      syncEventNote();
    });
    syncEnhanceMode();
    syncBoomTable();
    syncEventNote();
  });
})();
