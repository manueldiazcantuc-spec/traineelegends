-- Datos ficticios relativos a la fecha de hoy, así el query de "últimos 30 días"
-- siempre encuentra información. La semilla fija hace que salgan los mismos
-- números cada vez que se carga en el mismo día.
--
-- La historia del piloto con Nominax (H = hoy):
--   H-34  arranca el piloto con ~15 consultas al día y crece cada día
--         (los primeros 5 días quedan FUERA de la ventana de 30 días)
--   H-17  BDI sube un cambio con un error: 1 de cada 4 consultas falla (error 400)
--   H-9   incidente en Nominax: casi la mitad de las consultas se quedan sin respuesta (timeout)
--   H-6   ventana de mantenimiento (sábado): ese día no se envía ninguna consulta
--   Fines de semana: un tercio del volumen
-- Delta Nómina y Sigma Pagos son otros partners (ficticios) que ya están en producción.

INSERT INTO partners (id, name, etapa, inicio) VALUES
  (1, 'Nominax',      'piloto',     CURRENT_DATE - 34),
  (2, 'Delta Nómina', 'produccion', CURRENT_DATE - 400),
  (3, 'Sigma Pagos',  'produccion', CURRENT_DATE - 200);

SELECT setseed(0.42);

INSERT INTO api_requests (partner_id, created_at, status, endpoint, http_status, latency_ms, worker_ref, employer_rfc)
WITH dias AS (
  SELECT h AS hace, CURRENT_DATE - h AS fecha,
         CASE WHEN extract(isodow FROM CURRENT_DATE - h) IN (6, 7) THEN 0.35 ELSE 1 END AS factor
  FROM generate_series(0, 39) h
),
volumen AS (
  SELECT d.hace, d.fecha, p.id AS partner_id,
         CASE
           WHEN p.id = 1 AND (d.hace > 34 OR d.hace = 6) THEN 0              -- antes del piloto y mantenimiento
           WHEN p.id = 1 THEN round((15 + (34 - d.hace) * 3.2) * d.factor)  -- arranque gradual
           WHEN p.id = 2 THEN round(55 * d.factor)
           ELSE               round(28 * d.factor)
         END::int AS n
  FROM dias d CROSS JOIN partners p
),
filas AS (
  SELECT v.*, random() AS r_status, random() AS r_hora, random() AS r_lat, random() AS r_misc
  FROM volumen v CROSS JOIN LATERAL generate_series(1, v.n) i
),
con_estado AS (
  SELECT f.*,
         CASE
           WHEN f.partner_id = 1 AND f.hace = 9 THEN CASE WHEN f.r_status < 0.45 THEN 'timeout' WHEN f.r_status < 0.50 THEN 'error' ELSE 'success' END
           WHEN f.partner_id = 1 AND f.hace = 17 THEN CASE WHEN f.r_status < 0.25 THEN 'error'   WHEN f.r_status < 0.27 THEN 'timeout' ELSE 'success' END
           ELSE                                    CASE WHEN f.r_status < 0.04 THEN 'error'   WHEN f.r_status < 0.06 THEN 'timeout' ELSE 'success' END
         END AS status
  FROM filas f
)
SELECT partner_id,
       -- hora del día entre 7 y 20 h, más frecuente en la mañana
       fecha + make_interval(secs => (7 + 13 * power(r_hora, 1.1)) * 3600)::interval,
       status,
       CASE WHEN r_misc < 0.8 THEN '/v1/ingresos' ELSE '/v1/empleo' END,
       CASE status WHEN 'success' THEN 200
                   WHEN 'error'   THEN CASE WHEN hace = 17 AND partner_id = 1 THEN 400
                                            WHEN r_misc < 0.5 THEN 422 ELSE 500 END
       END,
       CASE status WHEN 'timeout' THEN 30000
                   WHEN 'error'   THEN 80 + (r_lat * 300)::int
                   ELSE                180 + (r_lat * r_lat * 1400)::int END,
       'TRAB-' || lpad((r_misc * 99999)::int::text, 5, '0'),
       (ARRAY['RET050617HB2', 'LOG110903KT7', 'SAL070221MN5', 'EDU130415PL9', 'ALI090830RS3', 'CON160112VW8', 'SER190705ZA1'])[1 + (r_lat * 7)::int % 7]
FROM con_estado
ORDER BY 2;
