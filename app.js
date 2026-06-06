(function () {
  const $ = (id) => document.getElementById(id);

  // Which calculator tab is showing. "quick" drives the global mode slider +
  // safeguard checkbox; "perstar" sends a per-star plan (opts.starPlan) instead.
  let activeTab = "quick";

  // Stars where Enhancement Modes exist (15–21). Safeguard only applies to 15–17.
  const PLAN_STARS = [15, 16, 17, 18, 19, 20, 21];
  const PLAN_STORAGE_KEY = "sf-star-plan";
  const TAB_STORAGE_KEY = "sf-active-tab";
  // Default plan: safeguard 15–17, Mode 1 on 18–19, Mode 4 on 20–21.
  const DEFAULT_PLAN = {
    15: { mode: 1, safeguard: true },
    16: { mode: 1, safeguard: true },
    17: { mode: 1, safeguard: true },
    18: { mode: 1, safeguard: false },
    19: { mode: 1, safeguard: false },
    20: { mode: 4, safeguard: false },
    21: { mode: 4, safeguard: false },
  };

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

  // Item level comes from the dropdown, except when "Custom…" is selected, in
  // which case the free-input field next to it is authoritative.
  function readItemLevel() {
    const sel = $("itemLevel");
    if (sel.value === "custom") return parseInt($("itemLevelCustom").value, 10);
    return parseInt(sel.value, 10);
  }

  function readInputs() {
    const input = {
      itemLevel: readItemLevel(),
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
    // Per-star tab: a plan overrides the global mode/safeguard for stars 15–21.
    if (activeTab === "perstar") input.starPlan = readStarPlan();
    return input;
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

  function renderResults(stats) {
    $("m-avg").textContent = fmtMesos(stats.avgCost);
    $("m-median").textContent = fmtMesos(stats.medianCost);
    $("m-booms").textContent = stats.avgBooms.toFixed(2);
    $("m-attempts").textContent = stats.medianAttempts.toFixed(1);

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

  // Run the simulation off the main thread via a Web Worker so the UI stays
  // fully responsive while it runs. Falls back to the in-page (time-sliced) path
  // if a Worker can't be created or fails to load — e.g. some browsers block
  // worker scripts under the file:// protocol. A fresh worker per run keeps the
  // routing simple and lets us terminate it cleanly when finished.
  function runSimulation(input, onProgress) {
    return new Promise((resolve) => {
      let worker;
      try {
        worker = new Worker("worker.js");
      } catch (e) {
        resolve(SF.runTrials(input, { onProgress }));
        return;
      }

      let settled = false;
      const fallback = () => {
        if (settled) return;
        settled = true;
        try {
          worker.terminate();
        } catch (e) {}
        resolve(SF.runTrials(input, { onProgress }));
      };

      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === "progress") {
          onProgress(msg.done, msg.total);
        } else if (msg.type === "done") {
          settled = true;
          worker.terminate();
          resolve(msg.stats);
        }
      };
      worker.onerror = (err) => {
        // Worker failed to load or threw; recover by computing in-page.
        if (err && err.preventDefault) err.preventDefault();
        fallback();
      };

      worker.postMessage(input);
    });
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
      const stats = await runSimulation(input, (done, total) => {
        btn.textContent = `Running ${done.toLocaleString("en-US")} / ${total.toLocaleString("en-US")}`;
      });
      $("results").classList.remove("hidden");
      renderResults(stats);
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
    const itemLevel = readItemLevel() || 200;

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
            // fmtMesos rolls over to "B" above 1000 M (and "T" above 1000 B).
            const costStr = fmtMesos(cost);
            // Gradient: amber #d4a259 (30%+) → red #c97a7a (8% and below)
            const t = Math.max(0, Math.min(1, (s - 0.08) / (0.3 - 0.08)));
            const pctColor = `rgb(${Math.round(201 + 11 * t)},${Math.round(122 + 40 * t)},${Math.round(122 - 33 * t)})`;
            return `<td class="num" data-mode-col="${m}"><span style="color:${pctColor}">${pct}</span><br><span class="table-sub">${costStr}</span></td>`;
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

  // Reveal the free-input field only when "Custom…" is picked.
  function syncItemLevelCustom() {
    const isCustom = $("itemLevel").value === "custom";
    const custom = $("itemLevelCustom");
    custom.hidden = !isCustom;
    if (isCustom) custom.focus();
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
        cell.innerHTML = `<span class="boom-old">${base.toFixed(2)}%</span><span class="boom-new">0%</span>`;
        return;
      }
      // Boom reduction applies to Mode 1 always; to modes 2–3 only if the option is on.
      const reduced =
        boomEventActive && (cell.dataset.modeCol === "1" || enhModeEvents);
      if (reduced) {
        const reducedVal = (base * 0.7).toFixed(2);
        cell.innerHTML = `<span class="boom-old">${base.toFixed(2)}%</span><span class="boom-new">${reducedVal}%</span>`;
      } else {
        cell.textContent = base.toFixed(2) + "%";
      }
    });
  }

  // ── Per-star strategy tab ───────────────────────────────────────────────
  // Read the saved plan from localStorage, falling back to DEFAULT_PLAN for any
  // missing/corrupt entry so a partial or stale payload can never break the page.
  function loadPlan() {
    let parsed = null;
    try {
      const raw = localStorage.getItem(PLAN_STORAGE_KEY);
      if (raw) parsed = JSON.parse(raw);
    } catch (e) {
      parsed = null;
    }
    const plan = {};
    PLAN_STARS.forEach((star) => {
      const p = parsed && parsed[star];
      plan[star] =
        p && typeof p.mode === "number"
          ? { mode: p.mode, safeguard: !!p.safeguard }
          : Object.assign({}, DEFAULT_PLAN[star]);
    });
    return plan;
  }

  function savePlan(plan) {
    try {
      localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
    } catch (e) {}
  }

  // Build the live plan from the matrix controls. Safeguard only counts when it's
  // a 15–17 star on Mode 1 (it doesn't stack on Modes 2–4), matching the engine.
  function readStarPlan() {
    const plan = {};
    PLAN_STARS.forEach((star) => {
      const sel = document.querySelector(`.plan-mode[data-star="${star}"]`);
      const mode = sel ? parseInt(sel.value, 10) : 1;
      const sgCb = document.querySelector(`.plan-sg[data-star="${star}"]`);
      const safeguard = !!(sgCb && sgCb.checked && mode === 1 && star <= 17);
      plan[star] = { mode, safeguard };
    });
    return plan;
  }

  function buildPlanTable() {
    const saved = loadPlan();
    $("plan-table-body").innerHTML = PLAN_STARS.map((star) => {
      const p = saved[star];
      const modeOpts = [1, 2, 3, 4]
        .map(
          (m) =>
            `<option value="${m}"${m === p.mode ? " selected" : ""}>Mode ${m}</option>`,
        )
        .join("");
      const sgCell =
        star <= 17
          ? `<input type="checkbox" class="plan-sg" data-star="${star}"${p.safeguard ? " checked" : ""} aria-label="Safeguard ${star}★" />`
          : `<span class="num zero">—</span>`;
      return `<tr data-star="${star}">
        <td>${star} → ${star + 1}</td>
        <td><select class="plan-mode" data-star="${star}" aria-label="Mode for ${star}★">${modeOpts}</select></td>
        <td>${sgCell}</td>
        <td class="num plan-boom-cell"></td>
        <td class="num plan-cost-cell"></td>
      </tr>`;
    }).join("");

    $("plan-table-body")
      .querySelectorAll(".plan-mode, .plan-sg")
      .forEach((el) => el.addEventListener("change", onPlanChange));

    syncPlanTable();
  }

  function onPlanChange() {
    savePlan(readStarPlan());
    syncPlanTable();
  }

  // Refresh each row's derived UI: the safeguard checkbox is only enabled on Mode
  // 1, and the boom%/cost columns are computed through the same engine the
  // simulation uses. Rows outside the current → target range are greyed (off).
  function syncPlanTable() {
    const itemLevel = readItemLevel() || 200;
    const current = parseInt($("currentStar").value, 10);
    const target = parseInt($("targetStar").value, 10);
    const baseOpts = {
      mvp: $("mvp").value,
      event: $("event").value,
      starCatching: $("starCatching").checked,
      enhanceModeEvents: $("enhanceModeEvents").checked,
    };

    PLAN_STARS.forEach((star) => {
      const row = document.querySelector(`tr[data-star="${star}"]`);
      if (!row) return;
      const mode = parseInt(row.querySelector(".plan-mode").value, 10);
      const sgCb = row.querySelector(".plan-sg");
      if (sgCb) sgCb.disabled = mode !== 1;
      const safeguard = !!(sgCb && sgCb.checked && mode === 1 && star <= 17);

      const opts = Object.assign({ enhanceMode: mode, safeguard }, baseOpts);
      const [, , boom] = SF.applyRateModifiers(star, opts);
      const cost = Math.round(
        SF.baseCost(star, itemLevel) * SF.costMultiplier(star, opts),
      );

      const boomPct = boom * 100;
      row.querySelector(".plan-boom-cell").innerHTML =
        `<span class="plan-boom${boomPct === 0 ? " zero" : ""}">${boomPct.toFixed(2)}%</span>`;
      row.querySelector(".plan-cost-cell").textContent = fmtMesos(cost);

      const off = !(
        Number.isFinite(current) &&
        Number.isFinite(target) &&
        star >= current &&
        star < target
      );
      row.classList.toggle("plan-row--off", off);
    });
  }

  function setTab(tab) {
    activeTab = tab === "perstar" ? "perstar" : "quick";
    const perStar = activeTab === "perstar";
    $("tab-quick").classList.toggle("is-active", !perStar);
    $("tab-perstar").classList.toggle("is-active", perStar);
    $("tab-quick").setAttribute("aria-selected", String(!perStar));
    $("tab-perstar").setAttribute("aria-selected", String(perStar));
    // The global mode slider + safeguard checkbox belong to the Quick tab only;
    // the reference tables are replaced by the strategy matrix in Per-star.
    $("enhanceModeRow").classList.toggle("hidden", perStar);
    $("safeguardField").classList.toggle("hidden", perStar);
    $("referencePanels").classList.toggle("hidden", perStar);
    $("perStarPanel").classList.toggle("hidden", !perStar);
    if (perStar) syncPlanTable();
    try {
      localStorage.setItem(TAB_STORAGE_KEY, activeTab);
    } catch (e) {}
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
    $("itemLevel").addEventListener("change", () => {
      syncItemLevelCustom();
      syncEnhanceMode();
    });
    $("itemLevelCustom").addEventListener("input", syncEnhanceMode);
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
    // Tabs + per-star matrix.
    $("tab-quick").addEventListener("click", () => setTab("quick"));
    $("tab-perstar").addEventListener("click", () => setTab("perstar"));
    // Inputs the matrix's boom%/cost and active-range shading depend on. (The
    // mode slider and safeguard checkbox are Quick-only and don't feed it.)
    [
      "event",
      "mvp",
      "starCatching",
      "enhanceModeEvents",
      "itemLevel",
      "itemLevelCustom",
      "currentStar",
      "targetStar",
    ].forEach((id) => {
      const el = $(id);
      const evt = el.tagName === "INPUT" && el.type === "number" ? "input" : "change";
      el.addEventListener(evt, syncPlanTable);
    });

    syncItemLevelCustom();
    syncEnhanceMode();
    syncBoomTable();
    syncEventNote();

    buildPlanTable();
    let savedTab = "quick";
    try {
      savedTab = localStorage.getItem(TAB_STORAGE_KEY) || "quick";
    } catch (e) {}
    setTab(savedTab);
  });
})();
