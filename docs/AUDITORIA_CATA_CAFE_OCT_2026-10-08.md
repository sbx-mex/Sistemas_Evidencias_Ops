# Cata Cafe Oct — auditoría del 8 de octubre de 2026

La respuesta Forms Id 1851, CeCo 38368 (Luna Park), estaba presente en el Excel, pero la actividad no existía en el CMS. El motor la omitía correctamente por no estar autorizada.

Se habilita `Cata Cafe Oct` en Actividades, orden 13, inicio 08/10/2026, evidencia obligatoria y prioridad alta. La descripción pide una foto de los cuatro letreros impresos y recuerda las fechas de café de octubre. No se establece una fecha límite de entrega que el usuario no haya indicado. Sólo cambian siete celdas de la fila 24; se conservan las demás celdas y fórmulas. Forms y Directorio no se modifican.

## Resultado reconstruido

- Cata Cafe Oct: 1 realizada, 450 aplicables, 449 pendientes, 0.2%.
- CeCo 38368: Cata realizada; total de tienda 4/7, 57.1%.
- General: 757/3150 cumplimientos, 450 tiendas, siete actividades.
- Evidencia tomada de `Evidencia_Cata_Cafe_Oct`, incluyendo el salto de línea original del encabezado. Se conserva el vínculo exacto del Excel. Aunque la ruta SharePoint contiene `Evidencia_Tarta_Copete_POS`, la clasificación viene de la actividad y la columna Forms, no del nombre de la carpeta.

## Verificación

`python tests/validate_cata_cafe_oct.py` aprobó el caso real, vínculo exacto, deduplicación, ausencia de evidencia, dominio no autorizado, desactivación por CMS, denominador y conservación de conteos de otras actividades. Los escenarios usan Excel temporales y verifican las huellas de las fuentes.

`python scripts/safe_maintenance.py --force` finalizó correctamente: proyecto 13/13, CMS 14/14, tipos de respuesta 13/13, contratos de carga, catálogo, corte histórico, cruces, PDF/Excel, PWA y paquete Azure. Auditoría de 157 archivos sin incidencias. El JSON y las exportaciones fueron regenerados desde las fuentes.

Persisten aislamientos previos no bloqueantes: cinco CeCo fuera del catálogo (38104, 38666, 39351, 39749, 43079) y fila Forms 889 inválida; no afectan el conteo de Cata Cafe Oct. La validación comprueba la estructura y seguridad del vínculo; no certifica el contenido visual de la foto ni los permisos SharePoint.

La prueba específica documenta el estado de esta campaña y la respuesta 1851. Ejecutarla al cambiar el CMS o Forms de esta campaña; no es un bloqueo permanente para futuras desactivaciones legítimas.

## Publicación

El PR habilita la actividad y actualiza los resultados. La producción requiere integrar el PR a `main` y que concluyan correctamente los workflows de actualización y despliegue existentes.
