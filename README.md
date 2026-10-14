# Cresko · Smart Savings

Prototipo de ahorro e inversión automática ligada al consumo: en cada compra con débito se aparta un porcentaje
que el usuario elige y se invierte en un fondo indexado hacia su meta. Este repositorio sigue la
**propuesta 3: vincular la tarjeta de débito que el usuario ya tiene**.

## Contenido

- `index.html`: sitio web (propuesta de valor, calculadora, confianza, lista de espera con prueba de precio).
- `app/`: MVP en un teléfono simulado, con un panel del piloto y una bitácora del backend.
  - `engine.js`: motor de reglas (porcentaje por compra, mínimo, tope mensual, pausa, cargo diario agrupado, unidades del fondo).
  - `provider.js`: proveedor de tarjeta simulado. Es la pieza que se reemplaza para la prueba real.
  - `app.js`, `app.css`: pantallas y estilos.
- `docs/ARQUITECTURA.md`: cómo pasar a una prueba con tarjeta real.
- `tests/engine.test.js`: pruebas del motor.

## Cómo verlo

Abre `index.html` en el navegador (no requiere build ni servidor). Desde ahí, **Probar el prototipo** abre el MVP.
En el MVP puedes registrarte paso a paso o cargar 6 semanas de datos de ejemplo.

```sh
node tests/engine.test.js
```

Cifras de la calculadora y del fondo: hipotéticas. No es asesoría de inversión.
