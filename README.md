# Cresko · Smart Savings

Wealthtech de ahorro e inversión automática ligada al consumo: en cada compra con débito se aparta un porcentaje
que el usuario elige y se invierte, a su nombre, en un portafolio de una casa de bolsa u operadora de fondos
aliada y regulada por la CNBV. Este repositorio sigue la
**propuesta 3: vincular la tarjeta de débito que el usuario ya tiene**.

## Contenido

- `index.html`: sitio web (propuesta de valor, calculadora, confianza, lista de espera con prueba de precio).
- `app/`: MVP en un teléfono simulado, con un panel del piloto y una bitácora del backend.
  - `engine.js`: motor de reglas (porcentaje por compra, mínimo, tope mensual, pausa, cargo diario agrupado, unidades del fondo).
  - `provider.js`: proveedor de tarjeta simulado. Es la pieza que se reemplaza para la prueba real.
  - `partner.js`: casa de bolsa aliada simulada (contrato, órdenes, portafolios por perfil).
  - `app.js`, `app.css`: pantallas y estilos.
- `nominax/`: consola interna del acuerdo BDI × Nominax (criterio legal, exclusión por RFC patronal, consentimiento,
  diccionario de datos con aviso previo, efecto contagio y plan de acción). Reglas en `nominax/rules.js`.
- `docs/NOMINAX.md`: cómo cada punto del plan de acción se traduce en código.
- `docs/ARQUITECTURA.md`: cómo pasar a una prueba con tarjeta real.
- `tests/engine.test.js`: pruebas del motor.
- `tests/nominax.test.js`: pruebas de las reglas Nominax.

## Cómo verlo

Abre `index.html` en el navegador (no requiere build ni servidor). Desde ahí, **Probar el prototipo** abre el MVP.
En el MVP puedes registrarte paso a paso o cargar 6 semanas de datos de ejemplo.

```sh
node tests/engine.test.js
node tests/nominax.test.js
```

Cifras de la calculadora y del fondo: hipotéticas. No es asesoría de inversión.
