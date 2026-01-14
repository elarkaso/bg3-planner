const url = `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`;

// Náš slash command
const command = {
  name: "bg3",
  description: "Add BG3 event to planner",
  options: [
    {
      type: 3, // STRING
      name: "event",
      description: "Format: so 20-24 raid",
      required: true,
    },
    // volitelně můžeš doplnit room:
    // { type: 3, name: "room", description: "Room slug (default bg3)", required: false }
  ],
};

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bot ${BOT_TOKEN}`,
  },
  body: JSON.stringify(command),
});

const text = await res.text();
if (!res.ok) {
  console.error("Discord API error:", res.status, text);
  process.exit(1);
}

console.log("✅ Command registered:", text);
console.log("👉 Na Discordu napiš /bg3 a měl by se objevit hned (guild commands jsou rychlé).");