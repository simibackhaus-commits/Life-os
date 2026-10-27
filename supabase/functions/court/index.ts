import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { callClaude, checkVerdict, judgeSystemPrompt, textOf, toolUses, transcriptToMessages, verdictTool, type BetaMessageParam } from "../_shared/ai.ts";
import {
  EXCUSES,
  EXCUSE_LABELS,
  PLEAS,
  RULEBOOK_VERSION,
  consequenceDeltas,
  describeRule,
  simpleJudge,
  validateVerdict,
  type Excuse,
  type Plea,
  type VerdictProposal,
} from "../_shared/core/index.ts";
import { HttpError, anthropicKey, handler, json, type RequestContext } from "../_shared/http.ts";

const Body = z.object({
  caseId: z.string().uuid(),
  action: z.enum(["plead", "message", "appeal"]),
  plea: z.enum(PLEAS).optional(),
  excuse: z.enum(EXCUSES).optional(),
  statement: z.string().max(3000).default(""),
});

interface CaseRow {
  id: string;
  user_id: string;
  quest_id: string | null;
  occurrence_key: string | null;
  charge: string;
  status: string;
  plea: Plea | null;
  verdict: string | null;
  consequences: VerdictProposal["consequences"];
  quest_xp: number;
  quest_coins: number;
  appeal_count: number;
}

async function addMessage(ctx: RequestContext, caseId: string, role: string, content: string) {
  if (!content.trim()) return;
  const { error } = await ctx.admin.from("court_messages").insert({ case_id: caseId, user_id: ctx.userId, role, content: content.slice(0, 4000) });
  if (error) throw new Error(error.message);
}

/** Beweismittel: Questdaten und Erfüllungsquote der letzten 14 Tage. */
async function caseFile(ctx: RequestContext, c: CaseRow): Promise<string> {
  const lines = [`Anklage: ${c.charge}`, `Quest-Belohnung: ${c.quest_xp} XP, ${c.quest_coins} Coins`, `Plädoyer: ${c.plea ?? "noch keins"}`];
  if (c.quest_id) {
    const { data: q } = await ctx.user.from("quests").select("title,description,recurrence,mandatory,consequences").eq("id", c.quest_id).single();
    if (q) {
      lines.push(`Quest: ${q.title}${q.recurrence ? ` (${describeRule(q.recurrence)})` : ""}`);
      if (q.consequences) lines.push(`Vom Spieler festgelegte mögliche Konsequenzen: ${q.consequences}`);
    }
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    const { data: inst } = await ctx.user.from("quest_instances").select("occurrence_key,status").eq("quest_id", c.quest_id).gte("occurrence_key", since);
    const done = (inst ?? []).filter((i) => i.status === "erledigt").length;
    lines.push(`Erledigte Vorkommen dieser Quest in den letzten 14 Tagen: ${done}`);
  }
  const { count } = await ctx.user
    .from("court_cases")
    .select("id", { count: "exact", head: true })
    .eq("status", "urteil")
    .not("verdict", "in", "(freispruch,einstellung)")
    .neq("id", c.id);
  lines.push(`Frühere Verurteilungen: ${count ?? 0}`);
  return lines.join("\n");
}

async function applyVerdict(ctx: RequestContext, c: CaseRow, v: VerdictProposal) {
  const { error } = await ctx.admin.rpc("apply_court_verdict", {
    p_case_id: c.id,
    p_event_id: crypto.randomUUID(),
    p_verdict: v.verdict,
    p_reasoning: v.reasoning,
    p_protected_reason: v.protectedReason,
    p_consequences: v.consequences,
    p_rulebook_version: RULEBOOK_VERSION,
  });
  if (error) throw new Error(error.message);
  for (const k of v.consequences) {
    if (k.type !== "wiedergutmachung") continue;
    await ctx.admin.from("quests").insert({
      user_id: ctx.userId,
      title: k.questTitle,
      description: "Vom Court of Life verhängte Wiedergutmachung.",
      type: "side",
      category: "gericht",
      difficulty: "leicht",
      estimated_minutes: k.estimatedMinutes,
    });
  }
}

