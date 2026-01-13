"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadRoom, saveRoom } from "@/lib/rooms";

const DAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const HOURS = Array.from({ length: 16 }, (_, i) => i + 8); // 08:00–23:00

const STATES = ["empty", "free", "maybe", "busy"];
const STATE_LABEL = { empty: "—", free: "free", maybe: "možná", busy: "busy" };

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
function pad2(n) {
  return String(n).padStart(2, "0");
}
function blankMatrix() {
  return DAYS.map(() => HOURS.map(() => ({ state: "empty", note: "" })));
}
function seed() {
  const p1 = { id: uid(), name: "Já" };
  return { players: [p1], availability: { [p1.id]: blankMatrix() } };
}

function deepClone(obj) {
  // moderní a jednoduché
  return structuredClone(obj);
}

export default function Page() {
  const seedData = useMemo(() => seed(), []);
  const [data, setData] = useState(seedData);
  const [activePlayerId, setActivePlayerId] = useState(seedData.players[0].id);
  const [minFree, setMinFree] = useState(seedData.players.length);

  const [status, setStatus] = useState("Načítám…"); // jen malý indikátor
  const saveTimer = useRef(null);

  // room slug: ?room=bg3
  const roomSlug = useMemo(() => {
    if (typeof window === "undefined") return "bg3";
    return new URLSearchParams(window.location.search).get("room") || "bg3";
  }, []);

  // load z DB
  useEffect(() => {
    (async () => {
      try {
        setStatus("Načítám room…");
        const dbData = await loadRoom(roomSlug, seedData);
        setData(dbData);

        const first = dbData.players?.[0]?.id ?? seedData.players[0].id;
        setActivePlayerId(first);
        setMinFree(Math.max(1, dbData.players?.length ?? 1));

        setStatus("OK");
      } catch (e) {
        console.error(e);
        setStatus("Chyba při načtení (viz konzole)");
      }
    })();
  }, [roomSlug, seedData]);

  // debounce save
  function persist(nextData) {
    setData(nextData);
    setStatus("Ukládám…");

    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await saveRoom(roomSlug, nextData);
        setStatus("OK");
      } catch (e) {
        console.error(e);
        setStatus("Chyba při ukládání (viz konzole)");
      }
    }, 300);
  }

  // helpers na práci s cell
  function getCell(d, h) {
    const pid = activePlayerId;
    if (!pid) return { state: "empty", note: "" };
    return data.availability?.[pid]?.[d]?.[h] ?? { state: "empty", note: "" };
  }

  function cycleCell(d, h) {
    const next = deepClone(data);
    const pid = activePlayerId;
    if (!pid) return;

    const cell = next.availability[pid][d][h];
    const cur = cell.state ?? "empty";
    const nextState = STATES[(STATES.indexOf(cur) + 1) % STATES.length];
    cell.state = nextState;

    persist(next);
  }

  function editNote(d, h) {
    const pid = activePlayerId;
    if (!pid) return;

    const current = getCell(d, h)?.note || "";
    const playerName = data.players.find((p) => p.id === pid)?.name ?? "?";
    const label = `${playerName} • ${DAYS[d]} • ${pad2(HOURS[h])}:00`;

    const note = window.prompt(`Poznámka (${label})`, current);
    if (note === null) return; // cancel

    const next = deepClone(data);
    next.availability[pid][d][h].note = note.trim();
    persist(next);
  }

  function addPlayer() {
    const name = window.prompt("Jméno hráče:");
    if (!name || !name.trim()) return;

    const next = deepClone(data);
    const id = uid();
    next.players.push({ id, name: name.trim() });
    next.availability[id] = blankMatrix();

    persist(next);
    setActivePlayerId(id);
    setMinFree(Math.max(1, next.players.length));
  }

  function removeActivePlayer() {
    const pid = activePlayerId;
    if (!pid) return;
    const p = data.players.find((x) => x.id === pid);
    if (!p) return;

    const ok = window.confirm(`Odebrat hráče "${p.name}"?`);
    if (!ok) return;

    const next = deepClone(data);
    next.players = next.players.filter((x) => x.id !== pid);
    delete next.availability[pid];

    const newActive = next.players[0]?.id ?? null;
    persist(next);
    setActivePlayerId(newActive);
    setMinFree(Math.max(1, next.players.length || 1));
  }

  function resetAll() {
    const ok = window.confirm("Resetovat všechno (stavy + poznámky)?");
    if (!ok) return;

    const next = deepClone(data);
    next.players.forEach((p) => {
      next.availability[p.id] = blankMatrix();
    });
    persist(next);
  }

  // společné volno (minFree)
  const slots = useMemo(() => {
    const players = data.players ?? [];
    const out = [];

    for (let d = 0; d < DAYS.length; d++) {
      for (let h = 0; h < HOURS.length; h++) {
        const free = [];
        const maybe = [];
        const busy = [];

        for (const p of players) {
          const cell = data.availability?.[p.id]?.[d]?.[h] ?? { state: "empty" };
          if (cell.state === "free") free.push(p.name);
          else if (cell.state === "maybe") maybe.push(p.name);
          else busy.push(p.name);
        }

        if (free.length >= minFree) {
          out.push({
            key: `${d}-${h}`,
            label: `${DAYS[d]} ${pad2(HOURS[h])}:00–${pad2(HOURS[h] + 1)}:00`,
            free,
            maybe,
            busy,
            ratio: `${free.length}/${players.length}`,
          });
        }
      }
    }
    return out;
  }, [data, minFree]);

  const allFreeCount = useMemo(() => {
    const players = data.players ?? [];
    let count = 0;

    for (let d = 0; d < DAYS.length; d++) {
      for (let h = 0; h < HOURS.length; h++) {
        let ok = true;
        for (const p of players) {
          const cell = data.availability?.[p.id]?.[d]?.[h] ?? { state: "empty" };
          if (cell.state !== "free") {
            ok = false;
            break;
          }
        }
        if (ok && players.length > 0) count++;
      }
    }
    return count;
  }, [data]);

  // UI
  return (
    <main style={{ padding: 18, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 14, alignItems: "start" }}>
        {/* LEFT */}
        <section style={card}>
          <div style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: 18 }}>BG3 dostupnost</h1>
              <span style={{ color: "#6b7280", fontSize: 13 }}>
                Room: <b>{roomSlug}</b> • Stav: <b>{status}</b>
              </span>
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ fontSize: 13, color: "#374151" }}>
                Aktivní hráč:&nbsp;
                <select
                  value={activePlayerId ?? ""}
                  onChange={(e) => setActivePlayerId(e.target.value)}
                  style={select}
                >
                  {(data.players ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <button onClick={addPlayer} style={btn}>
                + Přidat hráče
              </button>
              <button onClick={removeActivePlayer} style={btnDanger} disabled={!activePlayerId}>
                Odebrat hráče
              </button>

              <span style={{ color: "#6b7280", fontSize: 13 }}>
                Tip: klik = změna stavu • poznámka = tlačítko „✎“
              </span>
            </div>
          </div>

          <div style={{ padding: 12, overflow: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "max-content", minWidth: "100%" }}>
              <thead>
                <tr>
                  <th style={{ ...th, position: "sticky", left: 0, zIndex: 3, background: "#fff" }}>Čas</th>
                  {DAYS.map((d) => (
                    <th key={d} style={th}>
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {HOURS.map((hour, h) => (
                  <tr key={hour}>
                    <td style={{ ...tdTime, position: "sticky", left: 0, zIndex: 2, background: "#fff" }}>
                      {pad2(hour)}:00
                    </td>

                    {DAYS.map((_, d) => {
                      const cell = getCell(d, h);
                      const state = cell.state ?? "empty";
                      const note = (cell.note ?? "").trim();

                      return (
                        <td key={`${d}-${h}`} style={td}>
                          <div style={{ ...cellBox, ...stateStyle(state) }}>
                            <button onClick={() => cycleCell(d, h)} style={cellBtn}>
                              {STATE_LABEL[state]}
                            </button>

                            <button
                              onClick={() => editNote(d, h)}
                              title={note ? note : "Přidat poznámku"}
                              style={noteBtn}
                            >
                              ✎
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* RIGHT */}
        <aside style={card}>
          <div style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 700, color: "#374151" }}>Společně volno</div>
            <div style={{ marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap", color: "#6b7280", fontSize: 13 }}>
              <span>
                Hráči: <b style={{ color: "#111827" }}>{data.players?.length ?? 0}</b>
              </span>
              <span>
                Úseků všichni free: <b style={{ color: "#111827" }}>{allFreeCount}</b>
              </span>
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, color: "#374151" }}>
                Min. free:&nbsp;
                <select
                  value={minFree}
                  onChange={(e) => setMinFree(Number(e.target.value))}
                  style={select}
                >
                  {Array.from({ length: Math.max(1, data.players?.length ?? 1) }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>

              <button onClick={resetAll} style={btnDanger}>
                Reset vše
              </button>
            </div>
          </div>

          <div style={{ padding: 12, maxHeight: 560, overflow: "auto" }}>
            {slots.length === 0 ? (
              <div style={{ color: "#6b7280", fontSize: 13 }}>
                Nic nesplňuje podmínku. Zkus snížit „Min. free“.
              </div>
            ) : (
              slots.map((s) => (
                <div key={s.key} style={slotCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <b>{s.label}</b>
                    <span style={{ color: "#6b7280", fontSize: 12 }}>{s.ratio} free</span>
                  </div>

                  <div style={{ marginTop: 8, fontSize: 13, color: "#111827" }}>
                    <div>
                      <span style={{ ...pill, background: "#dcfce7", borderColor: "#86efac" }}>Free</span>{" "}
                      {s.free.join(", ") || "—"}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <span style={{ ...pill, background: "#fef9c3", borderColor: "#fde047" }}>Možná</span>{" "}
                      {s.maybe.join(", ") || "—"}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <span style={{ ...pill, background: "#fee2e2", borderColor: "#fca5a5" }}>Busy</span>{" "}
                      {s.busy.join(", ") || "—"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>

      <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
        HOW TO: <br />
        1) Stiskni přidat hráče a napiš své jméno (ostatní hráči to udělají taky).<br />
        2) Vyber se v seznamu jako aktivního hráče.<br />
        3) Klikáním na buňky nastav svůj stav dostupnosti (free/možná/busy).<br />
        4) Můžeš přidat i poznámky k jednotlivým časům (tlačítko „✎“).<br />
      </div>
    </main>
  );
}

// ====== styles (jednoduché inline, ať se s tím nemusíš prát) ======
const card = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  overflow: "hidden",
};

const th = {
  border: "1px solid #e5e7eb",
  padding: "10px 12px",
  fontSize: 12,
  color: "#6b7280",
  background: "#f9fafb",
  position: "sticky",
  top: 0,
  zIndex: 2,
};

const tdTime = {
  border: "1px solid #e5e7eb",
  padding: "8px 10px",
  fontSize: 12,
  color: "#6b7280",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const td = {
  border: "1px solid #e5e7eb",
  padding: 0,
  minWidth: 92,
  height: 38,
};

const cellBox = {
  width: "100%",
  height: "100%",
  display: "grid",
  gridTemplateColumns: "1fr 34px",
  alignItems: "stretch",
};

const cellBtn = {
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: 12,
  padding: 8,
};

const noteBtn = {
  border: "none",
  borderLeft: "1px solid rgba(0,0,0,.08)",
  background: "rgba(255,255,255,.35)",
  cursor: "pointer",
  fontSize: 12,
};

const select = {
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "white",
};

const btn = {
  padding: "7px 10px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#f9fafb",
  cursor: "pointer",
};

const btnDanger = {
  ...btn,
  background: "#fff1f2",
  borderColor: "#fecdd3",
};

const slotCard = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 10,
  marginBottom: 10,
  background: "#fafafa",
};

const pill = {
  display: "inline-block",
  fontSize: 12,
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid",
  marginRight: 6,
};

function stateStyle(state) {
  if (state === "free") return { background: "rgba(34,197,94,.18)" };
  if (state === "maybe") return { background: "rgba(234,179,8,.18)" };
  if (state === "busy") return { background: "rgba(239,68,68,.18)" };
  return { background: "rgba(0,0,0,.02)" };
}