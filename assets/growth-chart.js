/*
 * Cresko · gráfica de crecimiento compuesto
 *
 * Área apilada: abajo lo aportado (crece en línea recta), arriba el rendimiento
 * (crece cada vez más rápido porque los rendimientos también generan rendimiento).
 * Uso: CreskoChart.render(el, { monthly, rate, years, start, goal })
 */
(function (root) {
  "use strict";

  var mxn0 = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

  function compact(v) {
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "") + " M";
    if (v >= 1e3) return "$" + Math.round(v / 1e3) + " mil";
    return "$" + Math.round(v);
  }

  /** Serie mensual: valor y aportado acumulado. */
  function series(o) {
    var i = o.rate / 12, v = o.start || 0, c = o.start || 0, pts = [{ m: 0, v: v, c: c }];
    for (var m = 1; m <= o.years * 12; m++) { v = v * (1 + i) + o.monthly; c += o.monthly; pts.push({ m: m, v: v, c: c }); }
    return pts;
  }

  /** Paso "redondo" (1, 2 o 5 × 10^k) para unas 4 líneas de guía. */
  function niceStep(x) {
    if (x <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(x))), n = x / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  function render(el, o) {
    var pts = series(o);
    var W = Math.max(280, el.clientWidth || 320), H = o.height || 240;
    var L = 58, R = 26, T = 16, B = 28;
    var last = pts[pts.length - 1];
    var top = Math.max(last.v, o.goal || 0);
    var stepV = niceStep(top * 1.05 / 4), ticks = Math.ceil(top * 1.05 / stepV), max = stepV * ticks;
    function x(m) { return L + m / (o.years * 12) * (W - L - R); }
    function y(v) { return T + (1 - v / max) * (H - T - B); }

    var grid = "";
    for (var g = 0; g <= ticks; g++) {
      var gv = stepV * g;
      grid += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(gv).toFixed(1) + '" y2="' + y(gv).toFixed(1) + '" class="gc-grid' + (g ? "" : " gc-base") + '"/>' +
        '<text x="' + (L - 8) + '" y="' + (y(gv) + 4).toFixed(1) + '" text-anchor="end" class="gc-ax">' + compact(gv) + "</text>";
    }
    var fit = Math.max(2, Math.floor((W - L - R) / 64)), step = [1, 2, 5, 10].filter(function (s) { return o.years / s + 1 <= fit; })[0] || 10;
    var years = [];
    for (var yy = 0; yy < o.years; yy += step) if (o.years - yy >= step * 0.75 || yy === 0) years.push(yy);
    years.push(o.years);
    years.forEach(function (yr) {
      grid += '<text x="' + x(yr * 12).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + (yr === o.years ? "end" : yr ? "middle" : "start") + '" class="gc-ax">' + (yr ? "Año " + yr : "Hoy") + "</text>";
    });

    var cLine = pts.map(function (p, k) { return (k ? "L" : "M") + x(p.m).toFixed(1) + " " + y(p.c).toFixed(1); }).join("");
    var vLine = pts.map(function (p, k) { return (k ? "L" : "M") + x(p.m).toFixed(1) + " " + y(p.v).toFixed(1); }).join("");
    var back = pts.slice().reverse().map(function (p) { return "L" + x(p.m).toFixed(1) + " " + y(p.c).toFixed(1); }).join("");
    var areaC = cLine + "L" + x(last.m).toFixed(1) + " " + y(0) + "L" + x(0) + " " + y(0) + "Z";
    var areaG = vLine + back + "Z";

    var goal = "";
    if (o.goal && o.goal <= max) {
      goal = '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(o.goal).toFixed(1) + '" y2="' + y(o.goal).toFixed(1) + '" class="gc-goal"/>' +
        '<text x="' + (L + 6) + '" y="' + (y(o.goal) - 6).toFixed(1) + '" class="gc-lbl">Meta ' + mxn0.format(o.goal) + "</text>";
    }

    el.innerHTML =
      '<div class="gc-legend"><span class="gc-k gc-k-c">Lo que aportas</span><span class="gc-k gc-k-g">Rendimiento compuesto</span></div>' +
      '<div class="gc-wrap"><svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Crecimiento proyectado a ' + o.years + " años: " + mxn0.format(last.v) + ", de los cuales " + mxn0.format(last.c) + ' son aportaciones">' +
        grid +
        '<path d="' + areaC + '" class="gc-area-c"/>' +
        '<path d="' + areaG + '" class="gc-area-g"/>' +
        '<path d="' + cLine + '" class="gc-gap"/>' +
        '<path d="' + vLine + '" class="gc-line"/>' + goal +
        '<circle cx="' + x(last.m).toFixed(1) + '" cy="' + y(last.v).toFixed(1) + '" r="4.5" class="gc-dot"/>' +
        '<line class="gc-cross" y1="' + T + '" y2="' + (H - B) + '" x1="0" x2="0" visibility="hidden"/>' +
        '<rect x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - T - B) + '" fill="transparent" class="gc-hit"/>' +
      '</svg><div class="gc-tip" hidden></div></div>';

    var svg = el.querySelector("svg"), cross = el.querySelector(".gc-cross"), tip = el.querySelector(".gc-tip");
    function show(evt) {
      var r = svg.getBoundingClientRect(), px = (evt.clientX - r.left) * W / r.width;
      var m = Math.round((px - L) / (W - L - R) * o.years * 12);
      m = Math.max(0, Math.min(o.years * 12, m));
      var p = pts[m], cx = x(m);
      cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
      var yrs = Math.floor(m / 12), mo = m % 12;
      tip.innerHTML = "<b>" + (m ? (yrs ? yrs + (yrs === 1 ? " año" : " años") : "") + (mo ? (yrs ? " " : "") + mo + (mo === 1 ? " mes" : " meses") : "") : "Hoy") + "</b>" +
        "<span>Total <em>" + mxn0.format(p.v) + "</em></span><span>Aportado <em>" + mxn0.format(p.c) + "</em></span><span>Rendimiento <em>" + mxn0.format(p.v - p.c) + "</em></span>";
      tip.hidden = false;
      var left = cx / W * r.width;
      tip.style.left = Math.min(Math.max(left, 70), r.width - 70) + "px";
    }
    svg.addEventListener("pointermove", show);
    svg.addEventListener("pointerdown", show);
    svg.addEventListener("pointerleave", function () { tip.hidden = true; cross.setAttribute("visibility", "hidden"); });
    return last;
  }

  root.CreskoChart = { render: render, series: series };
})(this);
