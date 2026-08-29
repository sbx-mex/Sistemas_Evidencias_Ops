# Instrucción para Forms · Hornos Merry / Focaccia

Esta regla aplica **únicamente** a la actividad `Programacion Hornos Merry - Focaccia`.

## Texto breve para mostrar en la sección

> Selecciona **Sí** si tu tienda cuenta con Horno Merry / Focaccia y completa la evidencia.  
> Selecciona **No** si tu tienda no cuenta con este horno; se registrará como **No aplica** y podrás finalizar el formulario.

## Configuración de la pregunta

- Pregunta obligatoria: `¿Confirmas que realizaste la actividad seleccionada?`
- Opciones: `Sí` y `No`.
- Ramificación de `Sí`: continuar con la carga de evidencia.
- Ramificación de `No`: ir a **Fin del formulario**.

## Cálculo aplicado

- `Sí` + evidencia válida = actividad realizada.
- `No` = **No aplica**; se excluye del ideal y no se trata como incumplimiento.
- Sin respuesta = permanece pendiente; no se interpreta como `No`.
- Las demás actividades conservan su cálculo normal.

Ejemplo: Enrique tiene 10 tiendas. Si 2 responden `No`, el ideal de Hornos es 8. Si las 8 aplicables responden `Sí` con evidencia, el resultado de Hornos para ese DM es `8 / 8 = 100%`.
