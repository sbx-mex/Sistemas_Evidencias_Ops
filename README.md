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
4. `¿Confirmas que realizaste la actividad seleccionada?` → solo `Sí` puede validar.
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
- La tabla muestra **Actividad**, **CeCo**, **Nombre de archivo** y **Link**.
- `publishEvidenceLinks = Si` publica únicamente los vínculos que superan la lista de dominios autorizados.
- El vínculo se conserva tal como viene en el Excel y abre SharePoint en una pestaña aislada con `noopener`, `noreferrer` y sin encabezado `Referer`. SharePoint sigue determinando quién puede ver la imagen.

## Fotografías y liderazgo regional

La hoja `Gerentes` relaciona el nombre exacto del directorio con su fotografía en `assets/dm/`. La hoja `Configuracion` publica a **Jorge Alcantar** como **Director Regional** mediante `assets/director/jorge-alcantar.webp`. Python detiene la generación si falta una imagen configurada.

## 10 mejoras de navegación, visibilidad y exportación

1. Navegación adaptable y sección activa visible, también en celular.
2. Layout minimalista sin avisos ni encabezados repetitivos entre secciones.
3. Exportación regional dinámica: **Todos los DM** genera un ranking por DM.
4. Exportación focalizada: un solo DM desglosa sus tiendas de mayor a menor avance.
5. Pantalla previa **Le damos seguimiento** antes de preparar cada archivo.
6. Confirmación **Un placer haber ayudado** al finalizar la descarga.
7. Exportación XLSX dinámica con Resumen, ranking/tiendas y actividades.
8. Generador Python de XLSX ejecutivo con fórmulas, formato y gráfica por DM.
9. Imagen y PDF incluyen realizados, total, pendientes, avance filtrado y regional.
10. PWA offline v9 y pruebas automáticas para archivos, Excel, imágenes y seguridad.

## Python como producto principal

`scripts/build_dashboard.py` es el motor del proyecto. Valida encabezados, normaliza CeCo, verifica evidencia segura, cruza tienda y DM, comprueba fotografías, deduplica respuestas, protege datos personales y genera `data/dashboard.json`. La prueba ya no congela una hora fija: compara el JSON publicado contra una reconstrucción completa desde el Excel.

`scripts/export_excel.py` construye `exports/Resumen_Evidencias_OPS.xlsx` como respaldo ejecutivo: Resumen, Tiendas y Actividades, con fórmulas recalculables, filtros, congelación de encabezados, semáforo y gráfica nativa. En el dashboard, el botón **Excel XLSX** genera una versión nueva con el alcance de los filtros actuales.

## Regla de cumplimiento

Una combinación tienda–actividad cuenta una sola vez cuando:

- el CeCo contiene exactamente cinco dígitos y existe en el directorio;
- la respuesta de confirmación es `Sí`;
- existe vínculo HTTPS en un dominio autorizado;
- la actividad está activa o fue detectada en el Forms.

Envíos repetidos se conservan como registros, pero el cumplimiento se deduplica por `CeCo + Actividad`, utilizando el más reciente.

## Publicación en GitHub Pages

1. Carga el contenido del ZIP en la raíz de un repositorio nuevo.
2. En **Settings → Pages**, selecciona **Deploy from a branch**.
3. Elige `main` y la carpeta `/ (root)`.
4. Guarda y espera la publicación.

La PWA funciona en subruta, instala caché offline y actualiza `data/dashboard.json` con estrategia network-first.

## Vistas

- **Resumen:** KPI, Director Regional, avance por actividad y ranking DM.
- **Actividades:** catálogo administrable y cumplimiento individual.
- **Tiendas:** cruce CeCo, avance, última respuesta y exportación CSV.
- **Evidencias:** nombre real del archivo y vínculo directo validado, filtrables por DM, tienda y actividad.
- **Exportación:** imagen, PDF y Excel con alcance dinámico. Todos los DM exporta el ranking regional; un DM exporta sus tiendas ordenadas de mayor a menor avance.

## Fuente inicial validada

- 72 tiendas abiertas de la hoja `72 T`, alineadas con las seis fotografías proporcionadas.
- 7 actividades activas.
- Última actualización: `28/08/2026 20:39`.
- CeCo `38401` cruzado como `Coacalco` y asignado a `Enrique Cesar Flores`.
- 2 respuestas válidas y 0 CeCo sin cruce.
