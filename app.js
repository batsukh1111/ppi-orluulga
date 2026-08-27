(function () {
  const STORE = "ppi-orluulga-v1";
  let data = clone(PPI_DATA);
  let audit = [];
  let selected = null;
  let chosen = null;

  function clone(x) {
    return JSON.parse(JSON.stringify(x));
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.data) data = s.data;
      if (s.audit) audit = s.audit;
    } catch (e) {}
  }
  function saveStore() {
    localStorage.setItem(STORE, JSON.stringify({ data, audit }));
  }

  function period() {
    return document.getElementById("period").value || data.currentPeriod;
  }
  function sectorFilter() {
    return document.getElementById("sectorFilter").value || "ALL";
  }
  function specialist() {
    return document.getElementById("specialist").value.trim() || "Мэргэжилтэн";
  }

  function fmt(n, d) {
    if (n == null || !isFinite(n)) return "—";
    return n.toLocaleString("mn-MN", { maximumFractionDigits: d == null ? 1 : d });
  }
  function fmtPct(n) {
    if (n == null || !isFinite(n)) return "—";
    const s = (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
    return s;
  }

  function fillControls() {
    const pSel = document.getElementById("period");
    pSel.innerHTML = data.periods
      .map((p) => `<option value="${p}" ${p === data.currentPeriod ? "selected" : ""}>${p}</option>`)
      .join("");
    const sSel = document.getElementById("sectorFilter");
    sSel.innerHTML =
      `<option value="ALL">Бүх салбар</option>` +
      data.sectors.map((s) => `<option value="${s.code}">${s.code} · ${s.name}</option>`).join("");
  }

  function queue() {
    let q = PPI.scanQueue(data, period());
    const sf = sectorFilter();
    if (sf !== "ALL") q = q.filter((r) => r.sector.code === sf);
    return q;
  }

  function renderKpis() {
    const q = PPI.scanQueue(data, period());
    const tree = PPI.computeTree(data, period());
    const missing = q.filter((r) => r.issues.some((i) => i.code === "missing")).length;
    const frozen = q.filter((r) => r.issues.some((i) => i.code === "frozen" || i.code === "frozen_year")).length;
    const quality = q.filter((r) => r.issues.some((i) => i.code === "quality" || i.code === "pack")).length;
    const imputed = PPI.allItems(data).filter((r) => PPI.isImputed(r.item.prices[period()])).length;
    const el = document.getElementById("kpis");
    el.innerHTML = [
      kpi("Ерөнхий индекс", tree.overall == null ? "—" : fmt(tree.overall, 1), "өмнөх сар = 100"),
      kpi("Шийдвэр хүлээгдэж буй", String(q.length), "бүх салбар"),
      kpi("Алгассан үнэ", String(missing), "орлуулга хэрэгтэй", missing ? "up" : ""),
      kpi("Хөлдүү үнэ", String(frozen), "3–12 сар"),
      kpi("Чанар / багц", String(quality), "шууд харьцуулахгүй"),
      kpi("Орлуулсан", String(imputed), "баримттай"),
    ].join("");
  }
  function kpi(label, value, sub, cls) {
    return `<div class="kpi"><div class="label">${label}</div><div class="value ${cls || ""}">${value}</div><div class="sub">${sub}</div></div>`;
  }

  function badges(issues) {
    return issues
      .filter((i) => i.code !== "imputed")
      .map((i) => `<span class="badge b-${i.severity}">${i.label}</span>`)
      .join(" ");
  }

  function renderQueue() {
    const tb = document.querySelector("#tblQueue tbody");
    const q = queue();
    tb.innerHTML = q
      .map((r) => {
        const pref = r.preferred ? PPI.METHODS.find((m) => m.id === r.preferred.method)?.name : "—";
        return `<tr class="clickable" data-id="${r.item.id}">
          <td class="left">${r.sector.code}</td>
          <td class="left">${r.item.name}<br><span class="muted">${r.item.enterprise || ""}</span></td>
          <td class="left">${badges(r.issues)}</td>
          <td class="left">${pref || "—"}</td>
          <td>${fmt(r.prevPrice, 0)}</td>
        </tr>`;
      })
      .join("");
    tb.querySelectorAll("tr").forEach((tr) => {
      tr.addEventListener("click", () => openCase(tr.getAttribute("data-id")));
    });
  }

  function openCase(id) {
    const row = PPI.findItem(data, id);
    if (!row) return;
    selected = row;
    chosen = null;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === "apply"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === "panel-apply"));
    renderCase();
  }

  function renderCase() {
    const empty = document.getElementById("caseEmpty");
    const body = document.getElementById("caseBody");
    const opts = document.getElementById("options");
    const applyBox = document.getElementById("applyBox");
    if (!selected) {
      empty.style.display = "block";
      body.style.display = "none";
      opts.innerHTML = "";
      applyBox.style.display = "none";
      return;
    }
    empty.style.display = "none";
    body.style.display = "block";
    const { item, group, sector } = selected;
    const p = period();
    const rec = PPI.recommend(item, group, sector, p, data.periods, data.fx);
    const now = PPI.itemMnt(item, p, data.fx);
    const prev = rec.prevPrice;
    const share = PPI.imputationShare(group, p);

    body.innerHTML = `
      <p><span class="chip">${sector.code}</span> <span class="chip">${group.name}</span></p>
      <p style="margin:0.5rem 0 0.2rem;font-weight:700">${item.name}</p>
      <p class="muted">${item.enterprise || ""} · ${item.unit || ""} · ${item.currency || "MNT"}</p>
      <p style="margin-top:0.6rem">${badges(rec.issues)}</p>
      <div class="formula">
        Өмнөх сар: ${fmt(prev, 0)} төг<br/>
        Тайлант сар: ${now == null ? "алгассан" : fmt(now, 0) + " төг"}
        ${item.specs && item.specs.cuPct != null ? "<br/>Cu агуулга: " + item.specs.cuPct + "%" : ""}
        ${item.specs && item.specs.bundle ? "<br/>Багц: " + item.specs.bundle : ""}
      </div>
      ${share > 0.2 ? `<div class="warn-box">Энэ бүлэгт орлуулгын хувь ${(share * 100).toFixed(0)}% — 20%-иас хэтэрсэн тул сагсыг эргэн хяана.</div>` : ""}
      ${item.regulated ? `<div class="ok-box">Зохицуулалттай тариф — хөлдүү үнэ автоматаар алдаа биш.</div>` : ""}
    `;

    if (!rec.options.length) {
      opts.innerHTML = `<p class="hint">Одоогоор орлуулгын сонголт алга (үнэ ирсэн эсвэл өмнөх үнэ байхгүй).</p>`;
      applyBox.style.display = rec.issues.length ? "block" : "none";
      return;
    }

    opts.innerHTML = rec.options
      .map((o, i) => {
        const meta = PPI.METHODS.find((m) => m.id === o.method) || {};
        const pref = rec.preferred && rec.preferred.method === o.method;
        return `<div class="option ${pref ? "preferred" : ""} ${o.lastResort ? "last" : ""}" data-i="${i}">
          <div class="rank">${meta.rank || ""}. ${meta.name || o.method}${pref ? " · зөвлөмжит" : ""}${o.lastResort ? " · сүүлийн сонголт" : ""}</div>
          <h3>${fmt(o.value, 0)} төг ${o.relative ? " · харьцаа " + o.relative.toFixed(3) : ""}</h3>
          <p class="muted">${o.note || ""}</p>
        </div>`;
      })
      .join("");

    opts.querySelectorAll(".option").forEach((el) => {
      el.addEventListener("click", () => {
        opts.querySelectorAll(".option").forEach((x) => x.classList.remove("selected"));
        el.classList.add("selected");
        chosen = rec.options[Number(el.dataset.i)];
        applyBox.style.display = "block";
      });
    });
    const first = opts.querySelector(".option.preferred") || opts.querySelector(".option");
    if (first) first.click();
    else applyBox.style.display = "none";
  }

  function apply() {
    if (!selected || !chosen) return;
    const { item } = selected;
    const p = period();
    const note = document.getElementById("applyNote").value.trim();
    if (chosen.lastResort && !note) {
      alert("Өмнөх үеийн үнийг хадгалах бол тайлбар заавал бичнэ (яагаад 1 сарын түр саатал вэ).");
      return;
    }
    const updated = PPI.applyReplacement(item, p, Object.assign({}, chosen, { note: note || chosen.note }), specialist());
    item.prices = updated.prices;
    audit.unshift({
      at: new Date().toISOString(),
      itemId: item.id,
      name: item.name,
      period: p,
      method: chosen.method,
      methodName: (PPI.METHODS.find((m) => m.id === chosen.method) || {}).name,
      value: chosen.value,
      relative: chosen.relative,
      specialist: specialist(),
      note: note || chosen.note,
    });
    saveStore();
    document.getElementById("applyNote").value = "";
    selected = PPI.findItem(data, item.id);
    renderAll();
    renderCase();
  }

  function renderIndex() {
    const p = period();
    const tree = PPI.computeTree(data, p);
    const prev = PPI.prevPeriod(p);
    const prevTree = data.periods.includes(prev) ? PPI.computeTree(data, prev) : null;
    const tb = document.querySelector("#tblIndex tbody");
    const rows = [];
    rows.push(idxRow("Ерөнхий ҮҮИ", "", tree.overall, prevTree ? prevTree.overall : 100, null));
    tree.sectors.forEach((s, si) => {
      const ps = prevTree ? prevTree.sectors[si] : null;
      rows.push(idxRow(s.code + "  " + s.name, s.weight, s.index, ps ? ps.index : 100, null));
      s.groups.forEach((g, gi) => {
        const pg = ps ? ps.groups[gi] : null;
        rows.push(idxRow("  " + g.name, g.weight, g.index, pg ? pg.index : 100, g.n));
      });
    });
    tb.innerHTML = rows.join("");
  }
  function idxRow(name, w, idx, prevIdx, n) {
    const ch = idx != null && prevIdx ? (idx / 100 - 1) * 100 : null;
    const cls = ch == null ? "" : ch >= 0 ? "up" : "down";
    return `<tr>
      <td class="left">${name}</td>
      <td>${w === "" || w == null ? "—" : (w * 100).toFixed(1) + "%"}</td>
      <td>${fmt(idx, 1)}</td>
      <td class="${cls}">${ch == null ? "—" : fmtPct(ch)}</td>
      <td>${n == null ? "—" : n}</td>
    </tr>`;
  }

  function renderItems() {
    const p = period();
    const prev = PPI.prevPeriod(p);
    const sf = sectorFilter();
    const tb = document.querySelector("#tblItems tbody");
    const rows = [];
    for (const rec of PPI.allItems(data)) {
      if (sf !== "ALL" && rec.sector.code !== sf) continue;
      const a = PPI.itemMnt(rec.item, prev, data.fx);
      const b = PPI.itemMnt(rec.item, p, data.fx);
      const ch = a && b ? (b / a - 1) * 100 : null;
      const obs = rec.item.prices[p];
      let st = "OK";
      if (b == null) st = "алгассан";
      else if (PPI.isImputed(obs)) st = "орлуулсан";
      else if (rec.item.qualityFlag) st = "чанар";
      rows.push(`<tr class="clickable" data-id="${rec.item.id}">
        <td class="left">${rec.sector.code}</td>
        <td class="left">${rec.item.name}</td>
        <td class="left">${rec.item.unit || ""}</td>
        <td>${fmt(a, 0)}</td>
        <td>${fmt(b, 0)}</td>
        <td class="${ch == null ? "" : ch >= 0 ? "up" : "down"}">${ch == null ? "—" : fmtPct(ch)}</td>
        <td class="left">${st}</td>
      </tr>`);
    }
    tb.innerHTML = rows.join("");
    tb.querySelectorAll("tr").forEach((tr) => tr.addEventListener("click", () => openCase(tr.dataset.id)));
  }

  function renderAudit() {
    const tb = document.querySelector("#tblAudit tbody");
    tb.innerHTML = audit
      .map(
        (a) => `<tr>
        <td class="left">${a.at.slice(0, 16).replace("T", " ")}</td>
        <td class="left">${a.name}<br><span class="muted">${a.period}</span></td>
        <td class="left">${a.methodName || a.method}</td>
        <td>${fmt(a.value, 0)}</td>
        <td class="left">${a.specialist || ""}</td>
        <td class="left">${a.note || ""}</td>
      </tr>`
      )
      .join("") || `<tr><td class="left" colspan="6">Баримт байхгүй.</td></tr>`;
  }

  function renderAll() {
    renderKpis();
    renderQueue();
    renderIndex();
    renderItems();
    renderAudit();
  }

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
    });
  });
  document.getElementById("period").addEventListener("change", renderAll);
  document.getElementById("sectorFilter").addEventListener("change", renderAll);
  document.getElementById("btnApply").addEventListener("click", apply);
  document.getElementById("btnSkip").addEventListener("click", () => {
    selected = null;
    renderCase();
    document.querySelector('.tab[data-tab="queue"]').click();
  });
  document.getElementById("btnReset").addEventListener("click", () => {
    if (!confirm("Жишээ өгөгдөл, орлуулгын баримтыг эхнээс нь сэргээх үү?")) return;
    data = clone(PPI_DATA);
    audit = [];
    selected = null;
    localStorage.removeItem(STORE);
    fillControls();
    renderAll();
    renderCase();
  });

  loadStore();
  fillControls();
  renderAll();
})();
