# Motor de corte y reinicio de Forms

El avance quedó congelado al **17/09/2026 11:56:57**. La base histórica se lee desde `cms/Corte_Forms_2026-09-17_115657.xlsx` y sólo cuenta actividades activas en `cms/Sistema_Evidencias_OPS_CMS.xlsx`.

## Operación

1. Extrae el ZIP sobre el repositorio conservando las rutas `config/`, `cms/`, `scripts/` y `tests/`.
2. Conserva `cms/Corte_Forms_2026-09-17_115657.xlsx`; no se reemplaza ni se vuelve a descargar desde Forms.
3. Crea el nuevo Forms con las actividades que estén vigentes en el CMS. Usa `Nueva_Base_Forms.xlsx` sólo como referencia de encabezados y carga su exportación en `cms/Sistema de Evidencias OPS.xlsx`.
4. Ejecuta `python scripts/safe_maintenance.py --force`.

Las respuestas fechadas antes o en el corte dentro del nuevo Forms se aíslan. Las respuestas posteriores se suman a la base histórica. Cualquier actividad marcada como `No` en el CMS no se publica ni afecta el denominador.

`Nueva_Base_Forms.xlsx` es una plantilla limpia de referencia para el reinicio. El Forms puede agregar columnas: el motor identifica los campos por encabezado, no por posición.

Actualmente quedan visibles desde el CMS: Rack FHW, Max & Min, Mandil Verde, Lay Out, Community Board, Señaletica Back, Señaletica Lobby y Jarras Blender | Cold Foam. Las demás filas del Forms histórico no se reactivan ni se cuentan.
