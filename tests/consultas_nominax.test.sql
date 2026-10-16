-- Prueba del query sql/consultas_nominax_por_dia.sql
-- Correr desde la raíz del repo, en una base de PRUEBA (PostgreSQL):
--   psql -v ON_ERROR_STOP=1 -f tests/consultas_nominax.test.sql
-- Usa tablas temporales: no toca datos reales y desaparecen al cerrar la sesión.
-- Si una prueba falla, se detiene con "FALLA: ..." y el motivo.

CREATE TEMP TABLE partners (id int PRIMARY KEY, name text);
CREATE TEMP TABLE api_requests (id serial PRIMARY KEY, partner_id int, created_at timestamp, status text);

INSERT INTO partners VALUES (1, 'Nominax'), (2, 'Otro partner');

-- Datos con respuesta conocida (H = hoy)
INSERT INTO api_requests (partner_id, created_at, status) VALUES
  -- Bordes de la ventana
  (1, CURRENT_DATE - 30 + TIME '23:59:59', 'success'),  -- hace 30 días: FUERA
  (1, CURRENT_DATE - 29 + TIME '00:00:00', 'success'),  -- primer segundo de la ventana: DENTRO
  (1, CURRENT_DATE      + TIME '23:59:59', 'error'),    -- último segundo de hoy: DENTRO
  (1, CURRENT_DATE + 1  + TIME '00:00:00', 'timeout'),  -- mañana: FUERA
  -- Un día normal (H-10): 2 exitosas, 1 error, 1 timeout
  (1, CURRENT_DATE - 10 + TIME '09:15', 'success'),
  (1, CURRENT_DATE - 10 + TIME '12:30', 'success'),
  (1, CURRENT_DATE - 10 + TIME '18:00', 'error'),
  (1, CURRENT_DATE - 10 + TIME '22:45', 'timeout'),
  -- Otro partner, el mismo día y en un día sin consultas de Nominax: no debe contarse
  (2, CURRENT_DATE - 10 + TIME '10:00', 'success'),
  (2, CURRENT_DATE - 5  + TIME '10:00', 'success'),
  (2, CURRENT_DATE - 5  + TIME '11:00', 'error');

-- Corre el query real (sin el ";" final) y guarda su resultado
\set query `sed 's/;[[:space:]]*$//' sql/consultas_nominax_por_dia.sql`
CREATE TEMP TABLE resultado AS :query ;

-- La versión con el error típico: COUNT(*) en lugar de COUNT(c.dia)
CREATE TEMP TABLE resultado_con_error AS
WITH dias AS (SELECT generate_series(CURRENT_DATE - 29, CURRENT_DATE, INTERVAL '1 day')::date AS dia),
consultas AS (
  SELECT r.created_at::date AS dia FROM api_requests r JOIN partners p ON p.id = r.partner_id
  WHERE p.name = 'Nominax' AND r.created_at >= CURRENT_DATE - 29 AND r.created_at < CURRENT_DATE + 1)
SELECT d.dia, COUNT(*) AS total_consultas FROM dias d LEFT JOIN consultas c ON c.dia = d.dia GROUP BY d.dia;

DO $$
DECLARE
  r record;
  n int;
BEGIN
  -- 1. Exactamente 30 días, de H-29 a hoy, sin huecos
  SELECT count(*) INTO n FROM resultado;
  IF n <> 30 THEN RAISE EXCEPTION 'FALLA: se esperaban 30 días y hay %', n; END IF;
  IF (SELECT min(dia) FROM resultado) <> CURRENT_DATE - 29 THEN RAISE EXCEPTION 'FALLA: el primer día no es H-29'; END IF;
  IF (SELECT max(dia) FROM resultado) <> CURRENT_DATE THEN RAISE EXCEPTION 'FALLA: el último día no es hoy'; END IF;
  RAISE NOTICE 'ok 1 · 30 días, de % a %', CURRENT_DATE - 29, CURRENT_DATE;

  -- 2. Total: solo las 6 consultas de Nominax dentro de la ventana
  SELECT sum(total_consultas) INTO n FROM resultado;
  IF n <> 6 THEN RAISE EXCEPTION 'FALLA: total esperado 6, obtenido %', n; END IF;
  RAISE NOTICE 'ok 2 · total de 6 consultas (bordes y otro partner excluidos)';

  -- 3. Bordes: el primer segundo de la ventana y el último de hoy sí cuentan
  SELECT * INTO r FROM resultado WHERE dia = CURRENT_DATE - 29;
  IF r.total_consultas <> 1 OR r.exitosas <> 1 THEN RAISE EXCEPTION 'FALLA: H-29 debía tener 1 exitosa: %', r; END IF;
  SELECT * INTO r FROM resultado WHERE dia = CURRENT_DATE;
  IF r.total_consultas <> 1 OR r.errores <> 1 THEN RAISE EXCEPTION 'FALLA: hoy debía tener 1 error: %', r; END IF;
  RAISE NOTICE 'ok 3 · bordes de la ventana correctos';

  -- 4. Desglose por resultado de un día normal, sin mezclar al otro partner
  SELECT * INTO r FROM resultado WHERE dia = CURRENT_DATE - 10;
  IF (r.total_consultas, r.exitosas, r.errores, r.timeouts) <> (4, 2, 1, 1) THEN
    RAISE EXCEPTION 'FALLA: H-10 esperaba (4,2,1,1) y dio (%,%,%,%)', r.total_consultas, r.exitosas, r.errores, r.timeouts;
  END IF;
  RAISE NOTICE 'ok 4 · H-10: 4 consultas = 2 exitosas + 1 error + 1 timeout';

  -- 5. Día sin consultas de Nominax (solo del otro partner): aparece con 0
  SELECT * INTO r FROM resultado WHERE dia = CURRENT_DATE - 5;
  IF r IS NULL OR (r.total_consultas, r.exitosas, r.errores, r.timeouts) <> (0, 0, 0, 0) THEN
    RAISE EXCEPTION 'FALLA: H-5 debía aparecer con ceros: %', r;
  END IF;
  RAISE NOTICE 'ok 5 · día sin consultas aparece con 0';

  -- 6. Las columnas cuadran: total = exitosas + errores + timeouts en cada día
  SELECT count(*) INTO n FROM resultado WHERE total_consultas <> exitosas + errores + timeouts;
  IF n > 0 THEN RAISE EXCEPTION 'FALLA: % días no cuadran', n; END IF;
  RAISE NOTICE 'ok 6 · total = exitosas + errores + timeouts en los 30 días';

  -- 7. Contraprueba: con COUNT(*) el día vacío saldría con 1 (por eso se usa COUNT(c.dia))
  SELECT total_consultas INTO n FROM resultado_con_error WHERE dia = CURRENT_DATE - 5;
  IF n <> 1 THEN RAISE EXCEPTION 'FALLA: la contraprueba no reprodujo el error'; END IF;
  RAISE NOTICE 'ok 7 · contraprueba: COUNT(*) habría reportado 1 consulta en un día vacío';
END $$;

\echo 'Muestra del resultado (últimos 12 días):'
SELECT * FROM resultado WHERE dia >= CURRENT_DATE - 11 ORDER BY dia;
