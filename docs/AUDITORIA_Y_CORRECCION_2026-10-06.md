# Auditoría y corrección — Sistema de Evidencias OPS

Revisión del 06/10/2026. Preparado: 06/10/2026 14:20 CST. Repositorio: https://github.com/sbx-mex/Sistemas_Evidencias_Ops. Rama auditada: `main`. Commit base: `c345ee5e5e908f5ea2122f1c99ee1c501111e3a3`.

**Dictamen: correcciones validadas localmente. Despliegue Azure pendiente de resolver la credencial o el recurso asociado.** El ZIP contiene 17 archivos de código, automatización, documentación y resultados nuevos o reemplazados, más este informe y los soportes. Los archivos están listos para incorporarse al repositorio; no se aplicaron cambios remotos.

## Resultado real del corte

Fecha de última respuesta integrada: **06/10/2026 14:01**. Catálogo maestro: `cms/Sistema_Evidencias_OPS_CMS.xlsx > Tiendas Abiertas`.

| Indicador | Valor |
| --- | ---: |
| Tiendas abiertas | 450 |
| Regiones / DM | 5 / 36 |
| Actividades activas CMS | 6 |
| Cumplimientos / ideal | 668 / 2700 |
| Avance | 24.7% |
| Pendientes | 2032 |
| Tiendas completas | 4 |
| CeCo ausentes del catálogo | 8 |
| Filas contradictorias en cuarentena | 0 |
| Respuestas con cantidades pendientes | 0 |

| Actividad | Cumplimientos | Pendientes | Avance |
| --- | ---: | ---: | ---: |
| Lay Out | 66 | 384 | 14.7% |
| Jarras Blender \| Cold Foam | 155 | 295 | 34.4% |
| Organización Refrigeradores Back | 23 | 427 | 5.1% |
| Va X Cuenta | 171 | 279 | 38.0% |
| FHW | 193 | 257 | 42.9% |
| Tarta Maricu | 60 | 390 | 13.3% |

Cantidades reconciliadas: **428 jarras** (275 Blender + 153 Cold Foam); **5483 piezas FHW** (4429 cubiertos + 1054 tazas de 3 oz); **Va X Cuenta 1969 Sí + 341 No = 2310**, porcentaje ponderado Sí **85.2%**. Las cantidades se mantienen separadas del avance de cumplimiento.

## Hallazgos y estado

| Código | Prioridad | Área | Estado |
| --- | --- | --- | --- |
| A01 | Alta | Contrato de carga | Corregido |
| A02 | Media | Imágenes y exportaciones offline | Corregido |
| A03 | Alta | Copia local y autenticación | Corregido |
| A04 | Alta | Secuencia de despliegue Azure | Corregido |
| A05 | Media | Fechas operativas | Corregido |
| A06 | Media | Instrucciones y catálogo maestro | Corregido |
| P01 | Alta | Credencial/recurso Azure | Pendiente externo |
| P02 | Media | Identidad de ocho CeCo | Pendiente operativo |

### A01 · Contrato de carga

**Hecho comprobado:** El contrato aceptaba ranking DM vacío, avance general alterado, totales de actividad incoherentes y cantidades negativas.

**Corrección/acción:** Se reconcilian tiendas, regiones, ranking DM, porcentajes, actividades, métricas, totales y desgloses con las respuestas. Se rechazan datos incoherentes.

### A02 · Imágenes y exportaciones offline

**Hecho comprobado:** Sin red ni copia local, el SW devolvía null. La cuota agotada descartaba una descarga correcta. La renovación de imágenes no mantenía vivo el evento.

**Corrección/acción:** Se devuelve una Response de error válida, se conserva una descarga correcta aunque falle la caché y se registra waitUntil para la renovación.

### A03 · Copia local y autenticación

**Hecho comprobado:** El SW devolvía un JSON guardado sin volver a validarlo y sustituía HTTP 401/403 por una copia local. Podía interceptar rutas de autenticación.

**Corrección/acción:** La copia offline supera el mismo contrato; una copia corrupta se descarta. HTTP 401/403 y redirecciones se devuelven al navegador; /.auth/ queda fuera del SW.

### A04 · Secuencia de despliegue Azure

**Hecho comprobado:** El push disparaba Azure al mismo tiempo que la reconstrucción del dashboard; podía empaquetar datos anteriores. El staging sólo comprobaba que el JSON fuera legible.

**Corrección/acción:** Se elimina el despliegue paralelo por push. Azure parte del workflow de mantenimiento terminado y vuelve a validar/reconstruir la revisión descargada. Un preparador central comprueba contrato, recursos y restricción de acceso.

### A05 · Fechas operativas

**Hecho comprobado:** La versión diaria y los vencimientos dependían de la zona horaria del runner; generatedAt también usaba su horario local.

**Corrección/acción:** Las fechas operativas usan America/Mexico_City. Se prueban las 01:00 y 06:00 UTC, antes y después de la medianoche mexicana. Se incluye tzdata para Windows.

### A06 · Instrucciones y catálogo maestro

**Hecho comprobado:** La documentación presentaba Tiendas Abiertas como vista automática aunque la configuración actual usa el CMS como catálogo maestro.

**Corrección/acción:** README distingue CMS maestro y Directorio de respaldo, documenta el mantenimiento completo y el despliegue validado.

### P01 · Credencial/recurso Azure

**Hecho comprobado:** El despliegue real 37523926613 fue rechazado por Azure: aplicación no encontrada o clave inválida.

**Corrección/acción:** Actualizar el secreto del workflow con el token de la Static Web App correcta y volver a ejecutar. El ZIP añade diagnóstico para secreto vacío; no contiene credenciales ni puede reparar un token privado.

### P02 · Identidad de ocho CeCo

