# Clean Architecture — Hito 4: render de página desde `CoachPageViewModel`

Fecha: 2026-06-26  
Alcance: migración de `src/app/coach/page.tsx` para consumir el contrato de página.

## Objetivo

Reducir el conocimiento de `page.tsx` sobre el estado interno del controller.

Antes:

```ts
const { auth, state, refs, models, actions } = useCoachPageController();
```

Después:

```ts
const { auth, refs, viewModel, dispatch } = useCoachPageController();
```

## Cambio principal

`page.tsx` ahora renderiza usando:

- `viewModel.authGate`
- `viewModel.shell`
- `viewModel.topBar`
- `viewModel.sidebar`
- `viewModel.chat`
- `viewModel.composer`
- `viewModel.globalError`

Esto evita que la página conozca los modelos parciales internos como:

- `topBarModel`
- `studyPanelModel`
- `messageListModel`
- `composerModel`

## Decisión de compatibilidad

El controller todavía conserva `models` y `actions` por compatibilidad temporal, pero `page.tsx` ya no los consume.

Esto permite migrar por capas sin romper componentes existentes.

## Slot pendiente

`page.tsx` todavía recibe `auth` para montar el `UserButton` de Clerk.

Ese punto quedará para un hito posterior de adapters/slots:

```txt
framework auth slot -> page shell
```

## Resultado

Podemos decir:

```txt
La página principal ya renderiza desde CoachPageViewModel.
```

Todavía no podemos decir:

```txt
Todos los componentes reciben únicamente dispatch semántico nativo.
```

Eso corresponde al hito 5 y posteriores.
