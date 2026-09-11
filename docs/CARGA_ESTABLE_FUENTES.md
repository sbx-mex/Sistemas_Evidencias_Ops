# Carga estable de fuentes

## Incidente 2026-09-10

El workflow `Actualizar Sistema de Evidencias OPS` no falló por GitHub Pages ni por la carga del archivo XLSX. El preflight rechazó la actualización porque Forms contiene el CeCo `94565` y el Directorio operativo vigente no lo reconoce.

El motor actual incluye `unknownCeCos` dentro de los bloqueos duros de `scripts/validate_sources.py`. Por eso `scripts/safe_maintenance.py` termina antes de reconstruir `data/dashboard.json` y las exportaciones, aunque GitHub Pages sí compile y despliegue correctamente.

## Regla de estabilidad recomendada

1. Los errores estructurales siguen bloqueando: encabezados ambiguos/duplicados, conflictos de aplicabilidad, vínculos inseguros y archivos XLSX dañados.
2. Un CeCo nuevo o todavía no cruzado con Directorio debe aislarse como fila no publicable, registrarse como advertencia y no detener toda la actualización.
3. Las filas aisladas no deben modificar avance, fecha de corte, tienda, DM, región ni exportaciones.
4. El workflow debe mostrar claramente los CeCo aislados para que se actualice Directorio sin perder la publicación del resto de respuestas válidas.
5. Una vez incorporado el CeCo al Directorio, la misma fila de Forms puede recuperarse automáticamente en la siguiente reconstrucción.

## Causa observada

`validate_sources.py` construye actualmente el conjunto de bloqueos con `cecosDesconocidos = quality.unknownCeCos`. En la ejecución afectada el único bloqueo reportado fue:

```text
cecosDesconocidos: ["94565"]
```

Los demás grupos de conflicto estaban vacíos. Esto confirma que la fuente es legible y que el fallo corresponde al cruce de catálogo/directorio, no a corrupción del XLSX ni a GitHub Pages.
