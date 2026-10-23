// Pruebas del motor de MI+: node miplus/tests/engine.test.js
const assert = require("node:assert/strict");
const E = require("../core/engine.js");

const cfg = Object.assign({}, E.DEFAULT_CONFIG, { udi: 10 }); // UDI redonda para que las cuentas se lean fácil
const D = "2026-10-14T15:00:00";
function user(level) {
  const s = E.createState({ name: "Ana", curp: "GOMA900101MDFRRN09", level: level || "N1" }, cfg);
  s.card = { cardId: "c1", status: "activa" };
  return s;
}
const dep = (s, pesos, source, date) => E.applyDeposit(s, { amount: pesos * 100, source: source || "efectivo", date: date || D }, cfg);
const buy = (s, pesos, authId) => E.applyPurchase(s, { authId: authId || String(Math.random()), amount: pesos * 100, merchant: "Tienda", date: D }, cfg);

// Nivel 1: con UDI = $10, abonos de hasta $7,500 al mes y saldo de hasta $10,000
let s = user();
assert.equal(E.limits(s, cfg).monthlyDeposits, 750000);
assert.equal(E.limits(s, cfg).balanceCap, 1000000);
assert.ok(dep(s, 7000).ok);
let r = dep(s, 600);
assert.equal(r.ok, false);
assert.equal(r.reason, "Rebasa el límite mensual de depósitos de tu nivel");
assert.equal(r.room, 50000);
assert.equal(s.wallet, 700000, "un abono rechazado no mueve el saldo");
// El límite mensual se reinicia, pero el tope de saldo sigue
assert.ok(dep(s, 3000, "spei", "2026-11-02T10:00:00").ok);
r = dep(s, 100, "spei", "2026-11-03T10:00:00");
assert.equal(r.reason, "Rebasa el saldo máximo de tu nivel");

// Apoyos de gobierno: solo Nivel 2, con su propio tope de 6,000 UDIS
s = user();
assert.equal(dep(s, 500, "apoyo").reason, "Tu nivel no recibe apoyos; sube a Nivel 2");
s = user("N2");
assert.ok(dep(s, 30000).ok);
assert.ok(dep(s, 60000, "apoyo").ok, "el apoyo no consume el límite de 3,000 UDIS");
assert.equal(dep(s, 1, "apoyo").ok, false);
assert.equal(s.wallet, 9000000);

// Montos inválidos
assert.equal(E.applyDeposit(s, { amount: 10.5, source: "spei", date: D }, cfg).reason, "Monto inválido");
assert.equal(E.applyDeposit(s, { amount: 100, source: "bitcoin", date: D }, cfg).reason, "Origen desconocido");

// Compras: saldo, tarjeta bloqueada e idempotencia del webhook
s = user();
dep(s, 100);
assert.equal(buy(s, 150).reason, "Saldo insuficiente");
assert.equal(buy(s, 80, "a1").approved, true);
assert.equal(s.wallet, 2000);
const again = buy(s, 80, "a1");
assert.equal(again.duplicate, true);
assert.equal(s.wallet, 2000, "un reintento del procesador no cobra dos veces");
s.card.status = "bloqueada";
assert.equal(buy(s, 1).reason, "Tarjeta bloqueada");

// Sin tarjeta MI vinculada no hay cashback ni recarga automática
s = user();
dep(s, 500);
r = buy(s, 100);
assert.equal(r.cashback, null);
assert.equal(r.reload, null);

// Con tarjeta MI: cashback del 1% al transporte, con tope mensual de $50
s = user();
s.mi = { number: "50C33F63F8" };
s.purse.mirror = 10000; // $100 en el chip: no dispara recarga
dep(s, 7000);
r = buy(s, 200);
assert.equal(r.cashback.amount, 200);
assert.equal(s.wallet, 680000, "el cashback no sale del saldo del usuario");
buy(s, 6000);
assert.equal(E.summary(s, cfg, D).cashbackMonth, 5000, "ajustado al tope mensual");
assert.equal(buy(s, 100).cashback, null);

// Recarga automática: si el transporte baja de $20, carga $50 desde el saldo
s = user();
s.mi = { number: "50C33F63F8" };
s.purse.mirror = 1000;
dep(s, 200);
assert.equal(E.pendingTotal(s), 5000, "el abono dispara la recarga");
assert.equal(s.wallet, 15000);
assert.equal(E.checkAutoReload(s, cfg, D), null, "no duplica mientras hay carga pendiente");

// Torniquete: escribe cargas pendientes y cobra la tarifa
r = E.applyTap(s, { line: "metro", date: D }, cfg);
assert.equal(r.ok, true);
assert.equal(r.fare, 500);
assert.equal(s.purse.mirror, 5500);
assert.equal(E.pendingTotal(s), 0);
assert.equal(E.applyTap(s, { line: "tren", date: D }, cfg).reason, "Línea desconocida");

// Sin saldo de transporte ni en la cuenta: el torniquete rechaza
s = user();
s.mi = { number: "50C33F63F8" };
s.purse.mirror = 300;
r = E.applyTap(s, { line: "metrobus", date: D }, cfg);
assert.equal(r.ok, false);
assert.equal(r.reason, "Saldo de transporte insuficiente");
assert.equal(r.reload, null, "sin saldo en la cuenta no hay recarga");

// Recarga automática apagada
s = user();
s.mi = { number: "50C33F63F8" };
s.autoReload.enabled = false;
dep(s, 200);
assert.equal(E.pendingTotal(s), 0);

console.log("engine: ok");
