/*
 * BDI × Nominax · reglas de uso de datos de nómina
 *
 * Lógica pura, sin DOM ni red, para el acuerdo con Nominax. Traduce a código
 * las posturas del plan de acción interno:
 *   - Opt-in obligatorio: ningún dato se usa sin consentimiento expreso del trabajador.
 *   - El criterio de Legal decide el modo: si basta el consentimiento del trabajador,
 *     se excluye por RFC patronal a quien se oponga; si debe autorizar el patrón,
 *     solo entran las empresas que autorizan (arranque gradual).
 *   - Mientras Legal no defina el criterio, no entra ningún dato.
 *   - Diccionario de datos versionado, con aviso previo de cambios (30 días).
 * Las cifras son las del caso (180,000 trabajadores, cliente de 4,000).
 */
(function (root) {
  "use strict";

  var CRITERIA = {
    PENDIENTE: "pendiente",   // Legal aún no define: no fluye ningún dato
    TRABAJADOR: "trabajador", // basta el consentimiento del trabajador: excluir por RFC a quien se oponga
    PATRON: "patron"          // debe autorizar el patrón: solo empresas autorizadas
  };

  var DEFAULT_CONFIG = {
    noticeDays: 30,      // aviso previo mínimo para cambiar variables
    purgeHours: 72,      // plazo para borrar datos ya recibidos de una empresa excluida (a confirmar con Tech)
    consentVersion: "aviso-v1"
  };

  var DAY = 86400000, HOUR = 3600000;
  var MAX_LOG = 500; // la bitácora guarda solo los eventos más recientes

  function t(date) { return new Date(date).getTime(); }
  function iso(ms) { return new Date(ms).toISOString(); }

  /** RFC de persona moral (12) o física (13). Valida formato, no existencia ante el SAT. */
  function normalizeRFC(rfc) { return String(rfc || "").trim().toUpperCase(); }
  function isValidRFC(rfc) { return /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(normalizeRFC(rfc)); }

  function createState(opts) {
    opts = opts || {};
    return {
      config: Object.assign({}, DEFAULT_CONFIG, opts.config),
      criterion: opts.criterion || CRITERIA.PENDIENTE,
      employers: (opts.employers || []).map(function (e) {
        return { rfc: normalizeRFC(e.rfc), name: e.name, workers: e.workers, status: e.status || "activo", since: e.since || null, purgeBy: null, note: e.note || "" };
      }),
      consents: {},
      dictionary: opts.dictionary ? [{ version: opts.dictionary.version, fields: opts.dictionary.fields.slice(), noticeAt: null, effectiveAt: opts.dictionary.effectiveAt || "2026-01-01T00:00:00Z" }] : [],
      log: []
    };
  }

  function log(state, date, type, detail) {
    var e = { at: new Date(date).toISOString(), type: type, detail: detail };
    state.log.unshift(e);
    if (state.log.length > MAX_LOG) state.log.length = MAX_LOG;
    return e;
  }

  // Índice RFC → empresa, ligado al arreglo de empresas. No se guarda con el estado:
  // si el estado se recarga (p. ej. desde localStorage), el índice se rehace solo.
  var indexes = typeof WeakMap === "function" ? new WeakMap() : null;
  function employerIndex(state) {
    var idx = indexes && indexes.get(state.employers);
    if (!idx) {
      idx = {};
      state.employers.forEach(function (e) { idx[e.rfc] = e; });
      if (indexes) indexes.set(state.employers, idx);
    }
    return idx;
  }

  function findEmployer(state, rfc) {
    var idx = employerIndex(state), key = normalizeRFC(rfc);
    return Object.prototype.hasOwnProperty.call(idx, key) ? idx[key] : null;
  }

  /** Cambia el criterio legal. Solo Legal debería hacerlo: aquí queda registrado quién y cuándo. */
  function setCriterion(state, criterion, date, by) {
    if ([CRITERIA.PENDIENTE, CRITERIA.TRABAJADOR, CRITERIA.PATRON].indexOf(criterion) < 0) throw new Error("Criterio desconocido: " + criterion);
    state.criterion = criterion;
    log(state, date, "criterio", "Criterio legal: " + criterion + (by ? " (" + by + ")" : ""));
  }

  // ---------- Empresas (clientes de Nominax) ----------

  /**
   * Una empresa se opone. Bloqueo inmediato de datos nuevos; los ya recibidos
   * se borran antes de `purgeBy`.
   */
  function excludeEmployer(state, rfc, date, reason) {
    var e = findEmployer(state, rfc);
    if (!e) throw new Error("RFC no encontrado: " + normalizeRFC(rfc));
    e.status = "excluido";
    e.since = iso(t(date));
    e.purgeBy = iso(t(date) + state.config.purgeHours * HOUR);
    e.note = reason || e.note;
    log(state, date, "exclusion", e.rfc + " excluida. Borrar datos antes de " + e.purgeBy.slice(0, 16).replace("T", " "));
    return e;
  }

  /** Una empresa autoriza (necesario solo si el criterio es PATRON). */
  function authorizeEmployer(state, rfc, date) {
    var e = findEmployer(state, rfc);
    if (!e) throw new Error("RFC no encontrado: " + normalizeRFC(rfc));
    e.status = "autorizado";
    e.since = iso(t(date));
    e.purgeBy = null;
    log(state, date, "autorizacion", e.rfc + " autorizó el uso de datos de sus trabajadores");
    return e;
  }

  /** Regresa la empresa a su estado inicial (sin oposición ni autorización). */
  function resetEmployer(state, rfc, date) {
    var e = findEmployer(state, rfc);
    if (!e) throw new Error("RFC no encontrado: " + normalizeRFC(rfc));
    e.status = "activo"; e.since = null; e.purgeBy = null;
    log(state, date, "empresa", e.rfc + " regresa a estado inicial");
    return e;
  }

  /** ¿Pueden entrar datos de esta empresa con el criterio vigente? */
  function employerAllowed(state, e) {
    if (!e) return { ok: false, reason: "Empresa no registrada en el padrón de Nominax" };
    if (state.criterion === CRITERIA.PENDIENTE) return { ok: false, reason: "Pendiente: criterio de Legal" };
    if (e.status === "excluido") return { ok: false, reason: "Empresa excluida por RFC patronal" };
    if (state.criterion === CRITERIA.PATRON && e.status !== "autorizado") return { ok: false, reason: "Falta autorización del patrón" };
    return { ok: true, reason: "" };
  }

  // ---------- Consentimiento del trabajador ----------

  function grantConsent(state, workerId, date, channel) {
    state.consents[workerId] = { granted: true, at: iso(t(date)), version: state.config.consentVersion, channel: channel || "app BDI", revokedAt: null };
    log(state, date, "consentimiento", "Trabajador " + workerId + " otorgó consentimiento expreso (" + state.config.consentVersion + ")");
    return state.consents[workerId];
  }

  function revokeConsent(state, workerId, date) {
    var c = state.consents[workerId];
    if (!c || !c.granted) return null;
    c.granted = false;
    c.revokedAt = iso(t(date));
    log(state, date, "revocacion", "Trabajador " + workerId + " revocó su consentimiento");
    return c;
  }

  // `nowIso` en formato toISOString: se compara como texto, sin volver a interpretar fechas.
  function consentAt(state, workerId, nowIso) {
    var c = state.consents[workerId];
    return !!(c && c.granted && c.at <= nowIso);
  }

  function hasConsent(state, workerId, date) { return consentAt(state, workerId, iso(t(date))); }

  // ---------- Diccionario de datos ----------

  /** Versión del diccionario vigente en `date`. */
  function activeDictionary(state, date) {
    var now = t(date), best = null;
    state.dictionary.forEach(function (d) { if (t(d.effectiveAt) <= now && (!best || t(d.effectiveAt) >= t(best.effectiveAt))) best = d; });
    return best;
  }

  /**
   * Nominax propone cambiar las variables. Se acepta solo si respeta el aviso previo.
   * Devuelve { ok, error, change, minEffectiveAt }.
   */
  function proposeDictionaryChange(state, change, date) {
    var min = t(date) + state.config.noticeDays * DAY;
    var res = { ok: false, error: "", change: null, minEffectiveAt: iso(min) };
    if (!change.version) { res.error = "Falta la versión"; return res; }
    if (state.dictionary.some(function (d) { return d.version === change.version; })) { res.error = "La versión " + change.version + " ya existe"; return res; }
    if (!change.fields || !change.fields.length) { res.error = "La versión no tiene campos"; return res; }
    if (t(change.effectiveAt) < min) { res.error = "Aviso insuficiente: debe entrar en vigor a partir del " + iso(min).slice(0, 10) + " (" + state.config.noticeDays + " días)"; return res; }
    var d = { version: change.version, fields: change.fields.slice(), noticeAt: iso(t(date)), effectiveAt: iso(t(change.effectiveAt)) };
    state.dictionary.push(d);
    log(state, date, "diccionario", "Versión " + d.version + " notificada; vigente desde " + d.effectiveAt.slice(0, 10));
    res.ok = true; res.change = d;
    return res;
  }

  /** Campos que cambian entre dos versiones. */
  function diffFields(a, b) {
    var A = a ? a.fields : [], B = b ? b.fields : [];
    return {
      added: B.filter(function (f) { return A.indexOf(f) < 0; }),
      removed: A.filter(function (f) { return B.indexOf(f) < 0; })
    };
  }

  // ---------- Decisión por registro ----------

  /** Lo que no cambia entre registros del mismo momento: se calcula una vez por lote. */
  function context(state, date) {
    var ms = t(date);
    return { iso: iso(ms), dict: activeDictionary(state, ms) };
  }

  function decide(state, record, ctx) {
    var out = { ok: false, reason: "", data: null, dropped: [], version: null };
    var emp = employerAllowed(state, findEmployer(state, record.employerRfc));
    if (!emp.ok) { out.reason = emp.reason; return out; }
    if (!consentAt(state, record.workerId, ctx.iso)) { out.reason = "Sin consentimiento expreso del trabajador"; return out; }
    var dict = ctx.dict;
    if (!dict) { out.reason = "Sin diccionario de datos vigente"; return out; }
    out.version = dict.version;
    out.data = {};
    Object.keys(record.data || {}).forEach(function (k) {
      if (dict.fields.indexOf(k) >= 0) out.data[k] = record.data[k];
      else out.dropped.push(k);
    });
    out.ok = true;
    return out;
  }

  /**
   * Decide si un registro de nómina puede usarse.
   * record = { workerId, employerRfc, data: { campo: valor } }
   * Devuelve { ok, reason, data, dropped, version }.
   */
  function evaluateRecord(state, record, date) { return decide(state, record, context(state, date)); }

  /** Igual que `evaluateRecord`, para un lote completo (p. ej. el envío diario de Nominax). */
  function evaluateBatch(state, records, date) {
    var ctx = context(state, date);
    return records.map(function (r) { return decide(state, r, ctx); });
  }

  /** Aplica `evaluateRecord` y lo deja en la bitácora. */
  function ingest(state, record, date) {
    var d = evaluateRecord(state, record, date);
    log(state, date, d.ok ? "ingesta" : "rechazo",
      record.workerId + " · " + normalizeRFC(record.employerRfc) + (d.ok ? " aceptado (" + d.version + (d.dropped.length ? "; descartados: " + d.dropped.join(", ") : "") + ")" : " rechazado: " + d.reason));
    return d;
  }

  // ---------- Cobertura y contagio ----------

  /** Trabajadores en empresas habilitadas con el criterio vigente (alcance máximo antes del opt-in). */
  function coverage(state) {
    var total = 0, reachable = 0, excluded = 0, waiting = 0;
    state.employers.forEach(function (e) {
      total += e.workers;
      if (employerAllowed(state, e).ok) reachable += e.workers;
      else if (e.status === "excluido") excluded += e.workers;
      else waiting += e.workers;
    });
    return { total: total, reachable: reachable, excluded: excluded, waiting: waiting, share: total ? reachable / total : 0 };
  }

  /**
   * Efecto contagio: si `opposedShare` de la base pide lo mismo que el cliente
   * de 4,000, ¿cuántos trabajadores quedan? `optIn` = tasa esperada de consentimiento.
   */
  function contagion(base, opposedShare, optIn) {
    var reachable = Math.round(base * (1 - opposedShare));
    return { reachable: reachable, lost: base - reachable, withConsent: Math.round(reachable * (optIn == null ? 1 : optIn)) };
  }

  var api = {
    CRITERIA: CRITERIA, DEFAULT_CONFIG: DEFAULT_CONFIG, normalizeRFC: normalizeRFC, isValidRFC: isValidRFC,
    createState: createState, setCriterion: setCriterion, findEmployer: findEmployer,
    excludeEmployer: excludeEmployer, authorizeEmployer: authorizeEmployer, resetEmployer: resetEmployer, employerAllowed: employerAllowed,
    grantConsent: grantConsent, revokeConsent: revokeConsent, hasConsent: hasConsent,
    activeDictionary: activeDictionary, proposeDictionaryChange: proposeDictionaryChange, diffFields: diffFields,
    evaluateRecord: evaluateRecord, evaluateBatch: evaluateBatch, MAX_LOG: MAX_LOG, ingest: ingest, coverage: coverage, contagion: contagion
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NominaxRules = api;
})(this);
