# Actualización estable del Sistema de Evidencias OPS

## Instalación

1. Extrae el ZIP en la raíz de `sbx-mex/Sistemas_Evidencias_Ops`.
2. Conserva las carpetas y reemplaza los archivos coincidentes.
3. Ejecuta `python -X utf8 scripts/safe_maintenance.py --force`.
4. Confirma que el resultado muestre `12/12`, `issues: []` y cero archivos obsoletos.

## Corrección incluida

- El catálogo activo se obtiene del CMS en cada ejecución; las pruebas no fijan campañas históricas.
- Una actividad con `Activo = No` no aparece ni contabiliza, y sus filas anteriores no bloquean la publicación.
- Si una fila no puede recuperarse de forma inequívoca, se aísla y no modifica avance, evidencias ni fecha de corte.
- El CMS agrega `responseErrorPolicy = Aislar fila` y `trustedCeCoRecovery = Si`.
- Se validan versiones descargadas/reexportadas, fechas seriales, columnas reordenadas, filas agregadas o retiradas, rollback, escritura atómica y firmas XLSX/PDF.

## Resultado verificado antes de empaquetar

- 357 tiendas abiertas
- 9 actividades activas
- 299 respuestas válidas
- 9.3% de avance regional
- 12/12 controles de estabilidad
- Auditoría: `issues: []`
- Limpieza: cero obsoletos

Los CeCo 38599 y 94565 permanecen aislados como advertencias no bloqueantes hasta que existan en el Directorio. No afectan los indicadores publicados.
