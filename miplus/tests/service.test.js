// Prueba de punta a punta con los proveedores simulados: node miplus/tests/service.test.js
const assert = require("node:assert/strict");
const P = require("../core/providers.js");
const MiPlusService = require("../core/service.js");

const events = [];
const log = (kind, name) => events.push(name);
const svc = new MiPlusService({
  issuer: new P.MockIssuer(log, 0),
  transit: new P.MockTransit(log, 0),
  cashin: new P.MockCashIn(log, 0),
  now: () => "2026-10-14T15:00:00"
});

(async () => {
  await assert.rejects(svc.signUp({ name: "Ana", curp: "123" }), /CURP/);
  await svc.signUp({ name: "Ana Gómez", curp: "goma900101mdfrrn09" });
  assert.equal(svc.state.user.level, "N1");
  assert.equal(svc.state.card.type, "virtual");

  // Recarga en efectivo: referencia y pago en caja
  const ref = await svc.cashInReference(30000);
  await svc.cashin.simulatePayment(ref.reference);
  assert.equal(svc.state.wallet, 30000);
  await assert.rejects(svc.cashin.simulatePayment(ref.reference), /ya pagada/);

  // Vincular la MI con $10 en el chip dispara la recarga automática
  await assert.rejects(svc.linkMi("hola"), /tarjeta MI/);
  await svc.linkMi("50 c33f63f8", 1000);
  assert.equal(svc.state.mi.number, "50C33F63F8");
  assert.equal(svc.state.wallet, 25000);
  assert.ok(events.includes("recaudo.lista_acciones.carga"));

  // Compra en comercio: aprobada, con viajes de regalo
  const ok = await svc.purchase(10000, "Farmacia");
  assert.equal(ok.approved, true);
  assert.equal(svc.state.wallet, 15000);
  assert.equal(svc.summary().cashbackMonth, 100);

  const no = await svc.purchase(99999, "Súper");
  assert.equal(no.approved, false);
  assert.equal(no.reason, "Saldo insuficiente");

  // Metro: el torniquete escribe la recarga y el cashback, y cobra $5
  const t = await svc.tap("metro", "Pino Suárez");
  assert.equal(t.ok, true);
  assert.equal(svc.state.purse.mirror, 1000 + 5000 + 100 - 500);

  // Bloqueo desde la app
  await svc.setCardBlocked(true);
  assert.equal((await svc.purchase(100, "Tienda")).reason, "Tarjeta bloqueada");
  await svc.setCardBlocked(false);

  // Nivel 2: INE y tarjeta física con chip dual; ya recibe apoyos
  await svc.upgrade({ ine: "1234567890123" });
  assert.equal(svc.state.user.level, "N2");
  assert.equal(svc.state.card.type, "fisica");
  assert.equal((await svc.deposit(50000, "apoyo")).ok, true);

  console.log("service: ok");
})().catch((e) => { console.error(e); process.exit(1); });
