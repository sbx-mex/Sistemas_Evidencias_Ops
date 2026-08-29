# Sistema de Evidencias OPS

PWA ejecutiva de Centro Norte para medir el cumplimiento de actividades registradas mediante Microsoft Forms.

## Modelo operativo

```text
Sistema de Evidencias OPS.xlsx
             +
Centro Norte_Directorio.xlsx
Sistema_Evidencias_OPS_CMS.xlsx + assets/dm/ + assets/director/
             ↓
scripts/build_dashboard.py
             ↓
data/dashboard.json → PWA
```

El motor utiliza exclusivamente estos encabezados del Forms:

1. `Hora de finalización` → **Última actualización**.
2. `Selecciona la actividad que deseas registrar` → actividad evaluada.
3. `CeCo` → cruce automático con nombre de tienda y DM.
4. `¿Confirmas que realizaste la actividad seleccionada?` → `Sí` valida; únicamente en Hornos, `No` significa **No aplica**.
5. `Evidencia del avance` → valida HTTPS y dominio autorizado; genera una etiqueta `Actividad_CeCo`.

El correo y el nombre del respondente no se publican. Por autorización operativa, el dashboard muestra el nombre real del archivo y el vínculo directo de SharePoint exactamente como viene en Forms, después de validar HTTPS y el dominio permitido.

## Actualización inmediata

1. Reemplaza `cms/Sistema de Evidencias OPS.xlsx` con la descarga más reciente de Forms.
2. Cuando cambie el directorio, reemplaza `cms/Centro Norte_Directorio.xlsx`.
3. Ejecuta:

```bash
pip install -r requirements.txt
python scripts/build_dashboard.py
python scripts/export_excel.py
python scripts/export_pdf.py
python tests/validate_horno_applicability.py
python tests/validate_project.py
python scripts/audit_project.py
```

## CMS maestro

Edita `cms/Sistema_Evidencias_OPS_CMS.xlsx`:

- `Orden`: posición visual.
- `Actividad`: debe coincidir con la opción configurada en Forms.
- `Activo`: `Si` publica la actividad; `No` la retira del cumplimiento esperado.
- `Descripción`: contexto que verá el usuario en el dashboard.

En `Configuracion` se administran región, privacidad, dominios autorizados y Director Regional. Si aparece una actividad nueva en Forms, Python la integra como detectada para evitar pérdida de información.

## Evidencias y alcance seguro

- El tablero usa los encabezados cortos **Actividad**, **CeCo** y **Evidencia**.
- Python sólo acepta `https://`, sin usuario/contraseña embebidos, puerto no estándar, fragmentos ni dominios fuera de `evidenceAllowedHosts`.
- El soporte de evidencias muestra **Actividad**, **Tienda** y **Link del archivo**. El texto visible usa `Link_Actividad_CeCo`; el hipervínculo conserva la URL exacta del Excel y el nombre original queda disponible como descripción accesible.
- `publishEvidenceLinks = Si` publica únicamente los vínculos que superan la lista de dominios autorizados.
- El vínculo se conserva tal como viene en el Excel y abre SharePoint en una pestaña aislada con `noopener`, `noreferrer` y sin encabezado `Referer`. SharePoint sigue determinando quién puede ver la imagen.

## Fotografías y liderazgo regional

La hoja `Gerentes` relaciona el nombre exacto del directorio con su fotografía en `assets/dm/`. La hoja `Configuracion` publica a **Jorge Alcantar** como **Director Regional** mediante `assets/director/jorge-alcantar.webp`. Python detiene la generación si falta una imagen configurada.

## 10 mejoras de navegación, cálculo y exportación

Consulta [MEJORAS.md](MEJORAS.md) para el detalle verificable. La actualización incorpora navegación compartible, alcance visible, regreso rápido, exportaciones con **Realizadas / Aplican / No aplica / % Avance** y una prueba automática del caso de Hornos.

## Python como producto principal

`scripts/build_dashboard.py` es el motor del proyecto. Valida encabezados, normaliza CeCo, verifica evidencia segura, cruza tienda y DM, comprueba fotografías, deduplica respuestas, protege datos personales y genera `data/dashboard.json`. La prueba ya no congela una hora fija: compara el JSON publicado contra una reconstrucción completa desde el Excel.

`scripts/export_excel.py` construye `exports/Resumen_Evidencias_OPS.xlsx` como respaldo ejecutivo: Resumen, Tiendas y Actividades, con fórmulas recalculables, filtros, congelación de encabezados, semáforo y formatos separados para cantidades y porcentajes. `scripts/export_pdf.py` genera el respaldo regional con la fotografía de Jorge Alcantar. En el dashboard, PDF, imagen y Excel generan una versión nueva con el alcance de los filtros actuales.

## Regla de cumplimiento

Una combinación tienda–actividad cuenta una sola vez cuando:

- el CeCo contiene exactamente cinco dígitos y existe en el directorio;
- la respuesta de confirmación es `Sí`;
- existe vínculo HTTPS en un dominio autorizado;
- la actividad está activa o fue detectada en el Forms.

Envíos repetidos se conservan como registros, pero el cumplimiento se deduplica por `CeCo + Actividad`, utilizando el más reciente.

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

- 72 tiendas abiertas de la hoja `72 T`, alineadas con las seis fotografías proporcionadas.
- 8 actividades activas.
- Última actualización: `28/08/2026 20:39`.
- CeCo `38401` cruzado como `Coacalco` y asignado a `Enrique Cesar Flores`.
- 2 respuestas válidas y 0 CeCo sin cruce.
