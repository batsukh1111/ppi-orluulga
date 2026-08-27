(function () {
  "use strict";

  const STORE = "ppi-sheet-v2";
  const SECTORS = [
    { code: "B", name: "Уул уурхай, олборлолт" },
    { code: "C", name: "Боловсруулах үйлдвэр" },
    { code: "D", name: "Цахилгаан, хий, уур" },
    { code: "E", name: "Усан хангамж, хог хаягдал" },
    { code: "H", name: "Тээвэр, агуулах" },
    { code: "I", name: "Байр сууц, нийтийн хоол" },
    { code: "J", name: "Мэдээлэл, холбоо" },
  ];

  const METHODS = [
    { id: "targeted", label: "Зорилтот дунджаар орлуулах" },
    { id: "overall", label: "Ерөнхий дунджаар орлуулах" },
    { id: "comparable", label: "Харьцуулах боломжтой орлуулга" },
    { id: "overlap", label: "Давхцах үеийн арга" },
    { id: "quantity", label: "Тоо хэмжээний тохируулга" },
    { id: "metal", label: "Металл агуулгын тохируулга" },
    { id: "carry", label: "Өмнөх үеийн үнийг хадгалах (0%)" },
  ];

  function emptyRow() {
    return {
      name: "",
      enterprise: "",
      unit: "",
      prev: "",
      method: "targeted",
      pct: "",
      note: "",
    };
  }

  function nowMonth() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function prevMonth(ym) {
    const [y, m] = ym.split("-").map(Number);
    if (m === 1) return y - 1 + "-12";
    return y + "-" + String(m - 1).padStart(2, "0");
  }

  function key(period, sector) {
    return period + "|" + sector;
  }

  function loadAll() {
    try {
      return JSON.parse(localStorage.getItem(STORE) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveAll(db) {
    localStorage.setItem(STORE, JSON.stringify(db));
  }

  const sectorEl = document.getElementById("sector");
  const periodEl = document.getElementById("period");
  const specEl = document.getElementById("specialist");
  const tbody = document.getElementById("tbody");
  const statusEl = document.getElementById("status");

  SECTORS.forEach((s) => {
    const o = document.createElement("option");
    o.value = s.code;
    o.textContent = s.code + " — " + s.name;
    sectorEl.appendChild(o);
  });

  let state = {
    period: nowMonth(),
    sector: "C",
    specialist: "",
    rows: Array.from({ length: 8 }, emptyRow),
  };

  function calcPrice(row) {
    const prev = parseFloat(String(row.prev).replace(",", "."));
    if (!isFinite(prev)) return null;
    if (row.method === "carry") return prev;
    const pct = parseFloat(String(row.pct).replace(",", "."));
    if (!isFinite(pct)) return null;
    return Math.round(prev * (1 + pct / 100) * 100) / 100;
  }

  function fmt(n) {
    if (n == null || !isFinite(n)) return "";
    return n.toLocaleString("mn-MN", { maximumFractionDigits: 2 });
  }

  function currentKey() {
    return key(state.period, state.sector);
  }

  function persist() {
    const db = loadAll();
    db.specialist = state.specialist;
    db.lastPeriod = state.period;
    db.lastSector = state.sector;
    db.sheets = db.sheets || {};
    db.sheets[currentKey()] = {
      period: state.period,
      sector: state.sector,
      specialist: state.specialist,
      savedAt: new Date().toISOString(),
      rows: state.rows,
    };
    saveAll(db);
  }

  function loadSheet(period, sector) {
    const db = loadAll();
    const sh = db.sheets && db.sheets[key(period, sector)];
    state.period = period;
    state.sector = sector;
    state.specialist = specEl.value || db.specialist || "";
    if (sh && sh.rows && sh.rows.length) {
      state.rows = sh.rows.map((r) => Object.assign(emptyRow(), r));
      if (sh.specialist && !specEl.value) state.specialist = sh.specialist;
    } else {
      state.rows = Array.from({ length: 8 }, emptyRow);
    }
  }

  function sectorName(code) {
    const s = SECTORS.find((x) => x.code === code);
    return s ? s.code + " — " + s.name : code;
  }

  function setStatus(msg, ok) {
    statusEl.textContent = msg || "";
    statusEl.className = "status" + (ok ? " ok" : "");
  }

  function renderHistory() {
    const db = loadAll();
    const sheets = db.sheets || {};
    const keys = Object.keys(sheets).sort().reverse();
    const box = document.getElementById("history");
    if (!keys.length) {
      box.innerHTML = '<p class="hint">Одоогоор түүх алга. Хадгалснаар энд гарна.</p>';
      return;
    }
    const cur = currentKey();
    box.innerHTML = keys
      .map((k) => {
        const sh = sheets[k];
        const n = (sh.rows || []).filter((r) => r.name || r.prev).length;
        const active = k === cur ? " active" : "";
        return `<button type="button" class="hist-item${active}" data-k="${k}">
          <b>${sh.period}</b> · ${sh.sector}<br/>
          <span class="s">${n} бүтээгдэхүүн${sh.specialist ? " · " + sh.specialist : ""}</span>
        </button>`;
      })
      .join("");
    box.querySelectorAll(".hist-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        persist();
        const [p, s] = btn.dataset.k.split("|");
        loadSheet(p, s);
        periodEl.value = state.period;
        sectorEl.value = state.sector;
        specEl.value = state.specialist;
        render();
        setStatus(p + " сарын түүхийг нээлээ", true);
      });
    });
  }

  function methodSelect(row, i) {
    return (
      `<select data-i="${i}" data-f="method">` +
      METHODS.map(
        (m) =>
          `<option value="${m.id}" ${row.method === m.id ? "selected" : ""}>${m.label}</option>`
      ).join("") +
      `</select>`
    );
  }

  function render() {
    document.getElementById("sheetTitle").textContent =
      sectorName(state.sector) + "  ·  " + state.period + "  ·  орлуулгын хүснэгт";
    tbody.innerHTML = state.rows
      .map((row, i) => {
        const price = calcPrice(row);
        const carry = row.method === "carry";
        return `<tr>
          <td class="n">${i + 1}</td>
          <td><input data-i="${i}" data-f="name" value="${esc(row.name)}" /></td>
          <td><input data-i="${i}" data-f="enterprise" value="${esc(row.enterprise)}" /></td>
          <td><input data-i="${i}" data-f="unit" value="${esc(row.unit)}" /></td>
          <td><input data-i="${i}" data-f="prev" inputmode="decimal" value="${esc(row.prev)}" /></td>
          <td>${methodSelect(row, i)}</td>
          <td><input data-i="${i}" data-f="pct" inputmode="decimal" value="${carry ? "0" : esc(row.pct)}" ${carry ? "readonly" : ""} /></td>
          <td class="calc">${price == null ? "" : fmt(price)}</td>
          <td><input data-i="${i}" data-f="note" value="${esc(row.note)}" /></td>
          <td><button type="button" class="del" data-del="${i}" title="Мөр устгах">×</button></td>
        </tr>`;
      })
      .join("");

    tbody.querySelectorAll("input, select").forEach((el) => {
      el.addEventListener("change", onCell);
      el.addEventListener("input", onCell);
      el.addEventListener("keydown", onKey);
    });
    tbody.querySelectorAll("[data-del]").forEach((el) => {
      el.addEventListener("click", () => {
        state.rows.splice(Number(el.dataset.del), 1);
        if (!state.rows.length) state.rows.push(emptyRow());
        persist();
        render();
      });
    });

    const filled = state.rows.filter((r) => r.name || r.prev);
    document.getElementById("rowCount").textContent = String(filled.length);
    let sp = 0,
      sn = 0;
    filled.forEach((r) => {
      const p = parseFloat(r.prev);
      const n = calcPrice(r);
      if (isFinite(p)) sp += p;
      if (n != null) sn += n;
    });
    document.getElementById("sumPrev").textContent = filled.length ? fmt(sp) : "";
    document.getElementById("sumNow").textContent = filled.length ? fmt(sn) : "";
    renderHistory();
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function onCell(ev) {
    const el = ev.target;
    const i = Number(el.dataset.i);
    const f = el.dataset.f;
    if (!state.rows[i]) return;
    state.rows[i][f] = el.value;
    if (f === "method" && el.value === "carry") state.rows[i].pct = "0";
    const td = el.closest("tr").querySelector(".calc");
    const price = calcPrice(state.rows[i]);
    td.textContent = price == null ? "" : fmt(price);
    if (f === "method") render();
  }

  function onKey(ev) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      const i = Number(ev.target.dataset.i);
      if (i === state.rows.length - 1) {
        state.rows.push(emptyRow());
        persist();
        render();
        const next = tbody.querySelector(`[data-i="${i + 1}"][data-f="${ev.target.dataset.f}"]`);
        if (next) next.focus();
      } else {
        const next = tbody.querySelector(`[data-i="${i + 1}"][data-f="${ev.target.dataset.f}"]`);
        if (next) next.focus();
      }
    }
  }

  function filledRows() {
    return state.rows
      .map((r, i) => ({ r, i, price: calcPrice(r) }))
      .filter((x) => x.r.name || x.r.prev);
  }

  document.getElementById("btnAdd").addEventListener("click", () => {
    state.rows.push(emptyRow());
    persist();
    render();
    const i = state.rows.length - 1;
    const el = tbody.querySelector(`[data-i="${i}"][data-f="name"]`);
    if (el) el.focus();
  });

  document.getElementById("btnSave").addEventListener("click", () => {
    persist();
    setStatus("Хадгаллаа. Дараа сард түүхээс харагдана.", true);
    renderHistory();
  });

  document.getElementById("btnFromPrev").addEventListener("click", () => {
    persist();
    const prev = prevMonth(state.period);
    const db = loadAll();
    const sh = db.sheets && db.sheets[key(prev, state.sector)];
    if (!sh || !sh.rows) {
      setStatus(prev + " сард энэ салбарын түүх алга.");
      return;
    }
    const copied = sh.rows
      .filter((r) => r.name || r.prev)
      .map((r) => {
        const last = calcPrice(r);
        return Object.assign(emptyRow(), {
          name: r.name,
          enterprise: r.enterprise,
          unit: r.unit,
          prev: last != null ? String(last) : r.prev,
          method: r.method,
          pct: "",
          note: "",
        });
      });
    state.rows = copied.length ? copied.concat([emptyRow()]) : Array.from({ length: 8 }, emptyRow);
    persist();
    render();
    setStatus(prev + " сарын бүтээгдэхүүн, тайлант үнийг өмнөх үнэ болгон татав.", true);
  });

  document.getElementById("btnExcel").addEventListener("click", exportExcel);

  function exportExcel() {
    persist();
    const rows = filledRows();
    const sec = sectorName(state.sector);
    const header = [
      ["Үндэсний статистикийн хороо"],
      ["Үйлдвэрлэгчийн үнийн орлуулгын тайлан"],
      ["Салбар", sec],
      ["Тайлант сар", state.period],
      ["Мэргэжилтэн", state.specialist || ""],
      ["Огноо", new Date().toISOString().slice(0, 16).replace("T", " ")],
      [],
      ["№", "Бүтээгдэхүүн, үйлчилгээ", "ААНБ", "Нэгж", "Өмнөх үнэ", "Орлуулгын арга", "Өөрчлөлт %", "Тайлант үнэ", "Тайлбар"],
    ];
    const body = rows.map((x, n) => {
      const m = METHODS.find((t) => t.id === x.r.method);
      return [
        n + 1,
        x.r.name,
        x.r.enterprise,
        x.r.unit,
        parseFloat(x.r.prev) || "",
        m ? m.label : x.r.method,
        x.r.method === "carry" ? 0 : parseFloat(x.r.pct) || "",
        x.price == null ? "" : x.price,
        x.r.note,
      ];
    });
    const aoa = header.concat(body);

    const db = loadAll();
    const hist = [["Салбар", "Сар", "№", "Бүтээгдэхүүн", "ААНБ", "Нэгж", "Өмнөх үнэ", "Арга", "Өөрчлөлт %", "Тайлант үнэ", "Тайлбар", "Мэргэжилтэн"]];
    Object.keys(db.sheets || {})
      .sort()
      .forEach((k) => {
        const sh = db.sheets[k];
        (sh.rows || [])
          .filter((r) => r.name || r.prev)
          .forEach((r, n) => {
            const m = METHODS.find((t) => t.id === r.method);
            const price = calcPrice(r);
            hist.push([
              sh.sector,
              sh.period,
              n + 1,
              r.name,
              r.enterprise,
              r.unit,
              parseFloat(r.prev) || "",
              m ? m.label : r.method,
              r.method === "carry" ? 0 : parseFloat(r.pct) || "",
              price == null ? "" : price,
              r.note,
              sh.specialist || "",
            ]);
          });
      });

    const fname = "UUY_orluulga_" + state.sector + "_" + state.period + ".xlsx";
    if (window.XLSX) {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [
        { wch: 6 },
        { wch: 32 },
        { wch: 22 },
        { wch: 12 },
        { wch: 14 },
        { wch: 32 },
        { wch: 12 },
        { wch: 14 },
        { wch: 28 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Тайлан");
      const wh = XLSX.utils.aoa_to_sheet(hist);
      XLSX.utils.book_append_sheet(wb, wh, "Түүх");
      XLSX.writeFile(wb, fname);
      setStatus("Excel татагдлаа: " + fname, true);
      return;
    }
    const csv =
      "\uFEFF" +
      aoa
        .map((r) => r.map((c) => '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"').join(","))
        .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fname.replace(".xlsx", ".csv");
    a.click();
    setStatus("CSV татагдлаа (Excel нээнэ).", true);
  }

  sectorEl.addEventListener("change", () => {
    persist();
    loadSheet(state.period, sectorEl.value);
    render();
  });
  periodEl.addEventListener("change", () => {
    persist();
    loadSheet(periodEl.value, state.sector);
    render();
  });
  specEl.addEventListener("change", () => {
    state.specialist = specEl.value;
    persist();
  });

  const db0 = loadAll();
  state.period = db0.lastPeriod || nowMonth();
  state.sector = db0.lastSector || "C";
  state.specialist = db0.specialist || "";
  periodEl.value = state.period;
  sectorEl.value = state.sector;
  specEl.value = state.specialist;
  loadSheet(state.period, state.sector);
  specEl.value = state.specialist;
  render();
})();
