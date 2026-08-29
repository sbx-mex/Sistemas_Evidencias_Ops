# 10 mejoras visuales implementadas

| # | Mejora | Resultado |
|---:|---|---|
| 1 | Vista Equipo DM | Directorio visual con las seis fotografías entregadas. |
| 2 | Tarjetas ejecutivas | Foto, nombre, tiendas, avance, pendientes y estado en un solo bloque. |
| 3 | Enfoque por gerente | Un clic filtra todas las métricas y abre el portafolio correspondiente. |
| 4 | Lectura en 10 segundos | Medidor circular y mensaje automático de prioridad. |
| 5 | Semáforo operativo | Estados Completo, En avance y Por iniciar. |
| 6 | Ranking con identidad | Avatar, posición, tiendas y porcentaje por DM. |
| 7 | Filtros persistentes | Barra visible por DM, tienda/CeCo y actividad. |
| 8 | Atención priorizada | Python ordena tiendas pendientes por menor cumplimiento. |
| 9 | CMS de gerentes | `config/gerentes.csv` permite cambiar nombre o fotografía sin tocar la interfaz. |
| 10 | PWA offline v2 | Fotografías y dashboard disponibles desde el caché de la aplicación. |

## Control del motor Python

El comando `python scripts/build_dashboard.py` valida los encabezados del Forms, el directorio, las fotografías y la configuración; luego reconstruye todas las métricas públicas. Si falta una foto configurada o cambia un encabezado requerido, el proceso falla con un mensaje claro antes de publicar información incompleta.
