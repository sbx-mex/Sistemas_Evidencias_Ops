# Auditoría de carga segura

Fecha de revisión: 19 de septiembre de 2026

Repositorio: `sbx-mex/Sistemas_Evidencias_Ops`  
Base auditada: `main` en `e4101f0`

## Resultado

La carga vigente es funcional y la ejecución más reciente de GitHub Actions terminó correctamente.

- 451 filas de Forms leídas.
- 425 filas conservadas en el corte histórico.
- 26 filas nuevas incorporadas.
- 357 tiendas con `Estatus = Abierta`.
- 4 regiones y 28 DM.
- 11 actividades activas.
- 397 cumplimientos de 3,911 esperados.
- 10.2% de avance regional.
- 13 de 13 controles del proyecto aprobados.
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

## Hallazgo corregido

El CMS contenía una segunda fila de encabezados dentro de:

- `Gerentes`
- `Organigrama`
- `Tiendas Abiertas`
- `Configuracion`

Python ignoraba esas filas y por eso el proceso podía terminar en verde, pero eran redundantes y afectaban la lectura del archivo. El paquete elimina esas filas y agrega una validación que detiene futuras cargas si un encabezado vuelve a quedar repetido dentro de los datos.

## Mejoras incluidas

- CMS sin encabezados internos duplicados.
- Filas preparadas para agregar actividades nuevas.
- Listas desplegables para `Activo`, `Evidencia requerida` y `Prioridad`.
- Fórmula de `Estado fecha` preparada para filas nuevas y vacía mientras no exista una actividad.
- Texto de ayuda más directo en cada hoja.
- Directorio con encabezado claro, congelación de fila superior y validación de estatus.
- Prueba integral de alta dinámica: fila CMS nueva + pregunta Forms nueva.
- Validación explícita contra encabezados repetidos.

## Advertencias no bloqueantes

Los CeCo `38599` y `94565` permanecen aislados y no afectan el avance:

- `38599` aparece en el directorio nacional proporcionado, pero pertenece a la región Sur y no forma parte del Directorio Centro publicado.
- `94565` no existe en el Directorio revisado.

No deben agregarse por aproximación. Se recuperarán automáticamente cuando exista un registro válido en el Directorio controlado.

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
- `Organizacion_Refrigeradores_Back_38371 → Montevideo DT`

