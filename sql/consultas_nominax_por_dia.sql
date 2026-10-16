-- Consultas enviadas a Nominax por día, últimos 30 días (incluye hoy)
WITH dias AS (
  SELECT generate_series(CURRENT_DATE - 29, CURRENT_DATE, INTERVAL '1 day')::date AS dia
),
consultas AS (
  SELECT r.created_at::date AS dia, r.status
  FROM api_requests r
  JOIN partners p ON p.id = r.partner_id
  WHERE p.name = 'Nominax'
    AND r.created_at >= CURRENT_DATE - 29
    AND r.created_at <  CURRENT_DATE + 1
)
SELECT d.dia,
       COUNT(c.dia)                                 AS total_consultas,
       COUNT(*) FILTER (WHERE c.status = 'success') AS exitosas,
       COUNT(*) FILTER (WHERE c.status = 'error')   AS errores,
       COUNT(*) FILTER (WHERE c.status = 'timeout') AS timeouts
FROM dias d
LEFT JOIN consultas c ON c.dia = d.dia
GROUP BY d.dia
ORDER BY d.dia;
