// Pruebas de las reglas BDI × Nominax: node tests/nominax.test.js
const assert = require("node:assert/strict");
const R = require("../nominax/rules.js");
const PLAN = require("../nominax/plan.js");

const D = "2026-10-16T15:00:00Z";
const OPP = PLAN.employers[0].rfc;
const OTHER = PLAN.employers[1].rfc;
const fresh = (criterion) => R.createState({ criterion, employers: PLAN.employers, dictionary: PLAN.dictionary });
const rec = (rfc, extra) => ({ workerId: "w1", employerRfc: rfc, data: Object.assign({ ingreso_mensual_neto: 18000, periodicidad_pago: "quincenal" }, extra) });

// El padrón suma la base del caso y el cliente que se opone es ~2%
let s = fresh();
assert.equal(R.coverage(s).total, PLAN.base);
assert.equal(R.findEmployer(s, OPP).workers, PLAN.opposingWorkers);

// RFC
assert.ok(R.isValidRFC("man980312qx4"));
assert.ok(R.isValidRFC("GODE561231GR8"));
assert.ok(!R.isValidRFC("ABC123"));

// Sin criterio legal no entra ningún dato, aunque haya consentimiento
R.grantConsent(s, "w1", D);
assert.equal(R.evaluateRecord(s, rec(OTHER), D).reason, "Pendiente: criterio de Legal");
assert.equal(R.coverage(s).reachable, 0);

// Criterio TRABAJADOR: basta el consentimiento; se excluye al que se opone
s = fresh(R.CRITERIA.TRABAJADOR);
assert.equal(R.evaluateRecord(s, rec(OTHER), D).reason, "Sin consentimiento expreso del trabajador");
R.grantConsent(s, "w1", D);
let d = R.evaluateRecord(s, rec(OTHER, { curp: "XXXX" }), D);
assert.ok(d.ok);
assert.equal(d.version, "v1");
assert.deepEqual(d.dropped, ["curp"]);          // campo fuera del diccionario: se descarta
assert.equal(d.data.curp, undefined);
const ex = R.excludeEmployer(s, OPP, D, "Solicitud del cliente");
assert.equal(ex.purgeBy, "2026-10-19T15:00:00.000Z"); // 72 h para borrar lo ya recibido
assert.equal(R.evaluateRecord(s, rec(OPP), D).reason, "Empresa excluida por RFC patronal");
assert.equal(R.coverage(s).reachable, PLAN.base - PLAN.opposingWorkers);
assert.equal(R.coverage(s).excluded, PLAN.opposingWorkers);

// Revocar el consentimiento corta el flujo
R.revokeConsent(s, "w1", D);
assert.equal(R.evaluateRecord(s, rec(OTHER), D).ok, false);

// Criterio PATRON: solo empresas que autorizan (arranque gradual)
s = fresh(R.CRITERIA.PATRON);
R.grantConsent(s, "w1", D);
assert.equal(R.evaluateRecord(s, rec(OTHER), D).reason, "Falta autorización del patrón");
R.authorizeEmployer(s, OTHER, D);
assert.ok(R.evaluateRecord(s, rec(OTHER), D).ok);
assert.equal(R.coverage(s).reachable, PLAN.employers[1].workers);
R.resetEmployer(s, OTHER, D);
assert.equal(R.coverage(s).reachable, 0);

// Empresa fuera del padrón
assert.equal(R.evaluateRecord(s, rec("ZZZ010101AAA"), D).reason, "Empresa no registrada en el padrón de Nominax");

// Diccionario: aviso previo de 30 días
s = fresh(R.CRITERIA.TRABAJADOR);
let p = R.proposeDictionaryChange(s, { version: "v2", fields: ["ingreso_mensual_neto"], effectiveAt: "2026-11-01T00:00:00Z" }, D);
assert.equal(p.ok, false);
assert.match(p.error, /Aviso insuficiente/);
p = R.proposeDictionaryChange(s, { version: "v2", fields: ["ingreso_mensual_neto", "bono_mensual"], effectiveAt: "2026-11-20T00:00:00Z" }, D);
assert.ok(p.ok);
assert.equal(R.proposeDictionaryChange(s, { version: "v2", fields: ["x"], effectiveAt: "2027-01-01T00:00:00Z" }, D).error, "La versión v2 ya existe");
assert.equal(R.activeDictionary(s, D).version, "v1");
assert.equal(R.activeDictionary(s, "2026-11-20T00:00:00Z").version, "v2");
const diff = R.diffFields(R.activeDictionary(s, D), R.activeDictionary(s, "2026-12-01T00:00:00Z"));
assert.deepEqual(diff.added, ["bono_mensual"]);
assert.ok(diff.removed.includes("periodicidad_pago"));

// Contagio: si 25% de la base pide lo mismo
const c = R.contagion(PLAN.base, 0.25, 0.4);
assert.equal(c.reachable, 135000);
assert.equal(c.lost, 45000);
assert.equal(c.withConsent, 54000);

// La bitácora registra cada decisión
s = fresh(R.CRITERIA.TRABAJADOR);
R.ingest(s, rec(OTHER), D);
assert.equal(s.log[0].type, "rechazo");

console.log("ok · reglas Nominax");
