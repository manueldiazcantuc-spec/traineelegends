// Pruebas del motor de reglas: node tests/engine.test.js
const assert = require("node:assert/strict");
const E = require("../app/engine.js");

function state(rules) {
  return { rules: Object.assign({ pct: 5, cap: 12, minPurchase: 20, paused: false }, rules), card: { status: "activa" }, txs: [], charges: [], units: 0, contributed: 0 };
}
const D = "2026-10-14T15:00:00";
const buy = (s, amount, date) => E.applyPurchase(s, { id: Math.random(), date: date || D, merchant: "x", amount });

// Compra menor al mínimo no aparta
let s = state();
assert.equal(buy(s, 10).status, "omitido");

// Porcentaje de cada compra y ajuste al tope
assert.equal(buy(s, 100).fee, 5);
assert.equal(buy(s, 87.5).fee, 4.38);
const adj = buy(s, 100);
assert.equal(adj.fee, 2.62);
assert.equal(adj.reason, "Ajustado al tope mensual");
assert.equal(buy(s, 100).reason, "Tope mensual alcanzado");

// El tope se reinicia el mes siguiente
assert.equal(buy(s, 100, "2026-11-01T10:00:00").fee, 5);

// Pausa y tarjeta desvinculada
s = state({ paused: true });
assert.equal(buy(s, 100).reason, "Inversión en pausa");
s = state(); s.card.status = "desvinculada";
assert.equal(buy(s, 100).status, "omitido");

// Cargo agrupado: un cargo por todos los pendientes, convertido a unidades
s = state({ cap: 1000 });
buy(s, 100); buy(s, 200); buy(s, 300);
const ch = E.settle(s, { id: "c1", status: "aprobado" }, 50, D);
assert.equal(ch.amount, 30);
assert.equal(s.units, 0.6);
assert.equal(s.contributed, 30);
assert.equal(E.pendingTotal(s), 0);
assert.ok(s.txs.every((t) => t.status === "cobrado" && t.chargeId === "c1"));

// Cargo rechazado: no se invierte
s = state({ cap: 1000 });
buy(s, 100);
E.settle(s, { id: "c2", status: "rechazado" }, 50, D);
assert.equal(s.units, 0);
assert.equal(s.txs[0].status, "omitido");

// Proyección
assert.equal(E.monthlyContribution({ pct: 3, cap: 300 }, 6000), 180);
assert.equal(E.monthlyContribution({ pct: 10, cap: 300 }, 6000), 300);
assert.equal(E.monthsToGoal(0, 100, 1000, 0), 10);

console.log("motor: todas las pruebas pasan");
