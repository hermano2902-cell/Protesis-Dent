# API de Prótesis Dent

La API se ejecuta con `npm start` y sirve también los archivos estáticos del proyecto.

## Endpoints

- `POST /api/auth/register`: crea un usuario y una sesión.
- `POST /api/auth/login`: inicia sesión.
- `POST /api/auth/logout`: revoca las sesiones del usuario actual.
- `GET /api/auth/me`: devuelve el usuario autenticado.
- `GET /api/quotes`: devuelve únicamente las cotizaciones del usuario autenticado.
- `POST /api/quotes`: crea una cotización y sus productos dentro de una transacción.

Las sesiones usan cookies `HttpOnly`, `SameSite=Lax` y `Secure` en producción. Las contraseñas se almacenan con `bcrypt`; nunca se devuelve `password_hash`.

## Render

Configura en Render las variables `DATABASE_URL`, `NODE_ENV=production`, `PORT` y `FRONTEND_ORIGIN`. No subas `.env.local` ni copies credenciales en JavaScript del navegador.
