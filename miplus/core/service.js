/*
 * MI+ · servicio
 *
 * Une el motor (engine.js) con los proveedores (providers.js). Es la capa que
 * corre en el backend: la demo del navegador y server/server.js la usan igual.
 * Cada método devuelve una promesa porque en producción cada proveedor es una API.
 */
(function (root) {
  "use strict";

  var E = typeof module !== "undefined" && module.exports ? require("./engine.js") : root.MiPlusEngine;

  function MiPlusService(opts) {
    this.cfg = opts.config || E.DEFAULT_CONFIG;
    this.issuer = opts.issuer;
    this.transit = opts.transit;
    this.cashin = opts.cashin;
    this.log = opts.log || function () {};
    this.now = opts.now || function () { return new Date().toISOString(); };
    this.onChange = opts.onChange || function () {};
    this.state = opts.state || null;
    this.accountId = opts.accountId || null;
    var self = this;
    this.issuer.onAuthorization(function (ev) { return self.handleAuthorization(ev); });
    this.cashin.onPayment(function (ev) { return self.handleCashIn(ev); });
  }

  MiPlusService.prototype.changed = function () { this.onChange(this.state); };

  /** Manda al recaudo cualquier carga que haya generado el motor. */
  MiPlusService.prototype.forward = function (loads) {
    var self = this;
    return Promise.all(loads.filter(Boolean).map(function (l) { return self.transit.pushLoad(self.state.mi.number, l); }));
  };

  MiPlusService.prototype.signUp = function (input) {
    var self = this;
    return this.issuer.openAccount(input).then(function (acc) {
      self.accountId = acc.accountId;
      self.state = E.createState({ name: input.name.trim(), curp: acc.curp, level: acc.level }, self.cfg);
      self.state.accountId = acc.accountId;
      return self.issuer.issueCard(acc.accountId, "virtual");
    }).then(function (card) {
      self.state.card = card;
      self.changed();
      return self.state;
    });
  };

  /** Sube a Nivel 2 y pide la tarjeta física MI+ con chip dual. */
  MiPlusService.prototype.upgrade = function (input) {
    var self = this;
    return this.issuer.upgradeKyc(this.accountId, input).then(function (r) {
      E.setLevel(self.state, r.level);
      return self.issuer.issueCard(self.accountId, "fisica");
    }).then(function (card) {
      self.state.card = card;
      self.changed();
      return card;
    });
  };

  MiPlusService.prototype.linkMi = function (number, initialPurse) {
    var self = this;
    return this.transit.linkCard(number, initialPurse).then(function (r) {
      self.state.mi = { number: r.number, linkedAt: self.now() };
      self.state.purse.mirror = r.purse;
      var reload = E.checkAutoReload(self.state, self.cfg, self.now());
      return self.forward([reload]).then(function () { self.changed(); return self.state.mi; });
    });
  };

  /** Referencia para pagar en efectivo en tienda. Revisa límites antes de mandar al cliente a la caja. */
  MiPlusService.prototype.cashInReference = function (amount) {
    var d = E.evaluateDeposit(this.state, { amount: amount, source: "efectivo", date: this.now() }, this.cfg);
    if (!d.ok) return Promise.reject(new Error(d.reason));
    return this.cashin.createReference(this.accountId, amount);
  };

  MiPlusService.prototype.handleCashIn = function (ev) {
    return this.deposit(ev.amount, "efectivo", ev.reference);
  };

  /** Abono a la cuenta: efectivo, SPEI o apoyo de gobierno. */
  MiPlusService.prototype.deposit = function (amount, source, ref) {
    var self = this;
    var r = E.applyDeposit(this.state, { amount: amount, source: source, date: this.now(), ref: ref }, this.cfg);
    this.log(r.ok ? "evento" : "rechazo", r.ok ? "cuenta.abono" : "cuenta.abono.rechazado", r.ok ? { origen: E.SOURCES[source], monto: amount / 100 } : { motivo: r.reason });
    if (!r.ok) { this.changed(); return Promise.resolve(r); }
    return this.forward([r.reload]).then(function () { self.changed(); return r; });
  };

  /** Webhook de autorización: el procesador pregunta si aprobamos la compra. */
  MiPlusService.prototype.handleAuthorization = function (ev) {
    var self = this;
    var r = E.applyPurchase(this.state, { authId: ev.authId, amount: ev.amount, merchant: ev.merchant, date: this.now() }, this.cfg);
    if (r.duplicate || !r.approved) { this.changed(); return Promise.resolve({ approved: r.approved, reason: r.reason }); }
    // La respuesta al procesador no espera al recaudo: las cargas se mandan en segundo plano.
    this.forward([r.cashback, r.reload]).then(function () { self.changed(); });
    this.changed();
    return Promise.resolve({ approved: true, reason: "" });
  };

  MiPlusService.prototype.purchase = function (amount, merchant) {
    return this.issuer.simulatePurchase(this.state.card.cardId, amount, merchant);
  };

  MiPlusService.prototype.tap = function (line, station) {
    var self = this;
    return this.transit.tap(this.state.mi.number, line, station).then(function (t) {
      var r = E.applyTap(self.state, { line: t.line, station: t.station, date: self.now() }, self.cfg);
      return self.forward([r.reload]).then(function () { self.changed(); return r; });
    });
  };

  MiPlusService.prototype.setCardBlocked = function (blocked) {
    var self = this;
    return this.issuer.setCardStatus(this.state.card.cardId, blocked ? "bloqueada" : "activa").then(function (st) {
      self.state.card.status = st;
      self.changed();
      return st;
    });
  };

  MiPlusService.prototype.setAutoReload = function (patch) {
    Object.assign(this.state.autoReload, patch);
    var reload = E.checkAutoReload(this.state, this.cfg, this.now());
    var self = this;
    return this.forward([reload]).then(function () { self.changed(); return self.state.autoReload; });
  };

  MiPlusService.prototype.summary = function () { return E.summary(this.state, this.cfg, this.now()); };

  if (typeof module !== "undefined" && module.exports) module.exports = MiPlusService;
  else root.MiPlusService = MiPlusService;
})(this);
