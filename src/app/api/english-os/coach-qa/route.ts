import { NextResponse } from "next/server";
import { authenticateQaRequest } from "@/lib/qaServer";

type CoachMessage = {
  role: "user" | "coach";
  content: string;
};

type CoachRequest = {
  message: string;
  conversationHistory?: CoachMessage[];
};

function normalize(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildReply(message: string) {
  const normalized = normalize(message);

  if (normalized.includes("repasar") || normalized.includes("review unit") || normalized.includes("unidad 4")) {
    return `Modo QA: repaso de Unidad 4 activado, sin cambiar progreso real.

Primera pregunta:

**What is your best time of day, and why?**

Usa al menos una estructura de tiempo:

- As soon as I...
- After I...
- Before I...
- I don't... until...
- Whenever I...
- Ever since I...`;
  }

  if (normalized.includes("class pack") || normalized.includes("ensen") || normalized.includes("teach") || normalized.includes("clase")) {
    return `Modo QA: enseñaré la clase sin cambiar progreso real.

Objetivo de la clase actual: dar consejo de negocio con contraste y consecuencia estratégica.

Estructura esperada:

**The way I see it, you ought to... Although..., it might not be a bad idea to... This would help...**

Primera tarea: escribe una respuesta breve para un manager cuyo equipo está cansado y atrasado.`;
  }

  if (normalized.includes("despite bogota has")) {
    return `Corrección rápida:

**Although Bogotá has many job opportunities, I prefer Cali.**

Regla: usa **although + subject + verb**. Usa **despite + noun phrase**.

Intenta de nuevo con dos versiones:

1. Although Bogotá has many job opportunities, ...
2. Despite Bogotá's many job opportunities, ...`;
  }

  if (normalized.includes("ought to giving")) {
    return `Corrección rápida:

**You ought to give the team some time off.**

Regla: usa **ought to + base verb**.

Ahora intenta una respuesta completa con advice + contrast + consequence.`;
  }

  return `Modo QA Coach activo. Recibí tu respuesta y la usaría como parte de la misma experiencia del estudiante.

Para una respuesta B2, asegúrate de incluir:

1. Advice: **The way I see it, you ought to...**
2. Contrast: **Although...**
3. Option: **It might not be a bad idea to...**
4. Consequence: **This would help...**

Siguiente paso: escribe una respuesta usando esas cuatro partes.`;
}

export async function POST(request: Request) {
  const qa = authenticateQaRequest(request);
  if (!qa.ok) {
    return NextResponse.json({ ok: false, error: "QA authentication required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as CoachRequest;
  const message = String(body.message || "").trim();

  if (!message) {
    return NextResponse.json({ ok: false, error: "Message is required." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    agent: "coach-qa",
    qaMode: true,
    reply: buildReply(message),
    source: "QA Coach",
    deterministic: true,
    usage: {
      model: "qa-deterministic",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUSD: 0,
    },
  });
}
