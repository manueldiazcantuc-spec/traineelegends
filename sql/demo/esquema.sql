-- Base ficticia de BDI para practicar con la API de data partners.
-- Mismas tablas y columnas del ejercicio, más columnas de apoyo para entender
-- cada consulta (endpoint, código HTTP, latencia, trabajador y empresa).
-- Cargar en una base de PRUEBA:
--   psql -d bdi_demo -f sql/demo/esquema.sql -f sql/demo/datos.sql

DROP TABLE IF EXISTS api_requests;
DROP TABLE IF EXISTS partners;

-- Catálogo de data partners (proveedores de datos de nómina)
CREATE TABLE partners (
  id           int  PRIMARY KEY,
  name         text NOT NULL UNIQUE,      -- nombre del partner, p. ej. 'Nominax'
  etapa        text NOT NULL,             -- 'piloto' (etapa de prueba) o 'produccion'
  inicio       date NOT NULL              -- fecha en que empezamos a consultarlo
);

-- Una fila por cada consulta que BDI envía a un partner
CREATE TABLE api_requests (
  id            bigserial PRIMARY KEY,
  partner_id    int       NOT NULL REFERENCES partners(id),
  created_at    timestamp NOT NULL,       -- hora de la consulta (hora de Ciudad de México)
  status        text      NOT NULL CHECK (status IN ('success', 'error', 'timeout')),
  -- Columnas de apoyo (no las usa el query de la directora)
  endpoint      text      NOT NULL,       -- qué se pidió: '/v1/ingresos' o '/v1/empleo'
  http_status   int,                      -- 200 éxito; 4xx/5xx error; vacío si no hubo respuesta (timeout)
  latency_ms    int       NOT NULL,       -- cuánto tardó la respuesta; 30000 = se agotó la espera
  worker_ref    text      NOT NULL,       -- trabajador consultado (seudónimo, nunca el nombre)
  employer_rfc  text      NOT NULL        -- RFC patronal de la empresa del trabajador
);

-- Índice que aprovecha el filtro por rango de fechas del query
CREATE INDEX api_requests_partner_fecha ON api_requests (partner_id, created_at);
