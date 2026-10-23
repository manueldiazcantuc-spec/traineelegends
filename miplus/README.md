# MI+ · La tarjeta del Metro, para todo México

MVP para convertir la Tarjeta de Movilidad Integrada (MI) de la CDMX en una tarjeta multiusos de circuito abierto.
Sigue la **Ruta A**: tarjeta digital MI+ para pagar en comercios, con la tarjeta MI de siempre vinculada para el transporte.

## Contenido

- `docs/CASO_PRACTICO.md`: el caso de punta a punta (problema, usuaria, piloto, tecnología, leyes, inversión, riesgos, plan de 90 días).
- `docs/ARQUITECTURA.md`: piezas, flujos, API y lista para producción.
- `core/engine.js`: motor puro. Límites de cuentas Nivel 1 y 2 en UDIS, autorización de compras, monedero de transporte, recarga automática y viajes de regalo.
- `core/providers.js`: emisor, recaudo y red de efectivo simulados. Son las piezas que se reemplazan por los proveedores reales.
- `core/service.js`: une motor y proveedores. Lo usan igual la app y el servidor.
- `server/server.js`: API REST en Node sin dependencias, con webhook de autorización firmado.
- `app/`: app en un teléfono simulado, con simulador (comercio, caja, torniquete, banco) y bitácora del backend.
- `tests/`: pruebas del motor, del servicio y de la API.

## Cómo verlo

Abre `app/index.html` en el navegador, o levanta la API, que también sirve la app:

```sh
node miplus/server/server.js      # http://localhost:3030
```

## Pruebas

```sh
node miplus/tests/engine.test.js
node miplus/tests/service.test.js
node miplus/tests/server.test.js
```

Valores por confirmar antes del piloto: el valor de la UDI, las tarifas vigentes, el porcentaje de viajes de regalo y
los límites de la circular vigente de Banxico. Están en `DEFAULT_CONFIG` y `LEVELS` de `core/engine.js`.
