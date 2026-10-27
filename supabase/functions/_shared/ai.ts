import Anthropic from "@anthropic-ai/sdk";

type BetaContentBlock = Anthropic.Beta.Messages.BetaContentBlock;
type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
export type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;
export type BetaTool = Anthropic.Beta.Messages.BetaTool;
import {
  ATTRIBUTES,
  DIFFICULTIES,
  QUEST_TYPES,
  QuestDraftSchema,
  rulebookText,
  validateVerdict,
  type CaseContext,
  type Consequence,
  type QuestDraft,
  type ValidationResult,
} from "./core/index.ts";

export const MODEL = "claude-opus-5-5";

/** Ein Aufruf an Claude. Server-seitiger Fallback bei Ablehnungen ist aktiviert. */
export async function callClaude(
  client: Anthropic,
  params: { system: string; messages: BetaMessageParam[]; tools?: BetaTool[]; effort: "low" | "medium" | "high" },
): Promise<BetaMessage> {
  return await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: params.effort },
    system: params.system,
    messages: params.messages,
    ...(params.tools ? { tools: params.tools, tool_choice: { type: "auto" as const } } : {}),
  });
}

export function textOf(content: BetaContentBlock[]): string {
  return content
    .filter((b): b is Extract<BetaContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export function toolUses(content: BetaContentBlock[], name: string) {
  return content.filter((b): b is Extract<BetaContentBlock, { type: "tool_use" }> => b.type === "tool_use" && b.name === name);
}

// ───────────── Quest-Entwürfe ─────────────

const recurrenceSchema = {
  type: ["object", "null"],
  description: "Nur für wiederkehrende Quests. byWeekday: 1=Montag … 7=Sonntag. times: je Uhrzeit eine eigene Instanz (z. B. morgens und abends).",
  properties: {
    freq: { type: "string", enum: ["daily", "weekly", "monthly"] },
    interval: { type: "integer", minimum: 1 },
    byWeekday: { type: "array", items: { type: "integer", minimum: 1, maximum: 7 } },
    byMonthDay: { type: "array", items: { type: "integer", minimum: 1, maximum: 31 } },
    times: { type: "array", items: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" } },
    startDate: { type: "string", description: "JJJJ-MM-TT" },
    endDate: { type: "string", description: "JJJJ-MM-TT" },
  },
  required: ["freq", "interval", "startDate"],
} as const;

export const questDraftJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Kurz, aktiv formuliert, ohne Datumsangaben" },
    description: { type: "string" },
    type: { type: "string", enum: [...QUEST_TYPES] },
    category: { type: "string", description: "z. B. sport, finanzen, business, gesundheit, haushalt, wissen, soziales" },
    difficulty: { type: "string", enum: [...DIFFICULTIES] },
    priority: { type: "integer", minimum: 1, maximum: 5 },
    attributes: { type: "array", items: { type: "string", enum: [...ATTRIBUTES] }, maxItems: 4 },
    dueAt: { type: ["string", "null"], description: "ISO-8601 mit Zeitzonen-Offset, nur für einmalige Quests" },
    recurrence: recurrenceSchema,
    estimatedMinutes: { type: ["integer", "null"] },
    subtasks: { type: "array", items: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } },
    mandatory: { type: "boolean", description: "true bei Pflicht-Routinen, die vor Gericht kommen dürfen" },
  },
  required: ["title", "type", "difficulty", "attributes"],
} as const;

/** Wandelt eine KI-Eingabe in einen validierten Entwurf um (Teilaufgaben bekommen IDs). */
export function parseDraft(input: unknown): { ok: true; draft: QuestDraft } | { ok: false; errors: string[] } {
  const raw = (input ?? {}) as Record<string, unknown>;
  const subtasks = Array.isArray(raw.subtasks)
    ? raw.subtasks.map((s) => ({ id: crypto.randomUUID(), title: String((s as { title?: unknown }).title ?? ""), done: false }))
    : [];
  const r = QuestDraftSchema.safeParse({ ...raw, subtasks });
  return r.success ? { ok: true, draft: r.data } : { ok: false, errors: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
}

// ───────────── Gericht ─────────────

export const verdictTool: BetaTool = {
  name: "issue_verdict",
  description:
    "Verkündet das Urteil. Nur aufrufen, wenn genug Informationen vorliegen. Konsequenzen müssen der Regelbasis entsprechen; sie wird serverseitig geprüft.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      prosecution: { type: "string", description: "Kurzes Plädoyer der Staatsanwaltschaft (2–3 Sätze)" },
      defense: { type: "string", description: "Kurzes Plädoyer der Verteidigung (2–3 Sätze)" },
      verdict: { type: "string", enum: ["freispruch", "einstellung", "verwarnung", "teilschuld", "schuldig_mildernd", "schuldig"] },
      reasoning: { type: "string", description: "Begründung des Urteils, direkt an den Angeklagten gerichtet" },
      protectedReason: { type: ["string", "null"], enum: ["krankheit", "verletzung", "regeneration", "notfall", null] },
      consequences: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string", enum: ["coins_verlust", "xp_abzug", "bonus_verlust", "wiedergutmachung", "reflexion"] },
            amount: { type: ["integer", "null"] },
            description: { type: ["string", "null"] },
            questTitle: { type: ["string", "null"] },
            estimatedMinutes: { type: ["integer", "null"] },
            prompt: { type: ["string", "null"] },
          },
          required: ["type", "amount", "description", "questTitle", "estimatedMinutes", "prompt"],
        },
      },
    },
    required: ["prosecution", "defense", "verdict", "reasoning", "protectedReason", "consequences"],
  },
};

