# Carga segura de la corrección CMS

Paquete de correcciones para **sbx-mex/Sistemas_Evidencias_Ops**, revisión
`b69994ed01fb344b2a60303f2f53e1245bcefe39` de main. Revisión comprobada otra vez
al terminar. Este ZIP se aplica sobre el repositorio existente; no es una copia
independiente de todo el repositorio.

1. Extrae el ZIP y conserva la estructura `scripts/`, `tests/`, `data/`, `exports/` y `docs/`.
2. Copia su contenido a la raíz de una copia del repositorio, reemplazando los archivos coincidentes. No aplanes las carpetas.
3. Conserva los cuatro Excel de `cms/` y `config/cutover.json` del repositorio actual. El ZIP no contiene ni reemplaza esas fuentes.
4. Antes de reconstruir, ejecuta `python -X utf8 verificar_paquete_cms.py`. Debe aprobar la integridad de los archivos. Si las fuentes cambiaron, reconstruye con las actuales.
5. Con las dependencias de `requirements.txt` instaladas, ejecuta:

```bash
python -X utf8 scripts/safe_maintenance.py --force
python -X utf8 scripts/audit_cms_visibility.py
python -X utf8 tests/validate_publish_safe.py
git diff --check
```

6. Confirma `Actualización segura aprobada`, `CMS seguro aprobado`, `issues: []` y cero obsoletos. Los conteos pueden cambiar si tus fuentes son más recientes.
7. Carga los archivos manteniendo sus carpetas. El workflow existente “Actualizar Sistema de Evidencias OPS” reconstruye y valida al recibir cambios en main. Confirma el resultado verde de esa ejecución antes de dar por confirmada la publicación.

**No subas el ZIP como un único archivo ni arrastres los archivos internos todos sueltos a la raíz.** El repositorio necesita las rutas completas.

La validación incluida es local, con los mismos controles del workflow. No se
modificó GitHub ni se ejecutó una publicación remota durante esta auditoría.

## Regla operativa

| Campo CMS | Efecto |
| --- | --- |
| Activo = Si | Autoriza la actividad; se evalúan sus respuestas válidas. |
| Activo = No o vacío | Omite actividad, historia, módulo, evidencia y denominador. |
| Evidencia requerida = No, con Activo = Si | La actividad permanece visible; no exige foto para contar. |
| Estado fecha = Vigente, con Activo = No | Sigue omitida. El estado informativo no la reactiva. |
| Actividad de Forms ausente del CMS activo | Se omite, aunque su nombre se parezca. |

Las diferencias de acentos, mayúsculas, espacios y signos se normalizan.
Un nombre con palabras distintas debe corregirse en Forms o CMS; no se autoriza
por similitud. Las respuestas y fechas originales de ambos Excel quedan intactas.

Si el CMS no tiene ninguna actividad activa, o contiene el mismo nombre con Si
y No, la carga se detiene y conserva los resultados anteriores.
