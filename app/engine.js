/*
 * Cresko · motor de reglas
 *
 * Lógica pura, sin DOM ni red. Aparta un porcentaje de cada compra,
 * agrupa los apartados del día en un solo cargo y convierte ese cargo en
 * unidades del fondo. Es la misma lógica que correrá en el backend cuando
 * conectemos una tarjeta real, por eso no depende del navegador.
 */
(function (root) {
  "use strict";

  var DEFAULT_RULES = {
    pct: 3,          // % de cada compra que se aparta
    cap: 300,        // tope mensual en MXN
    minPurchase: 20, // compras menores no generan apartado
    paused: false
  };

  function round2(n) { return Math.round(n * 100) / 100; }

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  // Fechas en hora local: el corte del día es la medianoche del usuario, no UTC.
  function dayKey(date) { var d = new Date(date); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function monthKey(date) { return dayKey(date).slice(0, 7); }

  /** Suma de apartados (pendientes y cobrados) del mes de `date`. */
  function monthTotal(state, date) {
    var m = monthKey(date);
    return round2(state.txs.reduce(function (s, t) {
      return t.status !== "omitido" && monthKey(t.date) === m ? s + t.fee : s;
    }, 0));
  }

  /** Apartado de una compra: su porcentaje, redondeado a centavos. */
  function feeFor(rules, amount) { return round2(amount * rules.pct / 100); }

  /**
   * Decide el apartado de una compra.
   * Devuelve { fee, status: "pendiente" | "omitido", reason }.
   */
  function evaluatePurchase(state, tx) {
    var r = state.rules;
    if (!state.card || state.card.status !== "activa") return { fee: 0, status: "omitido", reason: "Tarjeta no vinculada" };
    if (r.paused) return { fee: 0, status: "omitido", reason: "Apartados en pausa" };
    if (tx.amount < r.minPurchase) return { fee: 0, status: "omitido", reason: "Menor a $" + r.minPurchase };
    var room = round2(r.cap - monthTotal(state, tx.date));
    if (room <= 0) return { fee: 0, status: "omitido", reason: "Tope mensual alcanzado" };
    var fee = feeFor(r, tx.amount);
    if (room < fee) return { fee: room, status: "pendiente", reason: "Ajustado al tope mensual" };
    return { fee: fee, status: "pendiente", reason: "" };
  }

  /** Registra una compra en el estado y devuelve el movimiento creado. */
  function applyPurchase(state, tx) {
    var d = evaluatePurchase(state, tx);
    var rec = {
      id: tx.id, date: tx.date, merchant: tx.merchant, category: tx.category || "otros",
      amount: round2(tx.amount), fee: d.fee, status: d.status, reason: d.reason, chargeId: null
    };
    state.txs.unshift(rec);
    return rec;
  }

  function pending(state) { return state.txs.filter(function (t) { return t.status === "pendiente"; }); }
  function pendingTotal(state) { return round2(pending(state).reduce(function (s, t) { return s + t.fee; }, 0)); }

  /**
   * Cierra el lote: un solo cargo por la suma de pendientes, invertido a `nav`.
   * `chargeResult` viene del proveedor de pagos ({ id, status }).
   */
  function settle(state, chargeResult, nav, date) {
    var list = pending(state);
    var amount = round2(list.reduce(function (s, t) { return s + t.fee; }, 0));
    if (!amount) return null;
    var ok = chargeResult.status === "aprobado";
    var charge = {
      id: chargeResult.id, date: date, amount: amount, txIds: list.map(function (t) { return t.id; }),
      status: ok ? "invertido" : "rechazado", nav: nav, units: ok ? amount / nav : 0
    };
    list.forEach(function (t) {
      t.chargeId = charge.id;
      if (ok) t.status = "cobrado"; else { t.status = "omitido"; t.reason = "Cargo rechazado por el banco"; }
    });
    if (ok) { state.units += charge.units; state.contributed = round2(state.contributed + amount); }
    state.charges.unshift(charge);
    return charge;
  }

  function portfolioValue(state, nav) { return round2(state.units * nav); }

  /** Aportación mensual esperada para un gasto mensual con débito, respetando el tope. */
  function monthlyContribution(rules, monthlySpend) {
    return Math.min(round2(monthlySpend * rules.pct / 100), rules.cap);
  }

  /** Meses para llegar a `goal` desde `current`, aportando `monthly` con tasa anual `rate`. */
  function monthsToGoal(current, monthly, goal, rate) {
    if (current >= goal) return 0;
    if (monthly <= 0) return Infinity;
    var i = rate / 12, v = current, n = 0;
    while (v < goal && n < 1200) { v = v * (1 + i) + monthly; n++; }
    return n;
  }

  /** Generador pseudoaleatorio con semilla, para que la demo sea reproducible. */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Un día hábil del fondo simulado: ~8% anual esperado, ~12% de volatilidad. */
  function nextNav(nav, rand) {
    var z = Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
    return Math.round(nav * (1 + 0.08 / 365 + 0.12 * z / Math.sqrt(365)) * 10000) / 10000;
  }

  var api = {
    DEFAULT_RULES: DEFAULT_RULES, round2: round2, dayKey: dayKey, monthKey: monthKey,
    monthTotal: monthTotal, feeFor: feeFor, evaluatePurchase: evaluatePurchase, applyPurchase: applyPurchase,
    pending: pending, pendingTotal: pendingTotal, settle: settle, portfolioValue: portfolioValue,
    monthlyContribution: monthlyContribution, monthsToGoal: monthsToGoal, rng: rng, nextNav: nextNav
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CreskoEngine = api;
})(this);
