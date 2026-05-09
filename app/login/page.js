"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    setLoading(false);
    if (!response.ok) {
      const data = await response.json();
      setError(data.error || "Login failed");
      return;
    }
    router.replace("/dashboard");
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-clinic-50 via-white to-emerald-100 px-4 py-10 dark:from-slate-950 dark:via-slate-900 dark:to-clinic-900">
      <section className="mx-auto grid min-h-[80vh] max-w-5xl items-center gap-8 md:grid-cols-2">
        <div>
          <div className="mb-6 inline-flex rounded-2xl bg-white/80 p-3 text-4xl shadow-soft dark:bg-slate-900">🐾</div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-950 dark:text-white">Veterinary WhatsApp Telemedicine</h1>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">Secure doctor dashboard for live WhatsApp consultations, bot takeover, payments, case history, and clinical follow-up.</p>
        </div>
        <form onSubmit={submit} className="rounded-3xl bg-white p-8 shadow-soft ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          <h2 className="text-2xl font-semibold">Admin login</h2>
          <p className="mt-1 text-sm text-slate-500">Use your clinic administrator account.</p>
          <label className="mt-6 block text-sm font-medium">Email</label>
          <input className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-clinic-500 dark:border-slate-700 dark:bg-slate-950" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <label className="mt-4 block text-sm font-medium">Password</label>
          <input className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-clinic-500 dark:border-slate-700 dark:bg-slate-950" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
          <button disabled={loading} className="mt-6 w-full rounded-xl bg-clinic-600 px-4 py-3 font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-clinic-700 disabled:opacity-60 dark:shadow-none">
            {loading ? "Signing in..." : "Open dashboard"}
          </button>
        </form>
      </section>
    </main>
  );
}
