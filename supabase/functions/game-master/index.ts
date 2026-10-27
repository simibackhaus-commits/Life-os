import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { callClaude, parseDraft, questDraftJsonSchema, textOf, toolUses, type BetaMessageParam } from "../_shared/ai.ts";
import { ATTRIBUTE_CURVE, ATTRIBUTES, describeRule, levelFromXp, type QuestDraft } from "../_shared/core/index.ts";
import { HttpError, anthropicKey, handler, json, type RequestContext } from "../_shared/http.ts";

const Body = z.object({ message: z.string().trim().min(1).max(4000), today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

/** Kontext nur mit ausdrücklicher Einwilligung (user_settings.ai_context_consent). */
async function buildContext(ctx: RequestContext, today: string): Promise<string> {
  const { data: settings } = await ctx.user.from("user_settings").select("ai_context_consent").single();
  if (!settings?.ai_context_consent) {
    return "Der Spieler hat den Zugriff auf seine Spieldaten NICHT freigegeben. Antworte allgemein und weise einmal kurz darauf hin, dass er ihn unter Einstellungen freigeben kann.";
  }
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const [ch, quests, done] = await Promise.all([
    ctx.user.from("characters").select("name,total_xp,coins,attribute_xp").single(),
    ctx.user.from("quests").select("title,type,difficulty,priority,due_at,recurrence,mandatory,estimated_minutes,status,progress").in("status", ["aktiv", "pausiert"]).limit(80),
    ctx.user.from("quest_instances").select("occurrence_key,completed_at,quests(title)").gte("completed_at", since).limit(200),
  ]);
  const c = ch.data;
  const attrs = c
    ? ATTRIBUTES.map((a) => `${a} Lv${levelFromXp((c.attribute_xp as Record<string, number>)[a] ?? 0, ATTRIBUTE_CURVE).level}`).join(", ")
    : "";
  const questLines = (quests.data ?? []).map((q) => {
    const when = q.recurrence ? describeRule(q.recurrence) : q.due_at ? `fällig ${q.due_at}` : "ohne Termin";
    return `- [${q.status}] ${q.title} (${q.type}, ${q.difficulty}, Prio ${q.priority}${q.mandatory ? ", Pflicht" : ""}${q.estimated_minutes ? `, ${q.estimated_minutes} min` : ""}) – ${when}`;
  });
  const doneCount = new Map<string, number>();
  for (const i of done.data ?? []) {
    const t = (i.quests as unknown as { title: string } | null)?.title ?? "?";
    doneCount.set(t, (doneCount.get(t) ?? 0) + 1);
  }
  return [
    `Heute: ${today}`,
    c ? `Charakter: ${c.name}, Level ${levelFromXp(Number(c.total_xp)).level}, ${c.coins} Coins. Attribute: ${attrs}` : "",
    "Aktive Quests:",
    ...questLines,
    "Abschlüsse der letzten 14 Tage:",
    ...[...doneCount].map(([t, n]) => `- ${t}: ${n}×`),
  ].join("\n");
}

Deno.serve(
  handler(async (req, ctx) => {
    const body = Body.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "Ungültige Eingabe");
    const { message, today } = body.data;

    const { data: history } = await ctx.user.from("ai_messages").select("role,content").order("created_at", { ascending: false }).limit(16);
    const messages: BetaMessageParam[] = [];
    for (const m of (history ?? []).reverse()) {
      const last = messages[messages.length - 1];
      if (last && last.role === m.role && typeof last.content === "string") last.content += `\n\n${m.content}`;
      else messages.push({ role: m.role as "user" | "assistant", content: m.content });
    }
    if (messages[0]?.role === "assistant") messages.shift();
    if (messages[messages.length - 1]?.role === "user") messages.push({ role: "assistant", content: "(keine Antwort)" });
    messages.push({ role: "user", content: message });

    const system = [
      "Du bist der KI-Spielleiter von LIFE OS, einem Real-Life-RPG. Der Spieler ist der Hauptcharakter; sein echtes Leben ist die Spielwelt.",
      "Du planst Tage, priorisierst Aufgaben, schlägst Quests vor und motivierst – konkret, ehrlich, knapp. Antworte auf Deutsch.",
      "Neue oder geänderte Quests schlägst du NUR über das Tool propose_quests vor; der Spieler bestätigt jede einzeln. Behaupte nie, etwas gespeichert zu haben.",
      "Achte auf Gesundheit und Regeneration; schlage nichts Gefährliches vor.",
      "",
      "SPIELDATEN",
      await buildContext(ctx, today),
    ].join("\n");

    const tools = [
      {
        name: "propose_quests",
        description: "Schlägt dem Spieler eine oder mehrere Quests zur Bestätigung vor.",
        input_schema: { type: "object" as const, properties: { quests: { type: "array", items: questDraftJsonSchema, minItems: 1, maxItems: 8 } }, required: ["quests"] },
      },
    ];

    const client = new Anthropic({ apiKey: anthropicKey() });
    const proposals: QuestDraft[] = [];
    let reply = "";
    // Höchstens zwei Runden: Vorschläge sammeln, danach Abschlusstext.
    for (let round = 0; round < 2; round++) {
      const res = await callClaude(client, { system, messages, tools, effort: "medium" });
      if (res.stop_reason === "refusal") {
        reply = "Dazu kann ich leider nichts beitragen.";
        break;
      }
      reply = textOf(res.content) || reply;
      const calls = toolUses(res.content, "propose_quests");
      if (res.stop_reason !== "tool_use" || calls.length === 0) break;
      messages.push({ role: "assistant", content: res.content });
      messages.push({
        role: "user",
        content: calls.map((call) => {
          const input = call.input as { quests?: unknown[] };
          const errors: string[] = [];
          for (const q of input.quests ?? []) {
            const p = parseDraft(q);
            if (p.ok) proposals.push(p.draft);
            else errors.push(...p.errors);
          }
          return {
            type: "tool_result" as const,
            tool_use_id: call.id,
            content: errors.length ? `Teilweise ungültig: ${errors.join("; ")}` : "Vorschläge werden dem Spieler zur Bestätigung angezeigt.",
          };
        }),
      });
    }
    if (!reply) reply = proposals.length ? "Hier sind meine Vorschläge:" : "…";

    await ctx.admin.from("ai_messages").insert([
      { user_id: ctx.userId, role: "user", content: message },
      { user_id: ctx.userId, role: "assistant", content: reply.slice(0, 8000) },
    ]);
    return json({ reply, proposals });
  }),
);
