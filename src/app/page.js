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

function getMonday(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Ne
  const diffToMon = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMon);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toISODate(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

  const monday = getMonday(new Date());
  const weekKey = toISODate(monday);

  return {
    players: [p1],
    weeks: {
      [weekKey]: {
        availability: { [p1.id]: blankMatrix() },
      },
    },
  };
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

  const thisMonday = useMemo(() => getMonday(new Date()), []);
  const nextMonday = useMemo(() => addDays(thisMonday, 7), [thisMonday]);

  const thisWeekKey = useMemo(() => toISODate(thisMonday), [thisMonday]);
  const nextWeekKey = useMemo(() => toISODate(nextMonday), [nextMonday]);

  const nextWeek = useMemo(() => getWeekRangeMonSun(nextMonday), [nextMonday]);
  const nextWeekLabel = `${formatCZ(nextWeek.start)} – ${formatCZ(nextWeek.end)}`;

  const [selectedWeekKey, setSelectedWeekKey] = useState(thisWeekKey);

  const selectedWeekLabel =
  selectedWeekKey === thisWeekKey ? weekLabel :
  selectedWeekKey === nextWeekKey ? nextWeekLabel :
  selectedWeekKey;

  function ensureWeeksShape(loaded) {
  if (loaded?.weeks) return loaded;

  // starý tvar: { players, availability }
  const monday = getMonday(new Date());
  const wk = toISODate(monday);

    return {
      players: loaded?.players ?? [],
      weeks: {
        [wk]: { availability: loaded?.availability ?? {} },
      },
    };
  }

  // load z DB
  useEffect(() => {
    (async () => {
      try {
        setStatus("Načítám room…");
        const dbData = await loadRoom(roomSlug, seedData);
        const upgraded = ensureWeeksShape(dbData);
        setData(upgraded);

        const withWeeks = deepClone(upgraded);
        ensureWeek(withWeeks, thisWeekKey);
        ensureWeek(withWeeks, nextWeekKey);
        setData(withWeeks);
              
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
  function ensureWeek(nextData, weekKey) {
  if (!nextData.weeks) nextData.weeks = {};
  if (!nextData.weeks[weekKey]) nextData.weeks[weekKey] = { availability: {} };

    for (const p of nextData.players ?? []) {
      if (!nextData.weeks[weekKey].availability[p.id]) {
        nextData.weeks[weekKey].availability[p.id] = blankMatrix();
      }
    }
  }

  function getCellForWeek(weekKey, d, h, playerId = activePlayerId) {
    if (!playerId) return { state: "empty", note: "" };
    return (
      data.weeks?.[weekKey]?.availability?.[playerId]?.[d]?.[h] ?? {
        state: "empty",
        note: "",
      }
    );
  }

  function getCell(weekKey, d, h) {
    return getCellForWeek(weekKey, d, h);
  }

  function cycleCell(weekKey, d, h) {
    const next = deepClone(data);
    ensureWeek(next, weekKey);

    const pid = activePlayerId;
    if (!pid) return;

    const cell = next.weeks[weekKey].availability[pid][d][h];
    const cur = cell.state ?? "empty";
    const nextState = STATES[(STATES.indexOf(cur) + 1) % STATES.length];
    cell.state = nextState;

    persist(next);
  }

  function editNote(weekKey, d, h) {
    const pid = activePlayerId;
    if (!pid) return;

    const current = getCellForWeek(weekKey, d, h)?.note || "";
    const playerName = data.players.find((p) => p.id === pid)?.name ?? "?";
    const label = `${playerName} • ${weekKey} • ${DAYS[d]} • ${pad2(HOURS[h])}:00`;

    const note = window.prompt(`Poznámka (${label})`, current);
    if (note === null) return;

    const next = deepClone(data);
    ensureWeek(next, weekKey);
    next.weeks[weekKey].availability[pid][d][h].note = note.trim();

    persist(next);
  }


  function addPlayer() {
    const name = window.prompt("Jméno hráče:");
    if (!name || !name.trim()) return;

    const next = deepClone(data);
    const id = uid();
    next.players.push({ id, name: name.trim() });
    // přidat hráče do všech existujících týdnů
      for (const wk of Object.keys(next.weeks ?? {})) {
        if (!next.weeks[wk].availability) next.weeks[wk].availability = {};
        next.weeks[wk].availability[id] = blankMatrix();
      }

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
      for (const wk of Object.keys(next.weeks ?? {})) {
        delete next.weeks[wk].availability?.[pid];
        }

    const newActive = next.players[0]?.id ?? null;
    persist(next);
    setActivePlayerId(newActive);
    setMinFree(Math.max(1, next.players.length || 1));
  }

  function resetAll() {
    const ok = window.confirm("Resetovat všechno (stavy + poznámky)?");
    if (!ok) return;

    const next = deepClone(data);
      for (const wk of Object.keys(next.weeks ?? {})) {
        next.players.forEach((p) => {
          next.weeks[wk].availability[p.id] = blankMatrix();
        });
      }

    persist(next);
  }

    // společné volno (minFree)
    const eventsForWeek = useMemo(() => {
      return data.events?.[selectedWeekKey] ?? [];
        }, [data, selectedWeekKey]);

    const blocks = useMemo(() => {
    const players = data.players ?? [];
    const blocksOut = [];

    function statesAt(d, h) {
      return players.map(p => {
        const cell = data.weeks?.[selectedWeekKey]?.availability?.[p.id]?.[d]?.[h] ?? { state: "empty" };
        return { name: p.name, state: cell.state };
      });
    }

    for (let d = 0; d < DAYS.length; d++) {
      let h = 0;

      while (h < HOURS.length) {
        const hour0 = statesAt(d, h);
        const availableCount0 = hour0.filter(x => x.state === "free" || x.state === "maybe").length;
        if (availableCount0 < minFree) {
          h++;
          continue;
        }

        const startH = h;
        let endH = h + 1;

        // pro každý hráč: množina stavů napříč blokem
        const stateMap = new Map();
        players.forEach(p => stateMap.set(p.name, new Set()));

        hour0.forEach(x => stateMap.get(x.name).add(x.state));

        while (endH < HOURS.length) {
          const hourNext = statesAt(d, endH);
          const availableCountNext = hourNext.filter(x => x.state === "free" || x.state === "maybe").length;
          if (availableCountNext < minFree) break;

          hourNext.forEach(x => stateMap.get(x.name).add(x.state));
          endH++;
        }

        // vyhodnocení hráčů
        const freeAll = [];
        const freeSome = [];
        const never = [];

        stateMap.forEach((states, name) => {
          if (states.size === 1 && states.has("free")) {
            freeAll.push(name);
          } else if (states.has("free") || states.has("maybe")) {
            freeSome.push(name);
          } else {
            never.push(name);
          }
        });

        blocksOut.push({
          key: `${d}-${startH}-${endH}`,
          day: DAYS[d],
          start: HOURS[startH],
          end: HOURS[endH - 1] + 1,
          freeAll,
          freeSome,
          never,
        });

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
          const cell = data.weeks?.[selectedWeekKey]?.availability?.[p.id]?.[d]?.[h] ?? { state: "empty" };
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
        {/* HEADER */}
        <div className="bg3-cardHeader">
          <div className="bg3-titleRow">
            <h1 className="bg3-h1">Baldur's Gate Guild Schedule</h1>
            <span className="bg3-headText">
              Týden: <b>{selectedWeekLabel}</b> • Room: <b>{roomSlug}</b> • Stav: <b>{status}</b>
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
                    const cell = getCell(selectedWeekKey, d, h);
                    const state = cell.state ?? "empty";
                    const note = (cell.note ?? "").trim();

                    const hourStart = HOURS[h]; // např. 20
                    const hasEvent = eventsForWeek.some(e =>
                      e.day === d &&
                      hourStart >= e.startHour &&
                      hourStart < e.endHour
                    );

                    return (
                      <td
                        key={`${selectedWeekKey}-${d}-${h}`}
                        className={[
                          "bg3-td",
                          `bg3-state-${state}`,
                          note ? "bg3-hasNote" : "",
                          hasEvent ? "bg3-hasEvent" : ""
                        ].join(" ")}
                      >
                        <div className="bg3-cell">
                          <button className="bg3-cellMain" onClick={() => cycleCell(selectedWeekKey, d, h)}>
                            {STATE_LABEL[state]}
                          </button>
                          <button
                            className="bg3-noteBtn"
                            onClick={() => editNote(selectedWeekKey, d, h)}
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

            <label className="bg3-sub">
              Týden:&nbsp;
              <select
                className="bg3-select"
                value={selectedWeekKey}
                onChange={(e) => setSelectedWeekKey(e.target.value)}
              >
                <option value={thisWeekKey}>Tento ({thisWeekKey})</option>
                <option value={nextWeekKey}>Příští ({nextWeekKey})</option>
              </select>
            </label>


            <button className="bg3-btn bg3-btnDanger" onClick={resetAll}>
              Reset vše
            </button>
          </div>
        </div>

        <div className="bg3-sideBody">

        {eventsForWeek.length > 0 && (
          <div className="bg3-slot" style={{ marginBottom: 14 }}>
            <div className="bg3-slotTop">
              <b>Eventy z Discordu</b>
              <small>{eventsForWeek.length}</small>
            </div>

            <div style={{ marginTop: 8, fontSize: 13 }}>
              {eventsForWeek
                .slice()
                .sort((a, b) => (a.day - b.day) || (a.startHour - b.startHour))
                .map(e => (
                  <div key={e.id} style={{ marginTop: 6 }}>
                    <span className="bg3-dot free"></span>
                    <b>{e.title}</b>
                    <div className="bg3-sub" style={{ marginTop: 2 }}>
                      {DAYS[e.day]} {pad2(e.startHour)}:00–{pad2(e.endHour)}:00
                      {e.createdBy ? ` • ${e.createdBy}` : ""}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

          {blocks.length === 0 ? (
          <div className="bg3-sub">Nic nesplňuje podmínku. Zkus snížit „Min. free“.</div>
        ) : (
          blocks.map((b) => {
            const timeLabel = `${b.day} ${pad2(b.start)}:00–${pad2(b.end)}:00`;
            const perfect = b.freeAll.length === (data.players?.length ?? 0);

            return (
              <div className="bg3-slot" style={perfect ? { borderColor: "var(--gold)" } : undefined}>
                <div className="bg3-slotTop">
                  <b>{b.day} {pad2(b.start)}:00–{pad2(b.end)}:00</b>
                  <small>{b.freeAll.length}/{data.players.length} jistě</small>
                </div>

                <div style={{ marginTop: 8, fontSize: 13 }}>
                  <div>
                    <span className="bg3-dot free"></span>
                    <b>Mohou celý blok:</b> {b.freeAll.join(", ") || "—"}
                  </div>

                  <div style={{ marginTop: 6 }}>
                    <span className="bg3-dot maybe"></span>
                    <b>Mohou část:</b> {b.freeSome.join(", ") || "—"}
                  </div>

                  <div style={{ marginTop: 6 }}>
                    <span className="bg3-dot busy"></span>
                    <b>Nemohou:</b> {b.never.join(", ") || "—"}
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