/*
 * MI+ · motor del monedero
 *
 * Lógica pura, sin DOM ni red. Es la misma en el navegador (demo) y en el
 * servidor (server/server.js). Todos los montos van en CENTAVOS enteros para
 * que el saldo nunca tenga errores de redondeo.
 *
 * Dos saldos distintos, a propósito:
 *   wallet  → saldo de pago. Lo guarda el emisor regulado (banco o IFPE).
 *   purse   → monedero de transporte. Vive en el chip Calypso de la tarjeta MI
 *             y lo controla Semovi. Aquí solo llevamos un espejo y las cargas
 *             pendientes, que el chip recibe la siguiente vez que pasa por un
 *             torniquete (lista de acciones del sistema de recaudo).
 * "Un solo saldo" para el usuario = recarga automática del monedero desde el wallet.
 */
(function (root) {
  "use strict";

  /*
   * Límites de cuentas de bajo riesgo (Banxico, Circular 14/2011; verificar la
   * circular vigente antes de producción). Valores en UDIS.
   * Nivel 1: abonos de hasta 750 UDIS al mes y saldo de hasta 1,000 UDIS.
   * Nivel 2: abonos de hasta 3,000 UDIS al mes, más 6,000 UDIS si vienen de
   * subsidios gubernamentales.
   * Decisión de producto (no regulatoria): Nivel 1 = tarjeta digital; Nivel 2 = tarjeta física.
   */
  var LEVELS = {
    N1: { id: "N1", label: "Nivel 1", monthlyDepositsUdis: 750, balanceCapUdis: 1000, subsidyUdis: 0, physicalCard: false },
    N2: { id: "N2", label: "Nivel 2", monthlyDepositsUdis: 3000, balanceCapUdis: null, subsidyUdis: 6000, physicalCard: true }
  };

  var DEFAULT_CONFIG = {
    udi: 8.6,                                   // MXN por UDI. Actualizar a diario con el valor que publica Banxico.
    fares: { metro: 500, metrobus: 600 },       // Tarifas en centavos. Verificar las vigentes de STC y Metrobús.
    cashback: { pct: 1, monthlyCap: 5000 },     // [__%] del pitch: lo financian comercios aliados. Tope mensual en centavos.
    autoReload: { enabled: true, threshold: 2000, amount: 5000 } // Si el transporte baja de $20, carga $50.
  };

  var SOURCES = { efectivo: "Efectivo en tienda", spei: "Transferencia SPEI", apoyo: "Apoyo de gobierno" };

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function monthKey(date) { var d = new Date(date); return d.getFullYear() + "-" + pad(d.getMonth() + 1); }
  function udisToCents(udis, cfg) { return Math.round(udis * cfg.udi * 100); }
  function isCents(n) { return Number.isInteger(n) && n > 0; }
  var seq = 0;
  function uid(p) { seq += 1; return p + "_" + Date.now().toString(36) + seq.toString(36); }

  function createState(user, cfg) {
    cfg = cfg || DEFAULT_CONFIG;
    return {
      user: { id: user.id || uid("usr"), name: user.name, curp: user.curp, level: user.level || "N1" },
      wallet: 0,
      purse: { mirror: 0, loads: [] },
      card: null,
      mi: null,
      autoReload: Object.assign({}, cfg.autoReload),
      movements: []
    };
  }

  function record(state, mov) {
    var m = Object.assign({ id: uid("mov") }, mov);
    state.movements.unshift(m);
    return m;
  }

  /** Límites del nivel del usuario, ya convertidos a centavos. */
  function limits(state, cfg) {
    var L = LEVELS[state.user.level];
    return {
      level: L,
      monthlyDeposits: udisToCents(L.monthlyDepositsUdis, cfg),
      balanceCap: L.balanceCapUdis == null ? null : udisToCents(L.balanceCapUdis, cfg),
      subsidy: udisToCents(L.subsidyUdis, cfg)
    };
  }

  /** Abonos del mes de `date`. `subsidy` separa los apoyos de gobierno del resto. */
  function monthDeposits(state, date, subsidy) {
    var m = monthKey(date);
    return state.movements.reduce(function (s, x) {
      return x.kind === "deposito" && monthKey(x.date) === m && (x.source === "apoyo") === !!subsidy ? s + x.amount : s;
    }, 0);
  }

  /** ¿Se puede abonar? Rechaza completo (como la caja de la tienda), nunca parcial. */
  function evaluateDeposit(state, dep, cfg) {
    if (!isCents(dep.amount)) return { ok: false, reason: "Monto inválido" };
    if (!SOURCES[dep.source]) return { ok: false, reason: "Origen desconocido" };
    var lim = limits(state, cfg);
    var subsidy = dep.source === "apoyo";
    var room;
    if (subsidy) {
      if (!lim.subsidy) return { ok: false, reason: "Tu nivel no recibe apoyos; sube a Nivel 2" };
      room = lim.subsidy - monthDeposits(state, dep.date, true);
    } else {
      room = lim.monthlyDeposits - monthDeposits(state, dep.date, false);
    }
    if (dep.amount > room) return { ok: false, reason: "Rebasa el límite mensual de depósitos de tu nivel", room: Math.max(0, room) };
    if (lim.balanceCap != null && state.wallet + dep.amount > lim.balanceCap) {
      return { ok: false, reason: "Rebasa el saldo máximo de tu nivel", room: Math.max(0, lim.balanceCap - state.wallet) };
    }
    return { ok: true };
  }

  function applyDeposit(state, dep, cfg) {
    var d = evaluateDeposit(state, dep, cfg);
    if (!d.ok) return Object.assign({ movement: null }, d);
    state.wallet += dep.amount;
    var mov = record(state, { kind: "deposito", date: dep.date, amount: dep.amount, source: dep.source, detail: SOURCES[dep.source], ref: dep.ref || null });
    return { ok: true, movement: mov, reload: checkAutoReload(state, cfg, dep.date) };
  }

  /**
   * Decisión de autorización para una compra con tarjeta (webhook del procesador).
   * Idempotente: si el procesador reintenta el mismo `authId`, devuelve la misma decisión.
   */
  function authorizePurchase(state, p) {
    var prev = state.movements.filter(function (x) { return x.authId && x.authId === p.authId; })[0];
    if (prev) return { approved: prev.kind === "compra", reason: prev.reason || "", duplicate: true };
    if (!isCents(p.amount)) return { approved: false, reason: "Monto inválido" };
    if (!state.card) return { approved: false, reason: "Sin tarjeta emitida" };
    if (state.card.status !== "activa") return { approved: false, reason: "Tarjeta bloqueada" };
    if (p.amount > state.wallet) return { approved: false, reason: "Saldo insuficiente" };
    return { approved: true, reason: "" };
  }

  function monthCashback(state, date) {
    var m = monthKey(date);
    return state.purse.loads.reduce(function (s, l) { return l.origin === "cashback" && monthKey(l.date) === m ? s + l.amount : s; }, 0);
  }

  /** Saldo de transporte de regalo por una compra, respetando el tope mensual. */
  function cashbackFor(state, amount, date, cfg) {
    if (!state.mi) return 0;
    var room = cfg.cashback.monthlyCap - monthCashback(state, date);
    return Math.max(0, Math.min(Math.floor(amount * cfg.cashback.pct / 100), room));
  }

  function applyPurchase(state, p, cfg) {
    var d = authorizePurchase(state, p);
    if (d.duplicate) return d;
    if (!d.approved) {
      record(state, { kind: "rechazo", date: p.date, amount: 0, detail: p.merchant, reason: d.reason, authId: p.authId, attempted: p.amount });
      return d;
    }
    state.wallet -= p.amount;
    record(state, { kind: "compra", date: p.date, amount: -p.amount, detail: p.merchant, authId: p.authId });
    var cb = cashbackFor(state, p.amount, p.date, cfg);
    var load = cb ? queuePurseLoad(state, cb, "cashback", p.date) : null;
    return { approved: true, reason: "", cashback: load, reload: checkAutoReload(state, cfg, p.date) };
  }

  function pendingLoads(state) { return state.purse.loads.filter(function (l) { return l.status === "pendiente"; }); }
  function pendingTotal(state) { return pendingLoads(state).reduce(function (s, l) { return s + l.amount; }, 0); }

  /**
   * Manda una carga al monedero de transporte. "recarga" sale del wallet;
   * "cashback" lo pagan los comercios aliados y no toca el wallet.
   */
  function queuePurseLoad(state, amount, origin, date) {
    if (!state.mi) return null;
    if (origin === "recarga") {
      if (amount > state.wallet) return null;
      state.wallet -= amount;
    }
    var load = { id: uid("load"), date: date, amount: amount, origin: origin, status: "pendiente" };
    state.purse.loads.unshift(load);
    record(state, { kind: origin === "cashback" ? "cashback" : "carga_transporte", date: date, amount: origin === "recarga" ? -amount : 0, purse: amount, detail: origin === "cashback" ? "Viajes de regalo" : "Recarga de transporte", loadId: load.id });
    return load;
  }

  /** Si el transporte (espejo + pendientes) baja del umbral, recarga desde el wallet. */
  function checkAutoReload(state, cfg, date) {
    var ar = state.autoReload;
    if (!state.mi || !ar.enabled) return null;
    if (state.purse.mirror + pendingTotal(state) >= ar.threshold) return null;
    return queuePurseLoad(state, ar.amount, "recarga", date);
  }

  /**
   * Paso por torniquete. El validador primero escribe en el chip las cargas
   * pendientes y luego cobra la tarifa del monedero de transporte.
   */
  function applyTap(state, tap, cfg) {
    if (!state.mi) return { ok: false, reason: "Tarjeta MI no vinculada" };
    var fare = cfg.fares[tap.line];
    if (!fare) return { ok: false, reason: "Línea desconocida" };
    var written = pendingLoads(state);
    written.forEach(function (l) { l.status = "aplicada"; l.appliedAt = tap.date; state.purse.mirror += l.amount; });
    if (state.purse.mirror < fare) {
      record(state, { kind: "rechazo", date: tap.date, amount: 0, detail: "Torniquete " + tap.line, reason: "Saldo de transporte insuficiente" });
      return { ok: false, reason: "Saldo de transporte insuficiente", written: written, reload: checkAutoReload(state, cfg, tap.date) };
    }
    state.purse.mirror -= fare;
    record(state, { kind: "viaje", date: tap.date, amount: 0, purse: -fare, detail: tap.line === "metro" ? "Metro" : "Metrobús", station: tap.station || "" });
    return { ok: true, fare: fare, written: written, reload: checkAutoReload(state, cfg, tap.date) };
  }

  /** Lo que ve el usuario en la pantalla de inicio. */
  function summary(state, cfg, date) {
    var lim = limits(state, cfg);
    return {
      wallet: state.wallet,
      purse: state.purse.mirror,
      pending: pendingTotal(state),
      transit: state.purse.mirror + pendingTotal(state),
      depositsRoom: Math.max(0, lim.monthlyDeposits - monthDeposits(state, date, false)),
      balanceRoom: lim.balanceCap == null ? null : Math.max(0, lim.balanceCap - state.wallet),
      cashbackMonth: monthCashback(state, date),
      level: lim.level
    };
  }

  function setLevel(state, level) {
    if (!LEVELS[level]) throw new Error("Nivel desconocido: " + level);
    state.user.level = level;
  }

  var api = {
    LEVELS: LEVELS, DEFAULT_CONFIG: DEFAULT_CONFIG, SOURCES: SOURCES, monthKey: monthKey, udisToCents: udisToCents, uid: uid,
    createState: createState, limits: limits, monthDeposits: monthDeposits, evaluateDeposit: evaluateDeposit, applyDeposit: applyDeposit,
    authorizePurchase: authorizePurchase, applyPurchase: applyPurchase, cashbackFor: cashbackFor, queuePurseLoad: queuePurseLoad,
    pendingLoads: pendingLoads, pendingTotal: pendingTotal, checkAutoReload: checkAutoReload, applyTap: applyTap, summary: summary, setLevel: setLevel
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MiPlusEngine = api;
})(this);
