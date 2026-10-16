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

## Estructura

```
nominax/
  rules.js    Reglas puras (sin pantalla ni red): deciden si un dato puede usarse.
  plan.js     Datos del plan: padrón de ejemplo, diccionario, calendario, preguntas.
  app.js      Pantalla: dibuja la consola y llama a rules.js en cada clic.
  index.html  Esqueleto de la página.  app.css  Estilos (modo claro y oscuro).
tests/nominax.test.js   Pruebas de rules.js con los datos de plan.js.
```

Un registro de nómina pasa por tres filtros, en este orden; el primero que falla da el motivo del rechazo:

1. **Empresa** (`employerAllowed`): ¿hay criterio de Legal? ¿la empresa no está excluida? Con criterio PATRON, ¿autorizó?
2. **Trabajador** (`consentAt`): ¿dio consentimiento expreso antes de esta fecha y no lo ha revocado?
3. **Campos** (diccionario vigente): se usan solo las variables acordadas; las demás se descartan.

Rendimiento: las empresas se buscan con un índice por RFC; la fecha y el diccionario vigentes se
calculan una vez por lote (`evaluateBatch`); la bitácora guarda los últimos 500 eventos. 180,000
registros se evalúan en ~0.15 s.
