/*
 * MI+ · servidor de la API (Node, sin dependencias)
 *
 *   node miplus/server/server.js            → http://localhost:3030
 *   PORT=8080 WEBHOOK_SECRET=... node ...
 *
 * Usa el mismo servicio que la demo. Los usuarios viven en memoria: en
 * producción van en una base de datos con bitácora inmutable de movimientos.
 * Los montos de la API van en pesos; por dentro son centavos.
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const P = require("../core/providers.js");
const MiPlusService = require("../core/service.js");

const PORT = Number(process.env.PORT || 3030);
const SECRET = process.env.WEBHOOK_SECRET || "solo-para-desarrollo";
const APP_DIR = path.join(__dirname, "..", "app");
const CORE_DIR = path.join(__dirname, "..", "core");

const log = (kind, name, data) => console.log(new Date().toISOString(), kind.padEnd(9), name, data ? JSON.stringify(data) : "");
const issuer = new P.MockIssuer(log, 0);
const transit = new P.MockTransit(log, 0);
const cashin = new P.MockCashIn(log, 0);

// Un servicio por usuario sobre proveedores compartidos. El emisor y la red de
// efectivo avisan por cuenta, así que enrutamos sus webhooks al servicio correcto.
const users = new Map();
const byAccount = new Map();
const byCard = () => { const m = new Map(); users.forEach((s) => s.state.card && m.set(s.state.card.cardId, s)); return m; };
issuer.onAuthorization((ev) => {
  const svc = byCard().get(ev.cardId);
  return svc ? svc.handleAuthorization(ev) : Promise.resolve({ approved: false, reason: "Tarjeta desconocida" });
});
cashin.onPayment((ev) => byAccount.get(ev.accountId).handleCashIn(ev));

function newService() {
  // Proveedores compartidos: el servicio registra sus handlers, así que los
  // restauramos para que sigan enrutando a todos los usuarios.
  const auth = issuer.handler, pay = cashin.handler;
  const svc = new MiPlusService({ issuer, transit, cashin, log });
  issuer.handler = auth; cashin.handler = pay;
  return svc;
}

const toCents = (pesos) => {
  const n = Number(pesos);
  if (!Number.isFinite(n) || n <= 0 || Math.round(n * 100) !== Math.round(n * 1e4) / 100) throw httpError(400, "monto debe ser un número positivo con máximo 2 decimales");
  return Math.round(n * 100);
};
const pesos = (c) => c == null ? null : c / 100;

function view(svc) {
  const st = svc.state, sm = svc.summary();
  return {
    id: st.user.id,
    nombre: st.user.name,
    nivel: st.user.level,
    saldo: pesos(sm.wallet),
    transporte: { enChip: pesos(sm.purse), pendiente: pesos(sm.pending), total: pesos(sm.transit) },
    limites: { depositosDisponiblesMes: pesos(sm.depositsRoom), saldoDisponibleMaximo: pesos(sm.balanceRoom) },
    viajesDeRegaloMes: pesos(sm.cashbackMonth),
    tarjeta: st.card && { tipo: st.card.type, ultimos4: st.card.last4, estado: st.card.status, red: st.card.network },
    tarjetaMI: st.mi && st.mi.number,
    recargaAutomatica: { activa: st.autoReload.enabled, umbral: pesos(st.autoReload.threshold), monto: pesos(st.autoReload.amount) },
    movimientos: st.movements.slice(0, 50).map((m) => ({
      fecha: m.date, tipo: m.kind, detalle: m.detail, monto: pesos(m.amount), transporte: pesos(m.purse || 0), motivo: m.reason || undefined
    }))
  };
}

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
function user(id) { const s = users.get(id); if (!s) throw httpError(404, "Usuario no encontrado"); return s; }
function need(body, key) { if (body[key] == null || body[key] === "") throw httpError(400, "Falta " + key); return body[key]; }

/** Firma HMAC-SHA256 del cuerpo, como la mandan los procesadores de tarjetas. */
function validSignature(raw, header) {
  const expected = crypto.createHmac("sha256", SECRET).update(raw).digest("hex");
  const got = Buffer.from(String(header || ""), "utf8");
  const exp = Buffer.from(expected, "utf8");
  return got.length === exp.length && crypto.timingSafeEqual(got, exp);
}

