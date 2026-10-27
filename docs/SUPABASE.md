# Conexión online del duelo

La práctica individual no usa esta conexión. El duelo sí: dos móviles, en redes distintas, contra un servidor. No hay un segundo jugador simulado.

Comprobado con la documentación pública de Supabase en septiembre de 2026:

- El inicio anónimo crea un usuario con el rol `authenticated` y la marca `is_anonymous`. Hay que activarlo en Authentication → Providers. Supabase limita por defecto esos inicios (unos 30 por hora e IP); se puede ajustar en el panel, sin contratar un extra de pago.
- Las políticas RLS distinguen a ese usuario con `auth.uid()`.
- Las funciones `security definer` llevan `search_path = ''` y comprueban `auth.role()` o `auth.uid()`.
- Realtime privado usa `realtime.messages` y `realtime.topic()`. El cliente abre el canal con `private: true`. No hay política de escritura: la app no tiene chat.
- Postgres Changes solo envía filas que el usuario puede leer. Las soluciones viven en `duel_secrets`, sin permiso de lectura para el navegador.

## Pasos

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com). No actives facturación ni servicios de pago.
2. Authentication → Sign In / Providers → activa Anonymous sign-ins.
3. SQL Editor → pega y ejecuta `supabase/migrations/20260929120000_duel.sql`.
4. Instala la CLI de Supabase, entra con `supabase login` y enlaza el proyecto.
5. `supabase functions deploy duel --project-ref TU_REF`  
   La función usa `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`, que la plataforma inyecta. No las copies al frontend.
6. En la raíz del proyecto crea `.env.local` (no se sube a git):

```
VITE_SUPABASE_URL=https://TU_REF.supabase.co
VITE_SUPABASE_ANON_KEY=la_clave_anon_publica
```

7. `npm run dev` o vuelve a construir la página.

La clave `service_role` solo vive en la Edge Function. El navegador envía la respuesta, nunca los puntos. El plazo, la corrección y el marcador los decide Postgres.

Si la migración no puede crear la política de `realtime.messages` o añadir la tabla a la publicación, hazlo desde el panel de Realtime con la tabla `duel_signals` y un canal privado `room:<uuid>`.
