# Sistema de Evidencias OPS

PWA ejecutiva de Centro Norte para medir el cumplimiento de actividades registradas mediante Microsoft Forms.

## Modelo operativo

```text
Sistema de Evidencias OPS.xlsx
             +
Centro Norte_Directorio.xlsx
             +
config/actividades.csv
             ↓
scripts/build_dashboard.py
             ↓
data/dashboard.json → PWA
```

El motor utiliza exclusivamente estos encabezados del Forms:

1. `Hora de finalización` → **Última actualización**.
2. `Selecciona la actividad que deseas registrar` → actividad evaluada.
3. `CeCo` → cruce automático con nombre de tienda y DM.
4. `¿Confirmas que realizaste la actividad seleccionada?` → solo `Sí` puede validar.
5. `Evidencia del avance` → confirma que el registro contiene evidencia.

El correo, nombre del respondente y vínculo privado de SharePoint no se publican en el JSON inicial.

## Actualización inmediata

1. Reemplaza `cms/Sistema de Evidencias OPS.xlsx` con la descarga más reciente de Forms.
2. Cuando cambie el directorio, reemplaza `cms/Centro Norte_Directorio.xlsx`.
3. Ejecuta:

```bash
pip install -r requirements.txt
python scripts/build_dashboard.py
python tests/validate_project.py
python scripts/audit_project.py
```

## Agregar o retirar actividades

Edita `config/actividades.csv`:

- `Orden`: posición visual.
- `Actividad`: debe coincidir con la opción configurada en Forms.
- `Activo`: `Si` publica la actividad; `No` la oculta del cumplimiento esperado.
- `Descripción`: contexto que verá el usuario en el dashboard.

Si aparece en las respuestas una actividad nueva que aún no está en el CSV, Python la integra como **Detectada en Forms** para evitar pérdida de información.

## Regla de cumplimiento

Una combinación tienda–actividad cuenta una sola vez cuando:

- el CeCo contiene exactamente cinco dígitos y existe en el directorio;
- la respuesta de confirmación es `Sí`;
- existe vínculo de evidencia;
- la actividad está activa o fue detectada en el Forms.

Envíos repetidos se conservan como registros, pero el cumplimiento se deduplica por `CeCo + Actividad`, utilizando el más reciente.

## Publicación en GitHub Pages

1. Carga el contenido del ZIP en la raíz de un repositorio nuevo.
2. En **Settings → Pages**, selecciona **Deploy from a branch**.
3. Elige `main` y la carpeta `/ (root)`.
4. Guarda y espera la publicación.

La PWA funciona en subruta, instala caché offline y actualiza `data/dashboard.json` con estrategia network-first.

## Vistas

- **Resumen:** KPI, avance por actividad, ranking DM y atención inmediata.
- **Actividades:** catálogo administrable y cumplimiento individual.
- **Tiendas:** cruce CeCo, avance, última respuesta y exportación CSV.
- **Evidencias:** registros válidos y controles de calidad.

## Fuente inicial validada

- 94 tiendas abiertas de la hoja `93 T (2)`.
- 7 actividades activas.
- Última actualización: `28/08/2026 20:32`.
- CeCo `38401` cruzado como `Coacalco` y asignado al DM del directorio seleccionado.
- 1 respuesta válida y 0 CeCo sin cruce.
