# Auditoría Python de encuestas y CMS

Revisión auditada: `c65cfad5ff89a5b96f71101e09db90cfaea69dd0`. Informe: 30/09/2026.

**Resultado local: APROBADO.** Última respuesta: 29/09/2026 20:58.

## Hallazgo corregido

Las 23 respuestas de Tarta Maricu tenían dos encabezados específicos: `Evidencia_Tarta_Copete_POS` y `Evidencia_Tarta_MiniCopete_ShowCase`. El motor anterior las aislaba como `ambiguous-evidence` a pesar de contener ambos archivos. Ahora se reconocen expresamente como las etapas POS y Showcase de una sola respuesta. El CMS sigue determinando si Tarta está autorizada.

En el mismo corte, el tablero pasa de 405 a 428 cumplimientos, de 18.9% a 19.9%. No se suman fotografías como actividades adicionales.

Cada vínculo conserva su valor exacto en Excel y JSON. Un reenvío reemplaza la pareja completa; nunca mezcla archivos de dos filas. Faltantes, contradicciones, actividad incorrecta, evidencia extra y dominios no autorizados quedan fuera de cumplimiento.

## Cobertura del corte

Forms actual: 524 filas. Base histórica: 384 filas. Estas cifras pertenecen a archivos distintos y no son respuestas únicas sumables. El corte combina la base y las respuestas nuevas elegibles; después aplica visibilidad CMS, identidad, integridad y la última respuesta por tienda/actividad.

| Actividad CMS activa | Tiendas con cumplimiento |
| --- | ---: |
| Lay Out | 50 |
| Jarras Blender \| Cold Foam | 137 |
| Organización Refrigeradores Back | 12 |
| Va X Cuenta | 112 |
| FHW | 94 |
| Tarta Maricu | 23 |

## Cantidades reconciliadas

- Jarras: 240 Blender + 140 Cold Foam = **380 piezas**, 137 tiendas.
- FHW: 2,453 cubiertos + 529 vasos de 3 oz = **2,982 piezas**, 94 tiendas.
- Va X Cuenta: 1,286 sí + 203 no = **1,489 respuestas cuantificadas**, 112 tiendas; **86.4% sí**, porcentaje ponderado.

El porcentaje de Va X Cuenta mide las cantidades declaradas, separado del avance de actividades.

## Control de visibilidad

Los 13 registros CMS inactivos siguen omitidos aunque tengan respuestas históricas. Se probó desactivar individualmente cada una de las seis actividades activas: desaparece de módulos, evidencia, conteos y denominador.

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

## Controles nuevos reproducibles

1. Tablero sincronizado con CMS y ambas fuentes Forms.
2. Una sola respuesta ganadora por tienda/actividad, dentro del CMS.
3. POS y Showcase publicados conservan ambos vínculos de la misma fila original.
4. Encabezados nuevos de Tarta reconocidos expresamente.
5. Jarras, FHW y Va X Cuenta reconcilian por respuesta, región y DM; porcentaje ponderado.
6. Exportación Excel conserva todas las etapas y vínculos exactamente.
7. Pareja completa: una actividad y dos archivos, con columnas reordenadas.
8. Reenvío más reciente reemplaza la pareja completa sin duplicar ni mezclar.
9. Archivo o encabezado de Showcase faltante deja la respuesta fuera de cumplimiento.
10. Duplicados idénticos se consolidan; duplicados contradictorios se aíslan.
11. Archivos extra o actividad incorrecta se aíslan sin reasignar evidencias.
12. Cada vínculo supera la validación HTTPS y de dominio autorizado.
13. Fuentes originales conservan sus SHA256.

Los escenarios adversos utilizan únicamente copias temporales. Las seis fuentes Excel/configuración coinciden byte por byte con main en la revisión auditada. Sus SHA256 aparecen en los informes JSON y el manifiesto.

## Datos pendientes de catálogo

CeCo 38489 y 80173 no existen en el Directorio y continúan aislados. Se requiere verificar sus identidades con el catálogo oficial. El aislamiento evita inflar el avance; no es una autorización para reasignarlos.

## Archivos de la corrección

- Motor de evidencias: perfiles explícitos POS/Showcase y consolidación de duplicados equivalentes.
- Auditoría general: reconoce las etiquetas de cada perfil y preserva enlaces.
- Mantenimiento: integra el control de tipos en cada reconstrucción y en el workflow existente.
- Pruebas dinámicas y de corte: usan evidencia simple en los escenarios genéricos; los perfiles múltiples tienen pruebas específicas.
- JSON, Excel y PDF: reconstruidos con el último Forms disponible.
- Informe de validación: reemplaza el corte anterior y documenta las incidencias de catálogo.

## Alcance de la seguridad comprobada

Se comprobó la integridad de fuentes, autorización por CMS, validación de vínculos, aislamiento de entradas incoherentes, consistencia de totales y conservación de resultados ante fallos mediante las pruebas del proyecto. No constituye una prueba de penetración ni una garantía de ausencia de vulnerabilidades. Los vínculos se contrastaron con las celdas y sus dominios; no se abrió el contenido privado de SharePoint para verificar permisos o contenido de las fotografías.
