# MI+ · Arquitectura

## Piezas

| Pieza | Archivo | En el MVP | En producción |
|---|---|---|---|
| Motor | `core/engine.js` | Corre en el navegador y en Node | Igual, en el backend (no usa DOM ni red) |
| Servicio | `core/service.js` | Une motor y proveedores | Igual |
| Emisor y procesador | `core/providers.js` → `MockIssuer` | Simula cuenta, tarjeta y webhook de autorización | Cliente del procesador (BIN sponsor + emisor regulado) con los mismos métodos |
| Recaudo del transporte | `MockTransit` | Simula vinculación, lista de acciones y validaciones | Integración con el sistema de recaudo de Semovi |
| Recargas en efectivo | `MockCashIn` | Simula referencias y pago en caja | Cliente de la red de efectivo |
| API | `server/server.js` | Node sin dependencias, usuarios en memoria | Igual, con base de datos, colas y monitoreo |
| App | `app/` | Teléfono simulado + simulador + bitácora | App móvil nativa o web |

Montos: centavos enteros dentro del motor; pesos en la API.

## Flujos

**Compra con tarjeta**
1. El usuario acerca su celular o su tarjeta a la terminal.
2. El procesador manda `POST /webhooks/autorizacion` firmado con HMAC-SHA256 (`x-firma`).
3. `handleAuthorization()` → `applyPurchase()`: aprueba si la tarjeta está activa y hay saldo. Idempotente por `autorizacionId`.
4. Se responde de inmediato. El cashback y la recarga automática se mandan al recaudo en segundo plano.

**Recarga en efectivo**
1. `POST /api/usuarios/:id/referencias-efectivo` revisa los límites del nivel antes de mandar al cliente a la caja.
2. La red de efectivo avisa del pago (webhook) → `deposit(…, "efectivo")`.

**Torniquete**
1. El validador escribe en el chip las cargas pendientes de la lista de acciones y cobra la tarifa.
2. En producción, el backend se entera después, por el reporte de validaciones de Semovi. El motor actualiza su espejo con `applyTap()`.

## API

| Método | Ruta | Para qué |
|---|---|---|
| GET | `/api/salud` | Revisión de vida |
| POST | `/api/usuarios` | Alta con `nombre` y `curp` |
| GET | `/api/usuarios/:id` | Saldo, transporte, límites, tarjeta y movimientos |
| POST | `/api/usuarios/:id/nivel2` | Subir a Nivel 2 con `ine` (pide la tarjeta física) |
| POST | `/api/usuarios/:id/tarjeta-mi` | Vincular la tarjeta MI con `numero` |
| POST | `/api/usuarios/:id/referencias-efectivo` | Referencia de pago en tienda por `monto` |
| POST | `/api/usuarios/:id/spei` y `/apoyo` | Abonos (en producción llegan como webhooks) |
| POST | `/api/usuarios/:id/tarjeta` | Bloquear o desbloquear (`bloqueada`) |
| PATCH | `/api/usuarios/:id/recarga-automatica` | `activa`, `umbral`, `monto` |
| POST | `/webhooks/autorizacion` | Webhook firmado del procesador |
| POST | `/api/simulador/compra`, `/pago-efectivo`, `/torniquete` | Solo para pruebas |

## Para pasar a producción

- Escribir `RealIssuer`, `RealTransit` y `RealCashIn` con los mismos métodos que los simulados.
- Base de datos con bitácora inmutable de movimientos y conciliación diaria contra el emisor.
- Guardar `WEBHOOK_SECRET` en un gestor de secretos y verificar la firma de cada proveedor.
- Nunca guardar el número completo de la tarjeta (alcance PCI mínimo): solo `cardId` y `last4`.
- Actualizar a diario el valor de la UDI (`config.udi`) y revisar las tarifas vigentes (`config.fares`).
- Monitoreo y alertas: autorizaciones lentas (el procesador espera ~2 s), webhooks fallidos, descuadres de saldo.