interface RawConsequence {
  type: Consequence["type"];
  amount: number | null;
  description: string | null;
  questTitle: string | null;
  estimatedMinutes: number | null;
  prompt: string | null;
}

/** Normalisiert die flache Tool-Eingabe und prüft sie gegen die Regelbasis. */
export function checkVerdict(input: unknown, ctx: CaseContext): ValidationResult & { prosecution: string; defense: string } {
  const raw = (input ?? {}) as { prosecution?: string; defense?: string; consequences?: RawConsequence[] } & Record<string, unknown>;
  const consequences = (raw.consequences ?? []).map((c) => {
    switch (c.type) {
      case "coins_verlust":
      case "xp_abzug":
        return { type: c.type, amount: c.amount ?? 0 };
      case "bonus_verlust":
        return { type: c.type, description: c.description ?? "" };
      case "wiedergutmachung":
        return { type: c.type, questTitle: c.questTitle ?? "", estimatedMinutes: c.estimatedMinutes ?? 15 };
      case "reflexion":
        return { type: c.type, prompt: c.prompt ?? "" };
      default:
        return c;
    }
  });
  const result = validateVerdict({ ...raw, consequences }, ctx);
  return { ...result, prosecution: String(raw.prosecution ?? ""), defense: String(raw.defense ?? "") };
}

export function judgeSystemPrompt(questionsAsked: number): string {
  return [
    "Du bist der vorsitzende Richter im „Court of Life“, einem Gericht in einem Real-Life-Rollenspiel.",
    "Der Angeklagte ist der Spieler selbst; verhandelt wird, warum eine verpflichtende Quest nicht erfüllt wurde.",
    "Ton: würdevoll, fair, leicht spielerisch, nie herablassend. Antworte auf Deutsch.",
    "Prüfe Plädoyer, Aussagen und Beweismittel (Fallakte) gegen die Regelbasis.",
    "Du darfst kurze Rückfragen stellen (als normale Textantwort, ohne Tool). Bisher gestellte Rückfragen: " +
      `${questionsAsked}/3.` +
      (questionsAsked >= 3 ? " Es sind keine weiteren Rückfragen erlaubt – fälle jetzt das Urteil." : ""),
    "Wenn du entscheidest, rufe issue_verdict auf. Begründe jedes Urteil nachvollziehbar.",
    "Krankheit, Verletzungen, notwendige Regeneration und unvorhersehbare Notfälle werden niemals bestraft: Freispruch oder Einstellung, protectedReason setzen, keine Konsequenzen.",
    "Konsequenzen sind ausschließlich virtuell und klein: Coins, kleine XP-Abzüge, Bonusverlust, eine sinnvolle Wiedergutmachungsquest (max. 60 Minuten) oder eine kurze Reflexionsaufgabe.",
    "Niemals gesundheitsschädliche, gefährliche, entwürdigende oder reale finanzielle Konsequenzen.",
    "",
    rulebookText(),
  ].join("\n");
}

/** Gerichtsprotokoll → Claude-Nachrichten (aufeinanderfolgende gleiche Rollen werden zusammengeführt). */
export function transcriptToMessages(caseFile: string, log: Array<{ role: string; content: string }>): BetaMessageParam[] {
  const out: BetaMessageParam[] = [{ role: "user", content: `FALLAKTE\n${caseFile}` }];
  for (const m of log) {
    if (m.role !== "angeklagter" && m.role !== "richter") continue;
    const role = m.role === "angeklagter" ? "user" : "assistant";
    const prefix = role === "user" ? "Angeklagter: " : "";
    const last = out[out.length - 1]!;
    if (last.role === role && typeof last.content === "string") last.content += `\n\n${prefix}${m.content}`;
    else out.push({ role, content: `${prefix}${m.content}` });
  }
  if (out[out.length - 1]!.role === "assistant") out.push({ role: "user", content: "(Der Angeklagte schweigt.)" });
  return out;
}
