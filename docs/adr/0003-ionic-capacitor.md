# 0003 — Ionic React + Capacitor para la app de cliente

**Estado**: aceptada · 2026-08-31

## Contexto

La app de cliente necesita biometría, notificaciones push, ubicación y cámara — todas
APIs nativas. Tiene que estar en iOS y Android, y el equipo trabaja en TypeScript/React.

## Decisión

Ionic React sobre Capacitor. Una base de código para iOS, Android y web.

Todas las capacidades nativas pasan por la fachada `apps/mobile/src/lib/native/`. Las
features nunca importan `@capacitor/*` directo.

## Alternativas descartadas

- **Flutter**: mejor rendimiento y ecosistema nativo, pero es un lenguaje más para el
  equipo y no comparte los contratos zod con la API y el panel.
- **React Native**: capacidad nativa comparable, pero no corre en navegador — y el menú
  público tiene que ser una URL que se comparta por WhatsApp y abra sin instalar nada.
- **PWA sola**: sin biometría confiable y con push limitado en iOS.

## Consecuencias

- El menú público sale gratis como web desde el mismo código.
- Rendimiento de WebView: aceptable para un catálogo y un carrito; habría que
  reevaluarlo ante animaciones pesadas o listas muy largas.
- La fachada `lib/native` es obligatoria: sin ella, la app deja de compilar para web en
  cuanto alguien importa un plugin nativo en un componente.
