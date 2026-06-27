# Clean Architecture — Hito 2: contrato `CoachPageViewModel`

Fecha: 2026-06-22  
Alcance: definición de la frontera UI objetivo para `/coach`.

## Objetivo

Definir el contrato final hacia el que debe migrar la UI:

```txt
UI = CoachPageViewModel + dispatch(CoachPageEvent)
```

Este hito no mueve todavía la lógica de `useCoachPageController`. Su propósito es congelar la forma de la frontera limpia antes de refactorizar.

## Contrato creado

Archivo:

```txt
src/modules/coach-page/pageViewModel.ts
```

Tipos principales:

- `CoachPageViewModel`
- `CoachAuthGateViewModel`
- `CoachShellViewModel`
- `CoachSidebarViewModel`
- `CoachChatViewModel`
- `CoachGlobalErrorViewModel`
- `CoachPageEvent`
- `CoachPageDispatch`

## Estructura objetivo

```ts
type CoachPageViewModel = {
  authGate: CoachAuthGateViewModel;
  shell: CoachShellViewModel;
  topBar: CoachTopBarModel;
  sidebar: CoachSidebarViewModel;
  chat: CoachChatViewModel;
  composer: CoachComposerModel;
  globalError: CoachGlobalErrorViewModel;
};
```

## Por qué esto mejora la arquitectura

Antes, `page.tsx` consume:

- `auth`
- `state`
- `refs`
- `models`
- `actions`

Eso es mejor que el estado original monolítico, pero no es la frontera final de Clean Architecture.

El contrato nuevo permite que `page.tsx` evolucione hacia:

```ts
const { viewModel, dispatch, refs, slots } = useCoachPageController();
```

Y luego, en una etapa posterior:

```ts
<CoachPageView viewModel={viewModel} dispatch={dispatch} />
```

## Eventos UI tipados

Se definió una unión de eventos semánticos:

```ts
type CoachPageEvent =
  | { type: "layout.sidebarToggled" }
  | { type: "layout.themeChanged"; theme: CoachTheme }
  | { type: "study.classStartRequested" }
  | { type: "guide.workbookCreateRequested"; kind: "grammar" | "vocabulary" }
  | { type: "composer.messageSubmitted" }
  | { type: "message.feedbackToggled"; messageIndex: number; feedback: "like" | "dislike" }
  // ...
```

Esto reemplazará gradualmente callbacks específicos como:

- `onCreateGrammarWorkbook`
- `onCreateVocabularyWorkbook`
- `onRequestGrammarGuide`
- `onRequestVocabularyGuide`
- `onToggleFeedback`
- `onReportMessage`

por eventos normalizados.

## Qué queda intencionalmente fuera de este hito

No se hizo aún:

- conectar `page.tsx` al nuevo `CoachPageViewModel`;
- convertir componentes para recibir `dispatch`;
- extraer presenters desde `useCoachPageController`;
- partir el hook controlador;
- mover runtime/browser effects.

Esto es deliberado. El hito 2 crea el contrato, no ejecuta la migración completa.

## Tests agregados

Archivo:

```txt
tests/e2e/coach-page-viewmodel-contract.spec.ts
```

Validaciones:

1. Existe un único `CoachPageViewModel` como frontera de página.
2. El contrato compone ViewModels existentes, no payloads crudos.
3. Los eventos UI están tipados como intenciones semánticas.

## Resultado arquitectónico

Después de este hito podemos decir:

```txt
La frontera UI objetivo ya está definida y testeada.
```

Todavía no podemos decir:

```txt
La UI ya consume únicamente CoachPageViewModel.
```

Eso corresponde al Hito 3.

## Próximo hito recomendado

Hito 3: crear presenters puros para construir `CoachPageViewModel` a partir del estado actual del controlador.

Propuesta:

```txt
src/modules/coach-page/presenter.ts
```

Funciones:

- `presentCoachPage`
- `presentCoachAuthGate`
- `presentCoachShell`
- `presentCoachSidebar`
- `presentCoachChat`
- `presentCoachGlobalError`

El objetivo del Hito 3 será que `useCoachPageController` deje de ensamblar manualmente los modelos dispersos y delegue esa composición al presenter.

