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

  // Rendimientos y volatilidades hipotéticos, solo para simular.
  var PORTFOLIOS = {
    conservador: {
      name: "Cresko Conservador", risk: "Riesgo bajo", mu: 0.07, sigma: 0.03, fee: 0.8,
      mix: [["Deuda gubernamental", 80], ["Acciones indexadas", 20]],
      blurb: "Para metas de menos de un año o si no quieres ver bajas grandes."
    },
    moderado: {
      name: "Cresko Moderado", risk: "Riesgo medio", mu: 0.09, sigma: 0.08, fee: 0.9,
      mix: [["Deuda gubernamental", 50], ["Acciones México", 20], ["Acciones globales", 30]],
      blurb: "Equilibrio entre estabilidad y crecimiento para metas de 1 a 3 años."
    },
    crecimiento: {
      name: "Cresko Crecimiento", risk: "Riesgo alto", mu: 0.11, sigma: 0.15, fee: 1.0,
      mix: [["Acciones globales", 55], ["Acciones México", 30], ["Deuda gubernamental", 15]],
      blurb: "Para metas de más de 3 años, como el retiro. Sube y baja más."
    }
  };

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

  root.CreskoPartner = { MockInvestmentPartner: MockInvestmentPartner, PORTFOLIOS: PORTFOLIOS };
})(this);
