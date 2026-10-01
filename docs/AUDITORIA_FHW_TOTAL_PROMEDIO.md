# FHW: Total / Promedio

Base: sbx-mex/Sistemas_Evidencias_Ops, main, commit a9c388b6f409fbac8495a630027e7486c5c8e164.

## Aplicación

Reemplazar los siete archivos de este ZIP en sus rutas originales, en un mismo commit. El workflow existente validará los cambios antes de actualizar Pages. No se modifican los Excel fuente ni los datos de las respuestas. No se incluyen recursos, datos, exportaciones generadas ni archivos de otros proyectos.

| Archivo | Mejora |
| --- | --- |
| app.js | Quita Piezas totales del detalle FHW, calcula Total / Promedio según filtros y exporta el resumen |
| index.html | Selector Total / Promedio y base de cálculo visible |
| styles.css | Tarjetas legibles, botón activo accesible y resumen primero en pantallas pequeñas |
| service-worker.js | Versión de caché v41 para incorporar la nueva interfaz |
| tests/validate_fhw_summary.js | 378 escenarios de cálculo, filtros, ceros, pendientes, UI y exportaciones con los datos actuales |
| .github/workflows/build-dashboard.yml | Ejecuta automáticamente la nueva validación antes de publicar |
| docs/AUDITORIA_FHW_TOTAL_PROMEDIO.md | Instrucciones, cálculo y resultados |

## Uso

1. Seleccionar FHW y los filtros de Región, DM, Tienda o Cantidad.
2. En Consolidado de respuestas, elegir Total o Promedio.
3. Exportar. El reporte usa el mismo filtro, modo y base que la pantalla.

La tabla por tienda conserva los conteos de Cubiertos FHW y Tazas 3 Oz y el vínculo a la evidencia. Se elimina la columna Piezas totales únicamente de FHW, incluida su hoja de detalle dinámica. El consolidado conserva las dos categorías y su suma como tarjeta; esa tarjeta también cambia con el selector.

Total suma las cantidades reportadas en el filtro. Promedio divide cada suma entre las tiendas con respuesta válida en ese filtro, incluyendo las que respondieron cero. Las tiendas sin respuesta no se consideran cero ni entran en el promedio. Cuando no hay respuestas, se muestra — y una explicación, sin inventar cantidades. Los promedios se presentan con un decimal; la suma de cifras redondeadas puede diferir del promedio conjunto.

La base de cálculo permanece visible. Al filtrar una sola tienda, el consolidado sigue disponible. El modo se conserva en la URL para mantener la lectura al recargar. Jarras y Va X Cuenta conservan sus reglas y presentación.

## Reportes de FHW

- PDF e imagen: resumen ejecutivo de una página, con el modo seleccionado, alcance, corte, cantidades, tiendas con/sin respuesta, cobertura y base de cálculo.
- Excel: Resumen FHW y FHW tiendas. El resumen respeta Total / Promedio y el detalle mantiene los conteos originales por tienda, sin Piezas totales.
- El nombre del archivo identifica Total o Promedio y el alcance. La confirmación de descarga muestra la base y las cantidades del filtro.

## Auditoría con los datos reales actuales

Centro Norte: 73 tiendas en el filtro, 72 con respuesta y 1 sin respuesta. Cobertura: 98.6%.

| Indicador | Total | Promedio por tienda con respuesta |
| --- | ---: | ---: |
| Cubiertos FHW | 1459 | 20.3 |
| Tazas 3 Oz | 365 | 5.1 |
| Piezas combinadas | 1824 | 25.3 |

La auditoría Python abrió el XLSX dinámico generado y comprobó valores numéricos 20.3 / 5.1 / 25.3, 72 tiendas de detalle, 73 elegibles, una pendiente y ausencia de Piezas totales en el detalle.

Validaciones completadas:

- Nueva prueba JavaScript: 378 escenarios con datos reales; incluye todos los DM y tiendas respondentes, regiones, rangos, ceros, sin respuesta, filtro vacío, ambos modos, encabezados, filas, Excel, contexto de exportación, canvas y conservación de las fuentes.
- Regresión numérica existente: aprobada para Jarras, FHW y Va X Cuenta.
- Mantenimiento Python completo sobre los tres Excel reales: aprobado; reconstrucción, rollback, huellas, esquema Forms, CMS, corte, conteos, PDF, Excel y auditorías sin incidencias. Tiempo: 29.67 segundos.
- Sintaxis JavaScript, limpieza y git diff --check: aprobados.
- Reportes Total y Promedio: renderizados con el código real de canvas, revisados visualmente y preparados con el motor PDF existente. Un navegador Chromium no estuvo disponible; la comprobación de UI usa el motor en pruebas aisladas, no una captura del navegador.

Repetir en la raíz del repositorio:

```sh
python3 scripts/safe_maintenance.py --force
node tests/validate_numeric_filter.js
node tests/validate_fhw_summary.js
node --check app.js
node --check service-worker.js
python3 scripts/clean_obsolete.py --check
```

El número de escenarios y los totales cambian con nuevas respuestas. La prueba calcula sus expectativas desde las fuentes del checkout; no fija las cifras de esta auditoría para las siguientes cargas. El ZIP no publica ni modifica GitHub por sí mismo.
