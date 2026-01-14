import { NextResponse } from "next/server";
import { verifyKey } from "discord-interactions";
import { loadRoom, saveRoom } from "@/lib/rooms";

export const runtime = "nodejs";

const InteractionResponseType = { PONG: 1, CHANNEL_MESSAGE_WITH_SOURCE: 4 };

function json(data, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseEvent(text) {
  // podporuje:
  // "so 20-24 raid"
  // "+1 so 20-24 raid"   (příští týden)
  // "+2 so 20-24 raid"   (za 2 týdny)

  const cleaned = String(text || "").trim();

  const m = cleaned.match(
    /^(?:\+(\d+)\s+)?(\S+)\s+(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(.*)$/i
  );
  if (!m) return { error: "Formát: `so 20-24 raid` nebo `+1 so 20-24 raid`" };

  const weekOffset = m[1] ? Number(m[1]) : 0;
  const dayStr = m[2].toLowerCase();

  const start = Number(m[3]);
  const end = Number(m[4]);
  const title = (m[5] || "").trim() || "BG3 event";

  const dayMap = { po: 0, ut: 1, "út": 1, st: 2, ct: 3, "čt": 3, pa: 4, "pá": 4, so: 5, ne: 6 };
  const day = dayMap[dayStr];

  if (!Number.isInteger(weekOffset) || weekOffset < 0 || weekOffset > 52) {
    return { error: "Prefix týdne: `+0` až `+52` (např. `+1 so 20-24 raid`)." };
  }
  if (day === undefined) return { error: "Den použij: `po út st čt pá so ne`" };
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > 23 || end < 1 || end > 24 || end <= start) {
    return { error: "Čas: start 0–23, end 1–24 a end > start (např. 20-24)" };
  }

  return { day, startHour: start, endHour: end, title, weekOffset };
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function getMonday(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
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

export async function POST(req) {
  const rawBody = await req.text();

  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  if (!signature || !timestamp || !publicKey) {
    return json({ error: "Missing signature headers or DISCORD_PUBLIC_KEY" }, 401);
  }

  const isValid = verifyKey(rawBody, signature, timestamp, publicKey);
  if (!isValid) return json({ error: "Bad request signature" }, 401);

  const interaction = JSON.parse(rawBody);

  console.log("DISCORD HIT", {
  hasSig: !!req.headers.get("x-signature-ed25519"),
  hasTs: !!req.headers.get("x-signature-timestamp"),
  hasPk: !!process.env.DISCORD_PUBLIC_KEY,
  bodyLen: rawBody.length,
});


  // PING (Discord ověření)
  if (interaction.type === 1) {
    return json({ type: InteractionResponseType.PONG });
  }

  // Náš command
  if (interaction.type !== 2 || interaction.data?.name !== "bg3") {
    return json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: "Použij `/bg3 event: so 20-24 raid`" },
    });
  }

  const opt = (interaction.data.options || []).find((o) => o.name === "event");
  const parsed = parseEvent(opt?.value);

  if (parsed.error) {
    return json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `❌ ${parsed.error}` },
    });
  }

  // ---- vypočti týden ----
  const baseMonday = getMonday(new Date());
  const targetMonday = addDays(baseMonday, (parsed.weekOffset ?? 0) * 7);
  const weekKey = toISODate(targetMonday);

  const dn = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
  const createdBy =
    interaction.member?.user?.username || interaction.user?.username || "discord";

  // ---- DŮLEŽITÉ: odpověz hned, ať Discord netimeoutne ----
  const immediate = json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `⏳ Ukládám (týden ${weekKey}): ${dn[parsed.day]} ${String(parsed.startHour).padStart(2, "0")}:00–${String(parsed.endHour).padStart(2, "0")}:00 • ${parsed.title}`,
    },
  });

  // ---- ukládání na pozadí (nečekáme) ----
  const room = process.env.DISCORD_ALLOWED_ROOM || "bg3"; // <-- tady byl u tebe bug (room nebyl definovaný)
  const seedData = { players: [], weeks: {}, events: {} };

  queueMicrotask(async () => {
    try {
      const roomData = await loadRoom(room, seedData);
      const next = structuredClone(roomData);

      if (!next.events) next.events = {};
      if (!next.events[weekKey]) next.events[weekKey] = [];

      next.events[weekKey].push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: parsed.title,
        day: parsed.day,
        startHour: parsed.startHour,
        endHour: parsed.endHour,
        createdAt: new Date().toISOString(),
        createdBy,
      });

      await saveRoom(room, next);
    } catch (e) {
      console.error("Discord async save failed", e);
    }
  });

  return immediate;
}

export async function GET() {
  return NextResponse.json({ ok: true, where: "/api/discord" });
}