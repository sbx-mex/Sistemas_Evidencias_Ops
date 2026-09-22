# Auditoría de carga segura

Fecha de revisión: 22 de septiembre de 2026

Repositorio: `sbx-mex/Sistemas_Evidencias_Ops`  
Base auditada: `main` en `44463b9`, con el CMS actualizado por Operación

## Resultado

La actualización local completa terminó correctamente y quedó lista para GitHub Actions.

- 426 filas combinadas entre el corte histórico y Forms vigente.
- 384 filas conservadas en el corte histórico.
- 42 filas nuevas activas incorporadas.
- 357 tiendas con `Estatus = Abierta`.
- 4 regiones y 28 DM.
- 9 actividades activas definidas por el CMS.
- 299 cumplimientos de 3,202 esperados.
- 9.3% de avance regional.
- 13 de 13 controles del proyecto aprobados.
- 12 de 12 controles de estabilidad aprobados.
- 0 vínculos inseguros.
- 0 referencias faltantes.
- 0 archivos obsoletos.

## Validación del caso 38371

La respuesta de prueba quedó publicada correctamente.

- CeCo: `38371`
- Tienda: `Montevideo DT`
- DM: `Vanessa Carreño Rios`
- Región: `Centro Norte`
- Actividad: `Organizacion Refrigeradores Back`
- Encabezado detectado: `Evidencia_Organizacion_Refrigeradores_Back`
- Resultado: coincidencia exacta, evidencia HTTPS de SharePoint válida y cumplimiento contabilizado.

## Hallazgos corregidos

- La prueba de campaña exigía dos actividades Peanuts aunque el CMS ya hubiera desactivado una.
- Una evidencia histórica de una actividad inactiva podía degradar la estabilidad del build.
- La auditoría revisaba incidencias crudas de Forms sin distinguir filas aisladas, inactivas o excluidas.
- La vigencia de resultados sólo comprobaba que los exportables existieran; ahora también valida la estructura XLSX y el cierre correcto del PDF.
- La base histórica fue reemplazada sin actualizar su huella, por lo que el workflow se detuvo correctamente.

El motor toma la lista activa directamente del CMS. `Activo = No` retira la actividad del denominador y aísla sus filas históricas antes de evaluar estabilidad. La incidencia sigue visible en la auditoría del esquema, pero no modifica conteos ni fecha de corte.

La nueva base histórica se comparó fila por fila contra la anterior: conserva 384 respuestas sin cambios y retira únicamente 41 registros de `Lay Out`. `config/cutover.json` registra la nueva huella, la huella sustituida y el motivo del reinicio.

## Mejoras incluidas

- Catálogo de pruebas construido desde las actividades realmente activas del CMS.
- Aislamiento explícito de filas inactivas, ignoradas o en cuarentena.
- Validación estricta basada sólo en incidencias no resueltas.
- Reconstrucción atómica de JSON, Excel y PDF con rollback.
- Verificación de huellas SHA-256 antes y después de ejecutar.
- Detección de exportables incompletos o truncados.
- Prueba de regresión que confirma que el JSON respeta exactamente el catálogo CMS.

## Advertencias no bloqueantes

Los CeCo `38599` y `94565` permanecen aislados y no afectan el avance:

- `38599` aparece en el directorio nacional proporcionado, pero pertenece a la región Sur y no forma parte del Directorio Centro publicado.
- `94565` no existe en el Directorio revisado.

No deben agregarse por aproximación. Se recuperarán automáticamente cuando exista un registro válido en el Directorio controlado.

Las filas 30 y 108 del Forms vigente permanecen en cuarentena por contener más de una evidencia coincidente. El resto del archivo se publica normalmente.

## Regla para nuevas actividades

1. Agrega la actividad en `cms/Sistema_Evidencias_OPS_CMS.xlsx`.
2. Captura `Orden`, `Actividad`, fechas, `Activo = Si`, evidencia requerida y prioridad.
3. En Microsoft Forms agrega la pregunta de carga con el encabezado `Evidencia_<Actividad>`.
4. Conserva el mismo nombre funcional de la actividad. Python normaliza espacios, acentos y separadores, pero no debe adivinar nombres diferentes.
5. Carga el nuevo Excel de Forms en `cms/Sistema de Evidencias OPS.xlsx`.
6. Confirma que GitHub Actions termine en verde.

## Validación local

```bash
python -X utf8 scripts/safe_maintenance.py --force
```

El resultado esperado incluye:

- `Forms dinámico aprobado`
- `Mantenimiento aprobado`
- `Validación aprobada · 13/13 controles`
- `issues: []`
- `Actualización segura aprobada`
