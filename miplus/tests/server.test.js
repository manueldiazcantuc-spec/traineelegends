// Prueba de la API: node miplus/tests/server.test.js
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { server } = require("../server/server.js");

server.listen(0, async () => {
  const base = "http://localhost:" + server.address().port;
  const call = async (method, url, body, headers) => {
    const raw = body == null ? undefined : JSON.stringify(body);
    const r = await fetch(base + url, { method, body: raw, headers: Object.assign({ "content-type": "application/json" }, headers) });
    return { status: r.status, body: await r.json() };
  };
  try {
    assert.equal((await call("GET", "/api/salud")).body.ok, true);
    assert.equal((await call("POST", "/api/usuarios", { nombre: "Ana", curp: "malo" })).status, 422);

    const u = (await call("POST", "/api/usuarios", { nombre: "Ana Gómez", curp: "GOMA900101MDFRRN09" })).body;
    assert.equal(u.nivel, "N1");
    assert.equal(u.tarjeta.tipo, "virtual");

    const ref = (await call("POST", `/api/usuarios/${u.id}/referencias-efectivo`, { monto: 300 })).body;
    assert.equal((await call("POST", "/api/simulador/pago-efectivo", { referencia: ref.referencia })).status, 200);
    assert.equal((await call("POST", `/api/usuarios/${u.id}/referencias-efectivo`, { monto: 1.234 })).status, 400);

    let v = (await call("POST", `/api/usuarios/${u.id}/tarjeta-mi`, { numero: "50 C33F63F8", saldoChip: 10 })).body;
    assert.equal(v.saldo, 250, "vincular con $10 en el chip dispara la recarga automática de $50");
    assert.equal(v.transporte.total, 60);

    const c = (await call("POST", "/api/simulador/compra", { usuarioId: u.id, monto: 100, comercio: "Farmacia" })).body;
    assert.equal(c.aprobada, true);
    assert.equal(c.usuario.saldo, 150);

    const t = (await call("POST", "/api/simulador/torniquete", { usuarioId: u.id, linea: "metro", estacion: "Zócalo" })).body;
    assert.equal(t.paso, true);
    assert.equal(t.tarifa, 5);

    // Webhook firmado del procesador
    const payload = { tarjetaId: "desconocida", autorizacionId: "a1", monto: 10, comercio: "x" };
    assert.equal((await call("POST", "/webhooks/autorizacion", payload, { "x-firma": "mala" })).status, 401);
    const raw = JSON.stringify(payload);
    const firma = crypto.createHmac("sha256", "solo-para-desarrollo").update(raw).digest("hex");
    assert.equal((await call("POST", "/webhooks/autorizacion", payload, { "x-firma": firma })).body.aprobada, false);

    // Nivel 1 no recibe apoyos
    assert.equal((await call("POST", `/api/usuarios/${u.id}/apoyo`, { monto: 500 })).status, 422);
    assert.equal((await call("GET", "/api/usuarios/nadie")).status, 404);
    console.log("server: ok");
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
