# Clean Architecture — Hito 1: auditoría UI y ViewModels

Fecha: 2026-06-22  
Alcance: `/coach`, componentes React, hook controlador y ViewModels actuales.

## Resumen ejecutivo

La UI ya avanzó hacia ViewModels, especialmente en paneles laterales, chat y composer. Sin embargo, todavía no cumple el criterio estricto de Clean Architecture:

> React renderiza solo ViewModels y emite eventos de UI; no interpreta dominio, sesión, recursos, autenticación ni runtime.

El principal riesgo arquitectónico ya no está en los componentes visuales individuales. Está en `useCoachPageController`, que concentra estado, efectos, integración con Clerk, persistencia, recursos, dictado, voz, workbooks, agentes, sesión, API y composición de ViewModels. En términos de arquitectura, todavía es un `page controller` demasiado amplio.

## Estado de archivos clave

| Archivo | Líneas aprox. | Rol actual | Lectura arquitectónica |
|---|---:|---|---|
| `src/app/coach/page.tsx` | 193 | Composición visual de página | Mejoró mucho frente al `page.tsx` original, pero aún conoce `state`, `auth`, `refs`, `actions` y algunos detalles de layout. |
| `src/modules/coach-page/useCoachPageController.ts` | 970 | Hook controlador/orquestador | Principal deuda. Mezcla state machine, efectos de browser, integración API, mensajes, recursos, dictado, speech, agentes, workbooks y presenters. |
| `src/modules/coach-session/viewModels.ts` | 302 | ViewModels de sidebar/sesión | Buena base. Aún algunos inputs aceptan datos amplios o estructuras semi-crudas. |
| `src/modules/coach-chat/messageListViewModel.ts` | 129 | ViewModel de mensajes | Buen patrón: transforma mensajes en acciones visuales y labels. |
| `src/modules/coach-chat/composerViewModel.ts` | 97 | ViewModel de input/composer | Buen patrón. Aún el componente requiere refs y acciones concretas. |

## Inventario por componente

| Componente | Consume ViewModel | Props no-ViewModel | Lógica dentro del componente | Brecha Clean Architecture |
|---|---:|---|---|---|
| `CoachTopBar` | Parcial: `CoachTopBarModel` | `sidebarOpen`, `theme`, `textSize`, `hydrated`, `panelIcon`, `userMenu`, callbacks | Decide labels ARIA para panel, opciones de tema, habilitación por hydrated/textSize | Necesita `CoachTopBarViewModel` completo con controles, opciones y acciones semánticas normalizadas. |
| `CoachStudyPanel` | Sí: `CoachStudyPanelModel` | callbacks de unidad/clase | Mínima; render/input | Aceptable. Próximo paso: eventos `onEvent({ type })` en vez de múltiples callbacks. |
| `CoachLearningPulsePanel` | Sí | Ninguna relevante | Solo render | Cumple el patrón esperado. |
| `CoachGuidesPanel` | Sí: `CoachGuidesPanelModel` | callbacks de workbook/guía | Renderiza `WorkbookCard`, decide labels estáticos | Casi correcto. El subcomponente `WorkbookCard` puede quedar como UI puro. |
| `CoachQuickHelpPanel` | Sí | callbacks de agente | Render/select/buttons | Aceptable. Mejorable con acciones modeladas por agente. |
| `CoachClassMaterialsPanel` | Sí | callbacks `toggle/practice` | Decide embed por `resource.type`, texto de expandir/ocultar, estados vacíos | Parcial. El ViewModel debería entregar `player`, `primaryActions`, `emptyState` y `expanded` ya resueltos. |
| `CoachDiagnosticsPanel` | Sí | callback `runDiagnostics` | Render de checks/telemetry | Aceptable. Podría modelar acciones y severity. |
| `CoachMessageList` | Sí: `CoachMessageListModel` | objeto de callbacks | Decide ramas user/profesor, invoca acciones con `content/index`, renderiza thinking | Bueno, pero aún acopla eventos a contenido crudo. Ideal: `message.actions[]` con `actionId`. |
| `CoachComposer` | Sí: `CoachComposerModel` | refs, callbacks | Maneja enter-to-send, click de input file, decide stop/send por icono | Parcial. El ViewModel no debería obligar al componente a inferir comportamiento desde `sendButton.icon`. |
| `CoachSplitHandle` | No aplica | `onResizeStart` | UI event directo | Aceptable como componente técnico de layout. |
| `MarkdownMessage` | No aplica | `content` | Render markdown y normalización visual de labels | Es un renderer técnico. Cuidado: no debe acumular reglas pedagógicas. |
| `CoachIcon` / `EnglishOsLogo` | No aplica | props visuales | Solo presentación | Cumplen. |

## Dependencias UI → Application detectadas

### Buenas señales

