"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const r = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  async function onLogin(e) {
    e.preventDefault();
    setErr("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pw,
    });

    if (error) return setErr(error.message);
    r.push("/"); // zpět do planneru
  }

  async function onSignup(e) {
    e.preventDefault();
    setErr("");

    const { error } = await supabase.auth.signUp({
      email,
      password: pw,
    });

    if (error) return setErr(error.message);
    r.push("/");
  }

  return (
    <main style={{ padding: 24, maxWidth: 420, margin: "0 auto" }}>
      <h1>Přihlášení</h1>

      <form onSubmit={onLogin} style={{ display: "grid", gap: 10 }}>
        <input
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          placeholder="heslo"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="current-password"
        />

        <button type="submit">Přihlásit</button>
        <button type="button" onClick={onSignup}>
          Vytvořit účet
        </button>

        {err && <p style={{ color: "crimson" }}>{err}</p>}
      </form>
    </main>
  );
}