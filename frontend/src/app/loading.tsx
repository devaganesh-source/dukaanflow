
export default function Loading() {
  return (
    <main
      className="mx-auto max-w-7xl animate-pulse px-4 py-8 sm:px-6"
      aria-label="Loading catalogue"
    >
      <div className="mb-8 h-12 w-44 rounded-xl bg-[#e1e8e1]" />

      <div className="mb-8 h-48 rounded-3xl bg-[#e1e8e1]" />

      <div className="mb-6 h-12 max-w-xl rounded-xl bg-[#e1e8e1]" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-72 rounded-2xl border border-[#e1e8e1] bg-white p-4"
          >
            <div className="mb-6 h-20 w-20 rounded-xl bg-[#e1e8e1]" />
            <div className="mb-3 h-5 w-3/4 rounded bg-[#e1e8e1]" />
            <div className="mb-6 h-4 w-1/2 rounded bg-[#e1e8e1]" />
            <div className="h-11 rounded-xl bg-[#e1e8e1]" />
          </div>
        ))}
      </div>
    </main>
  );
}
