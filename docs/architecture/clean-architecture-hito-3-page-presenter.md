# Clean Architecture — Hito 3: presenter puro de página

Fecha: 2026-06-22  
Alcance: ensamblaje del `CoachPageViewModel` fuera del controller y fuera de React.

## Objetivo

Crear una capa presenter pura para construir el contrato de página definido en el hito 2:

```txt
estado actual + modelos parciales -> presentCoachPage -> CoachPageViewModel
```

Este hito no migra todavía todos los componentes de `page.tsx` para consumir únicamente `viewModel`. La intención es reducir riesgo: primero se instala y prueba el ensamblador limpio; luego migramos el render por slices.

## Archivo creado

```txt
src/modules/coach-page/presenter.ts
```

Funciones principales:

- `presentCoachPage`
- `presentCoachAuthGate`
- `presentCoachShell`
- `presentCoachSidebar`
- `presentCoachChat`
- `presentCoachGlobalError`

## Decisión arquitectónica

El controller conserva por ahora sus modelos existentes para no romper la UI, pero ya expone además:

```ts
viewModel: pageViewModel
```

Esto deja al controller en modo compatible:

```txt
Antes: page.tsx consume auth/state/models/actions
Ahora: page.tsx puede seguir consumiendo lo anterior, y además existe viewModel
Siguiente: page.tsx migrará gradualmente a viewModel + dispatch
```

## Reglas protegidas por tests

El presenter:

- no usa React;
- no usa Clerk;
- no hace `fetch`;
- no toca `window` ni `document`;
- no contiene efectos secundarios;
- es el ensamblador explícito del `CoachPageViewModel`.

## Por qué este hito mejora la mantenibilidad

Antes, la composición de la pantalla estaba repartida entre:

- estado del hook;
- modelos parciales;
- `page.tsx`;
- props de componentes.

Ahora empieza a aparecer una frontera más clara:

```txt
Controller: orquesta estado y acciones
Presenter: transforma estado/modelos en ViewModel de página
Components: deberían renderizar solo slices del ViewModel
```

## Impacto funcional

No debería cambiar el comportamiento visible de `/coach`.

Impacto esperado:

- cero cambios visuales;
- cero cambios pedagógicos;
- cero cambios en llamadas API;
- nueva frontera testeable para migrar la UI.

## Tests agregados

Archivo:

```txt
tests/e2e/coach-page-presenter-contract.spec.ts
```

Validaciones:

1. `presentCoachPage` compone un `CoachPageViewModel` completo.
2. Auth gate y error global se presentan sin dependencias de framework.
3. El presenter permanece libre de React/browser/API.
4. El controller expone `viewModel: pageViewModel` sin retirar aún los modelos legacy.

## Estado al cierre del hito

Podemos decir:

```txt
La página ya tiene un presenter puro y un ViewModel ensamblado en el controller.
```

Todavía no podemos decir:

```txt
La UI consume únicamente CoachPageViewModel.
```

Eso corresponde al siguiente hito.

## Próximo hito recomendado

Hito 4: migrar `page.tsx` para consumir `viewModel` en la mayor cantidad posible de zonas sin cambiar comportamiento visual.

Orden sugerido:

1. `topBar` desde `viewModel.topBar`.
2. `sidebar` desde `viewModel.sidebar`.
3. `chat` desde `viewModel.chat`.
4. `composer` desde `viewModel.composer`.
5. Mantener `actions` hasta introducir `dispatch`.
