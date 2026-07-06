import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-12">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">Arena</p>
      <h1 className="mt-3 text-4xl font-semibold">Trade points on real prediction markets.</h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        Buy mock positions, join parlays, and compare your realized points against MEAN.
      </p>
      <div className="mt-8 flex gap-3">
        <Link className="rounded-md bg-primary px-4 py-2 font-medium text-white" href="/signup">
          Sign up
        </Link>
        <Link className="rounded-md border border-slate-300 px-4 py-2 font-medium" href="/login">
          Log in
        </Link>
      </div>
    </main>
  );
}
