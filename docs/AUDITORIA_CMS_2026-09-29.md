# Auditoría Python: control de visibilidad CMS

Fecha operativa del informe: 29/09/2026. Fuente: main del repositorio solicitado.

**Resultado: APROBADO.** Los cuatro Excel fuente conservaron sus bytes originales.

Se detectó un dashboard anterior con 10 actividades, frente a 6 autorizadas por el CMS actual. Se reconstruyeron JSON y exportaciones. El fallo de pruebas era una comparación del orden editorial con el orden por fecha del tablero, y escenarios históricos que suponían actividades activas. Esos escenarios ahora habilitan las actividades necesarias únicamente en copias temporales.

Se retiró la autorización por similitud de nombres. Se distinguen los encabezados de evidencia de actividades activas e inactivas para impedir que una columna retirada acredite otra actividad. Una identidad CMS duplicada con Si y No detiene la carga.

## Catálogo autorizado

| Actividad | Activo |
| --- | --- |
| Lay Out | Si |
| Jarras Blender \| Cold Foam | Si |
| Organización Refrigeradores Back | Si |
| Va X Cuenta | Si |
| FHW | Si |
| Tarta Maricu | Si |

## Actividades omitidas

- Rack FHW
- Max & Min
- Mandil Verde
- Community Board
- Señaletica Back
- Señaletica Lobby
- Roll Out
- Programacion Hornos Merry - Focaccia
- Fotografia - SM
- Activacion PSL Sharpie
- Validacion Horario Festivo Sep 26
- Peanuts Charly&Lucy
- Peanuts Linus&Snoopy

## Excel de respuestas auditados

| Archivo | Filas leídas | Fuera del CMS activo |
| --- | ---: | ---: |
| Corte_Forms_2026-09-17_115657.xlsx | 384 | 267 |
| Sistema de Evidencias OPS.xlsx | 392 | 183 |

Estas cifras se cuentan por archivo y no deben sumarse como respuestas únicas. El corte combina 384 filas históricas y 209 filas nuevas elegibles antes de aplicar visibilidad, integridad, evidencias y selección de la última respuesta por tienda/actividad.

## Pruebas de control

1. Catálogo, tiendas, módulos y conteos sólo contienen actividades activas CMS.
2. Ambos Excel respetan el CMS también sin unión del corte.
3. Conservar u omitir historia inactiva no cambia avance, evidencia ni fecha.
4. Activo=No retira historia, módulo y denominador: Lay Out.
5. Activo=No retira historia, módulo y denominador: Jarras Blender | Cold Foam.
6. Activo=No retira historia, módulo y denominador: Organización Refrigeradores Back.
7. Activo=No retira historia, módulo y denominador: Va X Cuenta.
8. Activo=No retira historia, módulo y denominador: FHW.
9. Activo=No retira historia, módulo y denominador: Tarta Maricu.
10. Nombre externo similar y encabezado de actividad No no acreditan cumplimiento.
11. Actividad duplicada con Si/No contradictorios bloquea la carga.
12. Excel exportado sólo incluye actividades y evidencias activas.
13. CMS, Directorio, ambos Forms y configuración conservan sus SHA256.

Las desactivaciones y los casos adversos se ejecutaron en archivos temporales. También se verificó que retirar filas inactivas de ambos Excel no cambia el resultado operativo, incluidos vínculos y fecha. Las exportaciones usan el mismo JSON validado.

## Cómo repetir

```bash
python -X utf8 scripts/safe_maintenance.py --force
python -X utf8 scripts/audit_cms_visibility.py --report docs/auditoria_cms_actual.json
```

El informe JSON incluido registra las huellas SHA256 de las fuentes. El registro de validación incluye la ejecución completa del mantenimiento seguro. La prueba de publicación usa un remoto temporal local; GitHub no recibió cambios.
