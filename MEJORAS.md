# 5 mejoras de calidad y mantenimiento

| # | Mejora | Resultado |
|---:|---|---|
| 1 | CMS tolerante | El motor localiza encabezados aunque cambien de posición e ignora notas, estilos y celdas auxiliares. |
| 2 | Borradores seguros | Una fila con `Activo` vacío o `No` no se publica y tampoco bloquea el dashboard, aunque aún tenga datos incompletos. |
| 3 | Valores protegidos | Orden, evidencia, configuración y fechas inválidas usan respaldos seguros; la actividad permanece visible sin romper el proceso. |
| 4 | Escritura atómica | JSON, XLSX y PDF se reemplazan únicamente después de terminar correctamente; un fallo conserva la última versión válida. |
| 5 | Mantenimiento preventivo | El workflow valida dependencias, UTF-8, los tres Excel, residuos obsoletos y escenarios de edición del CMS. |

## Regla de edición del CMS

- No cambies los nombres de los encabezados ni elimines las hojas `Actividades`, `Gerentes` y `Configuracion`.
- Puedes actualizar las celdas de contenido sin depender del número de fila o columna.
- Para preparar una actividad nueva, captura la fila y deja `Activo` vacío o en `No`.
- La actividad entra al cálculo únicamente cuando `Activo` cambia a `Sí`.
- Si una celda de configuración queda vacía o incompleta, se conserva el valor seguro de `config/settings.json`.

La prueba `tests/validate_maintenance.py` reproduce estos escenarios antes de cada publicación.
