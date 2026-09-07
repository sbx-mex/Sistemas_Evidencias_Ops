# Instrucción para Forms · actividades condicionales

Esta regla aplica a `Programacion Hornos Merry - Focaccia` y `Rack FHW`. Cada
pregunta queda ligada exclusivamente a su actividad; una respuesta nunca altera
el ideal de otra actividad.

## Texto breve para mostrar en la sección

> Selecciona **Sí** si tu tienda cuenta con Horno Merry / Focaccia y completa la evidencia.  
> Selecciona **No** si tu tienda no cuenta con este horno; se registrará como **No aplica** y podrás finalizar el formulario.

Para Rack FHW:

> ¿Tu Tienda Aplica para Rack FHW?
> Selecciona **Sí** para continuar a `Evidencia_Rack_FHW`. Selecciona **No** si la
> tienda no aplica; se descontará del ideal sin registrarla como pendiente.

## Configuración de la pregunta

- Pregunta obligatoria de Hornos: `¿Tienes Horno Merry Chef?`
- Pregunta obligatoria de Rack: `¿Tu Tienda Aplica para Rack FHW?`
- Opciones: `Sí` y `No`.
- Ramificación de `Sí`: continuar con la carga de evidencia.
- Ramificación de `No`: ir a **Fin del formulario**.

## Cálculo aplicado

- `Sí` + evidencia válida = actividad realizada.
- `No` = **No aplica**; se excluye del ideal y no se trata como incumplimiento.
- Sin respuesta = permanece pendiente; no se interpreta como `No`.
- Una pregunta de otra actividad se ignora aunque contenga `Sí` o `No`.
- Las demás actividades conservan su cálculo normal.

Ejemplo: Enrique tiene 10 tiendas. Si 2 responden `No`, el ideal de Hornos es 8. Si las 8 aplicables responden `Sí` con evidencia, el resultado de Hornos para ese DM es `8 / 8 = 100%`.

Ejemplo FHW: si 10 tiendas tienen Rack FHW en el plan y 3 responden `No`, el
ideal queda en 7. Las 3 se identifican como `No aplica`; no generan pendiente ni
penalizan el porcentaje.

## Encabezados de evidencia

El motor acepta una columna genérica `Evidencia del avance` o una columna por actividad con el formato `Evidencia_<Actividad>`. La actividad seleccionada en Forms determina cuál evidencia se utiliza; el orden de las columnas no afecta el cruce.

Al sustituir la pregunta desplegable de tienda por captura numérica, Microsoft Forms conserva el histórico en `CeCo` y agrega la pregunta nueva como `CeCo1`. El motor consolida ambas columnas, exige exactamente cinco dígitos y rechaza cualquier fila donde las dos tengan valores diferentes. Encabezados parecidos como `Ceco12` no se usan como CeCo.

Las actividades pueden seguir agregándose o retirándose en Forms. El CMS es quien decide cuáles se muestran y forman parte del cálculo; una actividad no habilitada en el CMS permanece en el archivo fuente y se reporta en la auditoría sin publicarse.
