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

El correo, nombre del respondente y vínculo privado de SharePoint no se publican en GitHub. El dashboard muestra la evidencia como `Roll_Out_38401` y deja el acceso protegido. Esto evita convertir una ruta personal de SharePoint en un dato público.

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
- El nombre visible se forma como `Actividad_CeCo`; no expone el nombre original del archivo.
- En un repositorio público, conserva `publishEvidenceLinks = No`.
- Si el proyecto se mueve a un entorno autenticado y se autoriza la exposición de las rutas, cambia `publishEvidenceLinks = Si`. El botón abrirá SharePoint en una pestaña aislada con `noopener`, `noreferrer` y sin encabezado `Referer`. SharePoint seguirá determinando quién puede ver la imagen.

## Fotografías y liderazgo regional

La hoja `Gerentes` relaciona el nombre exacto del directorio con su fotografía en `assets/dm/`. La hoja `Configuracion` publica a **Jorge Alcantar** como **Director Regional** mediante `assets/director/jorge-alcantar.webp`. Python detiene la generación si falta una imagen configurada.

## 10 mejoras de facilidad visual

1. Nueva vista **Equipo DM** con fotografía por Gerente de Distrito.
2. Tarjetas DM con tiendas, avance, pendientes y estado en una sola lectura.
3. Selección directa del portafolio al tocar la tarjeta o el ranking.
4. Medidor circular de cumplimiento para lectura ejecutiva en 10 segundos.
5. Mensaje automático de prioridad generado según los pendientes.
6. Semáforo visual: Completo, En avance y Por iniciar.
7. Filtros persistentes por DM, tienda/CeCo y actividad.
8. Ranking DM enriquecido con avatar y acceso rápido.
9. Cola de atención priorizada generada por Python para las tiendas pendientes.
10. PWA offline v7 que conserva dashboard, liderazgo y fotografías del equipo.

## Python como producto principal

`scripts/build_dashboard.py` es el motor del proyecto. Valida encabezados, normaliza CeCo, verifica evidencia segura, cruza tienda y DM, comprueba fotografías, deduplica respuestas, protege datos personales y genera `data/dashboard.json`. La prueba ya no congela una hora fija: compara el JSON publicado contra una reconstrucción completa desde el Excel.

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
- **Evidencias:** registros compactos `Actividad_CeCo`, filtrables y con acceso gobernado por el CMS.
- **Exportación:** imagen y PDF con porcentaje de avance regional, incluso al consultar un alcance filtrado.

## Fuente inicial validada

- 72 tiendas abiertas de la hoja `72 T`, alineadas con las seis fotografías proporcionadas.
- 7 actividades activas.
- Última actualización: `28/08/2026 20:39`.
- CeCo `38401` cruzado como `Coacalco` y asignado a `Enrique Cesar Flores`.
- 2 respuestas válidas y 0 CeCo sin cruce.