/** Fragt den KI-Richter. Ergebnis: Rückfrage (Text) oder regelkonformes Urteil. */
async function deliberate(ctx: RequestContext, c: CaseRow, fallback: { plea: Plea; excuse: Excuse }): Promise<{ question: string } | { verdict: VerdictProposal; prosecution: string; defense: string; viaFallback: boolean }> {
  const { data: log } = await ctx.user.from("court_messages").select("role,content").eq("case_id", c.id).order("created_at");
  const questions = (log ?? []).filter((m) => m.role === "richter").length;
  const messages: BetaMessageParam[] = transcriptToMessages(await caseFile(ctx, c), log ?? []);
  const caseCtx = { questXp: c.quest_xp, questCoins: c.quest_coins };

  try {
    const client = new Anthropic({ apiKey: anthropicKey() });
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await callClaude(client, { system: judgeSystemPrompt(questions), messages, tools: [verdictTool], effort: "medium" });
      if (res.stop_reason === "refusal") break;
      const call = toolUses(res.content, "issue_verdict")[0];
      if (!call) {
        const text = textOf(res.content);
        if (text && questions < 3) return { question: text };
        messages.push({ role: "assistant", content: res.content });
        messages.push({ role: "user", content: "Bitte fälle jetzt das Urteil über issue_verdict." });
        continue;
      }
      const checked = checkVerdict(call.input, caseCtx);
      if (checked.ok && checked.sanitized) return { verdict: checked.sanitized, prosecution: checked.prosecution, defense: checked.defense, viaFallback: false };
      // Regelverstoß: Fehler zurückmelden und erneut entscheiden lassen.
      messages.push({ role: "assistant", content: res.content });
      messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: call.id, is_error: true, content: `Regelbasis verletzt: ${checked.errors.join("; ")}` }] });
    }
  } catch (e) {
    console.error("judge_unavailable", e instanceof Error ? e.name : "unknown");
  }
  // Fallback: deterministischer Regelrichter (immer regelkonform)
  const v = simpleJudge({ plea: fallback.plea, excuse: fallback.excuse, priorConvictions: 0, questTitle: c.charge });
  const checked = validateVerdict(v, caseCtx);
  return { verdict: checked.sanitized!, prosecution: "", defense: "", viaFallback: true };
}

Deno.serve(
  handler(async (req, ctx) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Ungültige Eingabe");
    const body = parsed.data;

    // RLS stellt sicher, dass nur eigene Verfahren gefunden werden.
    const { data: c } = await ctx.user.from("court_cases").select("*").eq("id", body.caseId).single<CaseRow>();
    if (!c) throw new HttpError(404, "Verfahren nicht gefunden");
    const excuse: Excuse = body.excuse ?? "keine";

    if (body.action === "plead") {
      if (c.plea || c.status !== "offen") throw new HttpError(409, "Plädoyer bereits abgegeben");
      if (!body.plea) throw new HttpError(400, "Plädoyer fehlt");
      await ctx.admin.from("court_cases").update({ plea: body.plea, status: "verhandlung" }).eq("id", c.id);
      c.plea = body.plea;
      await addMessage(ctx, c.id, "angeklagter", `Plädoyer: ${body.plea.replace("_", " ")}. Grund: ${EXCUSE_LABELS[excuse]}.\n${body.statement}`);
    } else if (body.action === "message") {
      if (c.status !== "verhandlung" && c.status !== "berufung") throw new HttpError(409, "Keine laufende Verhandlung");
      await addMessage(ctx, c.id, "angeklagter", body.statement);
    } else {
      if (c.status !== "urteil" || c.appeal_count >= 1) throw new HttpError(409, "Berufung nicht möglich");
      await ctx.admin.from("court_cases").update({ status: "berufung", appeal_count: c.appeal_count + 1 }).eq("id", c.id);
      await addMessage(ctx, c.id, "angeklagter", `Berufung. Grund: ${EXCUSE_LABELS[excuse]}.\n${body.statement}`);
      await addMessage(ctx, c.id, "system", "Berufungsverfahren eröffnet. Das Gericht prüft das Urteil erneut.");
    }

    const outcome = await deliberate(ctx, c, { plea: c.plea ?? "nicht_schuldig", excuse });
    if ("question" in outcome) {
      await addMessage(ctx, c.id, "richter", outcome.question);
      return json({ status: "verhandlung" });
    }

    const { verdict } = outcome;
    if (outcome.prosecution) await addMessage(ctx, c.id, "staatsanwalt", outcome.prosecution);
    if (outcome.defense) await addMessage(ctx, c.id, "verteidiger", outcome.defense);

    if (body.action === "appeal") {
      // Berufung wirkt nur zugunsten des Angeklagten.
      const oldD = consequenceDeltas(c.consequences ?? []);
      const newD = consequenceDeltas(verdict.consequences);
      if (newD.coins < oldD.coins || newD.xp < oldD.xp) {
        await ctx.admin.from("court_cases").update({ status: "urteil" }).eq("id", c.id);
        await addMessage(ctx, c.id, "richter", `Die Berufung wird zurückgewiesen. ${verdict.reasoning}`);
        return json({ status: "urteil", appeal: "zurückgewiesen" });
      }
      const { error } = await ctx.admin.rpc("revert_court_verdict", { p_case_id: c.id, p_event_id: crypto.randomUUID() });
      if (error) throw new Error(error.message);
      await ctx.admin.from("court_cases").update({ status: "berufung" }).eq("id", c.id);
    }

    await applyVerdict(ctx, c, verdict);
    await addMessage(ctx, c.id, "system", outcome.viaFallback ? "KI-Richter nicht erreichbar – Urteil durch den Regelrichter." : "Urteil verkündet.");
    return json({ status: "urteil", verdict: verdict.verdict });
  }),
);
