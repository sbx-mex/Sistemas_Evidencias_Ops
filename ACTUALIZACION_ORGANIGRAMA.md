# Actualización · Organigrama y tiendas abiertas

## Resultado

- El portal publica únicamente tiendas con `Estatus = Abierta`.
- El CMS incluye la hoja `Organigrama` con Raúl Sinohe Sierra Santamaria y cuatro Directores Regionales con fotografía.
- La fotografía `Raul Sierra.png` fue optimizada a `assets/director/raul-sierra.webp` (640 × 800 px).
- El diseño conserva el enfoque operativo y añade un acento discreto amarillo/verde inspirado en la campaña Peanuts × Starbucks.
- La navegación muestra `RD's Centro's`; cada tarjeta regional presenta fotografía, región, nombre y avance, sin repetir el texto `Director Regional`.
- Python conserva el nombre completo del DM como llave y publica `primer nombre + primer apellido` como nombre corto.

## Organigrama vigente

| Alcance | Responsable | Rol |
| --- | --- | --- |
| Centro's | Raúl Sinohe Sierra Santamaria | Director Starbucks México |
| Centro Centro | Oliver Roberto Perez Briones | Director Regional |
| Centro Poniente | Jorge Farrera Pinal | Director Regional |
| Centro Sur | Cielo Aide Morera Urrego | Director Regional |
| Centro Norte | Jorge Antonio Alcantar Aguiar | Director Regional |

## Uso del CMS

1. Abre `cms/Sistema_Evidencias_OPS_CMS.xlsx`.
2. En `Organigrama`, modifica nombre, ruta de foto u orden. Los cuatro RD activos requieren una fotografía WebP.
3. Usa `Activo = Si` para publicar una persona; `No` la oculta.
4. En `Tiendas Abiertas`, confirma las tiendas publicadas. Esta hoja se regenera desde `Directorio.xlsx`.
5. En `Directorio.xlsx`, consulta la pestaña `Instrucciones`; registra siempre el nombre completo del DM.
6. Ejecuta `python scripts/safe_maintenance.py --force` para validar, reconstruir JSON y actualizar exportaciones.

## Validación entregada

- 357 tiendas abiertas publicadas.
- 15 tiendas con cierre excluidas.
- 4 regiones y 28 DM.
- 11/11 pruebas del proyecto aprobadas.
- 10/10 controles de estabilidad aprobados.
- Excel sin errores de fórmula detectados.
