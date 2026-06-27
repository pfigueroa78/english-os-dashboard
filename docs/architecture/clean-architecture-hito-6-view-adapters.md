# Clean Architecture — Hito 6: view adapters por zona

Fecha: 2026-06-26  
Alcance: extracción de adaptadores visuales para sidebar y chat.

## Objetivo

Evitar que `page.tsx` conozca todos los callbacks específicos de cada componente.

Antes, `page.tsx` tenía conocimiento directo de:

- `CoachStudyPanel`
- `CoachGuidesPanel`
- `CoachQuickHelpPanel`
- `CoachClassMaterialsPanel`
- `CoachMessageList`
- `CoachComposer`
- la traducción de cada callback a eventos.

Después, ese conocimiento vive en vistas adaptadoras:

```txt
CoachSidebarView
CoachChatView
```

## Archivos creados

```txt
src/modules/coach-page/CoachSidebarView.tsx
src/modules/coach-page/CoachChatView.tsx
```

## Responsabilidad

`CoachSidebarView` recibe:

```ts
viewModel: CoachSidebarViewModel
dispatch: CoachPageDispatch
```

`CoachChatView` recibe:

```ts
viewModel: CoachChatViewModel
composer: CoachComposerModel
refs
dispatch: CoachPageDispatch
```

## Beneficio

Los componentes existentes pueden conservar su API actual mientras la página empieza a trabajar con una frontera más limpia.

Esto reduce el blast radius:

```txt
si cambia CoachStudyPanel -> impacta CoachSidebarView
si cambia CoachComposer -> impacta CoachChatView
si cambia page.tsx -> no toca detalles de panel/chat
```

## Estado

Podemos decir:

```txt
La adaptación de callbacks específicos ya no está concentrada en page.tsx.
```

Todavía queda una decisión futura:

```txt
si los componentes base deberían aceptar dispatch directamente o mantener callbacks locales.
```

Por ahora se mantiene la segunda opción para reducir riesgo.
