# 10 mejoras implementadas

| # | Mejora | Resultado |
|---:|---|---|
| 1 | Descarga automática | Imagen, PDF y Excel se descargan inmediatamente después de aceptar. |
| 2 | Validación intuitiva | El mensaje final indica revisar el archivo en la carpeta **Descargas**. |
| 3 | Nombre dinámico | La confirmación muestra el nombre generado según región, DM, actividad y corte. |
| 4 | Cierre explícito | La pantalla final solo se cierra con el botón superior **Cerrar**; no abre pestañas adicionales. |
| 5 | Estabilidad de memoria | La URL temporal de cada exportación se libera al cerrar la confirmación. |
| 6 | Avance congruente | El indicador principal utiliza `Realizadas / Total` y `% Avance`, calculado como realizadas entre total. |
| 7 | PDF ejecutivo por DM | El encabezado usa la fotografía y nombre del DM seleccionado; el reporte sigue sin pendientes ni numeración. |
| 8 | Excel ejecutivo por DM | Tiendas muestra CeCo, nombre, una columna por actividad, Realizadas, Total y `% Avance` con fórmulas auditables. |
| 9 | Contraste consistente | Cada pestaña usa título verde oscuro; `1` realizada y `0` pendiente tienen lectura visual inmediata. |
| 10 | Actualización segura | Caché PWA v15, limpieza por lista cerrada y diez controles de regresión protegen cada publicación. |

## Control del motor Python

Los comandos `python scripts/build_dashboard.py`, `python scripts/export_excel.py` y `python scripts/export_pdf.py` reconstruyen los datos y los respaldos ejecutivos. `python tests/validate_project.py` valida encabezados, directorio, fotografías, dominio de evidencia, archivos estáticos, generadores dinámicos y flujo de publicación antes de exponer información incompleta.

El workflow ejecuta diez controles identificables y `python scripts/clean_obsolete.py --apply` elimina únicamente los CSV heredados, JPEG duplicados y el SVG sin referencias. La lista es cerrada para evitar eliminaciones accidentales.
