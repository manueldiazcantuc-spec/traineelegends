# MI+ · Caso práctico

Convertir la Tarjeta de Movilidad Integrada (MI) de la CDMX en una tarjeta multiusos de circuito abierto: la misma
tarjeta sirve para el Metro y para pagar en cualquier comercio del país, sin colgarse de la infraestructura del
transporte.

Este documento cuenta el caso de punta a punta. El código en `miplus/` lo implementa con proveedores simulados.

## 1. El problema, en datos

| Dato | Valor | Fuente |
|---|---|---|
| Adultos que pagan en efectivo compras menores a $500 | 85% | ENIF 2024 (INEGI y CNBV) |
| Adultos sin ningún producto financiero | 23.5% | ENIF 2024 |
| Accesos pagados con tarjeta MI | 1,708 millones | Semovi vía Expansión (ene. 2025) |
| Viajes en el Metro en 2025 | 1,241.6 millones | STC vía Crónica (ene. 2026) |
| Terminales de pago en México (cierre 2024) | 6.5 millones, en 94% de los municipios | CNBV, Panorama de Inclusión Financiera 2025 |

La conducta ya existe: millones de personas recargan y tocan un lector cada día. Falta que esa tarjeta sirva para algo
más que moverse.

## 2. Un día con MI+ (usuaria ficticia)

**Ana, 34 años, vive en Iztapalapa y trabaja en el Centro.** Usa la tarjeta MI todos los días y paga casi todo en efectivo.

| Momento | Qué hace Ana | Qué pasa por dentro | Dónde está en el código |
|---|---|---|---|
| Alta | Descarga la app, escribe su nombre y su CURP | El emisor abre una cuenta Nivel 1 y emite una tarjeta digital | `service.signUp()`, `MockIssuer.openAccount()` |
| Vincula su MI | Escribe el número al reverso de su tarjeta MI | El sistema de recaudo confirma la tarjeta y su saldo en el chip ($10) | `service.linkMi()`, `MockTransit.linkCard()` |
| Recarga | Pide una referencia de $500 y paga en efectivo en la tienda | La red de efectivo avisa por webhook; el motor revisa los límites de su nivel y abona | `cashInReference()`, `handleCashIn()`, `evaluateDeposit()` |
| Recarga automática | No hace nada | Su transporte está debajo de $20, así que se mandan $50 de su saldo al monedero de transporte | `checkAutoReload()`, `MockTransit.pushLoad()` |
| Compra | Paga $120 en la tortillería con el celular | El procesador pide autorización; se aprueba si hay saldo y la tarjeta está activa. Gana 1% en viajes de regalo | `handleAuthorization()`, `applyPurchase()`, `cashbackFor()` |
| Metro | Pasa su tarjeta MI en Pino Suárez | El torniquete escribe en el chip las cargas pendientes ($50 + $1.20) y cobra $5 | `applyTap()` |
| Pierde el celular | Bloquea la tarjeta desde otro dispositivo | El emisor bloquea; toda compra se rechaza | `setCardBlocked()` |
| Sube de nivel | Registra su INE | Nivel 2: más límite, apoyos sociales y tarjeta física con chip dual | `service.upgrade()` |

Para Ana sigue siendo **una sola tarjeta y un solo saldo**. Por dentro hay dos saldos (sección 4).

## 3. Alcance del piloto

**Ruta A (primero, sin esperar a la tarjeta nueva):** tarjeta digital MI+ en el celular, con la tarjeta MI de siempre
vinculada para el transporte. Valida demanda, uso y fraude con usuarios reales.

**Ruta B (después):** tarjeta física MI+ con un solo chip dual: Calypso para el transporte y EMV para pagar. El precedente
es la tarjeta Cosmo Fly de IDEMIA en Lisboa, la primera tarjeta de pago EMV certificada por Calypso.

Criterios de éxito del piloto (llenar con el equipo):

| Indicador | Meta |
|---|---|
| Cuentas abiertas | [__] |
| Usuarios con MI vinculada | [__%] |
| Compras por usuario activo al mes | [__] |
| Parte del gasto que deja de ser efectivo | [__%] |
| Tasa de fraude | menor a [__%] del monto |
| Costo por usuario activo | [$__] |

## 4. Cómo funciona la tecnología

### Dos saldos, una experiencia

| Saldo | Dónde vive | Quién lo controla | En el código |
|---|---|---|---|
| Saldo de pago | Sistema del emisor regulado | Banco o IFPE socia | `state.wallet` |
| Monedero de transporte | Chip Calypso de la tarjeta MI | Semovi | `state.purse` (espejo + cargas pendientes) |

Los torniquetes funcionan sin conexión. Por eso una recarga no llega al chip al instante: entra a la **lista de acciones**
del sistema de recaudo y se escribe en el chip la próxima vez que la tarjeta pasa por un torniquete. Es el patrón común en
sistemas de transporte con tarjeta sin contacto; hay que confirmar con Semovi cómo lo soporta su sistema. El motor lo
modela con cargas `pendiente` → `aplicada`.

