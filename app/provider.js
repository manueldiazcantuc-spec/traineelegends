/*
 * Cresko · proveedor de tarjeta (simulado)
 *
 * Propuesta 3: vincular la tarjeta de débito que el usuario ya tiene.
 * Esta capa aísla todo lo que en producción hace un tercero:
 *
 *   linkCard()      → conexión con el banco vía agregador (lectura de movimientos)
 *                     + tokenización de la tarjeta en el procesador de pagos.
 *   onTransaction() → webhook del agregador con cada compra nueva.
 *   charge()        → cargo agrupado del día a la tarjeta tokenizada.
 *   unlink()        → revoca el consentimiento y borra el token.
 *
 * Para la prueba con tarjeta real solo hay que escribir otro objeto con la
 * misma forma (ver docs/ARQUITECTURA.md). La interfaz del MVP no cambia.
 */
(function (root) {
  "use strict";

  var MERCHANTS = [
    { name: "OXXO", category: "conveniencia", min: 25, max: 140 },
    { name: "Walmart Express", category: "súper", min: 180, max: 950 },
    { name: "Soriana", category: "súper", min: 150, max: 1200 },
    { name: "Uber", category: "transporte", min: 55, max: 260 },
    { name: "DiDi Food", category: "comida", min: 120, max: 420 },
    { name: "Starbucks", category: "café", min: 65, max: 150 },
    { name: "Farmacias del Ahorro", category: "salud", min: 60, max: 480 },
    { name: "Cinépolis", category: "entretenimiento", min: 90, max: 320 },
    { name: "Liverpool", category: "tienda", min: 350, max: 2200 },
    { name: "Gasolinera", category: "gasolina", min: 300, max: 900 },
    { name: "Tacos El Güero", category: "comida", min: 18, max: 95 }
  ];

  var INSTITUTIONS = ["BBVA", "Banorte", "Santander", "Banamex", "HSBC", "Scotiabank", "Nu", "Mercado Pago", "Otro"];

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function uid(p) { return p + "_" + Math.random().toString(36).slice(2, 10); }

  function MockCardProvider(log) {
    this.log = log || function () {};
    this.listeners = [];
  }

  MockCardProvider.prototype.institutions = function () { return INSTITUTIONS.slice(); };

  /** Conecta la tarjeta. `onStep` recibe cada etapa para mostrar avance. */
  MockCardProvider.prototype.linkCard = function (input, onStep) {
    var self = this;
    var steps = [
      ["Conectando con " + input.bank, "agregador.link.created"],
      ["Verificando que la tarjeta ···· " + input.last4 + " es tuya", "procesador.card.tokenized"],
      ["Leyendo tus compras recientes", "agregador.transactions.synced"]
    ];
    var p = Promise.resolve();
    steps.forEach(function (s, i) {
      p = p.then(function () { onStep && onStep(i, s[0]); return wait(750); })
           .then(function () { self.log("evento", s[1], { banco: input.bank, tarjeta: "···· " + input.last4 }); });
    });
    return p.then(function () {
      return { cardId: uid("card"), token: uid("tok"), bank: input.bank, last4: input.last4, holder: input.holder };
    });
  };

  MockCardProvider.prototype.onTransaction = function (fn) { this.listeners.push(fn); };

  /** Simula que el banco reporta una compra con la tarjeta vinculada. */
  MockCardProvider.prototype.emitPurchase = function (date, rand, override) {
    var r = rand || Math.random;
    var m = MERCHANTS[Math.floor(r() * MERCHANTS.length)];
    var tx = {
      id: uid("tx"), date: date,
      merchant: (override && override.merchant) || m.name,
      category: (override && override.category) || m.category,
      amount: override && override.amount != null ? override.amount : Math.round((m.min + r() * (m.max - m.min)) * 2) / 2
    };
    this.log("webhook", "transaction.created", { comercio: tx.merchant, monto: tx.amount });
    this.listeners.forEach(function (fn) { fn(tx); });
    return tx;
  };

  /** Cargo agrupado a la tarjeta tokenizada. 1 de cada 40 se rechaza, para ver ese caso. */
  MockCardProvider.prototype.charge = function (cardId, amount, rand) {
    var ok = (rand || Math.random)() > 0.025;
    var res = { id: uid("chg"), status: ok ? "aprobado" : "rechazado", amount: amount };
    this.log("procesador", ok ? "charge.succeeded" : "charge.declined", { monto: amount });
    return res;
  };

  MockCardProvider.prototype.unlink = function (cardId) {
    this.log("evento", "agregador.link.revoked", { tarjeta: cardId });
    return Promise.resolve(true);
  };

  root.CreskoProvider = { MockCardProvider: MockCardProvider, MERCHANTS: MERCHANTS };
})(this);
