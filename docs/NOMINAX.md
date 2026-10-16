# BDI × Nominax · del plan de acción al código

Base: *Plan de acción interno: Nominax* (15 oct 2026) y el *Mapa del deal Nominax*.

| Punto del plan | Dónde vive en el código |
|---|---|
| No improvisar posturas legales | `CRITERIA.PENDIENTE`: mientras Legal no defina el criterio, `evaluateRecord()` rechaza todo |
| Tema 1 · Consentimiento | `grantConsent()` / `revokeConsent()`: opt-in expreso y revocable, con versión del aviso de privacidad |
| Tema 3 · Cliente que se opone (si basta el consentimiento del trabajador) | `CRITERIA.TRABAJADOR` + `excludeEmployer()`: bloqueo inmediato por RFC patronal y plazo de borrado (`purgeHours`, a confirmar con Tech) |
| Tema 3 · Si debe autorizar el patrón | `CRITERIA.PATRON` + `authorizeEmployer()`: solo entran empresas autorizadas (arranque gradual) |
| Tema 2 · Variables y aviso previo | `proposeDictionaryChange()`: rechaza cambios con menos de `noticeDays` (30) días; `evaluateRecord()` descarta campos fuera del diccionario vigente |
| Riesgo oculto (contagio sobre 180k) | `coverage()` y `contagion()` |
| No negociables: opt-in y nada sin consentimiento | Ninguna ruta de `evaluateRecord()` acepta un registro sin consentimiento |
| Calendario, requerimientos, preguntas para Rodrigo, escalamiento, plan B | `nominax/plan.js` (datos que pinta la consola) |

Pendiente de confirmar con cada área: campos exactos (Producto), plazo de exclusión (Tech),
criterio legal y figura responsable/encargado (Legal). Empresas y RFC del padrón son ficticios.
