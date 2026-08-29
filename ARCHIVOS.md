# Archivos del proyecto

| Ruta | Función |
|---|---|
| `index.html` | Estructura del dashboard y navegación. |
| `styles.css` | Diseño corporativo, responsive e impresión. |
| `app.js` | Filtros, KPI, avisos y exportación dinámica por alcance. |
| `xlsx-export.js` | Generador XLSX sin dependencias para la exportación filtrada en navegador. |
| `service-worker.js` | Caché offline y actualización de datos. |
| `manifest.webmanifest` | Instalación como aplicación. |
| `cms/*.xlsx` | Fuentes de Forms y Directorio Centro Norte. |
| `config/actividades.csv` | CMS de actividades expuestas. |
| `config/gerentes.csv` | CMS de nombres, fotos y estado visual de los DM. |
| `assets/dm/*.webp` | Fotografías optimizadas para las tarjetas DM. |
| `assets/director/jorge-alcantar.webp` | Fotografía del Director Regional. |
| `assets/ui/Damos_Seguimiento.webp` | Aviso visual previo a la exportación. |
| `assets/ui/Un_placer_haber_Ayudado.webp` | Confirmación visual posterior a la exportación. |
| `config/settings.json` | Región, hoja y controles de privacidad. |
| `scripts/build_dashboard.py` | Motor Python de cruce y cumplimiento. |
| `scripts/export_excel.py` | Genera el XLSX ejecutivo con fórmulas y gráfica. |
| `scripts/prepare_images.py` | Convierte fotografías a WebP corporativo. |
| `data/dashboard.json` | Salida consumida por la PWA. |
| `exports/Resumen_Evidencias_OPS.xlsx` | Respaldo ejecutivo generado por Python. |
| `tests/validate_project.py` | Validación integral del proyecto. |
| `tests/build_dynamic_xlsx.js` | Prueba que la exportación XLSX dinámica sea válida. |
| `.github/workflows/build-dashboard.yml` | Automatización al actualizar los Excel. |
| `MEJORAS.md` | Resumen verificable de las 10 mejoras visuales. |

El ZIP de actualización conserva estas mismas rutas: carga su contenido en la raíz del repositorio y permite reemplazar los archivos coincidentes.
