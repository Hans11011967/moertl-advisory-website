// Worker für moertl advisory: statische Assets + Kontaktformular-Endpunkt.
// Nicht-API-Anfragen werden an die statischen Assets (ASSETS-Binding) weitergereicht.

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "Method not allowed" }, 405);
      }
      return handleContact(request, env, ctx);
    }
    // Alles andere: statische Seite ausliefern
    return env.ASSETS.fetch(request);
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function handleContact(request, env, ctx) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "Ungültige Anfrage." }, 400);
  }

  // Honeypot: Bots füllen das versteckte Feld -> still verwerfen, Erfolg vortäuschen
  if (data.website) return json({ ok: true });

  const name = String(data.name || "").trim();
  const email = String(data.email || "").trim();
  const anliegen = String(data.anliegen || "").trim();
  const rolle = String(data.rolle || "").trim();
  const quelle = String(data.quelle || "").trim();

  if (!name || !email || !anliegen) {
    return json({ ok: false, error: "Bitte Name, E-Mail und Ihr Anliegen ausfüllen." }, 400);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, error: "Bitte eine gültige E-Mail-Adresse angeben." }, 400);
  }
  if (!data.consent) {
    return json({ ok: false, error: "Bitte stimmen Sie der Verarbeitung Ihrer Angaben zu." }, 400);
  }

  const meta = {
    created_at: new Date().toISOString(),
    ip_country: request.headers.get("cf-ipcountry") || "",
    user_agent: (request.headers.get("user-agent") || "").slice(0, 300),
  };

  // In D1 speichern (eigene Cloudflare-Infrastruktur)
  try {
    await env.DB.prepare(
      "INSERT INTO contacts (name, email, rolle, quelle, anliegen, ip_country, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(name, email, rolle, quelle, anliegen, meta.ip_country, meta.user_agent, meta.created_at)
      .run();
  } catch (e) {
    return json({ ok: false, error: "Speichern fehlgeschlagen. Bitte später erneut versuchen oder direkt per E-Mail." }, 500);
  }

  // Optionale E-Mail-Benachrichtigung via Resend (nur wenn API-Key als Secret gesetzt ist)
  if (env.RESEND_API_KEY) {
    const text =
      `Neue Kontaktanfrage über moertl-advisory:\n\n` +
      `Name: ${name}\nE-Mail: ${email}\nRolle: ${rolle || "—"}\n` +
      `Aufmerksam geworden über: ${quelle || "—"}\nLand: ${meta.ip_country || "—"}\n\n` +
      `Anliegen:\n${anliegen}\n`;
    const send = fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.MAIL_FROM || "moertl advisory <onboarding@resend.dev>",
        to: [env.MAIL_TO || "hans@moertl-advisory.com"],
        reply_to: email,
        subject: `Neue Kontaktanfrage — ${name}`,
        text,
      }),
    }).catch(() => {});
    // Antwort nicht blockieren – Versand im Hintergrund
    ctx.waitUntil(send);
  }

  return json({ ok: true });
}
