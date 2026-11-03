
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-white p-8 shadow-sm">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary)] text-2xl font-bold text-white">
          D
        </div>

        <p className="mb-2 text-sm font-medium text-[var(--primary)]">
          Retailer ordering platform
        </p>

        <h1 className="text-3xl font-bold tracking-tight">
          DukaanFlow
        </h1>

        <p className="mt-3 text-[var(--muted)]">
          A faster way to manage retailer orders,
          prices and schemes.
        </p>

        <div className="mt-8 rounded-xl bg-[#f0f5f0] p-4">
          <p className="text-sm font-medium">
            Project foundation ready
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Catalogue and ordering workflows are coming next.
          </p>
        </div>
      </section>
    </main>
  );
}