**Hecho comprobado:** Ocho respuestas de actividades activas tienen códigos ausentes del catálogo maestro.

**Corrección/acción:** Confirmar identidad con catálogo oficial; corregir Forms o completar el CMS. Mantener el aislamiento hasta confirmar. El CSV incluye Id y fila para localizar cada respuesta.

## CeCo pendientes de confirmar

Estos códigos no se asignaron a otra tienda. Una corrección de identidad necesita datos oficiales. `storeCatalogSource = CMS` controla altas, bajas y reasignaciones; agregar una tienda sólo al Directorio de respaldo no la habilita en el dashboard.

| CeCo | Id Forms | Fila Excel | Actividad | Fecha |
| --- | --- | ---: | --- | --- |
| 38104 | 1521 | 620 | Jarras Blender \| Cold Foam | 01/10/2026 14:49 |
| 38278 | 1607 | 675 | Jarras Blender \| Cold Foam | 03/10/2026 18:08 |
| 38489 | 1209 | 382 | FHW | 29/09/2026 11:44 |
| 38608 | 1506 | 610 | Va X Cuenta | 01/10/2026 12:37 |
| 38666 | 1568 | 647 | Lay Out | 02/10/2026 12:08 |
| 39722 | 1439 | 562 | FHW | 30/09/2026 16:23 |
| 43079 | 1718 | 779 | FHW | 06/10/2026 12:34 |
| 80173 | 1290 | 455 | FHW | 29/09/2026 16:47 |

Seis perfiles DM aún no tienen fotografía: Maria Sanchez, Alberto Torrado, Guadalupe Ibarra, Luis Neri, Nora Caracas y Vacante. Son pendientes visuales informativos; se muestran iniciales y los conteos siguen funcionando.

## Pruebas ejecutadas

- `python scripts/safe_maintenance.py --force`: preflight, reconstrucción JSON/XLSX/PDF, rollback, fuentes, crecimiento CMS, catálogo maestro, Forms dinámico, corte histórico, cruce, filtros y auditorías aprobados.
- `node tests/validate_load_contract.js`: datos alterados, ranking y totales, cantidades, JSON parcial, HTTP 503, ausencia de red, caché corrupta, HTTP 401/403 y recuperación de carga aprobados.
- `node tests/validate_service_worker.js`: imágenes sin red, cuota agotada, renovación de caché y rutas de autenticación aprobados.
- `python tests/validate_operational_timezone.py`: límite de día operativo mexicano y huella diaria aprobados.
- `python tests/validate_azure_package.py`: recursos completos, JSON idéntico, exclusión de fuentes internas y restricción de acceso aprobados.
- `python tests/validate_publish_safe.py`: cargas concurrentes, reconstrucción contra nueva carga y rechazo sin sobrescribir cambios aprobados.
- `node tests/validate_fhw_summary.js`: **440 escenarios** de filtros, ceros, pendientes, promedios y exportaciones aprobados.
- Compilación Python, sintaxis de los cinco motores JS, YAML, `git diff --check` y limpieza de obsoletos aprobados.

Evidencia antes/después y salida completa en `docs/VALIDACION_AUDITORIA_2026-10-06.txt`. Entorno: Python 3.12.14 y Node v24.19.0. JSON, Excel y PDF fueron reconstruidos desde las mismas fuentes. El avance se mantiene en 668/2700; las correcciones evitan aceptar inconsistencias futuras.

## Aplicación en tres pasos

1. Descomprimir el ZIP y incorporar sus archivos en la raíz de `Sistemas_Evidencias_Ops`, conservando `.github/workflows`, `scripts`, `tests`, `data`, `exports` y `docs`. Revisar el cambio y guardar el commit. Los Excel operativos de `cms/` permanecen idénticos a la revisión auditada.
2. En Azure, seleccionar la **Static Web App** correcta y abrir **Overview > Manage deployment token**. Copiar su token; en GitHub, actualizar **Settings > Secrets and variables > Actions > AZURE_STATIC_WEB_APPS_API_TOKEN_SALMON_SEA_07FE94410**. Confirmar que el recurso existe. No publicar el valor del token en archivos o mensajes.
3. En GitHub Actions ejecutar **Actualizar Sistema de Evidencias OPS** sobre `main`. Al concluir correctamente se ejecuta Azure; confirmar el resultado de ambos workflows y el corte en el sitio. Para reconstrucción local: instalar `requirements.txt` y ejecutar `python scripts/safe_maintenance.py --force`.

Procedimiento oficial del token: https://learn.microsoft.com/en-us/azure/static-web-apps/deployment-token-management. Dependencia de zona horaria Windows: https://pypi.org/project/tzdata/2026.5/.

## Alcance y límites comprobados

Se inspeccionó el código y los Excel de la revisión indicada, las exportaciones y el log real de GitHub Actions. Se conservaron las reglas del CMS, el corte histórico y las URLs exactas publicadas de SharePoint. El manifiesto contiene las huellas de las fuentes y de cada archivo del paquete.

La publicación real en Azure permanece pendiente; la auditoría no valida el token ni la existencia del recurso privado. No se abrió el contenido de las fotos privadas en SharePoint ni se verificaron sus permisos. La validación del navegador se realizó con pruebas de lógica y contrato; la revisión visual con Chromium no pudo ejecutarse porque el navegador no estaba disponible y su descarga falló. Windows no se ejecutó en este entorno. El código mantiene el acceso `evidencias_ops` configurado actualmente.

Los ocho CeCo requieren confirmación operativa. El repositorio es público; el control de acceso de Azure no cambia esa visibilidad. Los vínculos SharePoint siguen sujetos a los permisos de SharePoint. Si se desea modificar la visibilidad del repositorio o el modelo de acceso, debe decidirse como cambio separado.
