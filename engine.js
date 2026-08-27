/**
 * ҮҮИ орлуулгын хөдөлгүүр — аргачлал 2026, 10-р бүлэг.
 * Орлуулга хоёр хэлбэр:
 *  1) алгассан үнийг орлуулах
 *  2) бүтээгдэхүүн, нэгжийг орлуулах
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PPI = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const METHODS = [
    { id: "comparable", rank: 1, name: "Харьцуулах боломжтой орлуулга", kind: "product" },
    { id: "overlap", rank: 2, name: "Давхцах үеийн арга", kind: "product" },
    { id: "targeted", rank: 3, name: "Зорилтот дунджаар орлуулах", kind: "price" },
    { id: "overall", rank: 4, name: "Ерөнхий дунджаар орлуулах", kind: "price" },
    { id: "quantity", rank: 5, name: "Тоо хэмжээний тохируулга", kind: "quality" },
    { id: "metal", rank: 5, name: "Металл агуулгын тохируулга", kind: "quality" },
    { id: "carry", rank: 6, name: "Өмнөх үеийн үнийг хадгалах", kind: "price", lastResort: true },
  ];

  function prevPeriod(period) {
    const [y, m] = period.split("-").map(Number);
    if (m === 1) return (y - 1) + "-12";
    return y + "-" + String(m - 1).padStart(2, "0");
  }

  function periodIndex(periods, p) {
    return periods.indexOf(p);
  }

  function geometricMean(values) {
    const xs = values.filter((v) => v > 0 && isFinite(v));
    if (!xs.length) return null;
    const s = xs.reduce((a, b) => a + Math.log(b), 0);
    return Math.exp(s / xs.length);
  }

  function rawValue(obs) {
    if (obs == null) return null;
    if (typeof obs === "number") return obs;
    if (typeof obs === "object" && obs.value != null) return obs.value;
    return null;
  }

  function isImputed(obs) {
    return obs && typeof obs === "object" && !!obs.imputed;
  }

  function toMnt(value, currency, fxRate) {
    if (value == null) return null;
    if (!currency || currency === "MNT") return value;
    if (fxRate == null) return null;
    return value * fxRate;
  }

  function itemObs(item, period) {
    if (!item.prices) return null;
    return item.prices[period];
  }

  function itemMnt(item, period, fx) {
    const obs = itemObs(item, period);
    const v = rawValue(obs);
    if (v == null) return null;
    const cur = (obs && obs.currency) || item.currency || "MNT";
    const rate = fx && fx[period];
    return toMnt(v, cur, rate);
  }

  function specsKey(item) {
    const s = item.specs || {};
    return [
      item.unit || "",
      s.packKg != null ? "kg:" + s.packKg : "",
      s.cuPct != null ? "cu:" + s.cuPct : "",
      s.route || "",
      s.room || "",
      s.bundle || "",
      s.grade || "",
    ].join("|");
  }

  function specsComparable(a, b) {
    if (!a || !b) return false;
    if (a.unit !== b.unit) return false;
    const sa = a.specs || {};
    const sb = b.specs || {};
    const keys = ["packKg", "cuPct", "route", "room", "bundle", "grade", "weightG"];
    for (const k of keys) {
      if (sa[k] != null && sb[k] != null && String(sa[k]) !== String(sb[k])) return false;
      if ((sa[k] != null) !== (sb[k] != null) && (k === "bundle" || k === "cuPct" || k === "packKg" || k === "weightG")) {
        return false;
      }
    }
    return true;
  }

  function groupItems(data, groupId) {
    const out = [];
    for (const sec of data.sectors) {
      for (const g of sec.groups) {
        if (g.id === groupId) return g.items;
        out.push(...g.items);
      }
    }
    return [];
  }

  function allItems(data) {
    const out = [];
    for (const sec of data.sectors) {
      for (const g of sec.groups) out.push(...g.items.map((it) => ({ item: it, group: g, sector: sec })));
    }
    return out;
  }

  function findItem(data, itemId) {
    for (const row of allItems(data)) {
      if (row.item.id === itemId) return row;
    }
    return null;
  }

  function relatives(items, period, fx, skipId) {
    const prev = prevPeriod(period);
    const rels = [];
    for (const it of items) {
      if (skipId && it.id === skipId) continue;
      const a = itemMnt(it, prev, fx);
      const b = itemMnt(it, period, fx);
      if (a && b && a > 0) rels.push(b / a);
    }
    return rels;
  }

  function frozenStreak(item, period, periods, fx) {
    const idx = periodIndex(periods, period);
    if (idx < 0) return 0;
    const cur = itemMnt(item, period, fx);
    if (cur == null) {
      // count trailing missing? not frozen
      let streak = 0;
      const lastVal = itemMnt(item, periods[idx - 1], fx);
      if (lastVal == null) return 0;
      for (let i = idx - 1; i >= 0; i--) {
        const v = itemMnt(item, periods[i], fx);
        if (v == null) break;
        if (Math.abs(v - lastVal) < 1e-6) streak++;
        else break;
      }
      return streak;
    }
    let streak = 1;
    for (let i = idx - 1; i >= 0; i--) {
      const v = itemMnt(item, periods[i], fx);
      if (v == null) break;
      if (Math.abs(v - cur) < 1e-9) streak++;
      else break;
    }
    return streak;
  }

  function detectIssues(item, group, sector, period, periods, fx) {
    const issues = [];
    const p = itemMnt(item, period, fx);
    const prev = itemMnt(item, prevPeriod(period), fx);
    const obs = itemObs(item, period);

    if (p == null) {
      issues.push({
        code: "missing",
        severity: "high",
        label: "Алгассан үнэ",
        detail: "Тайлант сард үнэ ирээгүй.",
      });
    }

    const streak = frozenStreak(item, period, periods, fx);
    if (!item.regulated && p != null && streak >= 12) {
      issues.push({
        code: "frozen_year",
        severity: "high",
        label: "Хөлдүү үнэ (12+ сар)",
        detail: streak + " сар дараалан ижил үнэ. ААНБ-аас заавал тодруулна.",
      });
    } else if (!item.regulated && streak >= (item.frozenWarnAfter || 5) && p != null) {
      issues.push({
        code: "frozen",
        severity: "medium",
        label: "Үнэ хөдөлөөгүй (" + streak + " сар)",
        detail: "Мэдээлэгчтэй холбогдож баталгаажуулна.",
      });
    }

    if (item.unitWarning) {
      issues.push({
        code: "unit",
        severity: "high",
        label: "Хэмжих нэгж",
        detail: item.unitWarning,
      });
    }

    if ((item.currency === "USD" || (obs && obs.currency === "USD")) && !(fx && fx[period])) {
      issues.push({
        code: "fx",
        severity: "high",
        label: "Ханш байхгүй",
        detail: "Гадаад валютаарх үнийг төгрөгт хөрвүүлэх ханш дутуу.",
      });
    }

    if (item.qualityFlag) {
      issues.push({
        code: "quality",
        severity: "high",
        label: "Чанар / багц өөрчлөгдсөн",
        detail: item.qualityFlag,
      });
    }

    if (item.packChange) {
      issues.push({
        code: "pack",
        severity: "medium",
        label: "Багцын хэмжээ өөрчлөгдсөн",
        detail: item.packChange,
      });
    }

    if (isImputed(obs)) {
      issues.push({
        code: "imputed",
        severity: "low",
        label: "Орлуулсан үнэ",
        detail: (obs.methodName || obs.method) + (obs.note ? " — " + obs.note : ""),
      });
    }

    if (p != null && prev != null && prev > 0) {
      const rel = p / prev;
      if (rel > 1.5 || rel < 0.67) {
        issues.push({
          code: "outlier",
          severity: "medium",
          label: "Хэт хазайлт",
          detail: "Өмнөх сараас " + ((rel - 1) * 100).toFixed(1) + "%",
        });
      }
    }

    return issues;
  }

  function recommend(item, group, sector, period, periods, fx) {
    const issues = detectIssues(item, group, sector, period, periods, fx);
    const missing = issues.some((i) => i.code === "missing");
    const prev = prevPeriod(period);
    const prevP = itemMnt(item, prev, fx);
    const peers = (group.items || []).filter((x) => x.id !== item.id);

    const options = [];

    if (item.replacementOf || item.replacedBy) {
      const otherId = item.replacementOf || item.replacedBy;
      const other = peers.find((x) => x.id === otherId) || (group.items || []).find((x) => x.id === otherId);
      if (other && specsComparable(item, other)) {
        const newP = itemMnt(item, period, fx);
        const oldP = itemMnt(other, prev, fx);
        if (newP != null && oldP != null) {
          options.push({
            method: "comparable",
            relative: newP / oldP,
            value: newP,
            note: "Шинэ нэр төрлийг хуучинтай шууд харьцуулна.",
            otherId: other.id,
          });
        }
      }
    }

    if (item.overlapWith && item.overlapPeriod) {
      const other = (group.items || []).find((x) => x.id === item.overlapWith);
      if (other) {
        const oldO = itemMnt(other, item.overlapPeriod, fx);
        const newO = itemMnt(item, item.overlapPeriod, fx);
        const newNow = itemMnt(item, period, fx);
        const old0 = itemMnt(other, periods[0], fx) || itemMnt(other, prev, fx);
        if (oldO && newO && newNow) {
          const qualityRatio = newO / oldO;
          options.push({
            method: "overlap",
            qualityRatio,
            relative: newNow / newO,
            value: newNow,
            note: "Давхцах үеийн үнийн харьцаа чанарын зөрүү = " + qualityRatio.toFixed(3),
            otherId: other.id,
          });
        }
      }
    }

    if (item.packChange && item.specs && item.specs.packKg && item.specs.prevPackKg) {
      const newP = itemMnt(item, period, fx);
      const oldP = prevP;
      if (newP != null && oldP != null) {
        const adj = newP * (item.specs.prevPackKg / item.specs.packKg);
        options.push({
          method: "quantity",
          value: adj,
          relative: adj / oldP,
          note:
            "P* = " +
            newP.toLocaleString("mn-MN") +
            " × (" +
            item.specs.prevPackKg +
            "/" +
            item.specs.packKg +
            ")",
        });
      }
    }

    if (item.specs && item.specs.cuPct != null && prevP != null) {
      const nowP = itemMnt(item, period, fx);
      const prevCu = item.specs.prevCuPct || item.specs.cuPct;
      if (nowP != null && item.specs.cuPct !== prevCu) {
        const unitPrev = prevP / (prevCu * 10); // kg metal per tonne ≈ pct*10
        const unitNow = nowP / (item.specs.cuPct * 10);
        options.push({
          method: "metal",
          relative: unitNow / unitPrev,
          value: nowP,
          note: "Тонн үнийг шууд биш, зэсийн кг үнээр харьцуулна.",
        });
      }
    }

    const targetedRels = relatives(peers, period, fx);
    const targeted = geometricMean(targetedRels);
    if (missing && prevP != null && targeted != null) {
      options.push({
        method: "targeted",
        relative: targeted,
        value: prevP * targeted,
        n: targetedRels.length,
        note: "Ижил бүлгийн " + targetedRels.length + " ажиглалтын геометрийн дундаж.",
      });
    }

    const sectorItems = [];
    for (const g of sector.groups) sectorItems.push(...g.items);
    const overallRels = relatives(sectorItems, period, fx, item.id);
    const overall = geometricMean(overallRels);
    if (missing && prevP != null && overall != null) {
      options.push({
        method: "overall",
        relative: overall,
        value: prevP * overall,
        n: overallRels.length,
        note: "Салбарын үлдсэн ажиглалтын геометрийн дундаж.",
      });
    }

    if (missing && prevP != null) {
      options.push({
        method: "carry",
        relative: 1,
        value: prevP,
        note: "Зөвхөн 1 сарын түр сааталд. Үндсэн арга биш.",
        lastResort: true,
      });
    }

    options.sort((a, b) => {
      const ra = METHODS.find((m) => m.id === a.method)?.rank || 99;
      const rb = METHODS.find((m) => m.id === b.method)?.rank || 99;
      return ra - rb;
    });

    const preferred = options.find((o) => !o.lastResort) || options[0] || null;
    return { issues, options, preferred, prevPrice: prevP };
  }

  function applyReplacement(item, period, choice, specialist) {
    if (!choice) return item;
    const prices = Object.assign({}, item.prices);
    prices[period] = {
      value: roundMoney(choice.value),
      currency: "MNT",
      imputed: true,
      method: choice.method,
      methodName: (METHODS.find((m) => m.id === choice.method) || {}).name,
      relative: choice.relative,
      note: choice.note,
      specialist: specialist || "",
      at: new Date().toISOString(),
    };
    return Object.assign({}, item, { prices });
  }

  function roundMoney(x) {
    if (x == null || !isFinite(x)) return x;
    return Math.round(x * 100) / 100;
  }

  function jevonsGroup(group, period, fx) {
    const prev = prevPeriod(period);
    const rels = [];
    for (const it of group.items) {
      const a = itemMnt(it, prev, fx);
      const b = itemMnt(it, period, fx);
      if (a && b && a > 0) rels.push(b / a);
    }
    const gm = geometricMean(rels);
    return { index: gm == null ? null : gm * 100, n: rels.length };
  }

  function laspeyresFromChildren(children) {
    let sw = 0;
    let s = 0;
    for (const c of children) {
      if (c.index == null || c.weight == null) continue;
      s += c.weight * c.index;
      sw += c.weight;
    }
    if (sw === 0) return null;
    return s / sw;
  }

  function computeTree(data, period) {
    const fx = data.fx || {};
    const sectors = data.sectors.map((sec) => {
      const groups = sec.groups.map((g) => {
        const j = jevonsGroup(g, period, fx);
        return {
          id: g.id,
          name: g.name,
          weight: g.weight,
          index: j.index,
          n: j.n,
        };
      });
      return {
        code: sec.code,
        name: sec.name,
        weight: sec.weight,
        index: laspeyresFromChildren(groups),
        groups,
      };
    });
    const overall = laspeyresFromChildren(sectors);
    return { period, overall, sectors };
  }

  function scanQueue(data, period) {
    const periods = data.periods;
    const fx = data.fx || {};
    const queue = [];
    for (const sec of data.sectors) {
      for (const g of sec.groups) {
        const recShare = imputationShare(g, period);
        for (const it of g.items) {
          const rec = recommend(it, g, sec, period, periods, fx);
          const blocking = rec.issues.filter((i) => i.severity === "high" && i.code !== "imputed");
          const needsWork =
            rec.issues.some((i) => i.code === "missing") ||
            rec.issues.some((i) => i.severity === "high") ||
            rec.issues.some((i) => i.code === "frozen" || i.code === "frozen_year" || i.code === "outlier" || i.code === "pack");
          if (!needsWork) continue;
          queue.push({
            item: it,
            group: g,
            sector: sec,
            issues: rec.issues,
            preferred: rec.preferred,
            options: rec.options,
            prevPrice: rec.prevPrice,
            imputationShare: recShare,
          });
        }
        if (recShare > 0.2) {
          /* flagged on items already */
        }
      }
    }
    const rank = { high: 0, medium: 1, low: 2 };
    queue.sort((a, b) => {
      const sa = Math.min(...a.issues.map((i) => rank[i.severity] ?? 9));
      const sb = Math.min(...b.issues.map((i) => rank[i.severity] ?? 9));
      return sa - sb;
    });
    return queue;
  }

  function imputationShare(group, period) {
    const n = group.items.length;
    if (!n) return 0;
    let k = 0;
    for (const it of group.items) {
      if (isImputed(itemObs(it, period))) k++;
    }
    return k / n;
  }

  function mom(indexNow, indexPrev) {
    if (indexNow == null || indexPrev == null || indexPrev === 0) return null;
    return (indexNow / indexPrev - 1) * 100;
  }

  return {
    METHODS,
    prevPeriod,
    geometricMean,
    itemMnt,
    rawValue,
    isImputed,
    specsComparable,
    detectIssues,
    recommend,
    applyReplacement,
    jevonsGroup,
    laspeyresFromChildren,
    computeTree,
    scanQueue,
    imputationShare,
    allItems,
    findItem,
    mom,
    toMnt,
  };
});
