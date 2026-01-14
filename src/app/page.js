"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadRoom, saveRoom } from "@/lib/rooms";

const DAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const HOURS = Array.from({ length: 16 }, (_, i) => i + 8); // 08:00–23:00

const STATES = ["empty", "free", "maybe", "busy"];
const STATE_LABEL = { empty: "—", free: "free", maybe: "možná", busy: "busy" };

function formatCZ(date) {
  return new Intl.DateTimeFormat("cs-CZ").format(date);
}

// vrátí { start: Date (Po), end: Date (Ne) } pro týden, kde je "today"
function getWeekRangeMonSun(today = new Date()) {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);

  // JS: 0=Ne, 1=Po, ... 6=So
  const day = d.getDay();
  const diffToMon = (day === 0 ? -6 : 1 - day); // když je neděle, vrať se o 6 dní
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMon);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return { start: monday, end: sunday };
}

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

  const week = useMemo(() => getWeekRangeMonSun(new Date()), []);
  const weekLabel = `${formatCZ(week.start)} – ${formatCZ(week.end)}`;

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
    const blocks = useMemo(() => {
    const players = data.players ?? [];
    const blocksOut = [];

    // pomocné: free jména pro konkrétní (d,h)
    function freeNamesAt(d, h) {
      const free = [];
      for (const p of players) {
        const cell = data.availability?.[p.id]?.[d]?.[h] ?? { state: "empty" };
        if (cell.state === "free") free.push(p.name);
      }
      return free;
    }

    // průchod po dnech
    for (let d = 0; d < DAYS.length; d++) {
      let h = 0;

      while (h < HOURS.length) {
        const free0 = freeNamesAt(d, h);

        // podmínka: v této hodině je splněno minFree
        if (free0.length < minFree) {
          h++;
          continue;
        }

        // start bloku
        const startH = h;
        let endH = h + 1;

        // průnik hráčů free po celý blok
        let intersection = new Set(free0);

        // extend bloku, dokud navazuje a pořád splňuje minFree
        while (endH < HOURS.length) {
          const freeNext = freeNamesAt(d, endH);

          if (freeNext.length < minFree) break;

          // intersect
          const nextSet = new Set(freeNext);
          intersection = new Set([...intersection].filter((x) => nextSet.has(x)));

          endH++;
        }

        // převeď průnik do pole
        const freeAllBlock = [...intersection];

        blocksOut.push({
          key: `${d}-${startH}-${endH}`,
          day: DAYS[d],
          d,
          start: HOURS[startH],
          end: HOURS[endH - 1] + 1, // konec je +1 hodina
          freeAllBlock,
          // pro info (kolik je „po celý blok“)
          freeAllCount: freeAllBlock.length,
        });

        // posuň se za blok
        h = endH;
      }
    }

    return blocksOut;
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
  <main className="bg3-shell">
    <div className="bg3-grid">

      {/* LEVÁ KARTA */}
      <section className="bg3-card">
        {/* HEADER (tady se ztrácíš) */}
        <div className="bg3-cardHeader">
          <div className="bg3-titleRow">
            <h1 className="bg3-h1">Baldur's Gate Guild Schedule</h1>
            <span className="bg3-headText">
              Týden: <b>{weekLabel}</b> • Room: <b>{roomSlug}</b> • Stav: <b>{status}</b>
            </span>
          </div>

          <div className="bg3-controls">
            <label className="bg3-sub">
              Aktivní hráč:&nbsp;
              <select
                className="bg3-select"
                value={activePlayerId ?? ""}
                onChange={(e) => setActivePlayerId(e.target.value)}
              >
                {(data.players ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <button className="bg3-btn bg3-btnPrimary" onClick={addPlayer}>
              + Přidat hráče
            </button>

            <button
              className="bg3-btn bg3-btnDanger"
              onClick={removeActivePlayer}
              disabled={!activePlayerId}
            >
              Odebrat hráče
            </button>

            <span className="bg3-pill">
              Tip: klik = stav • ✎ = důvod
            </span>
          </div>

          <div className="bg3-controls">
            <span className="bg3-pill"><span className="bg3-dot free"></span>free</span>
            <span className="bg3-pill"><span className="bg3-dot maybe"></span>možná</span>
            <span className="bg3-pill"><span className="bg3-dot busy"></span>busy</span>
            <span className="bg3-pill">— = bere se jako busy</span>
          </div>
        </div>

        {/* TABULKA */}
        <div className="bg3-tableWrap">
          <table className="bg3-table">
            <thead>
              <tr>
                <th className="bg3-th bg3-time">Čas</th>
                {DAYS.map((d) => (
                  <th key={d} className="bg3-th">{d}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {HOURS.map((hour, h) => (
                <tr key={hour}>
                  <td className="bg3-td bg3-time">{pad2(hour)}:00</td>

                  {DAYS.map((_, d) => {
                    const cell = getCell(d, h);
                    const state = cell.state ?? "empty";
                    const note = (cell.note ?? "").trim();

                    return (
                      <td
                        key={`${d}-${h}`}
                        className={[
                          "bg3-td",
                          `bg3-state-${state}`,
                          note ? "bg3-hasNote" : ""
                        ].join(" ")}
                      >
                        <div className="bg3-cell">
                          <button className="bg3-cellMain" onClick={() => cycleCell(d, h)}>
                            {STATE_LABEL[state]}
                          </button>
                          <button
                            className="bg3-noteBtn"
                            onClick={() => editNote(d, h)}
                            title={note || "Přidat důvod"}
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

      {/* PRAVÁ KARTA */}
      <aside className="bg3-card">
        <div className="bg3-cardHeader">
          <div className="bg3-titleRow">
            <h2 className="bg3-h1" style={{ fontSize: 14, margin: 0 }}>Společně volno</h2>
            <span className="bg3-sub">
              Hráči: <b>{data.players?.length ?? 0}</b> • Všichni free: <b>{allFreeCount}</b>
            </span>
          </div>

          <div className="bg3-controls">
            <label className="bg3-sub">
              Min. free:&nbsp;
              <select
                className="bg3-select"
                value={minFree}
                onChange={(e) => setMinFree(Number(e.target.value))}
              >
                {Array.from({ length: Math.max(1, data.players?.length ?? 1) }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>

            <button className="bg3-btn bg3-btnDanger" onClick={resetAll}>
              Reset vše
            </button>
          </div>
        </div>

        <div className="bg3-sideBody">
          {blocks.length === 0 ? (
          <div className="bg3-sub">Nic nesplňuje podmínku. Zkus snížit „Min. free“.</div>
        ) : (
          blocks.map((b) => {
            const timeLabel = `${b.day} ${pad2(b.start)}:00–${pad2(b.end)}:00`;
            const perfect = b.freeAllCount === (data.players?.length ?? 0);

            return (
              <div
                key={b.key}
                className="bg3-slot"
                style={perfect ? { borderColor: "rgba(214,178,94,.55)" } : undefined}
              >
                <div className="bg3-slotTop">
                  <b>{timeLabel}</b>
                  <small>{b.freeAllCount}/{data.players?.length ?? 0} free (celý blok)</small>
                </div>

                <div style={{ marginTop: 8, fontSize: 13 }}>
                  <div>
                    <span className="bg3-dot free"></span>
                    <b>Mohou:</b> {b.freeAllBlock.join(", ") || "—"}
                  </div>
                </div>
              </div>
            );
          })
        )}
        </div>
      </aside>

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