# Seguridad y privacidad

## Datos del perfil

Esta version es una pagina estatica. El correo, el carrito y el historial se guardan unicamente en `localStorage` del navegador actual. No existe autenticacion real ni sincronizacion entre dispositivos.

El panel de perfil incluye opciones para cambiar el correo, cerrar la sesion local y eliminar el perfil y las cotizaciones guardadas.

## Despliegue

La politica CSP incluida en `index.html` protege los recursos cargados por la pagina. El servidor de despliegue tambien debe enviar estos encabezados HTTP:

```text
Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

`frame-ancestors` y `X-Content-Type-Options` requieren configuracion del hosting; una etiqueta HTML no puede sustituirlos de forma fiable.
