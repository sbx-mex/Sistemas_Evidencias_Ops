# Aplicar la auditoría de encuestas

Correcciones para **sbx-mex/Sistemas_Evidencias_Ops**, sobre main en la revisión
`c65cfad5ff89a5b96f71101e09db90cfaea69dd0`. Este paquete se aplica al repositorio
existente. Contiene los archivos corregidos, las exportaciones actualizadas y
pruebas reproducibles. El corte Forms auditado es del **29/09/2026 20:58**.

1. Extrae el ZIP y copia su contenido a la raíz de una copia del repositorio, conservando las carpetas. Reemplaza los archivos coincidentes.
2. Conserva los Excel vigentes de `cms/` y la configuración del repositorio. Ninguno de esos originales está incluido en el ZIP.
3. Ejecuta `python -X utf8 verificar_paquete_encuestas.py` antes de reconstruir. Comprueba todos los archivos y las huellas de las fuentes. Si tus fuentes son más recientes, conserva las actuales y reconstruye.
4. Con las dependencias de `requirements.txt` instaladas, ejecuta:

```bash
python -X utf8 scripts/safe_maintenance.py --force
python -X utf8 scripts/audit_response_types.py --report docs/auditoria_tipos_actual.json
python -X utf8 scripts/audit_cms_visibility.py --report docs/auditoria_cms_actual.json
python -B -X utf8 tests/validate_publish_safe.py
git diff --check
```

5. Confirma `Actualización segura aprobada`, ambas auditorías `13/13`, `issues: []` y cero obsoletos. Los conteos cambian si hay nuevas respuestas o cambios autorizados del CMS.
6. Carga los archivos en GitHub manteniendo sus rutas. Confirma que la nueva ejecución de **Actualizar Sistema de Evidencias OPS** termine en verde antes de confirmar la publicación.

El workflow existente ya llama al mantenimiento seguro, que ahora ejecuta
también la auditoría nueva de tipos. No requiere cambiar el workflow.
El ZIP incorpora nueve archivos de código/datos/exportación, más informes e
instrucciones. No contiene credenciales, carpetas Git ni copias de Excel fuente.

**No subas únicamente el ZIP al repositorio ni pongas los archivos internos sueltos en la raíz.**

El CMS continúa autorizando exclusivamente `Activo = Si`. `Activo = No` o vacío
omite la actividad aunque conserve respuestas en cualquiera de los dos Excel.
`Evidencia requerida = No` no desactiva una actividad que tenga `Activo = Si`.

Si main incorporó cambios posteriores en los mismos scripts, revisa esas
diferencias antes de reemplazarlos. Las huellas del paquete verifican integridad;
no sustituyen la validación con tus fuentes actuales.

La validación incluida se ejecutó localmente. GitHub no recibió cambios durante
esta auditoría. Los archivos generados son una instantánea; el workflow debe
regenerarlos al aplicar las correcciones sobre las respuestas más recientes.
