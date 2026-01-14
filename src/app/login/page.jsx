"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const title = useMemo(
    () => (mode === "login" ? "Vstup do gildy" : "Vytvořit účet"),
    [mode]
  );

  async function onLogin(e) {
    e.preventDefault();
    setErr("");
    setInfo("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pw,
    });

    setLoading(false);
    if (error) return setErr(error.message);
    router.push("/");
  }

  async function onSignup(e) {
    e.preventDefault();
    setErr("");
    setInfo("");
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pw,
    });

    setLoading(false);
    if (error) return setErr(error.message);

    // když máš vypnuté email confirmation, rovnou pustí dál
    // když je zapnuté, ukážeme info
    if (!data?.session) {
      setInfo("Mrkni do emailu a potvrď registraci (pokud je zapnutá).");
      return;
    }

    router.push("/");
  }

  return (
    <main className="bg3-shell">
      <div className="bg3-loginWrap">
        <div className="bg3-loginCard">
          <div className="bg3-loginTop">
            <div className="bg3-loginSigil">⚔️</div>
            <div>
              <h1 className="bg3-loginH1">{title}</h1>
              <div className="bg3-sub">
                BG3 planner je jen pro vaši partu. Přihlas se, ať to není veřejné.
              </div>
            </div>
          </div>

          <div className="bg3-loginTabs">
            <button
              className={`bg3-tab ${mode === "login" ? "isActive" : ""}`}
              onClick={() => {
                setMode("login");
                setErr("");
                setInfo("");
              }}
              type="button"
            >
              Přihlášení
            </button>
            <button
              className={`bg3-tab ${mode === "signup" ? "isActive" : ""}`}
              onClick={() => {
                setMode("signup");
                setErr("");
                setInfo("");
              }}
              type="button"
            >
              Registrace
            </button>
          </div>

          <form className="bg3-form" onSubmit={mode === "login" ? onLogin : onSignup}>
            <label className="bg3-label">
              Email
              <input
                className="bg3-input"
                placeholder="např. družina@faerun.cz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
              />
            </label>

            <label className="bg3-label">
              Heslo
              <input
                className="bg3-input"
                placeholder="••••••••"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </label>

            {(err || info) && (
              <div className={`bg3-alert ${err ? "isError" : "isInfo"}`}>
                {err || info}
              </div>
            )}

            <button className="bg3-btn bg3-btnPrimary bg3-loginBtn" disabled={loading}>
              {loading ? "Chvíli..." : mode === "login" ? "Vstoupit" : "Vytvořit účet"}
            </button>

            <div className="bg3-loginHint">
              Tip: pokud jste jen parta kamarádů, můžete klidně používat jeden společný účet.
            </div>
          </form>
        </div>

        <div className="bg3-loginFoot">
          <span className="bg3-sub">Baldur’s Gate vibe ✨ • Vercel • Supabase</span>
        </div>
      </div>
    </main>
  );
}