/*
 * Cresko · MVP de la app (propuesta 3: vincular la tarjeta de débito existente)
 *
 * Pantallas: bienvenida → meta → perfil de inversión → porcentaje → vincular tarjeta → confirmar → app.
 * Cresko es wealthtech: el dinero se invierte en una casa de bolsa aliada (partner.js).
 * Cada compra genera su propio cargo a la tarjeta y su propia orden de inversión.
 * El estado vive en localStorage para que la demo sobreviva a una recarga.
 */
(function () {
  "use strict";

  var E = window.CreskoEngine;
  var KEY = "cresko.mvp.v1";
  // Gasto mensual con débito. Promedio estimado en México: ~$5,000 en ~12 compras de ~$430
  // (Banxico 2025: 11,261 M de pagos con tarjeta, 72% débito, $6.44 billones; ENIF 2024).
  var SPENDS = [3000, 5000, 8000, 12000];
  var PCTS = [1, 2, 3, 5, 10];
  var PORTS = window.CreskoPartner.PORTFOLIOS;
  var MIX_COLORS = { "Deuda gubernamental": "#9AA8FF", "Acciones México": "#3F58FD", "Acciones globales": "#3525F7", "Acciones indexadas": "#3F58FD" };
  function rate(profile) { return PORTS[profile || state.profile].mu; }

  var GOALS = {
    viaje: { label: "Viaje", name: "Viaje a Oaxaca", target: 15000, hint: "Vacaciones, boletos" },
    enganche: { label: "Enganche", name: "Enganche de depa", target: 80000, hint: "Casa o auto" },
    emergencia: { label: "Emergencias", name: "Fondo de emergencia", target: 20000, hint: "3 meses de gastos" },
    retiro: { label: "Retiro", name: "Mi retiro", target: 250000, hint: "Largo plazo" }
  };

  var ICONS = {
    viaje: '<path d="M2 16l20-8-6 12-3-5-5 3z"/>',
    enganche: '<path d="M3 11l9-7 9 7v9H3z"/><path d="M9 20v-6h6v6"/>',
    emergencia: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    retiro: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    inicio: '<path d="M3 11l9-7 9 7v9H3z"/>',
    movimientos: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    inversion: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.5 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1c.6.5 1.3.9 2 1.2L10 21h4l.5-2.6c.7-.3 1.4-.7 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    check: '<path d="M5 12l4 4 10-10"/>'
  };
  function icon(name) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>"; }

  var fmt2 = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var fmt0 = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
  var fDay = new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short" });
  var fFull = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  var fTime = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" });
  function m2(n) { return fmt2.format(n); }
  function m0(n) { return fmt0.format(n); }
  function pc(n) { return n + "%"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function months(n) {
    if (!isFinite(n)) return "sin fecha";
    if (n < 12) return n + (n === 1 ? " mes" : " meses");
    var y = Math.floor(n / 12), r = n % 12;
    return y + (y === 1 ? " año" : " años") + (r ? " " + r + (r === 1 ? " mes" : " meses") : "");
  }

  /* ---------- Estado ---------- */

  function startClock() { var d = new Date(); d.setHours(10, 5, 0, 0); return d.toISOString(); }
  function fresh() {
    var c = startClock();
    return {
      v: 4, stage: "welcome", tab: "inicio", userName: "", spend: 5000, profile: "moderado", contract: null,
      draft: { goalKind: "viaje", goalName: GOALS.viaje.name, target: GOALS.viaje.target, pct: 3, spend: 5000, cap: 300, minPurchase: 20, q1: "espero", q2: "1a3", profile: "moderado", bank: "BBVA", last4: "", holder: "", readConsent: false, feeConsent: false },
      linkStep: -1, goal: null, rules: Object.assign({}, E.DEFAULT_RULES), card: null, consent: null,
      txs: [], charges: [], units: 0, contributed: 0, nav: 100, navHistory: [{ d: c, nav: 100 }],
      clock: c, logs: [], confirmUnlink: false, isExample: false
    };
  }
  function load() { try { var s = JSON.parse(localStorage.getItem(KEY)); return s && s.v === 4 ? s : null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  var state = load() || fresh();
  if (state.stage === "linking") state.stage = "card"; // una conexión a medias no sobrevive la recarga
  var rand = E.rng(Date.now() & 0xffffffff);
  var quiet = false;

  function log(kind, msg, data) {
    if (quiet) return;
    var extra = data ? " " + Object.keys(data).map(function (k) { return k + "=" + data[k]; }).join(" ") : "";
    state.logs.unshift({ t: state.clock, k: kind, msg: msg + extra });
    if (state.logs.length > 180) state.logs.length = 180;
  }

  var provider = new window.CreskoProvider.MockCardProvider(log);
  var partner = new window.CreskoPartner.MockInvestmentPartner(log);
  provider.onTransaction(function (tx) {
    var rec = E.applyPurchase(state, tx);
    if (rec.status !== "pendiente") { log("motor", "sin apartado: " + rec.reason.toLowerCase()); if (!quiet) toast(rec.merchant + " " + m2(rec.amount) + " · " + rec.reason); return; }
    log("motor", "apartado " + pc(state.rules.pct) + " = " + m2(rec.fee) + (rec.reason ? " (" + rec.reason.toLowerCase() + ")" : ""));
    var res = provider.charge(state.card.cardId, rec.fee, rand);
    var ch = E.settle(state, res, state.nav, tx.date);
    if (ch.status === "invertido") { partner.buy(state.contract, state.profile, ch.amount, state.nav); log("motor", "unidades acreditadas", { unidades: ch.units.toFixed(4) }); }
    else log("motor", "cargo rechazado: no se invierte; se avisa al usuario");
    if (!quiet) toast(ch.status === "invertido" ? rec.merchant + " " + m2(rec.amount) + " · +" + m2(rec.fee) + " invertido en " + state.goal.name : "Tu banco rechazó el cargo de " + m2(rec.fee) + ". No se invirtió.");
  });

  /* ---------- Reloj simulado ---------- */

  function isLive() { return state.stage === "app" && state.card && state.card.status === "activa"; }

  function buy(override) {
    provider.emitPurchase(state.clock, rand, override);
    var d = new Date(state.clock);
    var next = new Date(d.getTime() + (40 + rand() * 120) * 60000);
    var limit = new Date(d); limit.setHours(22, 30, 0, 0);
    state.clock = (next > limit ? limit : next).toISOString();
  }

  function endOfDay() {
    var d = new Date(state.clock);
    var n = new Date(d); n.setDate(n.getDate() + 1); n.setHours(8, Math.floor(rand() * 50), 0, 0);
    state.nav = E.nextNav(state.nav, rand, PORTS[state.profile].mu, PORTS[state.profile].sigma);
    state.clock = n.toISOString();
    state.navHistory.push({ d: state.clock, nav: state.nav });
    if (state.navHistory.length > 400) state.navHistory.shift();
  }

  function advanceDay() {
    // ~12 compras al mes, el promedio estimado en México
    var r = rand(), k = r < 0.65 ? 0 : r < 0.9 ? 1 : 2;
    for (var i = 0; i < k; i++) buy();
    endOfDay();
  }

  function loadExample() {
    state = fresh();
    var c = new Date(); c.setDate(c.getDate() - 42); c.setHours(9, 10, 0, 0);
    state.clock = c.toISOString();
    state.navHistory = [{ d: state.clock, nav: 100 }];
    state.userName = "Ana";
    state.goal = { kind: "viaje", name: "Viaje a Oaxaca", target: 15000 };
    state.rules = { pct: 3, cap: 300, minPurchase: 20, paused: false };
    state.spend = 5000;
    state.profile = "moderado"; state.contract = "48210042";
    state.card = { cardId: "card_demo", bank: "BBVA", last4: "4821", holder: "Ana López", status: "activa", linkedAt: state.clock };
    state.consent = { acceptedAt: state.clock, text: consentText(state.rules, state.card) };
    state.stage = "app"; state.isExample = true;
    rand = E.rng(20261014);
    quiet = true;
    for (var i = 0; i < 42; i++) advanceDay();
    quiet = false;
    rand = E.rng(Date.now() & 0xffffffff);
    log("evento", "datos de ejemplo cargados: 6 semanas de compras de Ana", { movimientos: state.txs.length, cargos: state.charges.length });
  }

  /* ---------- Derivados ---------- */

  function investedToday() {
    var k = E.dayKey(state.clock);
    return E.round2(state.charges.reduce(function (s, c) { return c.status === "invertido" && E.dayKey(c.date) === k ? s + c.amount : s; }, 0));
  }

  function value() { return E.portfolioValue(state, state.nav); }
  function expectedMonthly(rules, spend) { return E.monthlyContribution(rules, spend == null ? state.spend : spend); }
  function consentText(r, card, profile) {
    return "Acepto que Cresko cargue a mi tarjeta ···· " + card.last4 + " el " + pc(r.pct) + " de cada compra" +
      (r.minPurchase ? " de " + m0(r.minPurchase) + " o más" : "") + ", hasta " + m0(r.cap) + " al mes, con un cargo por cada compra, y lo invierta a mi nombre en el portafolio " + PORTS[profile || state.profile].name + " a través de la casa de bolsa aliada. Puedo pausar o cancelar en cualquier momento.";
  }

  /* ---------- Render ---------- */

  var $screen = document.getElementById("screen");
  var $tabs = document.getElementById("tabs");
  var toastTimer;
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function dots(n) { var s = ""; for (var i = 1; i <= 5; i++) s += '<i class="' + (i <= n ? "on" : "") + '"></i>'; return '<div class="progress-dots" aria-label="Paso ' + n + ' de 5">' + s + "</div>"; }
  function header(step, back) {
    return '<div class="head-row"><button class="icon-btn" data-act="go" data-to="' + back + '" aria-label="Atrás">' + icon("back") + '</button><div style="flex:1">' + dots(step) + "</div></div>";
  }

  var screens = {
    welcome: function () {
      return '<div class="welcome">' +
        '<img src="../assets/mascota.webp" alt="Mascota de Cresko">' +
        '<h1>Cada vez que pagas, creces.</h1>' +
        '<p>Apartamos un porcentaje de cada compra con tu débito y lo invertimos hacia tu meta.</p>' +
        '<div class="spacer"></div>' +
        '<div class="stack"><button class="btn btn-primary block" data-act="go" data-to="goal">Crear mi cuenta</button>' +
        '<button class="btn btn-line block" data-act="example">Ver con datos de ejemplo</button></div></div>';
    },

    goal: function () {
      var d = state.draft;
      var choices = Object.keys(GOALS).map(function (k) {
        return '<button class="choice" data-act="goal-kind" data-kind="' + k + '" aria-pressed="' + (d.goalKind === k) + '">' + icon(k) + "<b>" + GOALS[k].label + "</b><small>" + GOALS[k].hint + "</small></button>";
      }).join("");
      return header(1, "welcome") +
        '<div class="stack"><span class="eyebrow">Tu meta</span><h2>¿Para qué quieres ahorrar?</h2></div>' +
        '<div class="choice-grid">' + choices + "</div>" +
        '<div class="field"><label for="i-user">¿Cómo te llamas?</label><input id="i-user" data-bind="userName" autocomplete="given-name" value="' + esc(state.userName) + '" placeholder="Tu nombre"></div>' +
        '<div class="field"><label for="i-gname">Nombre de la meta</label><input id="i-gname" data-bind="draft.goalName" value="' + esc(d.goalName) + '"></div>' +
        '<div class="field"><label for="i-target">¿Cuánto necesitas?</label><input id="i-target" class="big" type="number" min="500" step="500" inputmode="numeric" data-bind="draft.target" value="' + d.target + '"></div>' +
        '<div class="spacer"></div><button class="btn btn-primary block" data-act="go" data-to="perfil" data-need="goal">Continuar</button>';
    },

    perfil: function () {
      var d = state.draft, rec = recommend(d);
      function q(field, opts) {
        return '<div class="chips" role="group">' + opts.map(function (o) {
          return '<button class="chip" style="font-family:var(--font-body);font-size:.85rem" data-act="answer" data-field="' + field + '" data-val="' + o[0] + '" aria-pressed="' + (d[field] === o[0]) + '">' + o[1] + "</button>";
        }).join("") + "</div>";
      }
      var cards = Object.keys(PORTS).map(function (k) {
        var p = PORTS[k];
        return '<button class="port" data-act="profile-pick" data-profile="' + k + '" aria-pressed="' + (d.profile === k) + '">' +
          '<div class="port-head"><b>' + p.name + "</b>" + (k === rec ? '<span class="pill good">Recomendado</span>' : '<span class="pill off">' + p.risk + "</span>") + "</div>" +
          "<small>" + p.blurb + "</small>" + mixBar(p) + "</button>";
      }).join("");
      return header(2, "goal") +
        '<div class="stack"><span class="eyebrow">Tu perfil de inversión</span><h2>¿Cómo quieres invertir?</h2><p class="muted small">Tu dinero se invierte a tu nombre en una casa de bolsa aliada, regulada por la CNBV.</p></div>' +
        '<div class="field"><span class="lbl">Si tu inversión baja 10% en un mes, ¿qué haces?</span>' + q("q1", [["vendo", "Retiro todo"], ["espero", "Espero"], ["compro", "Aporto más"]]) + "</div>" +
        '<div class="field"><span class="lbl">¿Cuándo vas a usar este dinero?</span>' + q("q2", [["menos1", "En menos de 1 año"], ["1a3", "De 1 a 3 años"], ["mas3", "En más de 3 años"]]) + "</div>" +
        '<div class="stack">' + cards + "</div>" +
        '<p class="muted small">Rendimientos y riesgos hipotéticos. Puedes cambiar de perfil cuando quieras.</p>' +
        '<button class="btn btn-primary block" data-act="go" data-to="rules">Continuar</button>';
    },

    rules: function () {
      var d = state.draft;
      var r = { pct: d.pct, cap: d.cap };
      var mo = expectedMonthly(r, d.spend);
      var n = E.monthsToGoal(0, mo, d.target, rate(d.profile));
      function chips(field, vals, fmt) {
        return '<div class="chips" role="group">' + vals.map(function (v) {
          return '<button class="chip" data-act="set" data-field="' + field + '" data-val="' + v + '" aria-pressed="' + (d[field] === v) + '">' + fmt(v) + "</button>";
        }).join("") + "</div>";
      }
      return header(3, "perfil") +
        '<div class="stack"><span class="eyebrow">Tu porcentaje</span><h2>¿Qué porcentaje apartamos de cada compra?</h2><p class="muted small">Ahorras en proporción a lo que gastas. Lo puedes ajustar cuando quieras.</p></div>' +
        '<div class="field"><span class="lbl">De cada compra</span>' + chips("pct", PCTS, pc) + '<small class="muted">Con ' + pc(d.pct) + ", una compra de $200 aparta " + m2(E.feeFor({ pct: d.pct }, 200)) + ".</small></div>" +
        '<div class="field"><span class="lbl">Tope mensual</span>' + chips("cap", [150, 300, 600, 1000], m0) + '<small class="muted">Al llegar al tope dejamos de apartar hasta el siguiente mes.</small></div>' +
        '<div class="field"><label for="i-min">No apartar en compras menores a</label><select id="i-min" data-bind="draft.minPurchase" data-num="1">' +
          [0, 20, 50, 100].map(function (v) { return '<option value="' + v + '"' + (d.minPurchase === v ? " selected" : "") + ">" + (v ? m0(v) : "Apartar en todas") + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label for="i-spend">¿Cuánto gastas al mes con tu débito?</label><select id="i-spend" data-bind="draft.spend" data-num="1">' +
          SPENDS.map(function (v) { return '<option value="' + v + '"' + (d.spend === v ? " selected" : "") + ">Unos " + m0(v) + "</option>"; }).join("") + '</select><small class="muted">En México el promedio es de unos $5,000 al mes con débito.</small></div>' +
        '<div class="projection"><small>Gastando ' + m0(d.spend) + ' al mes apartarías</small><b>' + m0(mo) + ' al mes</b>' +
          '<small>Llegarías a ' + m0(d.target) + ' en <span class="num">' + months(n) + "</span>*</small></div>" +
        '<p class="muted small">*Hipotético, con ' + Math.round(rate(d.profile) * 100) + '% anual de ' + PORTS[d.profile].name + '. Tu inversión puede subir o bajar.</p>' +
        '<button class="btn btn-primary block" data-act="go" data-to="card">Continuar</button>';
    },

    card: function () {
      var d = state.draft;
      var banks = provider.institutions().map(function (b) {
        return '<button class="bank" data-act="bank" data-bank="' + esc(b) + '" aria-pressed="' + (d.bank === b) + '">' + esc(b) + "</button>";
      }).join("");
      return header(4, "rules") +
        '<div class="stack"><span class="eyebrow">Tu tarjeta</span><h2>Vincula tu débito de siempre</h2><p class="muted small">No cambias de banco ni de tarjeta. Solo leemos tus compras para saber cuándo apartar.</p></div>' +
        '<div class="field"><span class="lbl">Banco</span><div class="bank-grid">' + banks + "</div></div>" +
        '<div class="field"><label for="i-last4">Últimos 4 dígitos de la tarjeta</label><input id="i-last4" class="big" inputmode="numeric" maxlength="4" placeholder="0000" data-bind="draft.last4" value="' + esc(d.last4) + '"></div>' +
        '<div class="field"><label for="i-holder">Nombre del titular</label><input id="i-holder" autocomplete="cc-name" data-bind="draft.holder" value="' + esc(d.holder) + '" placeholder="Como aparece en la tarjeta"></div>' +
        '<label class="check"><input type="checkbox" id="i-read" data-bind="draft.readConsent"' + (d.readConsent ? " checked" : "") + '><span>Autorizo a Cresko a leer las compras de esta tarjeta (monto, comercio y fecha). Nunca vemos tu NIP ni tu contraseña, y puedo revocarlo cuando quiera.</span></label>' +
        '<div class="spacer"></div><button class="btn btn-primary block" data-act="link" data-need="card">Conectar tarjeta</button>';
    },

    linking: function () {
      var d = state.draft;
      var labels = ["Conectando con " + d.bank, "Verificando que la tarjeta ···· " + d.last4 + " es tuya", "Leyendo tus compras recientes", "Abriendo tu contrato en la casa de bolsa aliada"];
      var rows = labels.map(function (l, i) {
        var cls = i < state.linkStep ? "done" : i === state.linkStep ? "now" : "";
        return '<div class="' + cls + '"><span class="dot">' + (cls === "done" ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3">' + ICONS.check + "</svg>" : "") + "</span>" + esc(l) + "</div>";
      }).join("");
      return '<div class="stack" style="margin-top:40px"><span class="eyebrow">Conectando</span><h2>Un momento…</h2><p class="muted small">La conexión la hace un proveedor especializado. Cresko no guarda tu contraseña bancaria.</p></div>' +
        '<div class="card steps-live">' + rows + "</div>";
    },

    confirm: function () {
      var d = state.draft;
      var r = { pct: d.pct, cap: d.cap, minPurchase: d.minPurchase };
      return header(5, "card") +
        '<div class="stack"><span class="eyebrow">Último paso</span><h2>Confirma tus reglas</h2></div>' +
        '<dl class="card summary">' +
          "<div><dt>Meta</dt><dd>" + esc(d.goalName) + " · " + m0(d.target) + "</dd></div>" +
          "<div><dt>Tarjeta</dt><dd>" + esc(d.bank) + " ···· " + esc(d.last4) + "</dd></div>" +
          "<div><dt>De cada compra</dt><dd>" + pc(d.pct) + "</dd></div>" +
          "<div><dt>Tope mensual</dt><dd>" + m0(d.cap) + "</dd></div>" +
          "<div><dt>Compras mínimas</dt><dd>" + (d.minPurchase ? m0(d.minPurchase) : "Todas") + "</dd></div>" +
          "<div><dt>Cobro</dt><dd>Un cargo por cada compra</dd></div>" +
          "<div><dt>Portafolio</dt><dd>" + PORTS[d.profile].name + "</dd></div>" +
          "<div><dt>Custodia</dt><dd>Casa de bolsa aliada" + (state.pendingContract ? " · ···· " + esc(state.pendingContract.slice(-4)) : "") + "</dd></div>" +
        "</dl>" +
        '<label class="check"><input type="checkbox" id="i-fee" data-bind="draft.feeConsent"' + (d.feeConsent ? " checked" : "") + "><span>" + esc(consentText(r, { last4: d.last4 }, d.profile)) + "</span></label>" +
        '<div class="spacer"></div><button class="btn btn-primary block" data-act="activate" data-need="confirm">Activar Cresko</button>';
    },

    inicio: function () {
      var v = value(), g = state.goal, pct = Math.min(100, v / g.target * 100);
      var n = E.monthsToGoal(v, state.rules.paused ? 0 : expectedMonthly(state.rules), g.target, rate());
      var monthUsed = E.monthTotal(state, state.clock);
      var C = 2 * Math.PI * 38;
      var ring = '<svg class="ring" viewBox="0 0 92 92" role="img" aria-label="' + pct.toFixed(0) + '% de la meta"><defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stop-color="#8D9BFF"/><stop offset="1" stop-color="#4A63FF"/></linearGradient></defs>' +
        '<circle cx="46" cy="46" r="38" fill="none" stroke="#262C78" stroke-width="9"/>' +
        '<circle cx="46" cy="46" r="38" fill="none" stroke="url(#rg)" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + (C * pct / 100).toFixed(1) + " " + C.toFixed(1) + '" transform="rotate(-90 46 46)"/>' +
        '<text x="46" y="52" text-anchor="middle">' + (pct < 10 ? pct.toFixed(1) : pct.toFixed(0)) + "%</text></svg>";
      var status = state.card.status !== "activa" ? '<span class="pill off">Sin tarjeta</span>' : state.rules.paused ? '<span class="pill warn">En pausa</span>' : '<span class="pill good">Activo</span>';
      return '<div class="hello"><div><span class="muted small">' + esc(fDay.format(new Date(state.clock))) + "</span><h2>Hola, " + esc(state.userName || "") + "</h2></div>" + status + "</div>" +
        (state.isExample ? '<span class="pill info" style="justify-self:start">Datos de ejemplo</span>' : "") +
        '<div class="goal-card"><div><small>' + esc(g.name) + '</small><div class="val">' + m2(v) + '</div><div class="sub">de ' + m0(g.target) + " · " + (isFinite(n) ? "llegas en ~" + months(n) : "en pausa") + "</div></div>" + ring + "</div>" +
        '<div class="card stack"><div class="today"><div><span class="muted small">Invertido hoy</span><br><b>' + m2(investedToday()) + '</b></div><span class="pill info">Se invierte en cada compra</span></div>' +
          '<div><div class="today small"><span class="muted">Este mes</span><span class="num">' + m0(monthUsed) + " de " + m0(state.rules.cap) + '</span></div><div style="height:6px;border-radius:6px;background:var(--line);margin-top:6px;overflow:hidden"><div style="height:100%;width:' + Math.min(100, monthUsed / state.rules.cap * 100) + '%;background:var(--accent)"></div></div></div></div>' +
        '<div class="section-title"><h3>Últimos movimientos</h3>' + (state.txs.length ? '<button class="link" data-act="tab" data-tab="movimientos">Ver todo</button>' : "") + "</div>" +
        (state.txs.length ? '<div class="tx-list">' + state.txs.slice(0, 5).map(txRow).join("") + "</div>"
          : '<div class="empty"><p>Paga con tu débito y aquí verás cada apartado.</p><p class="small">En la demo, usa <b>Simular compra</b> en el panel del piloto.</p></div>');
    },

    movimientos: function () {
      if (!state.txs.length) return '<h2>Movimientos</h2><div class="empty"><p>Aún no hay compras con tu tarjeta ···· ' + esc(state.card.last4) + ".</p></div>";
      var byDay = {}, order = [];
      state.txs.forEach(function (t) { var k = E.dayKey(t.date); if (!byDay[k]) { byDay[k] = []; order.push(k); } byDay[k].push(t); });
      var html = order.slice(0, 30).map(function (k) {
        var inv = E.round2(byDay[k].reduce(function (s, t) { return t.status === "cobrado" ? s + t.fee : s; }, 0));
        var cRow = inv && byDay[k].length > 1 ? '<div class="charge-row"><span>Invertido este día</span><b class="num">' + m2(inv) + "</b></div>" : "";
        return '<div class="day-head">' + esc(fDay.format(new Date(byDay[k][0].date))) + "</div>" + cRow + '<div class="tx-list">' + byDay[k].map(txRow).join("") + "</div>";
      }).join("");
      return "<h2>Movimientos</h2>" + html;
    },

    inversion: function () {
      var v = value(), gain = E.round2(v - state.contributed), pct = state.contributed ? gain / state.contributed * 100 : 0;
      return "<h2>Inversión</h2>" +
        (state.isExample ? '<span class="pill info" style="justify-self:start">Datos de ejemplo · rendimiento simulado</span>' : "") +
        '<div class="card stack"><span class="muted small">Valor de tu inversión</span><b style="font:700 2rem/1 var(--font-display);letter-spacing:-.02em">' + m2(v) + "</b>" +
          '<span class="pill ' + (gain >= 0 ? "good" : "warn") + '" style="justify-self:start">' + (gain >= 0 ? "+" : "") + m2(gain) + " (" + pct.toFixed(2) + "%)</span>" + spark() + "</div>" +
        '<div class="card stack"><b>Tu proyección</b><p class="muted small">Con ~' + m0(expectedMonthly(state.rules)) + ' al mes en ' + PORTS[state.profile].name + ' (' + Math.round(rate() * 100) + '% anual hipotético). Fíjate cómo se acelera.</p><div id="proj"></div></div>' +
        '<div class="kpi-row"><div class="card kpi"><small>Aportado</small><b>' + m2(state.contributed) + '</b></div><div class="card kpi"><small>Unidades</small><b>' + state.units.toFixed(4) + "</b></div>" +
          '<div class="card kpi"><small>Precio por unidad</small><b>' + m2(state.nav) + '</b></div><div class="card kpi"><small>Cargos invertidos</small><b>' + state.charges.filter(function (c) { return c.status === "invertido"; }).length + "</b></div></div>" +
        '<div class="card stack"><div class="port-head"><b>' + PORTS[state.profile].name + '</b><span class="pill off">' + PORTS[state.profile].risk + "</span></div>" + mixBar(PORTS[state.profile]) +
          '<span class="small muted">Comisión total estimada: ' + PORTS[state.profile].fee.toFixed(1) + "% anual sobre lo invertido.</span></div>" +
        '<div class="card stack"><b>Dónde está tu dinero</b><p class="muted small">A tu nombre, en tu contrato de la casa de bolsa aliada, regulada por la CNBV. Cresko no custodia tu dinero: te ayuda a invertirlo.</p><span class="small">Contrato <span class="num">···· ' + esc((state.contract || "").slice(-4)) + "</span></span></div>";
    },

    ajustes: function () {
      var r = state.rules;
      function chips(field, vals, fmt) {
        return '<div class="chips">' + vals.map(function (v) { return '<button class="chip" data-act="rule" data-field="' + field + '" data-val="' + v + '" aria-pressed="' + (r[field] === v) + '">' + fmt(v) + "</button>"; }).join("") + "</div>";
      }
      var linked = state.card.status === "activa";
      return "<h2>Ajustes</h2>" +
        '<div class="card toggle"><div><b>Apartados activos</b><br><span class="muted small">' + (r.paused ? "En pausa: tus compras no generan apartados." : "Cada compra aparta el " + pc(r.pct) + ".") + '</span></div><button class="switch" role="switch" aria-label="Apartados activos" aria-checked="' + !r.paused + '" data-act="pause"' + (linked ? "" : " disabled") + "></button></div>" +
        '<div class="card stack"><div class="field"><span class="lbl">De cada compra</span>' + chips("pct", PCTS, pc) + "</div>" +
          '<div class="field"><span class="lbl">Tope mensual</span>' + chips("cap", [150, 300, 600, 1000], m0) + "</div>" +
          '<div class="field"><label for="i-rmin">No apartar en compras menores a</label><select id="i-rmin" data-act-change="rule-min">' + [0, 20, 50, 100].map(function (v) { return '<option value="' + v + '"' + (r.minPurchase === v ? " selected" : "") + ">" + (v ? m0(v) : "Apartar en todas") + "</option>"; }).join("") + "</select></div>" +
          '<p class="muted small">Los cambios aplican desde tu siguiente compra.</p></div>' +
        '<div class="card stack"><div class="field"><span class="lbl">Perfil de inversión</span><div class="chips">' + Object.keys(PORTS).map(function (k) { return '<button class="chip" style="font-family:var(--font-body);font-size:.85rem" data-act="profile" data-profile="' + k + '" aria-pressed="' + (state.profile === k) + '">' + PORTS[k].name.replace("Cresko ", "") + "</button>"; }).join("") + '</div></div><p class="muted small">Si cambias de perfil, la casa de bolsa rebalancea tu inversión al siguiente día hábil.</p></div>' +
        '<div class="card stack"><b>Tarjeta</b><span class="muted small">' + esc(state.card.bank) + " ···· " + esc(state.card.last4) + " · " + esc(state.card.holder) + "</span>" +
          (linked ? (state.confirmUnlink
            ? '<p class="small">Dejaremos de leer tus compras y no habrá más cargos. Tu inversión se queda donde está.</p><div class="chips"><button class="btn btn-danger btn-sm" data-act="unlink">Sí, desvincular</button><button class="btn btn-line btn-sm" data-act="unlink-cancel">Cancelar</button></div>'
            : '<button class="btn btn-danger btn-sm" style="justify-self:start" data-act="unlink-ask">Desvincular tarjeta</button>')
            : '<span class="pill off" style="justify-self:start">Desvinculada</span><button class="btn btn-line btn-sm" style="justify-self:start" data-act="relink">Vincular otra tarjeta</button>') + "</div>" +
        '<div class="card stack"><b>Tu autorización</b><p class="muted small">' + esc(state.consent.text) + '</p><span class="small muted">Aceptada el ' + esc(fFull.format(new Date(state.consent.acceptedAt))) + "</span></div>";
    }
  };

  function recommend(d) {
    var score = { vendo: 0, espero: 1, compro: 2 }[d.q1] + { menos1: 0, "1a3": 1, mas3: 2 }[d.q2];
    if (d.q2 === "menos1" || score <= 1) return "conservador";
    return score >= 4 ? "crecimiento" : "moderado";
  }

  function mixBar(p) {
    return '<div class="mix"><div class="mix-bar">' + p.mix.map(function (m) { return '<i style="width:' + m[1] + "%;background:" + MIX_COLORS[m[0]] + '"></i>'; }).join("") + "</div>" +
      '<div class="mix-leg">' + p.mix.map(function (m) { return '<span style="--c:' + MIX_COLORS[m[0]] + '">' + m[0] + " " + m[1] + "%</span>"; }).join("") + "</div></div>";
  }

  function txRow(t) {
    var pill = t.status === "cobrado" ? '<span class="pill good">Invertido</span>' : t.status === "pendiente" ? '<span class="pill info">Por cobrar</span>' : '<span class="pill off" title="' + esc(t.reason) + '">' + esc(t.reason) + "</span>";
    return '<div class="tx"><span class="ic">' + esc(t.merchant.slice(0, 2).toUpperCase()) + '</span><div><div class="m">' + esc(t.merchant) + '</div><div class="d">' + esc(fTime.format(new Date(t.date))) + " · " + m2(t.amount) + "</div></div>" +
      '<div class="r"><span class="fee' + (t.fee ? "" : " zero") + '">' + (t.fee ? "+" + m2(t.fee) : m2(0)) + "</span>" + pill + "</div></div>";
  }

  function spark() {
    var h = state.navHistory;
    if (h.length < 2 || !state.charges.length) return '<p class="muted small">Tu gráfica aparecerá después del primer cargo invertido.</p>';
    var charges = state.charges.filter(function (c) { return c.status === "invertido"; }).slice().reverse();
    var pts = h.map(function (p) {
      var units = 0, paid = 0, t = new Date(p.d);
      charges.forEach(function (c) { if (new Date(c.date) <= t) { units += c.units; paid += c.amount; } });
      return { v: units * p.nav, c: paid };
    });
    var W = 320, H = 120, pad = 6, max = Math.max.apply(null, pts.map(function (p) { return Math.max(p.v, p.c); })) || 1;
    function x(i) { return pad + i * (W - 2 * pad) / (pts.length - 1); }
    function y(v) { return H - pad - v / max * (H - 2 * pad - 14); }
    var line = pts.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.v).toFixed(1); }).join("");
    var paidLine = pts.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.c).toFixed(1); }).join("");
    var area = line + "L" + x(pts.length - 1).toFixed(1) + " " + (H - pad) + "L" + x(0).toFixed(1) + " " + (H - pad) + "Z";
    var last = pts[pts.length - 1];
    return '<svg class="spark" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="Valor de la inversión frente a lo aportado">' +
      '<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + (H - pad) + '" y2="' + (H - pad) + '" stroke="var(--line)"/>' +
      '<path d="' + area + '" fill="var(--accent-soft)"/>' +
      '<path d="' + paidLine + '" fill="none" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="3 3"/>' +
      '<path d="' + line + '" fill="none" stroke="var(--accent)" stroke-width="2"/>' +
      '<circle cx="' + x(pts.length - 1).toFixed(1) + '" cy="' + y(last.v).toFixed(1) + '" r="3.5" fill="var(--accent)"/></svg>' +
      '<div class="today small"><span style="color:var(--accent);font-weight:700">— Valor</span><span class="muted">- - Aportado</span></div>';
  }

  var TABS = [["inicio", "Inicio"], ["movimientos", "Movimientos"], ["inversion", "Inversión"], ["ajustes", "Ajustes"]];

  function render() {
    var inApp = state.stage === "app";
    var key = inApp ? state.tab : state.stage;
    var keepScroll = render.lastKey === key ? $screen.scrollTop : 0;
    $screen.innerHTML = screens[key]();
    $screen.scrollTop = keepScroll;
    render.lastKey = key;
    $tabs.hidden = !inApp;
    if (inApp) {
      $tabs.innerHTML = TABS.map(function (t) { return '<button data-act="tab" data-tab="' + t[0] + '"' + (state.tab === t[0] ? ' aria-current="page"' : "") + ">" + icon(t[0]) + t[1] + "</button>"; }).join("");
    }
    document.getElementById("st-time").textContent = fTime.format(new Date(state.clock));
    document.getElementById("clock").textContent = fFull.format(new Date(state.clock));
    document.getElementById("c-hint").hidden = isLive();
    document.getElementById("log").innerHTML = state.logs.length
      ? state.logs.map(function (l) { return '<div><span class="t">' + esc(fTime.format(new Date(l.t))) + '</span> <span class="k-' + esc(l.k) + '">[' + esc(l.k) + "]</span> " + esc(l.msg) + "</div>"; }).join("")
      : '<div class="t">Sin eventos todavía. Completa el registro o carga el ejemplo.</div>';
    var proj = document.getElementById("proj");
    if (proj) {
      var mo = state.rules.paused ? 0 : expectedMonthly(state.rules);
      var n = E.monthsToGoal(value(), mo, state.goal.target, rate());
      var yrs = Math.max(10, Math.min(30, isFinite(n) ? Math.ceil(n / 12) + 2 : 10));
      window.CreskoChart.render(proj, { monthly: mo, rate: rate(), years: yrs, start: value(), goal: state.goal.target, height: 220 });
    }
    validate();
    save();
  }

  function validate() {
    var d = state.draft;
    var need = { goal: state.userName.trim() && d.goalName.trim() && d.target >= 500, card: /^\d{4}$/.test(d.last4) && d.holder.trim() && d.readConsent, confirm: d.feeConsent };
    $screen.querySelectorAll("[data-need]").forEach(function (b) { b.disabled = !need[b.getAttribute("data-need")]; });
  }

  /* ---------- Eventos ---------- */

  function setPath(path, v) {
    var parts = path.split("."), o = state;
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = v;
  }

  $screen.addEventListener("input", function (e) {
    var el = e.target, b = el.getAttribute("data-bind");
    if (!b) return;
    var v = el.type === "checkbox" ? el.checked : el.type === "number" || el.hasAttribute("data-num") ? +el.value : el.value;
    if (b === "draft.last4") { v = el.value.replace(/\D/g, "").slice(0, 4); el.value = v; }
    setPath(b, v);
    validate(); save();
  });
  $screen.addEventListener("change", function (e) {
    var el = e.target;
    if (el.getAttribute("data-bind") === "draft.minPurchase" || el.getAttribute("data-bind") === "draft.spend") { setPath(el.getAttribute("data-bind"), +el.value); render(); }
    if (el.getAttribute("data-act-change") === "rule-min") { state.rules.minPurchase = +el.value; log("evento", "reglas actualizadas", { minimo: m0(+el.value) }); toast("Listo: compras menores a " + m0(+el.value) + " ya no apartan."); render(); }
  });

  function onClick(e) {
    var b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    var act = b.getAttribute("data-act"), d = state.draft;
    switch (act) {
      case "go": state.stage = b.getAttribute("data-to"); break;
      case "tab": state.tab = b.getAttribute("data-tab"); state.confirmUnlink = false; break;
      case "goal-kind":
        var k = b.getAttribute("data-kind");
        d.goalKind = k; d.goalName = GOALS[k].name; d.target = GOALS[k].target; break;
      case "set": d[b.getAttribute("data-field")] = +b.getAttribute("data-val"); break;
      case "bank": d.bank = b.getAttribute("data-bank"); break;
      case "answer": d[b.getAttribute("data-field")] = b.getAttribute("data-val"); d.profile = recommend(d); break;
      case "profile-pick": d.profile = b.getAttribute("data-profile"); break;
      case "profile":
        var np = b.getAttribute("data-profile");
        if (np !== state.profile) {
          partner.rebalance(state.contract, state.profile, np);
          state.profile = np;
          state.consent = { acceptedAt: state.clock, text: consentText(state.rules, state.card) };
          toast("Cambiamos tu portafolio a " + PORTS[np].name + ".");
        }
        break;
      case "example": loadExample(); toast("Cargamos 6 semanas de compras de ejemplo."); break;
      case "link": startLink(); return;
      case "activate": activate(); break;
      case "pause":
        state.rules.paused = !state.rules.paused;
        log("evento", state.rules.paused ? "apartados en pausa" : "apartados reactivados");
        toast(state.rules.paused ? "Pausamos tus apartados." : "Tus apartados están activos otra vez.");
        break;
      case "rule":
        var f = b.getAttribute("data-field"), val = +b.getAttribute("data-val");
        state.rules[f] = val;
        state.consent = { acceptedAt: state.clock, text: consentText(state.rules, state.card) };
        log("evento", "reglas actualizadas y nueva autorización registrada", (function () { var o = {}; o[f === "pct" ? "porcentaje" : "tope"] = f === "pct" ? pc(val) : m0(val); return o; })());
        toast(f === "pct" ? "Ahora apartamos el " + pc(val) + " de cada compra." : "Tu tope mensual es " + m0(val) + ".");
        break;
      case "unlink-ask": state.confirmUnlink = true; break;
      case "unlink-cancel": state.confirmUnlink = false; break;
      case "unlink":
        provider.unlink(state.card.cardId);
        state.card.status = "desvinculada"; state.confirmUnlink = false;
        toast("Desvinculamos tu tarjeta. No habrá más cargos."); break;
      case "relink":
        Object.assign(d, { last4: "", holder: state.card.holder, readConsent: false, feeConsent: false, goalName: state.goal.name, target: state.goal.target, pct: state.rules.pct, spend: state.spend, cap: state.rules.cap, minPurchase: state.rules.minPurchase });
        state.stage = "card"; break;
    }
    render();
  }
  $screen.addEventListener("click", onClick);
  $tabs.addEventListener("click", onClick);

  function startLink() {
    var d = state.draft;
    state.stage = "linking"; state.linkStep = 0; render();
    provider.linkCard({ bank: d.bank, last4: d.last4, holder: d.holder.trim() }, function (i) { state.linkStep = i; render(); })
      .then(function (card) {
        state.pendingCard = card;
        state.linkStep = 3; render();
        return state.contract ? { contract: state.contract } : partner.openContract({ name: d.holder.trim(), profile: d.profile });
      })
      .then(function (res) {
        state.pendingContract = res.contract;
        state.linkStep = 4;
        state.stage = "confirm"; render();
      });
  }

  function activate() {
    var d = state.draft, c = state.pendingCard;
    state.goal = { kind: d.goalKind, name: d.goalName.trim(), target: d.target };
    state.rules = { pct: d.pct, cap: d.cap, minPurchase: d.minPurchase, paused: false };
    state.spend = d.spend;
    state.profile = d.profile; state.contract = state.pendingContract;
    state.card = { cardId: c.cardId, bank: c.bank, last4: c.last4, holder: c.holder, status: "activa", linkedAt: state.clock };
    state.consent = { acceptedAt: state.clock, text: consentText(state.rules, state.card) };
    state.stage = "app"; state.tab = "inicio"; state.isExample = false;
    delete state.pendingCard; delete state.pendingContract;
    log("evento", "consent.accepted", { porcentaje: pc(d.pct), tope: m0(d.cap), minimo: m0(d.minPurchase), portafolio: PORTS[d.profile].name });
    toast("Listo, " + (state.userName.trim() || "") + ". Tu próxima compra ya suma a tu meta.");
  }

  /* ---------- Panel del piloto ---------- */

  function needLive() {
    if (isLive()) return true;
    document.getElementById("c-hint").hidden = false;
    toast(state.stage === "app" ? "Vincula una tarjeta para simular compras." : "Primero termina el registro o carga el ejemplo.");
    return false;
  }
  document.getElementById("c-buy").addEventListener("click", function () { if (needLive()) { buy(); render(); } });
  document.getElementById("c-custom").addEventListener("click", function () {
    if (!needLive()) return;
    var amt = +document.getElementById("c-amount").value;
    var name = document.getElementById("c-merchant").value.trim() || "Comercio";
    if (!(amt > 0)) { toast("Escribe un monto mayor a $0."); return; }
    buy({ merchant: name, amount: Math.round(amt * 100) / 100, category: "otros" }); render();
  });
  document.getElementById("c-day").addEventListener("click", function () { if (needLive()) { advanceDay(); render(); } });
  document.getElementById("c-week").addEventListener("click", function () {
    if (!needLive()) return;
    quiet = true; var before = state.txs.length, ch = state.charges.length;
    for (var i = 0; i < 7; i++) advanceDay();
    quiet = false;
    log("evento", "avanzó 1 semana", { compras: state.txs.length - before, cargos: state.charges.length - ch, valor: m2(value()) });
    toast("Avanzamos una semana: " + (state.txs.length - before) + " compras.");
    render();
  });
  document.getElementById("c-demo").addEventListener("click", function () { loadExample(); toast("Cargamos 6 semanas de compras de ejemplo."); render(); });
  document.getElementById("c-reset").addEventListener("click", function () { state = fresh(); render(); });

  render();
})();
