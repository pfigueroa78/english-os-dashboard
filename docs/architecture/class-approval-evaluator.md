# Class Approval Evaluator

Fecha: 2026-06-27  
Alcance: aprobación pedagógica basada en evidencia y rúbrica dinámica.

## Problema corregido

La ruta `v02` tenía un evaluador hardcodeado para una práctica específica de business advice. Eso podía causar dos fallas:

- clases de otros tipos quedaban evaluadas con criterios que no les correspondían;
- el estudiante podía entrar en bucles porque la aprobación no dependía de una máquina de decisión pedagógica reusable.

## Nuevo diseño

La decisión de aprobación vive en:

```txt
src/modules/coach-approval/application.ts
```

La ruta HTTP:

```txt
src/app/api/english-os/v02/route.ts
```

queda como adapter:

- autentica;
- lee contexto/MCP;
- delega evaluación a `coach-approval`;
- bloquea escritura si no hay evidencia aprobable;
- llama MCP solo cuando `canApproveClass === true`.

## Contrato principal

```ts
ClassApprovalEvaluation {
  evaluationGateCompleted: boolean;
  activeSectionsCompleted: boolean;
  grammarApproved: boolean;
  vocabularyApproved: boolean;
  communicativeGoalApproved: boolean;
  productionApproved: boolean;
  blockingErrors: string[];
  canApproveClass: boolean;
  approvalEvidence: string[];
}
```

## Regla de escritura

`approve_practice` ya no acepta solo:

```json
{ "confirm": true }
```

Ahora requiere una evaluación aprobable:

```json
{
  "confirm": true,
  "evaluation": {
    "evaluationGateCompleted": true,
    "activeSectionsCompleted": true,
    "canApproveClass": true,
    "blockingErrors": [],
    "approvalEvidence": ["..."]
  }
}
```

## Beneficio

El sistema deja de aprobar por frases específicas y empieza a aprobar por evidencia:

- objetivo de gramática/key language;
- vocabulario/chunks;
- producción suficiente;
- objetivo comunicativo;
- ausencia de errores bloqueantes;
- completion de evaluation gate.

## Tests de regresión

Archivo:

```txt
tests/e2e/coach-approval-application-contract.spec.ts
```

Valida que:

- una clase no-business puede aprobarse con evidencia correcta;
- errores bloqueantes impiden aprobación;
- `v02/route.ts` no contiene frases hardcodeadas de Unit 4/business advice;
- la ruta exige evidencia evaluada antes de escribir aprobación.
