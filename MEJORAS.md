# 10 mejoras visuales implementadas

| # | Mejora | Resultado |
|---:|---|---|
| 1 | Evidencias compactas | Encabezados Actividad, CeCo y Evidencia con nombre `Actividad_CeCo`. |
| 2 | Enlaces seguros | HTTPS, lista de dominios, acceso aislado y privacidad pública por defecto. |
| 3 | Enfoque por gerente | Un clic filtra todas las métricas y abre el portafolio correspondiente. |
| 4 | Lectura en 10 segundos | Medidor circular y mensaje automático de prioridad. |
| 5 | Semáforo operativo | Estados Completo, En avance y Por iniciar. |
| 6 | Ranking con identidad | Avatar, posición, tiendas y porcentaje por DM. |
| 7 | Filtros persistentes | Barra visible por DM, tienda/CeCo y actividad. |
| 8 | Liderazgo regional | Jorge Alcantar aparece como Director Regional con fotografía optimizada. |
| 9 | Exportación ejecutiva | Imagen y PDF incluyen el porcentaje de avance regional. |
| 10 | Motor certificado | La fecha se deriva del Excel y la prueba compara una reconstrucción completa. |

## Control del motor Python

El comando `python scripts/build_dashboard.py` valida los encabezados del Forms, el directorio, las fotografías, el dominio de evidencia y la configuración; luego reconstruye las métricas públicas. Si falta una foto, cambia un encabezado o aparece un vínculo inseguro, el proceso lo identifica antes de publicar información incompleta.
