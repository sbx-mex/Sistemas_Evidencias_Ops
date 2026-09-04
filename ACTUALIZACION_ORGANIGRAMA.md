# Actualización · Organigrama y tiendas abiertas

## Resultado

- El portal publica únicamente tiendas con `Estatus = Abierta`.
- El CMS incluye la hoja `Organigrama` con Raúl Sinohe Sierra Santa Maria y cuatro Directores Regionales.
- La fotografía `Raul Sierra.png` fue optimizada a `assets/director/raul-sierra.webp` (640 × 800 px).
- El diseño conserva el enfoque operativo y añade un acento discreto amarillo/verde inspirado en la campaña Peanuts × Starbucks.
- Las personas sin fotografía se muestran con iniciales; al agregar la ruta WebP en el CMS, la imagen aparece automáticamente.

## Organigrama vigente

| Alcance | Responsable | Rol |
| --- | --- | --- |
| Centro's | Raúl Sinohe Sierra Santa Maria | Director Starbucks México |
| Centro Centro | Oliver Roberto Perez Briones | Director Regional |
| Centro Poniente | Jorge Farrera Pinal | Director Regional |
| Centro Sur | Cielo Aide Morera Urrego | Director Regional |
| Centro Norte | Jorge Antonio Alcantar Aguiar | Director Regional |

## Uso del CMS

1. Abre `cms/Sistema_Evidencias_OPS_CMS.xlsx`.
2. En `Organigrama`, modifica nombre, rol, ruta de foto u orden.
3. Usa `Activo = Si` para publicar una persona; `No` la oculta.
4. En `Tiendas Abiertas`, confirma las tiendas publicadas. Esta hoja se regenera desde `Directorio.xlsx`.
5. Ejecuta `python scripts/safe_maintenance.py --force` para validar, reconstruir JSON y actualizar exportaciones.

## Validación entregada

- 357 tiendas abiertas publicadas.
- 15 tiendas con cierre excluidas.
- 4 regiones y 28 DM.
- 11/11 pruebas del proyecto aprobadas.
- 10/10 controles de estabilidad aprobados.
- Excel sin errores de fórmula detectados.
