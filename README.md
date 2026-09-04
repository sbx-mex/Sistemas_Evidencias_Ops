# Sistema de Evidencias OPS

PWA ejecutiva de Centro Norte para medir el cumplimiento de actividades registradas mediante Microsoft Forms.

## Modelo operativo

```text
Sistema de Evidencias OPS.xlsx
             +
Directorio.xlsx
Sistema_Evidencias_OPS_CMS.xlsx + assets/dm/ + assets/director/
             ↓
scripts/build_dashboard.py
             ↓
data/dashboard.json → PWA
```

El motor identifica estos encabezados aunque cambie su orden o existan columnas repetidas:

1. `Hora de finalización` → **Última actualización**.
2. `Selecciona la actividad que deseas registrar` → actividad evaluada.
3. `CeCo` o `CeCo1` → cruce automático con nombre de tienda y DM. Forms puede conservar ambas columnas al cambiar la pregunta de lista desplegable a captura numérica; Python toma el único valor informado y rechaza filas con valores contradictorios.
4. `¿Confirmas que realizaste la actividad seleccionada?` → es opcional; cuando no existe, una evidencia válida confirma el registro. Únicamente en Hornos, un `No` explícito significa **No aplica**.
5. `Evidencia del avance` o `Evidencia_<Actividad>` → Python elige la columna que coincide con la actividad seleccionada, valida HTTPS y dominio autorizado y genera una etiqueta `Actividad_CeCo`.

También admite el formato largo: si las respuestas nuevas aparecen hacia abajo como más filas y usan una columna genérica de evidencia, cada fila se procesa de forma independiente. Si una fila contiene valores contradictorios, evidencia en la columna de otra actividad o varias evidencias incompatibles, se marca en `quality.responseSchema` y no se publica como válida.

El correo y el nombre del respondente no se publican. Por autorización operativa, el dashboard muestra el nombre real del archivo y el vínculo directo de SharePoint exactamente como viene en Forms, después de validar HTTPS y el dominio permitido.

## Actualización inmediata

1. Reemplaza `cms/Sistema de Evidencias OPS.xlsx` con la descarga más reciente de Forms.
2. Cuando cambie el directorio, ejecuta `python scripts/update_directory.py Directorio.xlsx`; regiones, DM, tiendas abiertas y la estructura del CMS se agrupan automáticamente.
3. Ejecuta:

```bash
pip install -r requirements.txt
python scripts/build_dashboard.py
python scripts/export_excel.py
python scripts/export_pdf.py
python tests/validate_dynamic_forms_schema.py
python tests/validate_project.py
python scripts/audit_project.py
```

## CMS maestro

Edita `cms/Sistema_Evidencias_OPS_CMS.xlsx`:

- `Organigrama`: controla Director Starbucks México y los cuatro Directores Regionales. Los cuatro RD activos requieren fotografía WebP.
- `Tiendas Abiertas`: vista automática; únicamente `Estatus = Abierta` alimenta el portal.
- `Gerentes`: conserva el nombre completo como llave y usa `primer nombre + primer apellido` en `Nombre corto`.
- `Directorio.xlsx > Instrucciones`: documenta CC, Región, Estatus y DM sin modificar la hoja operativa.

- `Orden`: posición visual.
- `Actividad`: debe coincidir con la opción configurada en Forms.
- `Activo`: `Si` publica la actividad; `No` la retira del cumplimiento esperado.
- `Descripción`: contexto que verá el usuario en el dashboard.

En `Configuracion` se administran región, privacidad, dominios autorizados y Director Regional. Forms puede seguir acumulando actividades y respuestas, pero **sólo las actividades activas y vigentes del CMS se publican y forman parte del denominador**. Las actividades presentes en Forms pero no habilitadas en CMS se conservan en la fuente y se reportan como ocultas en la auditoría.

## Evidencias y alcance seguro

- El tablero usa los encabezados cortos **Actividad**, **CeCo** y **Evidencia**.
- Python sólo acepta `https://`, sin usuario/contraseña embebidos, puerto no estándar, fragmentos ni dominios fuera de `evidenceAllowedHosts`.
- El soporte de evidencias muestra **Actividad**, **Tienda** y **Link del archivo**. El texto visible usa `Link_Actividad_CeCo`; el hipervínculo conserva la URL exacta del Excel y el nombre original queda disponible como descripción accesible.
- `publishEvidenceLinks = Si` publica únicamente los vínculos que superan la lista de dominios autorizados.
- El vínculo se conserva tal como viene en el Excel y abre SharePoint en una pestaña aislada con `noopener`, `noreferrer` y sin encabezado `Referer`. SharePoint sigue determinando quién puede ver la imagen.

## Fotografías y liderazgo regional

La hoja `Gerentes` relaciona el nombre exacto del directorio con su región y fotografía en `assets/dm/`. Los DM nuevos se agregan con estado **Foto pendiente** y el dashboard muestra sus iniciales hasta recibir el WebP. Python sólo detiene la generación cuando una ruta de imagen configurada no existe.

