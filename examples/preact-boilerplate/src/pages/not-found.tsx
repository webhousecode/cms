export function NotFound() {
  return (
    <section class="py-20">
      <div class="mx-auto max-w-3xl px-4 text-center">
        <h1 class="text-5xl font-extrabold text-foreground">404</h1>
        <p class="mt-3 text-muted">This page doesn't exist.</p>
        <a
          href="/"
          class="mt-6 inline-block rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Back home
        </a>
      </div>
    </section>
  );
}
