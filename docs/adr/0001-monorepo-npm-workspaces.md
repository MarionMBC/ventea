# 0001 — Monorepo con npm workspaces + Turborepo

**Estado**: aceptada · 2026-08-31

## Contexto

Tres aplicaciones (API, móvil, panel) comparten el vocabulario del dominio: estados de
pedido, formas de entrega, contratos de request y respuesta. Con repos separados, cada
cambio de contrato exige publicar un paquete y sincronizar tres pull requests.

## Decisión

Un monorepo con `npm workspaces`. `packages/shared` es la única definición de los
contratos zod y los enums, y las tres apps la consumen por referencia directa.

Turborepo orquesta las tareas (`build`, `lint`, `typecheck`, `test`) respetando el grafo
de dependencias y cacheando lo que no cambió.

## Alternativas descartadas

- **pnpm workspaces**: mejor manejo de dependencias, pero pnpm no está instalado en la
  máquina de desarrollo y npm 10+ ya resuelve workspaces. Migrar después es cambiar un
  lockfile, no la estructura.
- **Nx**: más potente y más ceremonia de la que justifican tres paquetes.
- **Repos separados con paquete npm compartido**: publicar una versión por cada cambio
  de contrato, con la app móvil quedándose atrás sin que nada avise.

## Consecuencias

- Un cambio de contrato rompe el typecheck de las tres apps en el mismo CI, antes del merge.
- El CI instala todo el árbol aunque se toque una sola app.
- Migrar a pnpm más adelante: `pnpm import` y borrar `package-lock.json`.
