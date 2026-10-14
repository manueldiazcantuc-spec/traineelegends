# Cresko · Arquitectura para la prueba con tarjeta real

Cresko es una **wealthtech**: la app convierte cada compra con débito en inversión, y el dinero se invierte y
se custodia a nombre del usuario en casas de bolsa u operadoras de fondos reguladas por la CNBV (tipo GBM)
con las que Cresko tiene una relación comercial. Cresko no custodia dinero.

Captura de compras: propuesta 3 (ruta C del análisis), **vincular la tarjeta de débito que el usuario ya tiene**.

## Piezas

| Pieza | Archivo | En el MVP | En la prueba real |
|---|---|---|---|
| Motor de reglas | `app/engine.js` | Corre en el navegador | Se mueve al backend sin cambios (no usa DOM) |
| Proveedor de tarjeta | `app/provider.js` | `MockCardProvider` simula banco y procesador | Agregador + procesador de pagos con la misma interfaz |
| Socio de inversión | `app/partner.js` | `MockInvestmentPartner` simula la casa de bolsa | Cliente de la API del socio con la misma interfaz |
| Estado | `localStorage` | Un solo usuario por navegador | Base de datos (usuarios, movimientos, cargos, órdenes) |
| Portafolios | `PORTFOLIOS` en `partner.js` | Precio simulado por perfil | Precio diario que publica el socio |

## Flujo de una compra

1. **El banco avisa.** El agregador envía un webhook `transaction.created` con monto, comercio y fecha.
2. **El motor decide.** `evaluatePurchase()` calcula el porcentaje de la compra (`feeFor()`) y aplica la compra mínima, la pausa y el tope mensual.
3. **Un cargo al día.** A las 23:00 `settle()` suma los pendientes y hace **un solo cargo** a la tarjeta tokenizada.
4. **Se invierte con el socio.** El cargo aprobado se transfiere (SPEI) a la cuenta concentradora del socio y se envía
   una orden de compra del portafolio del usuario en su contrato. Un cargo rechazado no invierte y se avisa al usuario.

El cargo agrupado no es opcional: cobrar por separado el 3% de cada compra (unos $2 a $6 en compras típicas) costaría más en comisiones del procesador
(típicamente un porcentaje más una cuota fija por transacción) que el propio apartado.

## Interfaces

```js
// Tarjeta (provider.js)
provider.institutions()                            // bancos disponibles
provider.linkCard({ bank, last4, holder }, onStep) // → { cardId, token, bank, last4, holder }
provider.onTransaction(fn)                         // fn({ id, date, merchant, category, amount })
provider.charge(cardId, amount)                    // → { id, status: "aprobado" | "rechazado" }
provider.unlink(cardId)                            // revoca consentimiento y borra el token

// Socio de inversión (partner.js)
partner.portfolios()                               // conservador | moderado | crecimiento
partner.openContract({ name, profile })            // → { contract }  (KYC y contrato en el socio)
partner.buy(contract, profile, amount, nav)        // orden de compra con el cargo del día
partner.rebalance(contract, from, to)              // cambio de perfil
```

## Relación con el socio de inversión

Lo que hay que acordar con la casa de bolsa u operadora:

- **Figura de Cresko:** distribuidor o referenciador comercial del socio; el contrato de inversión es entre el usuario y el socio.
- **Alta de clientes:** API o flujo para abrir contrato, con KYC hecho por el socio o delegado a Cresko.
- **Fondeo:** cuenta concentradora o CLABE por cliente para recibir el cargo diario por SPEI.
- **Órdenes:** compra de montos fraccionados (desde centavos) en fondos de deuda y de renta variable indexada.
- **Datos:** posiciones, precio diario y estados de cuenta por API para mostrarlos en la app.
- **Ingreso:** reparto de la comisión de administración o distribución (revenue share) más, si aplica, una comisión
  de Cresko sobre activos. Objetivo de comisión total para el usuario: cercana a 1% anual.

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

**Inversión:** mientras no esté firmado el convenio con el socio, el piloto guarda los cargos en una cuenta
concentradora y registra unidades "sombra" al precio real de un fondo público. Nada de esto sustituye la
revisión de un despacho regulatorio.

## Pasos sugeridos

1. Backend mínimo (por ejemplo Node + Postgres) que exponga `POST /webhooks/transacciones` y un job diario de cierre.
2. Mover `engine.js` al backend y conservar `tests/engine.test.js`.
3. Implementar `EmailAlertProvider` (ruta 1) para la prueba interna.
4. Tokenizar una tarjeta real en modo prueba del procesador y luego en producción con el 1% de compras chicas.
5. Pedir al socio un ambiente de pruebas (sandbox) e implementar el cliente que reemplaza `MockInvestmentPartner`.
6. Cambiar los mocks por un cliente HTTP del backend en `app/app.js`.
