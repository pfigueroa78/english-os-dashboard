# Clean Architecture — Hito 5: eventos semánticos desde la página

Fecha: 2026-06-26  
Alcance: introducción de `dispatch(CoachPageEvent)` como frontera de intención UI.

## Objetivo

Evitar que `page.tsx` invoque directamente métodos concretos del controller.

Antes:

```ts
actions.startTodayClass()
actions.requestUnitGrammar()
actions.toggleMessageFeedback(index, "like")
```

Después:

```ts
dispatch({ type: "study.classStartRequested" })
dispatch({ type: "guide.chatGuideRequested", kind: "grammar" })
dispatch({ type: "message.feedbackToggled", messageIndex, feedback: "like" })
```

## Cambio principal

`useCoachPageController` ahora expone:

```ts
dispatch: CoachPageDispatch
```

`page.tsx` traduce callbacks de componentes a eventos semánticos.

## Responsabilidad por capa

```txt
Componentes:
  reciben ViewModel + callbacks simples

page.tsx:
  adapta callbacks existentes a CoachPageEvent

controller:
  interpreta CoachPageEvent y ejecuta acciones

application/services:
  mantienen reglas de negocio, prompts, recursos y efectos
```

## Por qué esto mejora modificabilidad

Un evento representa intención, no implementación.

Ejemplo:

```txt
study.classStartRequested
```

no dice si la clase se abre por:

- prompt;
- API;
- cache;
- estado local;
- machine state;
- agente;
- recuperación de sesión.

Eso queda detrás del controller/application.

## Estado actual

`page.tsx` ya no consume:

- `models.`
- `actions.`
- `state.`

Consume:

- `viewModel`
- `dispatch`
- `refs`
- `auth` solo como slot temporal para Clerk.

## Próximo paso recomendado

Hito 6: extraer adaptadores de componentes para que más callbacks específicos desaparezcan o queden encapsulados fuera de `page.tsx`.

Ejemplo:

```txt
CoachSidebarView
  input: viewModel.sidebar + dispatch
  output: JSX
```

Así `page.tsx` queda casi declarativo:

```tsx
<CoachTopBarView viewModel={viewModel.topBar} dispatch={dispatch} />
<CoachSidebarView viewModel={viewModel.sidebar} dispatch={dispatch} />
<CoachChatView viewModel={viewModel.chat} dispatch={dispatch} />
```
