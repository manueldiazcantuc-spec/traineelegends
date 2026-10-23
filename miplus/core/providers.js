/*
 * MI+ · proveedores (simulados)
 *
 * Cada objeto aísla lo que en producción hace un tercero. Para la prueba real
 * se escribe otro objeto con los mismos métodos (ver docs/ARQUITECTURA.md);
 * el motor y el servicio no cambian.
 *
 *   MockIssuer   → emisor regulado + procesador de tarjetas con BIN sponsor
 *                  (tipo Pomelo con un banco o IFPE). Abre la cuenta, emite la
 *                  tarjeta y pide autorización de cada compra vía webhook.
 *   MockTransit  → sistema de recaudo de Semovi (Calypso). Vincula la tarjeta MI,
 *                  recibe cargas para la lista de acciones y reporta los pasos
 *                  por torniquete.
 *   MockCashIn   → red de recargas en efectivo (tiendas). Genera referencias y
 *                  avisa cuando el cliente paga en caja.
 */
(function (root) {
  "use strict";

  var CURP = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$/;
  var MI = /^[0-9A-F]{8,16}$/;

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function rid(p) { return p + "_" + Math.random().toString(36).slice(2, 10); }
  function digits(n) { var s = ""; for (var i = 0; i < n; i++) s += Math.floor(Math.random() * 10); return s; }
  function normalizeMi(n) { return String(n || "").replace(/\s+/g, "").toUpperCase(); }

  function MockIssuer(log, latency) {
    this.log = log || function () {};
    this.latency = latency == null ? 300 : latency;
    this.cards = {};
    this.handler = null;
  }

  MockIssuer.prototype.openAccount = function (input) {
    var self = this, curp = String(input.curp || "").toUpperCase();
    return wait(this.latency).then(function () {
      if (!input.name || input.name.trim().length < 3) throw new Error("Escribe tu nombre completo");
      if (!CURP.test(curp)) throw new Error("La CURP no tiene un formato válido");
      var acc = { accountId: rid("acc"), level: "N1", curp: curp };
      self.log("evento", "emisor.cuenta.abierta", { nivel: "N1", curp: curp.slice(0, 4) + "··········" + curp.slice(-4) });
      return acc;
    });
  };

  /** Nivel 2: el emisor valida la INE (en producción, con biometría y consulta al INE). */
  MockIssuer.prototype.upgradeKyc = function (accountId, input) {
    var self = this;
    return wait(this.latency * 2).then(function () {
      if (!input || !/^\d{13}$/.test(String(input.ine || ""))) throw new Error("El número de la INE (OCR) son 13 dígitos");
      self.log("evento", "emisor.kyc.nivel2", { cuenta: accountId });
      return { level: "N2" };
    });
  };

  MockIssuer.prototype.issueCard = function (accountId, type) {
    var self = this;
    return wait(this.latency).then(function () {
      var card = { cardId: rid("crd"), accountId: accountId, type: type, last4: digits(4), status: "activa", network: "Visa" };
      self.cards[card.cardId] = card;
      self.log("evento", type === "fisica" ? "emisor.tarjeta.fisica.solicitada" : "emisor.tarjeta.virtual.emitida",
        { tarjeta: "···· " + card.last4, chip: type === "fisica" ? "dual: Calypso + EMV" : "token para Apple Pay / Google Pay" });
      return Object.assign({}, card);
    });
  };

  MockIssuer.prototype.setCardStatus = function (cardId, status) {
    var self = this;
    return wait(this.latency / 2).then(function () {
      self.cards[cardId].status = status;
      self.log("evento", "emisor.tarjeta." + (status === "activa" ? "desbloqueada" : "bloqueada"), { tarjeta: "···· " + self.cards[cardId].last4 });
      return status;
    });
  };

  /** El procesador llama a este handler en cada compra y espera { approved, reason } en menos de ~2 s. */
  MockIssuer.prototype.onAuthorization = function (handler) { this.handler = handler; };

  /** Simula que el usuario acerca la tarjeta a la terminal de un comercio. */
  MockIssuer.prototype.simulatePurchase = function (cardId, amount, merchant) {
    var self = this, card = this.cards[cardId];
    var ev = { authId: rid("auth"), cardId: cardId, amount: amount, merchant: merchant, network: card ? card.network : "" };
    return wait(this.latency).then(function () {
      self.log("webhook", "procesador.autorizacion.solicitada", { comercio: merchant, monto: amount / 100 });
      return self.handler(ev);
    }).then(function (d) {
      self.log("respuesta", d.approved ? "autorizacion.aprobada" : "autorizacion.rechazada", d.approved ? { comercio: merchant } : { motivo: d.reason });
      return Object.assign({ authId: ev.authId }, d);
    });
  };

  function MockTransit(log, latency) {
    this.log = log || function () {};
    this.latency = latency == null ? 300 : latency;
  }

  MockTransit.prototype.normalize = normalizeMi;

  /** Consulta la tarjeta en el sistema de recaudo y devuelve el saldo que tiene hoy el chip. */
  MockTransit.prototype.linkCard = function (number, initialPurse) {
    var self = this, n = normalizeMi(number);
    return wait(this.latency * 2).then(function () {
      if (!MI.test(n)) throw new Error("El número de la tarjeta MI son 8 a 16 caracteres (0-9, A-F), como aparece al reverso");
      var purse = initialPurse == null ? 1000 : initialPurse;
      self.log("evento", "recaudo.tarjeta.vinculada", { tarjetaMI: n, saldoChip: purse / 100 });
      return { number: n, purse: purse };
    });
  };

  /** Agrega una carga a la lista de acciones: el chip la recibe en el siguiente torniquete. */
  MockTransit.prototype.pushLoad = function (number, load) {
    var self = this;
    return wait(this.latency / 2).then(function () {
      self.log("evento", "recaudo.lista_acciones.carga", { tarjetaMI: number, monto: load.amount / 100, origen: load.origin });
      return { accepted: true };
    });
  };

  /** Paso por torniquete. En producción llega después, en el reporte de validaciones de Semovi. */
  MockTransit.prototype.tap = function (number, line, station) {
    var self = this;
    return wait(this.latency).then(function () {
      self.log("evento", "recaudo.validacion", { tarjetaMI: number, linea: line, estacion: station || "" });
      return { line: line, station: station || "" };
    });
  };

  function MockCashIn(log, latency) {
    this.log = log || function () {};
    this.latency = latency == null ? 300 : latency;
    this.refs = {};
    this.handler = null;
  }

  MockCashIn.prototype.onPayment = function (handler) { this.handler = handler; };

  MockCashIn.prototype.createReference = function (accountId, amount) {
    var self = this;
    return wait(this.latency).then(function () {
      var ref = { reference: digits(14), accountId: accountId, amount: amount, status: "pendiente" };
      self.refs[ref.reference] = ref;
      self.log("evento", "efectivo.referencia.creada", { referencia: ref.reference, monto: amount / 100 });
      return Object.assign({}, ref);
    });
  };

  /** Simula que el cliente paga en caja: la red avisa por webhook. */
  MockCashIn.prototype.simulatePayment = function (reference) {
    var self = this, ref = this.refs[reference];
    return wait(this.latency).then(function () {
      if (!ref || ref.status !== "pendiente") throw new Error("Referencia inválida o ya pagada");
      ref.status = "pagada";
      self.log("webhook", "efectivo.pago.recibido", { referencia: reference, monto: ref.amount / 100 });
      return self.handler({ reference: reference, accountId: ref.accountId, amount: ref.amount });
    });
  };

  var api = { MockIssuer: MockIssuer, MockTransit: MockTransit, MockCashIn: MockCashIn, CURP: CURP, normalizeMi: normalizeMi };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MiPlusProviders = api;
})(this);
