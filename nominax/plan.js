/*
 * BDI × Nominax · datos del plan de acción interno (15 oct 2026)
 *
 * Contenido del plan y del mapa del deal como datos, para que la consola los
 * muestre y se puedan marcar avances. Empresas y RFC: ficticios, para la demo.
 */
(function (root) {
  "use strict";

  var PLAN = {
    objective: "Responder a Rodrigo esta semana con información validada, sin improvisar posturas legales, y evitar que el caso del cliente de 4,000 empleados congele el acuerdo.",
    base: 180000,
    opposingWorkers: 4000,

    // Padrón ficticio que suma 180,000 trabajadores. El cliente que se opone es el primero.
    employers: [
      { rfc: "MAN980312QX4", name: "Cliente que se opone · Manufactura", workers: 4000, note: "Pidió que no se usen datos de sus empleados" },
      { rfc: "RET050617HB2", name: "Cliente B · Retail", workers: 52000 },
      { rfc: "LOG110903KT7", name: "Cliente C · Logística", workers: 38000 },
      { rfc: "SAL070221MN5", name: "Cliente D · Salud", workers: 27000 },
      { rfc: "EDU130415PL9", name: "Cliente E · Educación", workers: 21000 },
      { rfc: "ALI090830RS3", name: "Cliente F · Alimentos", workers: 18000 },
      { rfc: "CON160112VW8", name: "Cliente G · Construcción", workers: 12000 },
      { rfc: "SER190705ZA1", name: "Cliente H · Servicios", workers: 8000 }
    ],

    // Variables de ejemplo: Producto confirma los campos exactos y la versión vigente.
    dictionary: {
      version: "v1",
      effectiveAt: "2026-10-01T00:00:00Z",
      fields: ["ingreso_mensual_neto", "periodicidad_pago", "antiguedad_meses", "tipo_contrato", "fecha_ultimo_pago", "estatus_laboral"]
    },

    calendar: [
      { day: "Día 0", title: "Primeras 2 horas", tasks: [
        { id: "d0-acuse", owner: "Yo", text: "Acuse a Rodrigo: confirmo recepción y fecha de respuesta, y propongo una llamada entre equipos legales. Sin compromisos de fondo." },
        { id: "d0-directora", owner: "Directora", text: "15 min para alinear la lectura del caso y los contactos por área." },
        { id: "d0-reqs", owner: "Yo", text: "Reunir requerimientos (lista de abajo) y kickoff interno." }
      ] },
      { day: "Día 1", title: "Legal primero", tasks: [
        { id: "d1-legal", owner: "Legal", text: "Criterio sobre consentimiento y cliente que se opone (de él dependen los temas 1 y 3)." },
        { id: "d1-producto", owner: "Producto", text: "En paralelo: campos exactos, versión vigente, roadmap y documentación." }
      ] },
      { day: "Día 2", title: "Tech, margen y borrador", tasks: [
        { id: "d2-tech", owner: "Tech", text: "Exclusión por RFC patronal con la regla legal ya definida, y en cuánto tiempo." },
        { id: "d2-margen", owner: "Directora / Comercial", text: "Margen: qué tan crítico es Nominax y qué podemos ceder." },
        { id: "d2-borrador", owner: "Legal", text: "Revisa el borrador de respuesta." }
      ] },
      { day: "Día 3", title: "Respuesta", tasks: [
        { id: "d3-envio", owner: "Yo", text: "Envío la respuesta y llamada con Nominax." }
      ] }
    ],

    requirements: [
      { id: "r-nda", text: "NDA" },
      { id: "r-acuerdo", text: "Borrador del acuerdo" },
      { id: "r-consent", text: "Flujo de consentimiento" },
      { id: "r-aviso", text: "Aviso de privacidad" },
      { id: "r-dicc", text: "Diccionario de datos" },
      { id: "r-prec", text: "Precedentes con otros partners de nómina (si no hay: ISO 27001, LFPDPPP, manejo interno de información y cifrado)" },
      { id: "r-contratos", text: "Contratos de Nominax con sus clientes (riesgo oculto)" }
    ],

    topics: [
      { n: 1, topic: "Consentimiento", who: "Legal", ask: "¿Quién es responsable (¿el patrón?) y quién encargado (¿Nominax?)? ¿BDI recaba el consentimiento expreso del trabajador? ¿Transferencia o remisión? ¿Impacto de la LFPDPPP 2025?" },
      { n: 2, topic: "Variables", who: "Producto", ask: "Campos exactos, versión vigente, roadmap a 6 meses y aviso previo de cambios (ej. 30 días)." },
      { n: 3, topic: "Cliente que se opone", who: "Legal + Tech", ask: "¿Basta el consentimiento del trabajador o debe autorizar el patrón? ¿Podemos excluir por RFC patronal y en cuánto tiempo?" },
      { n: 4, topic: "Valor y margen", who: "Directora / Comercial", ask: "¿Qué tan crítico es Nominax? ¿Qué podemos ceder?" }
    ],

    questions: [
      "¿La restricción del cliente es contractual o una solicitud informal?",
      "¿Otros clientes tienen cláusulas similares?",
      "¿Qué permiten sus contratos sobre compartir datos con terceros?",
      "¿Quién de su equipo legal estará en la llamada?"
    ],

    iResolve: ["Comunicación y tiempos con Rodrigo", "Recopilar información", "Preguntas aclaratorias", "Agendar reuniones", "Redactar la respuesta"],
    escalate: [
      { what: "Posturas legales", to: "Legal" },
      { what: "Variables y roadmap", to: "Producto" },
      { what: "Exclusión por empresa", to: "Tech" },
      { what: "Concesiones o cambios al contrato", to: "Directora" }
    ],

    // Del mapa del deal
    concessions: {
      viable: ["Exclusión por empresa (RFC patronal)", "Aviso previo de cambios a variables", "Piloto"],
      nonNegotiable: ["Opt-in obligatorio del trabajador", "Ningún dato sin consentimiento"]
    },
    hiddenRisk: "Si el patrón es el responsable de los datos, el problema no es un cliente sino toda la base de 180k trabajadores. El cliente de 4,000 es ~2%, pero si puede bloquear sus datos, los demás pueden pedir lo mismo.",
    planB: "Si se cae el deal: Runa o Worky. Nómina en la nube para pymes, con integración más rápida pero empresas más pequeñas."
  };

  if (typeof module !== "undefined" && module.exports) module.exports = PLAN;
  else root.NominaxPlan = PLAN;
})(this);
