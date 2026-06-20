import Link from "next/link";
import { EnglishOsLogo } from "@/components/EnglishOsLogo";

const learningSteps = [
  {
    number: "01",
    title: "Aprende con contexto",
    description: "El coach conecta tu clase con tu posición, tus objetivos y tus errores recientes.",
  },
  {
    number: "02",
    title: "Practica por etapas",
    description: "Cada sesión avanza con explicación, ejemplos, producción guiada y retroalimentación útil.",
  },
  {
    number: "03",
    title: "Consolida el progreso",
    description: "Repasa una unidad sin perder tu posición guardada y usa los materiales del objetivo activo.",
  },
];

export default function Home() {
  return (
    <main className="min-h-[100dvh] bg-[#f2f3f1] text-[#202723]">
      <div className="mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-5 py-5 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between border-b border-[#d8ddd8] pb-4">
          <Link href="/" className="rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-[#6f8f76]/40">
            <EnglishOsLogo size="md" textClassName="text-[#202723]" />
          </Link>
          <Link href="/coach" className="rounded-full border border-[#aeb7b0] px-4 py-2 text-sm font-medium transition hover:bg-[#e4e8e4]">
            Abrir coach
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#667169]">De B1 a B2 profesional</p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.035em] sm:text-6xl">
              Una clase de inglés que recuerda dónde estás y qué necesitas practicar.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-[#5d675f] sm:text-lg">
              English OS transforma tu ruta de aprendizaje en sesiones interactivas: enseña, escucha tu respuesta, corrige y decide contigo el siguiente paso.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/coach" className="rounded-full bg-[#5f7165] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#4f6056]">
                Continuar mi clase
              </Link>
              <a href="#metodo" className="rounded-full border border-[#aeb7b0] px-6 py-3 text-sm font-semibold transition hover:bg-[#e4e8e4]">
                Ver cómo funciona
              </a>
            </div>
          </div>

          <aside className="rounded-[2rem] border border-[#d4dad5] bg-[#fafbf9] p-6 shadow-[0_24px_70px_rgba(44,55,48,0.08)] sm:p-8">
            <EnglishOsLogo size="lg" textClassName="text-[#202723]" />
            <p className="mt-7 text-xs font-semibold uppercase tracking-[0.16em] text-[#6c776f]">Tu sesión</p>
            <h2 className="mt-4 text-2xl font-semibold">Un objetivo claro, una actividad a la vez.</h2>
            <div className="mt-7 space-y-4 text-sm leading-6 text-[#59645c]">
              <p>Elige una clase concreta, continúa tu posición actual o entra en modo repaso.</p>
              <p>Los materiales, la conversación y la práctica siguen siempre el objetivo activo.</p>
              <p>Tu progreso solo cambia cuando existe evidencia real de aprendizaje.</p>
            </div>
          </aside>
        </section>

        <section id="metodo" className="border-t border-[#d8ddd8] py-10">
          <div className="grid gap-5 md:grid-cols-3">
            {learningSteps.map((step) => (
              <article key={step.number} className="rounded-2xl border border-[#d8ddd8] bg-[#f8f9f7] p-5">
                <p className="text-xs font-semibold text-[#7b867e]">{step.number}</p>
                <h2 className="mt-5 text-lg font-semibold">{step.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[#626d65]">{step.description}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
