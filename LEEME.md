# Estabilidad del Forms de continuación

Extrae este paquete en la raíz del repositorio y conserva las rutas internas. La instalación agrega el motor de corte, la base histórica y el CMS validado.

## Único archivo que actualizarás después de instalarlo

`cms/Sistema de Evidencias OPS.xlsx`

Reemplázalo cada vez con la exportación del Forms de continuación. El motor hará automáticamente lo siguiente:

- Conserva el avance consolidado al 17/09/2026 11:56:57.
- Suma únicamente respuestas posteriores a ese corte.
- Mantiene visibles y contables sólo las actividades con `Activo = Sí` en el CMS.
- Aísla filas antiguas, ocultas o con CeCo que no exista aún en el Directorio, sin detener la publicación.

No reemplaces `cms/Corte_Forms_2026-09-17_115657.xlsx` ni `config/cutover.json`.

Para reconstruir en verde ejecuta: `python scripts/safe_maintenance.py --force`.
