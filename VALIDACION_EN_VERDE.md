# Actualización estable del Sistema de Evidencias OPS

## Instalación

1. Extrae el ZIP en la raíz de `sbx-mex/Sistemas_Evidencias_Ops`.
2. Conserva las carpetas y reemplaza los archivos coincidentes.
3. Ejecuta `python -X utf8 scripts/safe_maintenance.py --force`.
4. Confirma que el resultado muestre `13/13`, `12/12`, `issues: []` y cero archivos obsoletos.

## Corrección incluida

- El catálogo activo se obtiene del CMS en cada ejecución; las pruebas no fijan campañas históricas.
- Una actividad con `Activo = No` no aparece ni contabiliza, y sus filas anteriores no bloquean la publicación.
- Si una fila no puede recuperarse de forma inequívoca, se aísla y no modifica avance, evidencias ni fecha de corte.
- El CMS agrega `responseErrorPolicy = Aislar fila` y `trustedCeCoRecovery = Si`.
- Se validan versiones descargadas/reexportadas, fechas seriales, columnas reordenadas, filas agregadas o retiradas, rollback, escritura atómica y firmas XLSX/PDF.
- La base histórica tiene un contrato semántico de 384 filas. Un reempaque XLSX equivalente puede reconciliar su huella; cualquier cambio de fechas, CeCo, actividad, evidencia o número de filas detiene la publicación y restaura la configuración.
- Los archivos que una carga anterior dejó sueltos en la raíz se eliminan mediante una lista cerrada, sin borrar carpetas ni usar patrones recursivos.

## Resultado verificado antes de empaquetar

- 357 tiendas abiertas
- 9 actividades activas
- 301 cumplimientos válidos
- 9.4% de avance regional
- 13/13 controles del proyecto
- 12/12 controles de estabilidad
- Auditoría: `issues: []`
- Limpieza: cero obsoletos

La base histórica conserva 384 filas. Se validaron las correcciones `38599→38590` y `94565→38764` contra sus correos corporativos, sin cambios de fecha, actividad ni evidencia.
