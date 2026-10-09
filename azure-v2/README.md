# Sistema de Evidencias OPS · Azure · Paso 1

Una plataforma para crear actividades y encuestas, recibir respuestas de las tiendas y validar el cumplimiento dentro de la misma experiencia.

**Este paso entrega un prototipo funcional de flujo.** No es la plataforma productiva: usa datos ficticios en memoria, cambia de perfil sin autenticación y se reinicia al recargar. No crea cuentas, guarda contraseñas, escribe en Azure ni sustituye el portal existente.

## Lo que ya encontramos

- El repositorio `sbx-mex/Sistemas_Evidencias_Ops` contiene un portal web y un workflow de Azure Static Web Apps.
- Ese workflow despliega una carpeta `azure-public` y tiene `api_location: ""`; actualmente no despliega una API de captura de respuestas.
- El README describe el flujo Forms → Excel → Python → JSON → tablero. La nueva captura debe escribir mediante una API, sin esperar reconstrucciones de GitHub para cada respuesta.
- Las capturas muestran `stchw / sistema-evidencias / Directorio_Sistema_Evidencia.xlsx`. Confirman la presencia del archivo, pero no permiten verificar sus datos completos ni sus permisos de acceso.
- En el Excel mostrado, la columna **CC** contiene los cinco dígitos de la tienda. La columna **CeCo** contiene códigos como `OPECC`, `OPECP` y `OPECN`.

El contenedor de Azure guarda archivos; el repositorio versiona el código. La web y la API pueden vivir en un solo repositorio y ejecutarse en Azure. Las respuestas y evidencias estarán en servicios de datos de Azure, separados del código.

## Perfiles y permisos propuestos

| Perfil | Crear y asignar | Ver y validar |
|---|---|---|
| Admin | Nacional, una o varias regiones, o un distrito | Todo el alcance autorizado; usuarios, directorio y auditoría |
| DM identificado | Actividades y encuestas de su propio portafolio | Todas las actividades que llegan a sus tiendas, incluidas las nacionales y regionales |
| Tienda | Responder por su CeCo | Sus pendientes, correcciones, envíos y actividades aprobadas |

Propuesta inicial: Admin y el DM responsable de una tienda pueden validar sus envíos. Si una campaña requiere aprobación regional o central, se configurará el validador de esa actividad en una fase posterior; no se asumirá ese permiso de forma automática.

El nombre de acceso Admin y las cuentas por tienda solicitadas se prepararán en el servidor en el paso de autenticación. Las contraseñas propuestas se consideran iniciales y no se incluyen en archivos, capturas, el repositorio o el HTML. Se guardarán únicamente hashes adecuados para contraseñas; las claves de servicios irán en configuración segura de Azure.

**Una cuenta compartida `sbx-sistema-evidencia` no permite distinguir qué DM inició sesión.** Puede servir como nombre de entrada a Gestión, pero cada DM necesita una identidad verificable enlazada a su portafolio: cuenta individual local o identidad corporativa. Seleccionar un nombre de DM en una lista no otorga permiso para usar ese portafolio.

La restricción actual `evidencias_ops` de Static Web Apps exige acceso de Microsoft Entra. No basta con agregar un formulario de usuario y contraseña para permitir el ingreso por CeCo: el piloto debe integrar las sesiones locales en su API y revisar las rutas de acceso del nuevo portal. El prototipo no modifica las reglas actuales.

## Flujo de operación

1. **Crear:** nombre, instrucciones, fechas y preguntas.
2. **Asignar:** Admin elige el alcance; DM queda limitado a sus tiendas.
3. **Publicar:** se crea una asignación única por actividad y CeCo.
4. **Responder:** la tienda captura información y carga evidencia en la misma plataforma.
5. **Validar:** el responsable aprueba o solicita corrección con un comentario.
6. **Consultar:** el tablero muestra el avance aprobado y la bandeja de revisión.

Estados: **Pendiente → En revisión → Aprobada**. Una solicitud de corrección pasa a **Corregir → En revisión**. El historial conserva cada envío y decisión.

Si se permite No aplica: la tienda justifica la solicitud; el DM o Admin la revisa. Solo una excepción aprobada se retira del denominador.

### Cómo se calcula el avance

`Avance aprobado = asignaciones aprobadas / asignaciones aplicables × 100`

- Una asignación es una combinación actividad–CeCo, aunque el alcance se superponga.
- Un envío pendiente de revisión no es cumplimiento aprobado.
- Reenvíos y correcciones no crean otro cumplimiento.
- No aplica solicitado sigue en el denominador. No aplica aprobado se excluye.
- Sin asignaciones aplicables, se muestra **Sin aplicables**.
- El tablero de DM usa únicamente sus tiendas; el de tienda, únicamente su CeCo.

## Probar este paso

Abre `prototipo/index.html` en el navegador. No requiere instalación ni conexión a servicios externos.

1. Selecciona **Tienda · 39001** en “Explorar como”. Verás una actividad nacional, una regional y dos distritales.
2. Abre **Limpieza de covacha**, escribe una respuesta, adjunta una imagen o PDF y envía.
3. Cambia a **DM A**, abre **Validación** y revisa ese envío.
4. Aprueba y consulta el nuevo avance; o solicita corrección con un comentario.
5. Cambia a **DM B**: la tienda 39001 y las actividades exclusivas del DM A no aparecen.
6. Como Admin, crea una actividad para varias regiones. Como DM A, el creador limita el alcance a su portafolio.