const routes = [
  ["GET", /^\/api\/salud$/, async () => ({ ok: true })],

  ["POST", /^\/api\/usuarios$/, async (b) => {
    const svc = newService();
    await svc.signUp({ name: need(b, "nombre"), curp: need(b, "curp") });
    users.set(svc.state.user.id, svc);
    byAccount.set(svc.accountId, svc);
    return [201, view(svc)];
  }],
  ["GET", /^\/api\/usuarios\/([\w-]+)$/, async (b, id) => view(user(id))],
  ["POST", /^\/api\/usuarios\/([\w-]+)\/nivel2$/, async (b, id) => { const s = user(id); await s.upgrade({ ine: need(b, "ine") }); return view(s); }],
  ["POST", /^\/api\/usuarios\/([\w-]+)\/tarjeta-mi$/, async (b, id) => { const s = user(id); await s.linkMi(need(b, "numero"), b.saldoChip == null ? undefined : toCents(b.saldoChip)); return view(s); }],
  ["POST", /^\/api\/usuarios\/([\w-]+)\/referencias-efectivo$/, async (b, id) => {
    const ref = await user(id).cashInReference(toCents(need(b, "monto")));
    return [201, { referencia: ref.reference, monto: pesos(ref.amount) }];
  }],
  // En producción estos dos llegan como webhooks del banco (SPEI) y del programa social.
  ["POST", /^\/api\/usuarios\/([\w-]+)\/(spei|apoyo)$/, async (b, id, source) => {
    const s = user(id), r = await s.deposit(toCents(need(b, "monto")), source);
    if (!r.ok) throw httpError(422, r.reason);
    return view(s);
  }],
  ["POST", /^\/api\/usuarios\/([\w-]+)\/tarjeta$/, async (b, id) => { const s = user(id); await s.setCardBlocked(!!need(b, "bloqueada")); return view(s); }],
  ["PATCH", /^\/api\/usuarios\/([\w-]+)\/recarga-automatica$/, async (b, id) => {
    const s = user(id), patch = {};
    if (b.activa != null) patch.enabled = !!b.activa;
    if (b.umbral != null) patch.threshold = toCents(b.umbral);
    if (b.monto != null) patch.amount = toCents(b.monto);
    await s.setAutoReload(patch);
    return view(s);
  }],

  // Webhook real del procesador: firma obligatoria. Responde rápido: el procesador da ~2 s.
  ["POST", /^\/webhooks\/autorizacion$/, async (b, raw, headers) => {
    if (!validSignature(raw, headers["x-firma"])) throw httpError(401, "Firma inválida");
    const svc = byCard().get(need(b, "tarjetaId"));
    if (!svc) return { aprobada: false, motivo: "Tarjeta desconocida" };
    const d = await svc.handleAuthorization({ authId: need(b, "autorizacionId"), cardId: b.tarjetaId, amount: toCents(need(b, "monto")), merchant: need(b, "comercio") });
    return { aprobada: d.approved, motivo: d.reason || undefined };
  }, true],

  // Simulador: hace lo que harían la terminal del comercio, la caja de la tienda y el torniquete.
  ["POST", /^\/api\/simulador\/compra$/, async (b) => {
    const s = user(need(b, "usuarioId")), d = await s.purchase(toCents(need(b, "monto")), need(b, "comercio"));
    return { aprobada: d.approved, motivo: d.reason || undefined, usuario: view(s) };
  }],
  ["POST", /^\/api\/simulador\/pago-efectivo$/, async (b) => {
    const r = await cashin.simulatePayment(String(need(b, "referencia")));
    if (!r.ok) throw httpError(422, r.reason);
    return { ok: true };
  }],
  ["POST", /^\/api\/simulador\/torniquete$/, async (b) => {
    const s = user(need(b, "usuarioId"));
    if (!s.state.mi) throw httpError(422, "Tarjeta MI no vinculada");
    const r = await s.tap(need(b, "linea"), b.estacion);
    return { paso: r.ok, motivo: r.reason, tarifa: pesos(r.fare), usuario: view(s) };
  }]
];

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };
function serveStatic(req, res) {
  const url = req.url.split("?")[0];
  const [dir, rel] = url.startsWith("/core/") ? [CORE_DIR, url.slice(6)] : [APP_DIR, url === "/" ? "index.html" : url.slice(1)];
  const file = path.join(dir, path.normalize(rel));
  if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return false;
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
  return true;
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
  req.on("end", async () => {
    const url = req.url.split("?")[0];
    const route = routes.find(([m, re]) => m === req.method && re.test(url));
    if (!route) {
      if (req.method === "GET" && serveStatic(req, res)) return;
      return send(res, 404, { error: "Ruta no encontrada" });
    }
    try {
      const body = raw ? JSON.parse(raw) : {};
      const params = url.match(route[1]).slice(1);
      const out = route[3] ? await route[2](body, raw, req.headers) : await route[2](body, ...params);
      const [status, payload] = Array.isArray(out) ? out : [200, out];
      send(res, status, payload);
    } catch (e) {
      send(res, e.status || (e instanceof SyntaxError ? 400 : 422), { error: e.message });
    }
  });
});

if (require.main === module) server.listen(PORT, () => console.log("MI+ API en http://localhost:" + PORT));
module.exports = { server, validSignature };
