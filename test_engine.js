const PPI = require("./engine.js");
const DATA = require("./data.js");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exitCode = 1;
  } else console.log("ok ", msg);
}

const gm = PPI.geometricMean([1.05, 1.04, 1.06]);
assert(Math.abs(gm - 1.04997) < 0.0001, "Жевонс 1.05×1.04×1.06 ≈ 1.050");

const data = JSON.parse(JSON.stringify(DATA));
const period = "2026-03";
const cement = data.sectors[1].groups[0];
const d = cement.items.find((x) => x.id === "c-cem-d");
const rec = PPI.recommend(d, cement, data.sectors[1], period, data.periods, data.fx);
assert(rec.issues.some((i) => i.code === "missing"), "цемент D алгассан");
assert(rec.preferred && rec.preferred.method === "targeted", "цемент D-д зорилтот дундаж");
assert(Math.abs(rec.preferred.value - 115500) < 50, "орлуулсан үнэ ≈ 115 500 (аргачлалын жишээ 3)");

const cu = data.sectors[0].groups[0];
const erd = cu.items.find((x) => x.id === "b-cu-erdenet");
const recB = PPI.recommend(erd, cu, data.sectors[0], period, data.periods, data.fx);
assert(recB.issues.some((i) => i.code === "missing"), "Эрдэнэт баяжмал алгассан");

const q = PPI.scanQueue(data, period);
const sectors = new Set(q.map((r) => r.sector.code));
["B", "C", "H", "I", "J"].forEach((s) => {
  assert(sectors.has(s), "ажил " + s + " салбарт гарсан");
});

const tree = PPI.computeTree(data, period);
assert(tree.overall > 90 && tree.overall < 130, "ерөнхий индекс боломжийн мужид");
assert(tree.sectors.length === 7, "7 салбар");

const applied = PPI.applyReplacement(d, period, rec.preferred, "тест");
assert(PPI.isImputed(applied.prices[period]), "орлуулга баримттай");

console.log("queue", q.length, "overall", tree.overall && tree.overall.toFixed(2));
if (!process.exitCode) console.log("ALL PASSED");
