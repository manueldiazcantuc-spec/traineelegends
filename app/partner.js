/*
 * Cresko · socio de inversión (simulado)
 *
 * Cresko es la capa de experiencia (wealthtech). El dinero se invierte y se
 * custodia a nombre del usuario en una casa de bolsa u operadora de fondos
 * regulada por la CNBV, con la que Cresko tiene una relación comercial
 * (distribución / referenciación). Esta capa aísla lo que hace ese socio:
 *
 *   openContract() → alta del contrato de inversión del usuario (KYC delegado).
 *   buy()          → orden de compra del portafolio con el cargo del día.
 *   rebalance()    → cambio de portafolio cuando el usuario cambia de perfil.
 *
 * En la prueba real se reemplaza por un cliente de la API del socio con la misma
 * forma (ver docs/ARQUITECTURA.md).
 */
(function (root) {
  "use strict";

  // Supuestos hipotéticos por clase de activo (rendimiento anual esperado y volatilidad).
  var ASSETS = {
    "Deuda gubernamental": { r: 0.07, vol: 0.01, color: "#9AA8FF" },
    "Acciones México": { r: 0.11, vol: 0.18, color: "#3F58FD" },
    "Acciones globales": { r: 0.12, vol: 0.16, color: "#2414B8" }
  };
  var EQUITY_CORR = 0.6; // correlación supuesta entre acciones México y globales

  function portfolio(name, risk, fee, mix, blurb) {
    // Rendimiento esperado = promedio ponderado; volatilidad con la correlación entre acciones.
    var mu = 0, v = 0;
    mix.forEach(function (m) { mu += m[1] / 100 * ASSETS[m[0]].r; });
    mix.forEach(function (a) { mix.forEach(function (b) {
      var wa = a[1] / 100, wb = b[1] / 100, A = ASSETS[a[0]], B = ASSETS[b[0]];
      var corr = a[0] === b[0] ? 1 : (a[0] !== "Deuda gubernamental" && b[0] !== "Deuda gubernamental") ? EQUITY_CORR : 0;
      v += wa * wb * A.vol * B.vol * corr;
    }); });
    var sigma = Math.sqrt(v);
    return { name: name, risk: risk, fee: fee, mix: mix, blurb: blurb, mu: mu, sigma: sigma,
             low: mu - 2 * sigma, high: mu + 2 * sigma };
  }

  var PORTFOLIOS = {
    conservador: portfolio("Cresko Conservador", "Riesgo bajo", 0.8,
      [["Deuda gubernamental", 80], ["Acciones México", 10], ["Acciones globales", 10]],
      "Para metas de menos de un año o si no quieres ver bajas grandes."),
    moderado: portfolio("Cresko Moderado", "Riesgo medio", 0.9,
      [["Deuda gubernamental", 50], ["Acciones México", 20], ["Acciones globales", 30]],
      "Equilibrio entre estabilidad y crecimiento para metas de 1 a 3 años."),
    crecimiento: portfolio("Cresko Crecimiento", "Riesgo alto", 1.0,
      [["Deuda gubernamental", 15], ["Acciones México", 30], ["Acciones globales", 55]],
      "Para metas de más de 3 años, como el retiro. Sube y baja más.")
  };

  function pct(x) { var n = Math.round(x * 100); return (n > 0 ? "+" : "") + n + "%"; }

  /** Composición en barras (una por clase de activo) y rango típico de un año en una escala común. */
  var SCALE = [-0.2, 0.4];
  function detailHTML(p) {
    function pos(x) { return ((x - SCALE[0]) / (SCALE[1] - SCALE[0]) * 100).toFixed(1); }
    var rows = p.mix.map(function (m) {
      return '<div class="alloc-row"><span class="alloc-name">' + m[0] + '</span><span class="alloc-track"><i style="width:' + m[1] + "%;background:" + ASSETS[m[0]].color + '"></i></span><b>' + m[1] + "%</b></div>";
    }).join("");
    return '<div class="alloc" aria-label="Composición del portafolio">' + rows + "</div>" +
      '<div class="prange"><div class="prange-head"><span>Rango típico en un año</span><b>' + pct(p.low) + " a " + pct(p.high) + "</b></div>" +
      '<div class="prange-track" role="img" aria-label="En un año típico, entre ' + pct(p.low) + " y " + pct(p.high) + ", con " + pct(p.mu) + ' esperado">' +
        '<span class="prange-zero" style="left:' + pos(0) + '%"></span>' +
        '<span class="prange-band" style="left:' + pos(p.low) + "%;width:" + (pos(p.high) - pos(p.low)).toFixed(1) + '%"></span>' +
        '<span class="prange-mu" style="left:' + pos(p.mu) + '%"></span></div>' +
      '<div class="prange-scale"><span>−20%</span><span style="left:' + pos(0) + '%">0%</span><span style="left:' + pos(0.2) + '%">+20%</span><span>+40%</span></div>' +
      '<div class="prange-foot"><span>Esperado <b>' + pct(p.mu).replace("+", "") + ' anual</b></span><span>Comisión <b>' + p.fee.toFixed(1) + "%</b></span></div></div>";
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function MockInvestmentPartner(log) { this.log = log || function () {}; }

  MockInvestmentPartner.prototype.portfolios = function () { return PORTFOLIOS; };

  MockInvestmentPartner.prototype.openContract = function (user) {
    var self = this;
    return wait(800).then(function () {
      var contract = String(Math.floor(10000000 + Math.random() * 89999999));
      self.log("socio", "contract.opened", { contrato: "···· " + contract.slice(-4), perfil: user.profile });
      return { contract: contract };
    });
  };

  MockInvestmentPartner.prototype.buy = function (contract, profile, amount, nav) {
    this.log("socio", "order.filled", { contrato: "···· " + contract.slice(-4), portafolio: PORTFOLIOS[profile].name, monto: amount.toFixed(2), precio: nav.toFixed(4) });
    return { status: "ejecutada" };
  };

  MockInvestmentPartner.prototype.rebalance = function (contract, from, to) {
    this.log("socio", "rebalance.requested", { contrato: "···· " + contract.slice(-4), de: PORTFOLIOS[from].name, a: PORTFOLIOS[to].name });
    return { status: "programado" };
  };

  root.CreskoPartner = { MockInvestmentPartner: MockInvestmentPartner, PORTFOLIOS: PORTFOLIOS, ASSETS: ASSETS, detailHTML: detailHTML };
})(this);