La **recarga automática** une los dos saldos para el usuario. Cuando el transporte (chip + pendientes) baja del umbral,
el motor manda una carga desde el saldo de pago.

### Lo que se renta y lo que se construye

| Pieza | Decisión | Proveedor posible |
|---|---|---|
| Cuenta y custodia del dinero | Socio regulado | Banco o IFPE |
| Emisión y procesamiento de tarjetas | Rentar | Procesador con BIN sponsor (por ejemplo Pomelo, que opera en México y tiene alianza con Visa) |
| Red de pago | Rentar | Visa, Mastercard o Carnet |
| Motor, reglas, app y API | **Construir** (este repositorio) | Equipo MI+ |
| Verificación de identidad y antifraude | Rentar | Proveedor especializado |
| Recargas en efectivo | Rentar | Cadenas de tiendas o agregadores de pagos en efectivo |
| Recaudo del transporte | Convenio | Semovi |
| Tarjeta física chip dual | Comprar | IDEMIA, Thales o G+D, con chip certificado Calypso + EMV |

## 5. Cumplimiento legal en México

| Requisito | Quién lo cumple | Cómo se refleja en el código |
|---|---|---|
| Solo un banco o una IFPE puede guardar el dinero (Ley Fintech) | Socio emisor | El saldo de pago vive en el emisor. MI+ guarda un registro, no el dinero |
| Cuentas de bajo riesgo: Nivel 1 (abonos de 750 UDIS/mes, saldo de 1,000 UDIS) y Nivel 2 (3,000 UDIS/mes, más 6,000 UDIS de subsidios) | Emisor, con reglas en MI+ | `LEVELS` y `evaluateDeposit()` en `core/engine.js` |
| Recibir efectivo requiere autorización específica de la CNBV para una IFPE | Socio emisor y red de efectivo | `MockCashIn` |
| Prevención de lavado de dinero: identidad, monitoreo y reportes | Emisor y oficial de cumplimiento | Validación de CURP e INE en `MockIssuer`; bitácora de eventos |
| Datos personales: aviso de privacidad y consentimiento; al gobierno solo datos agregados | MI+ | Aviso en la pantalla de alta; la API no expone CURP completa en la bitácora |
| Seguridad de tarjetas (PCI DSS, EMV y Calypso) | Procesador, fabricante y MI+ | MI+ nunca toca el número completo de la tarjeta: solo `last4` y un `cardId` |
| Webhooks auténticos | MI+ | Firma HMAC-SHA256 en `/webhooks/autorizacion` |
| Convenio con gobierno para usar la marca MI y las taquillas | MI+ con abogado | Fuera del código |

Las cifras regulatorias se tomaron de fuentes de 2011 a 2021 y deben confirmarse con un despacho especializado y con la
circular vigente de Banxico antes del piloto.

## 6. Inversión estimada

Estimación propia para un piloto de 12 a 18 meses **con socio emisor** (sin licencia propia), a validar con cotizaciones:

| Rubro | Qué incluye |
|---|---|
| Equipo | Producto, ingeniería, cumplimiento, operaciones |
| Tecnología | Procesador de tarjetas, nube, verificación de identidad, antifraude, certificación PCI |
| Tarjetas | [__] mil tarjetas físicas con chip dual para la Ruta B |
| Cumplimiento | Oficial de cumplimiento, auditorías, asesoría legal |
| Adquisición | Promoción, viajes de regalo de arranque, red de efectivo |

Orden de magnitud: **US$1.5 a 3 millones (≈ $27 a 55 millones de pesos)**. Con licencia propia de IFPE se suma un
capital mínimo de 500,000 UDIS (≈ $4.3 millones de pesos) y más de un año de trámite.

## 7. Riesgos y cómo se mitigan

| Riesgo | Mitigación |
|---|---|
| Semovi no comparte las llaves Calypso ni la lista de acciones | La Ruta A funciona sin eso: el usuario recarga su MI desde la app CDMX y paga comercios con MI+ |
| El cliente paga en caja pero rebasa su límite | Se revisa el límite al crear la referencia (`cashInReference`). Si aun así se rechaza, la red devuelve el efectivo |
| El procesador reintenta una autorización | La autorización es idempotente por `authId`: no cobra dos veces |
| Fraude con tarjetas robadas | Bloqueo inmediato desde la app; reglas antifraude del procesador |
| El cashback cuesta más de lo planeado | Tope mensual configurable (`cashback.monthlyCap`), financiado por comercios aliados |

## 8. Plan de 90 días

1. **Semanas 1–4:** firmar con socio emisor y procesador; abrir conversación técnica con Semovi y la agencia digital de la CDMX.
2. **Semanas 5–8:** sustituir `MockIssuer` por el procesador real en sandbox; base de datos y monitoreo.
3. **Semanas 9–12:** piloto cerrado con [__] usuarios (equipo y familias), medir los indicadores de la sección 3.
