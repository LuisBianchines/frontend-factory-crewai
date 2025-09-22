export default function Home() {
  return (
    <div className="space-y-6 rounded-3xl border border-border bg-card p-10 shadow-lg">
      <span className="inline-flex rounded-full bg-primary/10 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
        Lapidatto
      </span>
      <h1 className="text-4xl font-semibold tracking-tight">Next.js base pronta para agentes CrewAI</h1>
      <p className="text-base leading-relaxed text-muted-foreground">
        Essa página é apenas um placeholder. O fluxo de geração Lapidatto irá substituí-la
        por páginas personalizadas conforme o ProjectSpec planejado pelos agentes.
      </p>
    </div>
  );
}
