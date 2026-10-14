# Cresko · Arquitectura para la prueba con tarjeta real

Propuesta 3 (ruta C del análisis): **vincular la tarjeta de débito que el usuario ya tiene**.
Este documento explica cómo pasar del MVP simulado a una prueba con una tarjeta real.

## Qué hace hoy el MVP

| Pieza | Archivo | En el MVP | En la prueba real |
|---|---|---|---|
| Motor de reglas | `app/engine.js` | Corre en el navegador | Se mueve al backend sin cambios (no usa DOM) |
| Proveedor de tarjeta | `app/provider.js` | `MockCardProvider` simula banco y procesador | Se reemplaza por un proveedor real con la misma interfaz |
| Estado | `localStorage` | Un solo usuario por navegador | Base de datos (usuarios, movimientos, cargos, posiciones) |
| Fondo | `nextNav()` | Precio simulado (~8% anual, 12% vol.) | Precio diario que publica la distribuidora aliada |

## Flujo de una compra

1. **El banco avisa.** El agregador envía un webhook `transaction.created` con monto, comercio y fecha.
2. **El motor decide.** `evaluatePurchase()` calcula el porcentaje de la compra (`feeFor()`) y aplica la compra mínima, la pausa y el tope mensual.
3. **Un cargo al día.** A las 23:00 `settle()` suma los pendientes y hace **un solo cargo** a la tarjeta tokenizada.
4. **Se invierte.** El cargo aprobado compra unidades del fondo al precio del día. Un cargo rechazado no invierte y se avisa al usuario.

El cargo agrupado no es opcional: cobrar por separado el 3% de cada compra (unos $2 a $6 en compras típicas) costaría más en comisiones del procesador
(típicamente un porcentaje más una cuota fija por transacción) que el propio apartado.

## La interfaz que hay que implementar

```js
provider.institutions()                         // bancos disponibles
provider.linkCard({ bank, last4, holder }, onStep) // → { cardId, token, bank, last4, holder }
provider.onTransaction(fn)                      // fn({ id, date, merchant, category, amount })
provider.charge(cardId, amount)                 // → { id, status: "aprobado" | "rechazado" }
provider.unlink(cardId)                         // revoca consentimiento y borra el token
```

## Opciones para la prueba con tarjeta real

México todavía no tiene reglas de finanzas abiertas para datos transaccionales, así que la lectura de compras
depende de un tercero. Para un piloto chico estas son las rutas, de la más rápida a la más robusta:

1. **Alertas del banco por correo (piloto interno).** Casi todos los bancos mandan un correo por cada compra.
   El usuario reenvía esas alertas a un buzón de Cresko y un parser las convierte en `transaction.created`.
   Sirve para probar con 5 a 10 tarjetas del equipo en días, sin contratos.
2. **Agregador financiero.** Un proveedor de conexión bancaria (por ejemplo Belvo o Syncfy) lee los movimientos
   con el consentimiento del usuario y avisa por webhook. Hay que validar la cobertura por banco y el retraso
   con el que aparecen las compras.
3. **Ruta B del análisis (dentro de un banco aliado).** Si el banco ve cada compra en tiempo real, el webhook viene de él.
   La interfaz del proveedor es la misma.

**Cobro:** tokenizar la tarjeta con un procesador de pagos que opere en México (por ejemplo Stripe, Conekta u Openpay)
y hacer el cargo diario con el token. Validar con el procesador que los cargos recurrentes de monto variable
estén permitidos y cuánto cuestan.

**Inversión:** mientras no exista la alianza con la distribuidora o el asesor registrado ante la CNBV, el piloto
guarda los cargos en una cuenta concentradora y registra unidades "sombra" al precio real de un fondo indexado.
Nada de esto sustituye la revisión de un despacho regulatorio.

## Pasos sugeridos

1. Backend mínimo (por ejemplo Node + Postgres) que exponga `POST /webhooks/transacciones` y un job diario de cierre.
2. Mover `engine.js` al backend y conservar `tests/engine.test.js`.
3. Implementar `EmailAlertProvider` (ruta 1) para la prueba interna.
4. Tokenizar una tarjeta real en modo prueba del procesador y luego en producción con el 1% de compras chicas.
5. Cambiar `MockCardProvider` por un cliente HTTP del backend en `app/app.js`.
