# CapyVerbs

Juego para aprender los 75 verbos irregulares de la ficha, con capibaras, laguna y naranjas. Funciona en el móvil como página instalable. La práctica va en el propio teléfono. El duelo de dos personas necesita el servidor descrito en `docs/SUPABASE.md`.

## Qué puedes hacer

- **Aprender:** bloques de cinco verbos, presentación y práctica.
- **Repasar mis fallos:** insiste en lo confundido y lo pendiente.
- **Carrera:** diez preguntas, unos dos minutos.
- **Ahorcado:** el past simple y el past participle, letra a letra, en el tramo de la lista que elijas.
- **Duelo con código:** dos capibaras, las mismas preguntas, un envío por ronda.
- **Mis capibaras:** sombreros y una naranja. No cambian la puntuación.
- **Los 75 verbos:** tabla con búsqueda y filtros.
- **Examen:** en Ajustes, elige un rango de números. El intensivo no borra el repaso posterior.

La corrección y los plazos están en `docs/POLITICA_APRENDIZAJE.md`.

## Comandos

```bash
npm ci
npm test
npm run dev
npm run build
npm run preview
```

En local la dirección es `http://localhost:5173/#/`. En GitHub Pages la base es `/capyverbs/` y las rutas van detrás de `#`, así que recargar no pide otra página al servidor.

## En el móvil

1. Abre la dirección de la página en Chrome o Safari.
2. Añádela a la pantalla de inicio.
3. Pulsa **Aprender** y, si es la primera vez, **Empezar**.
4. Para jugar con otra persona, los dos necesitáis la conexión online ya configurada. Uno pulsa **Crear sala** y comparte el código o el enlace. El otro lo escribe en **Entrar**. Los dos pulsan **Listo**.

La primera visita descarga la app. Después, la práctica sigue sin cobertura. El duelo no se guarda en la caché del service worker: si no hay red, se ve el fallo y no se inventa un ganador.

## Duelo

Sin `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, el duelo muestra **Configurar conexión online**. Los pasos concretos están en `docs/SUPABASE.md`. La clave `service_role` no entra en esta app.

El servidor sortea las preguntas, cuenta el tiempo, corrige y suma 100 o 0. El cliente no envía puntos. Hay un envío por persona y ronda. Si el plazo se acaba, se sigue. Un empate es un empate. La revancha es otra partida y hace falta que los dos la pidan.

## Publicar en GitHub Pages

El workflow `.github/workflows/pages.yml` construye con `VITE_BASE=/capyverbs/` y publica el directorio `dist`. En el repositorio hay que activar Pages con el origen GitHub Actions. La dirección queda `https://USUARIO.github.io/capyverbs/`.

Esa página sigue necesitando las variables de Supabase en el momento de construir si quieres que el duelo quede enlazado. En GitHub: Settings → Secrets → Actions, y pásalas al paso `npm run build`. No subas `.env.local`.

## Pruebas hechas aquí

- Los 75 verbos, la corrección de was/were, lie/lay, read y los dos modos.
- Distractores con una sola respuesta válida.
- Intervalos, fallos, dominio, hueco del verbo nuevo y exportación.
- Reglas del duelo con dos jugadores de prueba: sala llena, código inválido, intruso, respuesta repetida, puntos manipulados, envío tardío, reconexión, empate y revancha.
- El contrato del SQL (RLS, `search_path`, permisos).
- Una comprobación del campo de escritura.

No se ha publicado la página ni se ha jugado un duelo real entre dos redes: en este equipo no hay sesión de GitHub ni un proyecto Supabase enlazado. El motor del duelo sí está probado en local; el servidor de Postgres queda listo para desplegarlo con los pasos de arriba.
