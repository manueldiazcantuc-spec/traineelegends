/* Consola BDI × Nominax: pinta el plan y conecta la UI con las reglas. */
(function () {
  "use strict";
  var R = window.NominaxRules, P = window.NominaxPlan;
  var KEY = "nominax-consola-v1";
  var fmt = new Intl.NumberFormat("es-MX");
  var $ = function (id) { return document.getElementById(id); };

  function seed() {
    var s = R.createState({ employers: P.employers, dictionary: P.dictionary });
    s.checks = {};
    s.log.unshift({ at: new Date().toISOString(), type: "inicio", detail: "Consola iniciada con el padrón de ejemplo" });
    return s;
  }
  function load() {
    try { var raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) { /* sin almacenamiento */ }
    return seed();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* sin almacenamiento */ } }

  var state = load();
  var now = function () { return new Date().toISOString(); };

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === "class") n.className = attrs[k]; else n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }
  function fill(id, items, make) { var box = $(id); box.replaceChildren(); items.forEach(function (it, i) { box.appendChild(make(it, i)); }); }
  var li = function (text) { return el("li", null, text); };

  // ---------- Criterio ----------
  var OPTIONS = [
    { v: R.CRITERIA.PENDIENTE, t: "Pendiente de Legal", d: "No entra ningún dato" },
    { v: R.CRITERIA.TRABAJADOR, t: "Basta el consentimiento del trabajador", d: "Tech excluye por RFC al que se oponga" },
    { v: R.CRITERIA.PATRON, t: "Debe autorizar el patrón", d: "Nominax gestiona autorización por empresa" }
  ];
  function renderCriterion() {
    fill("criterion", OPTIONS, function (o) {
      var b = el("button", { type: "button", role: "radio", "aria-checked": String(state.criterion === o.v) });
      b.appendChild(el("b", null, o.t)); b.appendChild(el("span", null, o.d));
      b.onclick = function () { R.setCriterion(state, o.v, now(), "Legal"); update(); };
      return b;
    });
  }

  // ---------- Cobertura ----------
  function renderCoverage() {
    var c = R.coverage(state);
    $("s-total").textContent = fmt.format(c.total);
    $("s-reach").textContent = fmt.format(c.reachable);
    $("s-share").textContent = Math.round(c.share * 1000) / 10 + "% de la base, antes del opt-in";
    $("s-excl").textContent = fmt.format(c.excluded);
    $("s-wait").textContent = c.waiting ? fmt.format(c.waiting) + " en espera de criterio o autorización" : "Nadie en espera";
  }

  // ---------- Empresas ----------
  var LABEL = { activo: "Sin oposición", excluido: "Excluida", autorizado: "Autorizó" };
  function renderEmployers() {
    fill("employers", state.employers, function (e) {
      var tr = el("tr"), allowed = R.employerAllowed(state, e);
      tr.appendChild(el("td", null, e.name));
      tr.appendChild(el("td", { class: "num" }, e.rfc));
      tr.appendChild(el("td", { class: "r num" }, fmt.format(e.workers)));
      var st = el("td");
      st.appendChild(el("span", { class: "pill " + (allowed.ok ? "ok" : e.status === "excluido" ? "no" : "wait") }, allowed.ok ? "Datos habilitados" : allowed.reason));
      st.appendChild(el("div", { class: "small muted" }, LABEL[e.status] + (e.purgeBy ? " · borrar antes de " + e.purgeBy.slice(0, 16).replace("T", " ") : "")));
      tr.appendChild(st);
      var act = el("td"), btn;
      if (e.status !== "activo") btn = el("button", { class: "btn sm", type: "button" }, "Deshacer");
      else if (state.criterion === R.CRITERIA.PATRON) btn = el("button", { class: "btn sm", type: "button" }, "Registrar autorización");
      else btn = el("button", { class: "btn sm", type: "button" }, "Excluir");
      btn.onclick = function () {
        if (e.status !== "activo") R.resetEmployer(state, e.rfc, now());
        else if (state.criterion === R.CRITERIA.PATRON) R.authorizeEmployer(state, e.rfc, now());
        else R.excludeEmployer(state, e.rfc, now(), "Solicitud de la empresa");
        update();
      };
      act.appendChild(btn);
      tr.appendChild(act);
      return tr;
    });
    var sel = $("sim-emp"), cur = sel.value;
    fill("sim-emp", state.employers, function (e) { return el("option", { value: e.rfc }, e.name); });
    if (cur) sel.value = cur;
  }

  // ---------- Contagio ----------
  function renderContagion() {
    var opp = +$("r-opp").value / 100, opt = +$("r-opt").value / 100;
    var c = R.contagion(P.base, opp, opt);
    $("v-opp").textContent = Math.round(opp * 100) + "%";
    $("v-opt").textContent = Math.round(opt * 100) + "%";
    $("c-reach").textContent = fmt.format(c.reachable);
    $("c-cons").textContent = fmt.format(c.withConsent);
    $("c-lost").textContent = fmt.format(c.lost);
    $("bar-ok").style.width = (c.reachable / P.base * 100) + "%";
    $("bar-cons").style.width = (c.withConsent / P.base * 100) + "%";
  }

  // ---------- Diccionario ----------
  function renderDictionary() {
    var d = R.activeDictionary(state, now());
    $("dict-ver").textContent = d ? d.version + " (desde " + d.effectiveAt.slice(0, 10) + ")" : "ninguna";
    fill("dict-fields", d ? d.fields : [], li);
    fill("dict-history", state.dictionary.filter(function (x) { return x.noticeAt; }), function (x) {
      var diff = R.diffFields(d, x);
      return li(x.version + ": notificada " + x.noticeAt.slice(0, 10) + ", vigente " + x.effectiveAt.slice(0, 10) +
        (diff.added.length ? " · agrega " + diff.added.join(", ") : "") + (diff.removed.length ? " · quita " + diff.removed.join(", ") : ""));
    });
    if (!$("dc-fields").value && d) $("dc-fields").value = d.fields.concat(["bono_mensual"]).join(", ");
    if (!$("dc-date").value) $("dc-date").value = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  }

  // ---------- Plan ----------
  function check(id, owner, text) {
    var l = el("li"), lab = el("label"), cb = el("input", { type: "checkbox" }), sp = el("span");
    cb.checked = !!state.checks[id];
    cb.onchange = function () { state.checks[id] = cb.checked; save(); renderProgress(); };
    if (owner) sp.appendChild(el("span", { class: "owner" }, owner));
    sp.appendChild(document.createTextNode(text));
    lab.appendChild(cb); lab.appendChild(sp); l.appendChild(lab);
    return l;
  }
  function renderPlan() {
    fill("calendar", P.calendar, function (d) {
      var box = el("div", { class: "day" }), h = el("h3", null, d.day);
      h.appendChild(el("small", null, d.title));
      box.appendChild(h);
      var ul = el("ul", { class: "checks" });
      d.tasks.forEach(function (t) { ul.appendChild(check(t.id, t.owner, t.text)); });
      box.appendChild(ul);
      return box;
    });
    fill("reqs", P.requirements, function (r) { return check(r.id, null, r.text); });
    fill("topics", P.topics, function (t) {
      var tr = el("tr");
      [t.n, t.topic, t.who, t.ask].forEach(function (v, i) { tr.appendChild(el("td", i === 1 ? { style: "font-weight:700" } : null, String(v))); });
      return tr;
    });
    fill("questions", P.questions, li);
    fill("viable", P.concessions.viable, li);
    fill("nonneg", P.concessions.nonNegotiable, li);
    fill("iresolve", P.iResolve, li);
    fill("escalate", P.escalate, function (e) { return li(e.what + " → " + e.to); });
    renderProgress();
  }
  function renderProgress() {
    var ids = [];
    P.calendar.forEach(function (d) { d.tasks.forEach(function (t) { ids.push(t.id); }); });
    P.requirements.forEach(function (r) { ids.push(r.id); });
    var done = ids.filter(function (id) { return state.checks[id]; }).length;
    $("progress").textContent = done + " de " + ids.length + " listos";
  }

  // ---------- Bitácora ----------
  function renderLog() {
    fill("log", state.log.slice(0, 80), function (e) {
      var l = el("li", { class: "t-" + e.type });
      l.appendChild(el("time", { datetime: e.at }, e.at.slice(5, 16).replace("T", " ")));
      l.appendChild(el("span", null, e.detail));
      return l;
    });
  }

  function update() {
    renderCriterion(); renderCoverage(); renderEmployers(); renderDictionary(); renderLog();
    save();
  }

  // ---------- Eventos ----------
  $("sim-go").onclick = function () {
    var w = $("sim-worker").value.trim() || "TRAB-0001";
    if ($("sim-consent").checked && !R.hasConsent(state, w, now())) R.grantConsent(state, w, now());
    if (!$("sim-consent").checked) R.revokeConsent(state, w, now());
    var d = R.ingest(state, { workerId: w, employerRfc: $("sim-emp").value, data: { ingreso_mensual_neto: 18500, periodicidad_pago: "quincenal", antiguedad_meses: 26, curp: "no solicitado" } }, now());
    var out = $("sim-out");
    out.className = "result " + (d.ok ? "ok" : "no");
    out.textContent = d.ok ? "Aceptado con diccionario " + d.version + ". Campos usados: " + Object.keys(d.data).join(", ") + (d.dropped.length ? ". Descartados: " + d.dropped.join(", ") : "")
      : "Rechazado: " + d.reason;
    update();
  };
  $("dc-go").onclick = function () {
    var fields = $("dc-fields").value.split(",").map(function (f) { return f.trim(); }).filter(Boolean);
    var res = R.proposeDictionaryChange(state, { version: $("dc-ver").value.trim(), fields: fields, effectiveAt: $("dc-date").value + "T00:00:00Z" }, now());
    var out = $("dc-out");
    out.className = "result " + (res.ok ? "ok" : "no");
    out.textContent = res.ok ? "Aceptada: " + res.change.version + " entra en vigor el " + res.change.effectiveAt.slice(0, 10) + "." : res.error;
    update();
  };
  $("r-opp").oninput = renderContagion;
  $("r-opt").oninput = renderContagion;
  $("reset").onclick = function () { state = seed(); $("sim-out").textContent = ""; $("dc-out").textContent = ""; update(); renderPlan(); };

  $("objective").textContent = P.objective;
  $("hidden-risk").textContent = P.hiddenRisk;
  $("planb").textContent = P.planB;
  $("purge-h").textContent = state.config.purgeHours;
  $("notice-d").textContent = state.config.noticeDays;
  renderPlan(); renderContagion(); update();
})();
