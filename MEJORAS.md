# 10 mejoras implementadas

| # | Mejora | Resultado |
|---:|---|---|
| 1 | Denominador aplicable | Solo Hornos excluye del ideal las tiendas cuya respuesta más reciente es `No`. |
| 2 | Cálculo unificado | Región, DM, tienda y actividad consumen la misma aplicabilidad. |
| 3 | Caso 10 → 8 | Una prueba automática valida 10 tiendas, 2 N/A y cumplimiento ideal de 8/8. |
| 4 | Vista compartible | DM, tienda y actividad se conservan en la URL. |
| 5 | Alcance visible | La barra de filtros resume vista, actividad, aplicables y N/A. |
| 6 | Navegación activa | El menú identifica la sección visible durante el desplazamiento. |
| 7 | Regreso rápido | El botón flotante **Arriba** facilita volver a filtros y exportaciones. |
| 8 | Exportación clara | Imagen y PDF muestran `Realizadas / Aplican`, `No aplica` y `% Avance`. |
| 9 | Excel auditable | `1` es realizada, `0` pendiente y vacío N/A; `SUM`, `COUNT` y `COUNTBLANK` validan el resultado. |
| 10 | Publicación limpia | Caché PWA v16, lista cerrada de obsoletos y controles automáticos evitan archivos desactualizados. |

La regla está en `config/settings.json` mediante `notApplicableOnNoActivities`. Actualmente contiene solo `Programacion Hornos Merry - Focaccia`.
