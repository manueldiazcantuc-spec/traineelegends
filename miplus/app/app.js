/*
 * MI+ · MVP de la app (Ruta A: tarjeta digital MI+ + tarjeta MI vinculada)
 *
 * Pantallas: bienvenida → alta (nombre y CURP) → vincular tarjeta MI → app.
 * La app usa el mismo servicio que el backend (core/service.js) con proveedores
 * simulados. El estado vive en localStorage para que la demo sobreviva a una recarga.
 */
(function () {
  "use strict";

  var E = window.MiPlusEngine, P = window.MiPlusProviders, Service = window.MiPlusService;
  var KEY = "miplus.mvp.v1";
  var SAMPLE = { name: "Ana Gómez Rendón", curp: "GORA900101MDFMNN09", mi: "50 C33F63F8", ine: "1234567890123" };
  var MERCHANTS = ["Tortillería Doña Mary", "Farmacia de barrio", "OXXO", "Súper", "Gasolinera", "Compra en línea"];
  var STATIONS = { metro: ["Pino Suárez", "Zócalo", "Pantitlán", "Indios Verdes"], metrobus: ["Insurgentes", "Reforma", "Buenavista"] };
  var AMOUNTS = [100, 200, 500, 1000];

  var $screen = document.getElementById("screen"), $tabs = document.getElementById("tabs");
  var $sim = document.getElementById("sim"), $log = document.getElementById("log"), $toast = document.getElementById("toast");

  var ui = { step: "bienvenida", tab: "inicio", amount: 200, ref: null, busy: false, error: "" };

  /* ---------- Bitácora ---------- */

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function addLog(kind, name, data) {
    var li = document.createElement("li");
    li.className = kind + (name.indexOf("rechaz") >= 0 ? " no" : "");
    li.innerHTML = '<span class="k">' + esc(kind) + '</span> <span class="n">' + esc(name) + "</span>" + (data ? "<br>" + esc(JSON.stringify(data)) : "");
    $log.insertBefore(li, $log.firstChild);
    while ($log.children.length > 80) $log.removeChild($log.lastChild);
  }

  var issuer = new P.MockIssuer(addLog, 250), transit = new P.MockTransit(addLog, 250), cashin = new P.MockCashIn(addLog, 250);
  var svc;

  /* ---------- Estado ---------- */

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ state: svc.state, accountId: svc.accountId, cards: issuer.cards, refs: cashin.refs, ref: ui.ref })); } catch (e) { /* sin almacenamiento: la demo sigue en memoria */ }
  }
  function restore() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || "null");
      if (d && d.state) { issuer.cards = d.cards || {}; cashin.refs = d.refs || {}; ui.ref = d.ref || null; return d; }
    } catch (e) { /* datos corruptos o bloqueados: empezar de cero */ }
    return null;
  }
  function boot(d) {
    svc = new Service({
      issuer: issuer, transit: transit, cashin: cashin, log: addLog,
      state: d && d.state, accountId: d && d.accountId,
      onChange: function () { save(); render(); }
    });
  }

  /* ---------- Formato ---------- */

  var fmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
  var fDate = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  function m(c) { return fmt.format(c / 100); }

  var ICONS = {
    inicio: '<path d="M3 11l9-7 9 7v9H3z"/>',
    recargar: '<path d="M12 5v14M5 12h14"/>',
    tarjeta: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>',
    movimientos: '<path d="M4 6h16M4 12h16M4 18h10"/>'
  };
  function icon(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[n] + "</svg>"; }

  var toastTimer;
  function toast(msg) {
    $toast.textContent = msg; $toast.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { $toast.hidden = true; }, 2600);
  }

  /** Corre una acción del servicio con estado ocupado y muestra el resultado o el error. */
  function run(promise, ok) {
    ui.busy = true; ui.error = ""; render();
    return promise.then(function (r) { ui.busy = false; var msg = ok && ok(r); render(); if (msg) toast(msg); return r; })
      .catch(function (e) { ui.busy = false; ui.error = e.message; render(); toast(e.message); });
  }

  /* ---------- Pantallas ---------- */

  function movRow(x) {
    var amt = "", cls = "", sub = fDate.format(new Date(x.date));
    if (x.kind === "deposito") { amt = "+" + m(x.amount); cls = "pos"; }
    else if (x.kind === "compra") amt = m(x.amount);
    else if (x.kind === "carga_transporte") { amt = m(x.amount); sub += " · pasa al monedero de transporte"; }
    else if (x.kind === "cashback") { amt = "+" + m(x.purse); cls = "pos"; sub += " · al transporte, lo pagan comercios aliados"; }
    else if (x.kind === "viaje") { amt = m(x.purse); sub += " · del monedero de transporte" + (x.station ? " · " + x.station : ""); }
    else if (x.kind === "rechazo") { amt = "Rechazada"; sub += " · " + x.reason; }
    return '<div class="mov"><span>' + esc(x.detail) + '</span><span class="amt num ' + cls + '">' + esc(amt) + '</span><span class="sub">' + esc(sub) + "</span></div>";
  }

  function screenWelcome() {
    return '<div style="flex:1"></div><p class="mark">MI<b>+</b></p>' +
      '<h1 class="hero">Tu tarjeta MI.<br><span class="grad">Ahora paga todo.</span></h1>' +
      '<p class="muted">El Metro, la tienda, la farmacia y tus compras en línea. Con la misma tarjeta, sin cuenta de banco.</p>' +
      '<div style="flex:1"></div><button class="btn" data-go="alta">Crear mi cuenta</button>';
  }

  function screenSignUp() {
    return '<h1 class="title">Crea tu cuenta</h1><p class="muted">Solo tu nombre y tu CURP. Empiezas en Nivel 1 con una tarjeta digital.</p>' +
      '<form id="f-alta" class="block">' +
      '<label class="field"><span class="label">Nombre completo</span><input name="name" autocomplete="name" required></label>' +
      '<label class="field"><span class="label">CURP</span><input name="curp" maxlength="18" autocapitalize="characters" required></label>' +
      '<p class="err">' + esc(ui.error) + '</p>' +
      '<button class="btn" ' + (ui.busy ? "disabled" : "") + '>' + (ui.busy ? "Abriendo tu cuenta…" : "Continuar") + "</button>" +
      '<button class="btn alt" type="button" data-sample="alta">Usar datos de ejemplo</button></form>' +
      '<p class="muted small">Tu dinero lo resguarda una institución regulada por la CNBV. Al continuar aceptas el aviso de privacidad.</p>';
  }

  function miForm(id) {
    return '<form id="' + id + '" class="block"><label class="field"><span class="label">Número al reverso de tu tarjeta MI</span><input name="mi" autocapitalize="characters" placeholder="50 C33F63F8" required></label>' +
      '<p class="err">' + esc(ui.error) + '</p><button class="btn" ' + (ui.busy ? "disabled" : "") + ">" + (ui.busy ? "Consultando con el sistema de recaudo…" : "Vincular tarjeta MI") + "</button>" +
      '<button class="btn alt" type="button" data-sample="mi">Usar número de ejemplo</button></form>';
  }

  function screenLink() {
    return '<h1 class="title">Vincula tu tarjeta MI</h1><p class="muted">Así tu saldo también sirve para el Metro: cuando tu transporte baje de ' + m(svc.state.autoReload.threshold) + ", lo recargamos solos.</p>" +
      miForm("f-mi") + '<button class="btn alt" data-go="app">Ahora no</button>';
  }

  function screenHome() {
    var st = svc.state, s = svc.summary();
    var h = '<p class="muted">Hola, ' + esc(st.user.name.split(" ")[0]) + '</p><h1 class="title">Inicio</h1>' +
      '<div class="block"><span class="label">Saldo para pagar</span><span class="big num">' + m(s.wallet) + "</span>" +
      '<div class="actions"><button class="btn sm" data-tab="recargar">Recargar</button><button class="btn sm alt" data-tab="tarjeta">Mi tarjeta</button></div></div>';
    if (st.mi) {
      h += '<div class="block"><div class="row"><span class="label">Transporte · MI ' + esc(st.mi.number) + '</span><span class="pill ' + (st.autoReload.enabled ? "good" : "") + '">' + (st.autoReload.enabled ? "Recarga automática" : "Recarga manual") + "</span></div>" +
        '<span class="mid num">' + m(s.transit) + "</span>" +
        (s.pending ? '<p class="small muted">' + m(s.purse) + " en el chip + " + m(s.pending) + " que se cargan en tu siguiente torniquete.</p>" : '<p class="small muted">En el chip de tu tarjeta.</p>') + "</div>";
      h += '<div class="block"><div class="row"><span class="label">Viajes de regalo este mes</span><span class="pill mg">' + svc.cfg.cashback.pct + "% de tus compras</span></div>" +
        '<span class="mid num grad">' + m(s.cashbackMonth) + '</span><p class="small muted">Tope de ' + m(svc.cfg.cashback.monthlyCap) + " al mes.</p></div>";
    } else {
      h += '<div class="block"><span class="mid">Usa tu saldo en el Metro</span><p class="muted small">Vincula tu tarjeta MI y gana viajes de regalo con cada compra.</p><button class="btn" data-go="vincular">Vincular tarjeta MI</button></div>';
    }
    var movs = st.movements.slice(0, 4);
    h += '<div class="block"><div class="row"><span class="label">Últimos movimientos</span><button class="link" data-tab="movimientos">Ver todos</button></div>' +
      (movs.length ? '<div class="list">' + movs.map(movRow).join("") + "</div>" : '<p class="muted small">Aún no hay movimientos. Recarga en una tienda para empezar.</p>') + "</div>";
    return h;
  }

  function screenTopUp() {
    var s = svc.summary();
    var h = '<h1 class="title">Recargar</h1><div class="block"><span class="label">¿Cuánto?</span><div class="chips">' +
      AMOUNTS.map(function (a) { return '<button data-amount="' + a + '" aria-pressed="' + (ui.amount === a) + '">$' + a + "</button>"; }).join("") + "</div>" +
      '<button class="btn" data-action="ref" ' + (ui.busy ? "disabled" : "") + ">Pagar en efectivo en tienda</button></div>";
    if (ui.ref) {
      h += '<div class="block"><span class="label">Referencia para la caja · ' + m(ui.ref.amount) + '</span><span class="mid num" style="font-family:var(--mono)">' +
        esc(ui.ref.reference.replace(/(\d{4})(?=\d)/g, "$1 ")) + '</span><p class="small muted">Díctala en caja. Tu saldo se abona en segundos. (En la demo, págala desde el simulador.)</p></div>';
    }
    h += '<div class="block"><span class="label">Transferencia SPEI</span><p class="small">CLABE: <span class="num">[CLABE asignada por el emisor]</span></p><p class="small muted">Desde cualquier banco o app.</p></div>' +
      '<div class="block"><span class="label">Tus límites · ' + esc(s.level.label) + '</span>' +
      '<div class="row"><span class="small">Puedes depositar este mes</span><b class="num">' + m(s.depositsRoom) + "</b></div>" +
      (s.balanceRoom == null ? "" : '<div class="row"><span class="small">Espacio hasta tu saldo máximo</span><b class="num">' + m(s.balanceRoom) + "</b></div>") +
      '<p class="small muted">Límites de cuentas de bajo riesgo de Banxico, en UDIS (1 UDI ≈ ' + fmt.format(svc.cfg.udi) + ").</p></div>";
    return h;
  }

  function screenCard() {
    var st = svc.state, c = st.card, L = E.limits(st, svc.cfg), ar = st.autoReload;
    var h = '<h1 class="title">Mi tarjeta</h1>' +
      '<div class="cardviz' + (c.status !== "activa" ? " blocked" : "") + '"><span class="mark">MI<b>+</b></span>' +
      '<div><div class="num">•••• •••• •••• ' + esc(c.last4) + '</div><div class="row"><span class="small">' + esc(st.user.name) + "</span><span class=\"small\">" + esc(c.network) + "</span></div></div></div>" +
      '<div class="block"><div class="row"><span>' + (c.type === "fisica" ? "Física · chip dual Calypso + EMV" : "Digital · para Apple Pay y Google Pay") + '</span><span class="pill ' + (c.status === "activa" ? "good" : "bad") + '">' + (c.status === "activa" ? "Activa" : "Bloqueada") + "</span></div>" +
      '<button class="btn ' + (c.status === "activa" ? "alt" : "") + '" data-action="block" ' + (ui.busy ? "disabled" : "") + ">" + (c.status === "activa" ? "Bloquear tarjeta" : "Desbloquear") + "</button></div>";
    h += '<div class="block"><div class="row"><span class="label">Nivel de cuenta</span><span class="pill">' + esc(L.level.label) + '</span></div>' +
      '<div class="row"><span class="small">Depósitos al mes</span><b class="num">' + m(L.monthlyDeposits) + "</b></div>" +
      (L.balanceCap == null ? "" : '<div class="row"><span class="small">Saldo máximo</span><b class="num">' + m(L.balanceCap) + "</b></div>") +
      (L.subsidy ? '<div class="row"><span class="small">Apoyos de gobierno al mes</span><b class="num">' + m(L.subsidy) + "</b></div>" : "");
    if (st.user.level === "N1") {
      h += '<form id="f-n2" class="field"><span class="small muted">Sube a Nivel 2 con tu INE: más límite, apoyos sociales y la tarjeta física MI+ con chip dual.</span>' +
        '<input name="ine" inputmode="numeric" maxlength="13" placeholder="OCR de tu INE (13 dígitos)" required>' +
        '<button class="btn" ' + (ui.busy ? "disabled" : "") + ">Subir a Nivel 2</button><button class=\"btn alt\" type=\"button\" data-sample=\"ine\">Usar INE de ejemplo</button></form>";
    }
    h += "</div>";
    if (st.mi) {
      h += '<div class="block"><div class="row"><span class="label">Tarjeta MI vinculada</span><span class="num">' + esc(st.mi.number) + "</span></div>" +
        '<label class="row"><span>Recarga automática</span><input type="checkbox" data-action="ar" ' + (ar.enabled ? "checked" : "") + "></label>" +
        '<div class="row"><span class="small">Si el transporte baja de</span><select data-ar="threshold">' + [1000, 2000, 5000].map(function (v) { return '<option value="' + v + '"' + (ar.threshold === v ? " selected" : "") + ">" + m(v) + "</option>"; }).join("") + "</select></div>" +
        '<div class="row"><span class="small">Cargar</span><select data-ar="amount">' + [3000, 5000, 10000].map(function (v) { return '<option value="' + v + '"' + (ar.amount === v ? " selected" : "") + ">" + m(v) + "</option>"; }).join("") + "</select></div></div>";
    } else {
      h += miForm("f-mi");
    }
    return h;
  }

  function screenMovements() {
    var movs = svc.state.movements;
    return '<h1 class="title">Movimientos</h1><div class="block">' + (movs.length ? '<div class="list">' + movs.map(movRow).join("") + "</div>" : '<p class="muted small">Sin movimientos todavía.</p>') + "</div>";
  }

  /* ---------- Simulador ---------- */

  function renderSim() {
    if (!svc || !svc.state) { $sim.innerHTML = '<p class="muted small">Primero crea tu cuenta en el teléfono.</p>'; return; }
    var st = svc.state, dis = ui.busy ? " disabled" : "";
    var h = '<div class="simrow"><b>Terminal de un comercio</b><div class="inline"><select id="s-merchant">' + MERCHANTS.map(function (x) { return "<option>" + esc(x) + "</option>"; }).join("") +
      '</select><input id="s-amount" type="number" min="1" step="0.01" value="85" aria-label="Monto de la compra"></div><button class="btn sm" data-sim="buy"' + dis + ">Acercar la tarjeta a la terminal</button></div>";
    h += '<div class="simrow"><b>Caja de la tienda</b>' + (ui.ref ? '<button class="btn sm" data-sim="pay"' + dis + ">Pagar referencia de " + m(ui.ref.amount) + " en efectivo</button>" : '<p class="small muted">Genera una referencia en Recargar.</p>') + "</div>";
    h += '<div class="simrow"><b>Torniquete</b>' + (st.mi ?
      '<div class="inline"><select id="s-line"><option value="metro">Metro · ' + m(svc.cfg.fares.metro) + '</option><option value="metrobus">Metrobús · ' + m(svc.cfg.fares.metrobus) + "</option></select>" +
      '<select id="s-station">' + STATIONS.metro.concat(STATIONS.metrobus).map(function (x) { return "<option>" + esc(x) + "</option>"; }).join("") + '</select></div><button class="btn sm" data-sim="tap"' + dis + ">Pasar la tarjeta MI</button>" :
      '<p class="small muted">Vincula una tarjeta MI para usarlo.</p>') + "</div>";
    h += '<div class="simrow"><b>Banco y gobierno</b><div class="inline"><button class="btn sm alt" data-sim="spei"' + dis + '>Recibir SPEI de $500</button><button class="btn sm alt" data-sim="apoyo"' + dis + ">Recibir apoyo de $1,000</button></div></div>";
    $sim.innerHTML = h;
  }

  /* ---------- Render ---------- */

  function render() {
    var logged = svc && svc.state;
    var screen;
    if (!logged) screen = ui.step === "alta" ? screenSignUp() : screenWelcome();
    else if (ui.step === "vincular") screen = screenLink();
    else screen = { inicio: screenHome, recargar: screenTopUp, tarjeta: screenCard, movimientos: screenMovements }[ui.tab]();
    var keep = document.activeElement && document.activeElement.name;
    $screen.innerHTML = screen;
    if (keep) { var el = $screen.querySelector('[name="' + keep + '"]'); if (el) el.focus(); }
    $tabs.hidden = !logged || ui.step === "vincular";
    $tabs.innerHTML = ["inicio", "recargar", "tarjeta", "movimientos"].map(function (t) {
      return '<button data-tab="' + t + '"' + (ui.tab === t ? ' aria-current="page"' : "") + ">" + icon(t) + t.charAt(0).toUpperCase() + t.slice(1) + "</button>";
    }).join("");
    renderSim();
  }

  /* ---------- Eventos ---------- */

  function fill(form, values) { Object.keys(values).forEach(function (k) { var i = form.querySelector('[name="' + k + '"]'); if (i) i.value = values[k]; }); }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("button");
    if (!t || ui.busy) return;
    var d = t.dataset;
    if (d.go) { ui.error = ""; ui.step = d.go === "app" ? "app" : d.go; if (d.go === "app") ui.tab = "inicio"; render(); }
    else if (d.tab) { ui.error = ""; ui.step = "app"; ui.tab = d.tab; render(); $screen.scrollTop = 0; }
    else if (d.sample === "alta") fill(document.getElementById("f-alta"), { name: SAMPLE.name, curp: SAMPLE.curp });
    else if (d.sample === "mi") fill(document.getElementById("f-mi"), { mi: SAMPLE.mi });
    else if (d.sample === "ine") fill(document.getElementById("f-n2"), { ine: SAMPLE.ine });
    else if (d.amount) { ui.amount = Number(d.amount); render(); }
    else if (d.action === "ref") run(svc.cashInReference(ui.amount * 100), function (ref) { ui.ref = ref; save(); return "Referencia lista"; });
    else if (d.action === "block") run(svc.setCardBlocked(svc.state.card.status === "activa"), function (st) { return st === "activa" ? "Tarjeta desbloqueada" : "Tarjeta bloqueada"; });
    else if (d.sim === "buy") {
      var amount = Math.round(Number(document.getElementById("s-amount").value) * 100);
      if (!(amount > 0)) return toast("Escribe un monto válido");
      run(svc.purchase(amount, document.getElementById("s-merchant").value), function (r) { return r.approved ? "Compra aprobada" : "Compra rechazada: " + r.reason; });
    }
    else if (d.sim === "pay") {
      var ref = ui.ref;
      run(cashin.simulatePayment(ref.reference), function (r) { ui.ref = null; save(); return r.ok ? m(ref.amount) + " abonados a tu saldo" : "La tienda rechazó el pago: " + r.reason; });
    }
    else if (d.sim === "tap") run(svc.tap(document.getElementById("s-line").value, document.getElementById("s-station").value), function (r) { return r.ok ? "Buen viaje · " + m(r.fare) : r.reason; });
    else if (d.sim === "spei") run(svc.deposit(50000, "spei"), function (r) { return r.ok ? "SPEI recibido" : r.reason; });
    else if (d.sim === "apoyo") run(svc.deposit(100000, "apoyo"), function (r) { return r.ok ? "Apoyo recibido" : r.reason; });
  });

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.dataset.action === "ar") run(svc.setAutoReload({ enabled: t.checked }));
    else if (t.dataset.ar) { var p = {}; p[t.dataset.ar] = Number(t.value); run(svc.setAutoReload(p)); }
  });

  document.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target, v = function (n) { return f.querySelector('[name="' + n + '"]').value; };
    if (f.id === "f-alta") run(svc.signUp({ name: v("name"), curp: v("curp") }), function () { ui.step = "vincular"; render(); return "Cuenta abierta · Nivel 1"; });
    else if (f.id === "f-mi") run(svc.linkMi(v("mi")), function () { ui.step = "app"; ui.tab = "inicio"; render(); return "Tarjeta MI vinculada"; });
    else if (f.id === "f-n2") run(svc.upgrade({ ine: v("ine") }), function () { return "Nivel 2 · tarjeta física en camino"; });
  });

  document.getElementById("reset").addEventListener("click", function () {
    try { localStorage.removeItem(KEY); } catch (e) { /* nada que borrar */ }
    issuer.cards = {}; cashin.refs = {}; ui = { step: "bienvenida", tab: "inicio", amount: 200, ref: null, busy: false, error: "" };
    $log.innerHTML = ""; boot(null); render();
  });

  var saved = restore();
  boot(saved);
  if (saved) ui.step = "app";
  render();
})();