## 10 mejoras de navegación, cálculo y exportación

Consulta [MEJORAS.md](MEJORAS.md) para el detalle verificable. La actualización incorpora navegación compartible, alcance visible, regreso rápido, exportaciones con **Realizadas / Aplican / No aplica / % Avance** y una prueba automática del caso de Hornos.

## Python como producto principal

`scripts/build_dashboard.py` es el motor del proyecto. Valida encabezados, normaliza CeCo, verifica evidencia segura, cruza tienda y DM, comprueba fotografías, deduplica respuestas, protege datos personales y genera `data/dashboard.json`. La prueba ya no congela una hora fija: compara el JSON publicado contra una reconstrucción completa desde el Excel.

`scripts/export_excel.py` construye `exports/Resumen_Evidencias_OPS.xlsx` como respaldo ejecutivo: Resumen, Tiendas y Actividades, con fórmulas recalculables, filtros, congelación de encabezados, semáforo y formatos separados para cantidades y porcentajes. `scripts/export_pdf.py` genera el respaldo regional con la fotografía de Jorge Alcantar. En el dashboard, PDF, imagen y Excel generan una versión nueva con el alcance de los filtros actuales.

## Regla de cumplimiento

Una combinación tienda–actividad cuenta una sola vez cuando:

- el CeCo contiene exactamente cinco dígitos y existe en el directorio;
- la respuesta de confirmación es `Sí` o, si esa pregunta ya no existe, se encontró la evidencia correspondiente a la actividad;
- existe vínculo HTTPS en un dominio autorizado;
- la actividad está activa y vigente en el CMS.

Envíos repetidos se conservan como registros, pero el cumplimiento se deduplica por `CeCo + Actividad`, utilizando el más reciente.

Las respuestas operativas de prueba pueden excluirse temporalmente por el `Id` original de Forms mediante `ignoredResponseIds` en la hoja `Configuracion` del CMS. La exclusión ocurre antes de calcular fecha de corte, aplicabilidad, evidencias o avance; no bloquea el CeCo para respuestas reales.

### Excepción exclusiva de Hornos

Para `Programacion Hornos Merry - Focaccia`, la respuesta explícita `No` registra **No aplica** y elimina esa combinación tienda–actividad del denominador. Una respuesta vacía sigue pendiente. La regla se configura en `config/settings.json` y no modifica ninguna otra actividad. El texto exacto y la ramificación de Microsoft Forms están en [INSTRUCCION_FORMS.md](INSTRUCCION_FORMS.md).

## Publicación en GitHub Pages

1. Carga el contenido del ZIP en la raíz de un repositorio nuevo.
2. En **Settings → Pages**, selecciona **Deploy from a branch**.
3. Elige `main` y la carpeta `/ (root)`.
4. Guarda y espera la publicación.

La PWA funciona en subruta, instala caché offline y actualiza `data/dashboard.json` con estrategia network-first.

## Vistas

- **Resumen:** KPI y lectura rápida del alcance seleccionado.
- **Ranking DM:** comparativo regional de mayor a menor avance.
- **Actividades:** catálogo administrable, cumplimiento y fechas compromiso.
- **Tiendas:** cruce CeCo y avance operativo por tienda.
- **Evidencias:** soporte plegable al final, con filtros propios por DM, actividad y tienda.
- **Exportación:** imagen, PDF y Excel con alcance dinámico. Todos los DM exporta el ranking regional; un DM exporta sus tiendas ordenadas de mayor a menor avance.

## Fuente inicial validada

- 357 tiendas `Abierta` de cuatro regiones, agrupadas automáticamente en 28 DM; 22 fotografías nuevas quedan identificadas como pendientes. Las 15 tiendas con `Cierre Temporal` o `Cierre Definitivo` permanecen en el Directorio, pero no entran en conteos ni avance.
- El CMS controla el alcance con `onlyOpenStores = Si` e `includedStoreStatuses = Abierta`.
- La pestaña CMS `Tiendas Abiertas` se regenera con CC, tienda, región, estatus y DM para revisar visualmente las 357 tiendas publicadas.
- La pestaña `Organigrama` publica a Raúl Sinohe Sierra Santa Maria como Director Starbucks México y a los responsables de Centro Centro, Centro Poniente, Centro Sur y Centro Norte con fotografía.
- La navegación identifica el apartado como `RD's Centro's`; las tarjetas omiten el rol repetitivo y mantienen el avance regional dinámico.
- 8 actividades activas.
- Última actualización: `29/08/2026 09:43`.
- CeCo `38115` cruzado como `Zona Azul` y asignado a `Yazmin Haydee Garcia Gonzalez`.
- 7 respuestas válidas, 8 columnas dinámicas de evidencia y 0 CeCo sin cruce.
