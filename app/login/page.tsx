"use client";

import { useState, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
      if (error) {
        setError(error.message);
      } else {
        setMessage("Check your email for a confirmation link.");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      } else {
        router.push(next);
        router.refresh();
      }
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-gold mb-1 font-display tracking-wide uppercase">
          World Cup 2026
        </h1>
        <p className="text-chalk/50 text-sm mb-8 font-mono">Fantasy Contest</p>

        <div className="card">
          <div className="flex mb-6 border border-border rounded overflow-hidden">
            <button
              className={`flex-1 py-2 text-sm font-mono transition-colors ${
                mode === "signin"
                  ? "bg-gold text-bg font-bold"
                  : "text-chalk/60 hover:text-chalk"
              }`}
              onClick={() => { setMode("signin"); setError(null); }}
            >
              Sign In
            </button>
            <button
              className={`flex-1 py-2 text-sm font-mono transition-colors ${
                mode === "signup"
                  ? "bg-gold text-bg font-bold"
                  : "text-chalk/60 hover:text-chalk"
              }`}
              onClick={() => { setMode("signup"); setError(null); }}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === "signup" && (
              <div>
                <label className="block text-xs text-chalk/60 mb-1 uppercase tracking-widest">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  className="w-full bg-bg border border-border rounded px-3 py-2 text-chalk text-sm focus:outline-none focus:border-gold"
                  placeholder="Your name"
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-chalk/60 mb-1 uppercase tracking-widest">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-bg border border-border rounded px-3 py-2 text-chalk text-sm focus:outline-none focus:border-gold"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-xs text-chalk/60 mb-1 uppercase tracking-widest">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-bg border border-border rounded px-3 py-2 text-chalk text-sm focus:outline-none focus:border-gold"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-red-400 text-xs">{error}</p>
            )}
            {message && (
              <p className="text-green-400 text-xs">{message}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gold text-bg font-bold py-2 rounded text-sm uppercase tracking-widest hover:bg-gold-light transition-colors disabled:opacity-50"
            >
              {loading ? "..." : mode === "signin" ? "Sign In" : "Sign Up"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
