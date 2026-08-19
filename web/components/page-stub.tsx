export function PageStub({
  route,
  title,
  section,
}: {
  route: string;
  title: string;
  section: string;
}) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-6 px-6 py-16">
      <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
        stub · {route}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground leading-relaxed">
        Build this page against <code className="font-mono text-sm">getDataSource()</code> as
        specified in{' '}
        <span className="font-mono text-sm text-foreground">
          docs/frontend-handoff.md {section}
        </span>
        . Do not wire real chain / runtime / Supabase.
      </p>
      <p className="text-sm text-muted-foreground">
        Work on a branch, open a PR into <code className="font-mono">main</code>, request review
        from @winsznx.
      </p>
    </main>
  );
}
