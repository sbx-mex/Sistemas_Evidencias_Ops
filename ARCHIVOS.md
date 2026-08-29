# Archivos del proyecto

| Ruta | Función |
|---|---|
| `index.html` | Estructura del dashboard y navegación. |
| `styles.css` | Diseño corporativo, responsive e impresión. |
| `app.js` | Filtros, KPI, perfil del DM y exportación dinámica por alcance y actividad. |
| `pdf-export.js` | Generador PDF multipágina y descarga directa desde el navegador. |
| `xlsx-export.js` | Generador XLSX filtrado con títulos oscuros, fórmulas y estados por actividad. |
| `service-worker.js` | Caché offline y actualización de datos. |
| `manifest.webmanifest` | Instalación como aplicación. |
| `cms/*.xlsx` | Fuentes de Forms y Directorio Centro Norte. |
| `assets/dm/*.webp` | Fotografías optimizadas para las tarjetas DM. |
| `assets/director/jorge-alcantar.webp` | Fotografía del Director Regional. |
| `assets/ui/Damos_Seguimiento.webp` | Aviso visual previo a la exportación. |
| `assets/ui/Un_placer_haber_Ayudado.webp` | Confirmación visual posterior a la exportación. |
| `config/settings.json` | Región, hoja y autorización de enlaces SharePoint. |
| `INSTRUCCION_FORMS.md` | Texto y ramificación exacta para la pregunta de Hornos en Forms. |
| `scripts/build_dashboard.py` | Motor Python de cruce y cumplimiento. |
| `scripts/clean_obsolete.py` | Limpieza segura mediante una lista cerrada de duplicados heredados. |
| `scripts/export_excel.py` | Genera el XLSX ejecutivo con fórmulas y formatos numéricos congruentes. |
| `scripts/export_pdf.py` | Genera el respaldo PDF regional con fotografía del Director Regional. |
| `scripts/prepare_images.py` | Convierte fotografías a WebP corporativo. |
| `data/dashboard.json` | Salida consumida por la PWA. |
| `exports/Resumen_Evidencias_OPS.xlsx` | Respaldo ejecutivo generado por Python. |
| `exports/Resumen_Evidencias_OPS.pdf` | Respaldo PDF regional generado por Python. |
| `tests/validate_project.py` | Validación integral del proyecto. |
| `tests/validate_horno_applicability.py` | Prueba 10 tiendas, 2 N/A e ideal 8 para Hornos. |
| `tests/build_dynamic_xlsx.js` | Prueba que la exportación XLSX dinámica sea válida. |
| `tests/build_direct_pdf.js` | Prueba que el PDF directo sea estructuralmente válido. |
| `.github/workflows/build-dashboard.yml` | Automatización al actualizar los Excel. |
| `MEJORAS.md` | Resumen verificable de las 10 mejoras visuales. |

El ZIP de actualización conserva estas mismas rutas: carga su contenido en la raíz del repositorio y permite reemplazar los archivos coincidentes.
