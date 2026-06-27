# Clean Architecture — Hito 7: `page.tsx` como composition root mínimo

Fecha: 2026-06-26  
Alcance: extracción de `CoachPageView` para simplificar la entrada de Next.js.

## Objetivo

Convertir `src/app/coach/page.tsx` en una raíz de composición pequeña.

Antes:

```txt
page.tsx = auth gate + layout + topbar + sidebar + chat + composer + event mapping
```

Después:

```txt
page.tsx = useCoachPageController + slots framework + CoachPageView
```

## Archivo creado

```txt
src/modules/coach-page/CoachPageView.tsx
```

## Nueva forma de la página

```tsx
const { auth, refs, viewModel, dispatch } = useCoachPageController();

return (
  <CoachPageView
    viewModel={viewModel}
    refs={refs}
    dispatch={dispatch}
    userMenu={...}
    renderSignInButton={...}
  />
);
```

## Por qué esto mejora Clean Architecture

La página de Next.js queda como adapter de framework:

- obtiene controller;
- entrega slots de Clerk;
- delega render a una vista propia del módulo coach-page.

La vista de página ya no depende directamente de Clerk.

## Estado final del plan 1–7

Ahora tenemos:

```txt
page.tsx
  -> CoachPageView
    -> CoachSidebarView
    -> CoachChatView
  -> useCoachPageController
    -> presentCoachPage
      -> CoachPageViewModel
```

## Lo que todavía no es arquitectura limpia pura

Aunque mejoramos mucho la frontera UI, aún quedan áreas para una fase posterior:

- partir `useCoachPageController` en controladores/use cases más pequeños;
- extraer runtime/browser effects detrás de puertos;
- aislar Clerk completamente en un auth adapter;
- mover persistencia local a un puerto probado;
- fortalecer observabilidad estructurada.

## Resultado

Podemos decir:

```txt
La UI principal de /coach ya sigue un patrón ViewModel + dispatch con composition root delgado.
```