El piloto visual admite texto, Sí/No, número, selección con tres opciones fijas y archivo JPG/PNG/WebP/PDF de hasta 10 MB. Todas las preguntas son obligatorias en esta demostración. Campos opcionales, opciones personalizadas, ramificaciones, borradores, cierres efectivos y edición de encuestas publicadas quedan para la implementación de captura. Un Sí/No no descuenta por sí solo una actividad.

Los adjuntos reales elegidos en la demostración se pueden abrir desde la validación en esa misma pestaña. No se suben ni se comparten con otros equipos. Las respuestas precargadas indican explícitamente cuándo un archivo es solo un ejemplo sin adjunto real.

## Arquitectura propuesta en Azure

| Componente | Función |
|---|---|
| Azure Static Web Apps | Interfaz del portal; aprovechar la estructura de despliegue existente |
| API en Azure Functions | Sesiones, identidad, permisos, publicación, captura y validación |
| Azure Table Storage en `stchw` | Propuesta inicial para usuarios, tiendas, actividades, asignaciones, respuestas y auditoría; verificar disponibilidad y límites antes de provisionar |
| Blob Storage privado en `stchw` | Directorio, materiales y evidencias; acceso a archivos mediado por la API o enlaces de corta duración |
| Azure SignalR Service | Notificaciones a navegadores autorizados cuando se guarda un envío o validación |

Functions debe ser una Function App propia si se necesita identidad administrada y referencias a Key Vault: las funciones administradas por Static Web Apps no ofrecen esas capacidades. La elección del plan, vinculación al sitio y permisos se confirmará en el inventario de recursos del paso 2.

Tiempo real significa: primero se guarda la operación, después se notifica a los usuarios de su alcance, y sus tableros consultan el dato confirmado. No se enviarán evidencias ni respuestas a un canal global. Al reconectar, se vuelve a consultar la API. SignalR no garantiza latencia cero; mediremos el tiempo del piloto antes de prometer una cifra.

Una actualización por consulta periódica puede servir en un piloto, pero se etiquetaría como actualización automática, sin presentarla como notificación en tiempo real.

## Datos que necesitamos para conectar el piloto

El archivo completo `Directorio_Sistema_Evidencia.xlsx` es la fuente para verificar:

| Campo de aplicación | Columna de origen | Regla |
|---|---|---|
| `ceco` | `CC` | Texto de cinco dígitos, único |
| `nombre_tienda` | `CC Nombre` | Nombre de la tienda |
| `region_id` / `region_nombre` | `No. de Región` / `Región` | Conservar código como texto y verificar catálogo |
| `estatus` | `Estatus` | Activar solo tiendas abiertas; conservar historial de las bajas |
| `dm_id` / `dm_nombre` | Por verificar en el archivo completo | Cada tienda activa debe tener un responsable inequívoco |

La columna `CeCo` de la captura puede conservarse como código operativo; no se usará como identificador del usuario de tienda. Falta ver la columna de DM: si no existe, se necesitará una tabla CeCo–DM autorizada.

También necesitamos el nombre o URL de la Static Web App y los recursos que están dentro del grupo de Azure. El contenedor `sistema-evidencias` no identifica por sí solo la aplicación web ni una API.

## Siguientes pasos

| Paso | Entrega verificable |
|---|---|
| 1 · Flujo y diseño | Este prototipo, permisos y regla de avance |
| 2 · Directorio y acceso | Importación auditada; un Admin, un DM identificado y dos tiendas con sesiones reales |
| 3 · Captura | Publicar una actividad y guardar respuestas/adjuntos privados en Azure |
| 4 · Validación | Corrección, aprobación y tablero con permisos verificados desde servidor |
| 5 · Tiempo real y piloto | Dos equipos distintos ven cambios del mismo dato; reconexión y auditoría; expansión posterior a regiones y Nacional |

En producción, ninguna ruta confiará en `role`, `dm`, `region` o `ceco` proporcionados por el navegador. La API resolverá esos valores desde la sesión y el directorio vigente. Las escrituras usarán control de versiones/ETag e idempotencia; si dos validadores actúan a la vez, la segunda operación deberá detectar el conflicto.

## Verificación del prototipo

Ejecutar desde la raíz del repositorio:

```bash
node azure-v2/tests/validate-prototype.cjs
```

Las pruebas cubren aislamiento entre portafolios, permisos de creación y revisión, alcance regional múltiple, asignaciones únicas, duplicados, correcciones, conflictos de versión y el cálculo de No aplica. Son pruebas del modelo de demostración; no certifican autenticación real, interfaz de navegador ni integración con Azure.

## Referencias oficiales consultadas

- [APIs de Static Web Apps con Azure Functions](https://learn.microsoft.com/en-us/azure/static-web-apps/apis-functions).
- [Autenticación y autorización de Static Web Apps](https://learn.microsoft.com/es-es/azure/static-web-apps/authentication-authorization).
- [Azure Functions y SignalR Service](https://learn.microsoft.com/en-us/azure/azure-signalr/signalr-concept-serverless-development-config).
- [Autorización de acceso a Azure Storage](https://learn.microsoft.com/en-us/azure/storage/common/authorize-data-access).
- [Control de concurrencia y ETag](https://learn.microsoft.com/en-us/azure/storage/blobs/concurrency-manage).

El paso 1 se publica, con autorización del responsable, en la rama de trabajo `feat/azure-evidencias-paso1-20261009`. Para publicar el nuevo portal habrá que integrar explícitamente su carpeta y API al empaquetado de Azure; el workflow actual solo empaqueta el portal existente.