- Los paneles laterales ya reciben modelos específicos: `CoachStudyPanelModel`, `CoachLearningPulsePanelModel`, `CoachGuidesPanelModel`, `CoachQuickHelpPanelModel`, `CoachClassMaterialsPanelModel`, `CoachDiagnosticsPanelModel`.
- Chat y composer ya tienen modelos propios: `CoachMessageListModel`, `CoachComposerModel`.
- `page.tsx` dejó de contener la mayor parte de la lógica de negocio.
- Hay mappers/presenters iniciales: `toCoachTopBarModel`, `toCoachStudyPanelModel`, `toCoachMessageListModel`, `toCoachComposerModel`, etc.

### Riesgos actuales

1. `useCoachPageController` es demasiado grande y tiene demasiadas razones para cambiar.
2. La UI todavía recibe `state`, `actions`, `refs` y `auth` como paquetes amplios.
3. Algunos componentes infieren comportamiento a partir de detalles visuales. Ejemplo: `CoachComposer` decide entre parar/enviar leyendo `model.sendButton.icon`.
4. Varios ViewModels todavía reciben datos parcialmente crudos: recursos, workbooks, telemetry, session.
5. La composición de página aún decide demasiadas cosas: cuándo mostrar sidebar, split handle, auth screens, errores globales y layout state.

## Mapa actual simplificado

```txt
React page
  └─ useCoachPageController
       ├─ Clerk / auth
       ├─ localStorage / preferences
       ├─ coach API client
       ├─ context loading
       ├─ resources loading
       ├─ workbooks
       ├─ agents
       ├─ dictation / media recorder
       ├─ speech synthesis
       ├─ session state
       ├─ message state
       ├─ error state
       └─ ViewModel factories

Components
  ├─ receive model
  ├─ receive callbacks
  └─ render UI
```

## Mapa objetivo para UI limpia

```txt
React page
  └─ useCoachPageController
       ├─ returns CoachPageViewModel
       └─ returns dispatch(event)

Components
  ├─ receive only their ViewModel slice
  └─ emit UI events without domain decisions

Presenter layer
  └─ maps application state → CoachPageViewModel

Application layer
  └─ executes use cases and state transitions
```

## Brechas priorizadas

### P0 — Crear `CoachPageViewModel`

Actualmente `page.tsx` consume varios modelos más estado suelto. El siguiente contrato debería agrupar la vista completa:

```ts
type CoachPageViewModel = {
  authGate: AuthGateViewModel;
  shell: CoachShellViewModel;
  topBar: CoachTopBarViewModel;
  sidebar: CoachSidebarViewModel;
  chat: CoachChatViewModel;
  composer: CoachComposerViewModel;
  globalError: ErrorBannerViewModel | null;
};
```

### P0 — Reemplazar callbacks granulares por eventos tipados

En vez de:

```ts
onCreateGrammarWorkbook
onCreateVocabularyWorkbook
onRequestGrammarGuide
onRequestVocabularyGuide
```

Preferir:

```ts
dispatch({ type: "guide.createWorkbook", kind: "grammar" })
dispatch({ type: "guide.requestInChat", kind: "vocabulary" })
```

Esto reduce acoplamiento de componentes a casos de uso específicos.

### P1 — Extraer presenters desde `useCoachPageController`

Hoy el hook construye ViewModels directamente. Debe moverse a presenters puros:

- `presentCoachPage`
- `presentCoachSidebar`
- `presentCoachChat`
- `presentCoachComposer`

### P1 — Separar runtime/browser effects

Dictado, speech synthesis, resize, localStorage y focus deben quedar detrás de runtime adapters/hooks más pequeños.

### P2 — Endurecer inputs de ViewModels

Los factories de ViewModel no deberían aceptar objetos semi-crudos con `[key: string]: unknown` salvo en mappers anticorrupción. El objetivo es:

```txt
raw external data → mapper/adapter → domain/application model → presenter → ViewModel
```

## Conclusión del Hito 1

La UI no está “sin ViewModels”; al contrario, ya tiene una base significativa. El problema es que los ViewModels todavía no son la única frontera entre React y la aplicación.

La deuda principal no está en `CoachStudyPanel`, `CoachLearningPulsePanel` o `CoachMessageList`. La deuda principal está en:

1. `useCoachPageController` como orquestador monolítico.
2. `page.tsx` consumiendo paquetes amplios (`state`, `actions`, `refs`, `auth`) en lugar de un `CoachPageViewModel`.
3. Eventos UI no normalizados.
4. ViewModels que aún no encapsulan completamente acciones, estados vacíos y decisiones de interacción.

## Próximo hito recomendado

Hito 2: definir los ViewModels finales y el contrato `CoachPageViewModel`, sin mover todavía lógica de negocio. El objetivo es congelar la frontera UI:

```txt
UI = ViewModel + dispatch(event)
```

