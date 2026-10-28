import {
  ATTRIBUTES,
  DIFFICULTIES,
  PROTECTED_REASONS,
  QUEST_TYPES,
  QuestDraftSchema,
  detectSchedule,
  rulebookText,
  scheduleToDraft,
  simpleJudge,
  validateVerdict,
  type CaseContext,
  type Excuse,
  type Plea,
  type QuestDraft,
  type VerdictProposal,
} from "@life-os/core";
import { AiUnavailableError, type AiMessage, type AiProvider } from "./providers.ts";
import { systemFor, type RoleId } from "./roles.ts";

// ───────────── Hilfen ─────────────

/** Holt das erste JSON-Objekt aus einer Modellantwort (manche Modelle setzen ```json-Zäune). */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Antwort enthält kein JSON");
  return JSON.parse(text.slice(start, end + 1));
}

const WEEKDAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const todayLine = (today: string) => `Heute ist ${WEEKDAY_NAMES[new Date(`${today}T12:00:00`).getDay()]}, ${today}. Ein Spieltag beginnt um 04:00.`;

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
    dueAt: { type: "string", description: "Nur für einmalige Quests: ISO-8601 mit Zeitzonen-Offset" },
    recurrence: {
      type: "object",
      description: "Nur für wiederkehrende Quests. byWeekday: 1=Montag … 7=Sonntag. times: je Uhrzeit eine eigene Instanz (HH:MM).",
      properties: {
        freq: { type: "string", enum: ["daily", "weekly", "monthly"] },
        interval: { type: "integer", minimum: 1 },
        byWeekday: { type: "array", items: { type: "integer", minimum: 1, maximum: 7 } },
        byMonthDay: { type: "array", items: { type: "integer", minimum: 1, maximum: 31 } },
        times: { type: "array", items: { type: "string" } },
        startDate: { type: "string", description: "JJJJ-MM-TT" },
      },
      required: ["freq", "interval", "startDate"],
    },
    estimatedMinutes: { type: "integer" },
    subtasks: { type: "array", items: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } },
    mandatory: { type: "boolean", description: "true nur bei Pflicht-Routinen, die vor Gericht kommen dürfen" },
  },
  required: ["title", "type", "difficulty", "attributes"],
} as const;

/** Modell-JSON → validierter Quest-Entwurf (null-Felder entfernt, Teilaufgaben mit IDs). */
export function toDraft(input: unknown, uuid: () => string): { ok: true; draft: QuestDraft } | { ok: false; errors: string[] } {
  const raw = Object.fromEntries(Object.entries((input ?? {}) as Record<string, unknown>).filter(([, v]) => v !== null && v !== "")) as Record<string, unknown>;
  const subtasks = Array.isArray(raw.subtasks)
    ? raw.subtasks.map((s) => ({ id: uuid(), title: String((s as { title?: unknown }).title ?? s ?? ""), done: false })).filter((s) => s.title.trim())
    : [];
  if (raw.recurrence && typeof raw.recurrence === "object") {
    const r = raw.recurrence as Record<string, unknown>;
    if (Array.isArray(r.times)) r.times = r.times.map(String).filter((t) => /^\d{1,2}:\d{2}$/.test(t)).map((t) => t.padStart(5, "0"));
    for (const k of ["byWeekday", "byMonthDay", "times"]) if (Array.isArray(r[k]) && (r[k] as unknown[]).length === 0) delete r[k];
    delete raw.dueAt;
  }
  if (Array.isArray(raw.attributes)) raw.attributes = raw.attributes.filter((a) => (ATTRIBUTES as readonly string[]).includes(String(a))).slice(0, 4);
  const r = QuestDraftSchema.safeParse({ ...raw, subtasks });
  return r.success ? { ok: true, draft: r.data } : { ok: false, errors: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
}

// ───────────── Quick-Add ─────────────

export async function aiQuickAdd(provider: AiProvider, text: string, today: string, uuid: () => string): Promise<{ draft: QuestDraft; notes: string[] }> {
  const system = systemFor("spielleiter", [
    "Aufgabe: Wandle die Eingabe des Spielers in GENAU EINE strukturierte Quest um.",
    todayLine(today),
    "Regeln: Wiederkehrendes → recurrence (startDate = heute, wenn nichts anderes gesagt). Einmaliges mit Termin → dueAt. „zweimal täglich“ → times mit zwei Uhrzeiten (z. B. 07:00 und 21:00).",
    "Große Ziele (z. B. Sparziel, Wettkampf) → type main oder epic, sinnvolle Teilaufgaben. Kleine Routinen → daily, trivial/leicht.",
    "mandatory nur, wenn der Spieler von Pflicht spricht oder es eine feste berufliche Pflicht ist.",
    "Wochentage: 1=Montag, 2=Dienstag, 3=Mittwoch, 4=Donnerstag, 5=Freitag, 6=Samstag, 7=Sonntag.",
  ]);
  // Zeitplan regelbasiert: Wochentage, Intervalle und Fristen erkennt der Parser zuverlässiger als kleine Modelle.
  const schedule = detectSchedule(text, today);
  const hasSchedule = Boolean(schedule.freq || schedule.date);
  let lastErrors: string[] = [];
  const messages: AiMessage[] = [{ role: "user", content: text }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await provider.generate({ system, messages, schema: questDraftJsonSchema as unknown as Record<string, unknown>, temperature: 0.2 });
    try {
      const r = toDraft(extractJson(out), uuid);
      if (r.ok) {
        const draft: QuestDraft = { ...r.draft };
        if (hasSchedule) Object.assign(draft, scheduleToDraft(schedule, today));
        else if (draft.recurrence) draft.recurrence = { ...draft.recurrence, startDate: today };
        if (schedule.type) draft.type = schedule.type;
        else if (draft.recurrence && (draft.type === "daily" || draft.type === "weekly")) draft.type = draft.recurrence.freq === "daily" ? "daily" : "weekly";
        else if (!draft.recurrence && (draft.type === "daily" || draft.type === "weekly")) draft.type = "side";
        if (schedule.estimatedMinutes) draft.estimatedMinutes = schedule.estimatedMinutes;
        const notes = [`Erstellt von ${provider.label}. Bitte vor dem Speichern prüfen.`];
        if (hasSchedule) notes.push(`Zeitplan regelbasiert erkannt: ${schedule.notes.join(" · ")}`);
        return { draft: QuestDraftSchema.parse(draft), notes };
      }
      lastErrors = r.errors;
    } catch (e) {
      lastErrors = [e instanceof Error ? e.message : String(e)];
    }
    messages.push({ role: "assistant", content: out }, { role: "user", content: `Ungültig: ${lastErrors.join("; ")}. Bitte korrigiertes JSON.` });
  }
  throw new AiUnavailableError(`KI-Entwurf ungültig (${lastErrors.join("; ")})`);
}

// ───────────── Chat / Rat ─────────────

export interface ChatResult {
  reply: string;
  proposals: QuestDraft[];
}

const chatSchema = {
  type: "object",
  properties: {
    reply: { type: "string", description: "Deine Antwort an den Spieler" },
    quests: { type: "array", maxItems: 6, items: questDraftJsonSchema, description: "Nur wenn du konkrete neue Quests vorschlägst, sonst leer" },
  },
  required: ["reply", "quests"],
} as const;

export async function aiChat(
  provider: AiProvider,
  input: { role: RoleId; message: string; history: AiMessage[]; today: string; context: string | null },
  uuid: () => string,
): Promise<ChatResult> {
  const system = systemFor(input.role, [
    "Antworte knapp (meist unter 150 Wörtern). Neue Quests schlägst du nur im Feld quests vor; der Spieler bestätigt jede einzeln.",
    todayLine(input.today),
    input.context
      ? `SPIELDATEN (vom Spieler freigegeben)\n${input.context}`
      : "Der Spieler hat seine Spieldaten NICHT freigegeben. Antworte allgemein; erwähne höchstens einmal, dass er sie in den Einstellungen freigeben kann.",
  ]);
  const history = input.history.slice(-12);
  const out = await provider.generate({ system, messages: [...history, { role: "user", content: input.message }], schema: chatSchema as unknown as Record<string, unknown>, temperature: 0.6 });
  try {
    const data = extractJson(out) as { reply?: unknown; quests?: unknown[] };
    const proposals: QuestDraft[] = [];
    for (const q of data.quests ?? []) {
      const r = toDraft(q, uuid);
      if (r.ok) proposals.push(r.draft);
    }
    return { reply: String(data.reply ?? "").trim() || (proposals.length ? "Hier sind meine Vorschläge:" : "…"), proposals };
  } catch {
    // Kein gültiges JSON: Text als Antwort verwenden, keine Vorschläge.
    return { reply: out.trim() || "…", proposals: [] };
  }
}

/** Ratssitzung: dieselbe Frage nacheinander aus mehreren Rollen – ehrlich als ein Modell gekennzeichnet. */
export async function aiCouncil(
  provider: AiProvider,
  input: { question: string; roles: RoleId[]; today: string; context: string | null },
  uuid: () => string,
): Promise<Array<{ role: RoleId; reply: string }>> {
  const out: Array<{ role: RoleId; reply: string }> = [];
  for (const role of input.roles) {
    const prior = out.map((o) => `${o.role}: ${o.reply}`).join("\n\n");
    const r = await aiChat(
      provider,
      {
        role,
        today: input.today,
        context: input.context,
        history: [],
        message: prior ? `Frage an den Rat: ${input.question}\n\nBisherige Beiträge:\n${prior}\n\nErgänze deine Sicht in 2–4 Sätzen; widersprich, wo du anderer Meinung bist.` : `Frage an den Rat: ${input.question}\n\nAntworte in 2–4 Sätzen aus deiner Rolle.`,
      },
      uuid,
    );
    out.push({ role, reply: r.reply });
  }
  return out;
}

// ───────────── Gericht ─────────────

const verdictSchema = {
  type: "object",
  properties: {
    aktion: { type: "string", enum: ["frage", "urteil"], description: "frage = kurze Rückfrage an den Angeklagten; urteil = Urteil fällen" },
    frage: { type: "string", description: "Nur bei aktion=frage" },
    prosecution: { type: "string", description: "Plädoyer der Staatsanwaltschaft, 2–3 Sätze" },
    defense: { type: "string", description: "Plädoyer der Verteidigung, 2–3 Sätze" },
    verdict: { type: "string", enum: ["freispruch", "einstellung", "verwarnung", "teilschuld", "schuldig_mildernd", "schuldig"] },
    reasoning: { type: "string", description: "Begründung, direkt an den Angeklagten gerichtet (mind. 2 Sätze)" },
    protectedReason: { type: "string", enum: ["keiner", ...PROTECTED_REASONS] },
    consequences: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["coins_verlust", "xp_abzug", "bonus_verlust", "wiedergutmachung", "reflexion"] },
          amount: { type: "integer" },
          description: { type: "string" },
          questTitle: { type: "string" },
          estimatedMinutes: { type: "integer" },
          prompt: { type: "string" },
        },
        required: ["type"],
      },
    },
  },
  required: ["aktion"],
} as const;

/** Flaches Modell-JSON → Urteilsvorschlag in der Form der Regelbasis. */
export function normalizeVerdict(raw: Record<string, unknown>): Record<string, unknown> {
  const cs = Array.isArray(raw.consequences) ? (raw.consequences as Array<Record<string, unknown>>) : [];
  return {
    verdict: raw.verdict,
    reasoning: raw.reasoning,
    protectedReason: raw.protectedReason && raw.protectedReason !== "keiner" ? raw.protectedReason : null,
    consequences: cs.map((c) => {
      switch (c.type) {
        case "coins_verlust":
        case "xp_abzug":
          return { type: c.type, amount: Number(c.amount ?? 0) };
        case "bonus_verlust":
          return { type: c.type, description: String(c.description ?? "") };
        case "wiedergutmachung":
          return { type: c.type, questTitle: String(c.questTitle ?? ""), estimatedMinutes: Number(c.estimatedMinutes ?? 15) };
        case "reflexion":
          return { type: c.type, prompt: String(c.prompt ?? "") };
        default:
          return c;
      }
    }),
  };
}

export type JudgeOutcome =
  | { kind: "frage"; question: string }
  | { kind: "urteil"; verdict: VerdictProposal; prosecution: string; defense: string; viaFallback: boolean; fallbackReason?: string };

export interface JudgeInput {
  caseFile: string;
  /** Verlauf: angeklagter = Spieler, richter = bisherige Rückfragen. */
  log: Array<{ role: string; content: string }>;
  caseCtx: CaseContext;
  plea: Plea;
  excuse: Excuse;
  priorConvictions: number;
  questTitle: string;
  /** Maximal 3 Rückfragen pro Verfahren. */
  maxQuestions?: number;
}

function judgeSystem(questionsAsked: number, maxQuestions: number): string {
  return systemFor("richter", [
    "Verhandelt wird, warum eine verpflichtende Quest nicht erfüllt wurde. Prüfe Plädoyer, Aussagen und Fallakte gegen die Regelbasis.",
    `Du darfst kurze Rückfragen stellen (aktion=frage). Bisher: ${questionsAsked}/${maxQuestions}.` +
      (questionsAsked >= maxQuestions ? " Keine weiteren Rückfragen – fälle jetzt das Urteil (aktion=urteil)." : ""),
    "Beim Urteil schreibst du auch die kurzen Plädoyers von Staatsanwaltschaft und Verteidigung.",
    "Krankheit, Verletzung, notwendige Regeneration und Notfälle werden nie bestraft: Freispruch oder Einstellung, protectedReason setzen, keine Konsequenzen.",
    "Konsequenzen sind ausschließlich virtuell und klein. Deine Entscheidung wird automatisch gegen die Regelbasis geprüft und bei Verstößen abgelehnt.",
    "",
    rulebookText(),
  ]);
}

function transcript(caseFile: string, log: JudgeInput["log"]): AiMessage[] {
  const out: AiMessage[] = [{ role: "user", content: `FALLAKTE\n${caseFile}` }];
  for (const m of log) {
    if (m.role !== "angeklagter" && m.role !== "richter") continue;
    const role = m.role === "angeklagter" ? "user" : "assistant";
    const content = role === "user" ? `Angeklagter: ${m.content}` : m.content;
    const last = out[out.length - 1]!;
    if (last.role === role) last.content += `\n\n${content}`;
    else out.push({ role, content });
  }
  if (out[out.length - 1]!.role === "assistant") out.push({ role: "user", content: "(Der Angeklagte schweigt.)" });
  return out;
}

/** Regelrichter – immer regelkonform. */
export function fallbackVerdict(input: Pick<JudgeInput, "plea" | "excuse" | "priorConvictions" | "questTitle" | "caseCtx">): VerdictProposal {
  const v = simpleJudge({ plea: input.plea, excuse: input.excuse, priorConvictions: input.priorConvictions, questTitle: input.questTitle });
  return validateVerdict(v, input.caseCtx).sanitized!;
}

/**
 * KI-Richter: Rückfrage oder regelkonformes Urteil.
 * Ungültige Urteile werden mit Fehlermeldung zurückgegeben (max. 2 Korrekturen), danach entscheidet der Regelrichter.
 * Ist die KI nicht erreichbar, wird der Fehler geworfen – das Verfahren bleibt offen und kann später fortgesetzt werden.
 */
export async function aiJudge(provider: AiProvider, input: JudgeInput): Promise<JudgeOutcome> {
  const maxQ = input.maxQuestions ?? 3;
  const asked = input.log.filter((m) => m.role === "richter").length;
  const messages = transcript(input.caseFile, input.log);
  const protectedExcuse = (PROTECTED_REASONS as readonly string[]).includes(input.excuse);
  let errors: string[] = [];

  for (let attempt = 0; attempt < 3; attempt++) {
    const out = await provider.generate({ system: judgeSystem(asked, maxQ), messages, schema: verdictSchema as unknown as Record<string, unknown>, temperature: 0.3 });
    let raw: Record<string, unknown>;
    try {
      raw = extractJson(out) as Record<string, unknown>;
    } catch {
      errors = ["Antwort war kein gültiges JSON"];
      messages.push({ role: "assistant", content: out }, { role: "user", content: "Bitte antworte als JSON nach dem Schema." });
      continue;
    }
    if (raw.aktion === "frage" && asked < maxQ && String(raw.frage ?? "").trim()) return { kind: "frage", question: String(raw.frage).trim() };

    const checked = validateVerdict(normalizeVerdict(raw), input.caseCtx);
    errors = [...checked.errors];
    if (protectedExcuse && checked.sanitized && !["freispruch", "einstellung"].includes(checked.sanitized.verdict)) {
      errors.push(`Geltend gemachter Schutzgrund „${input.excuse}“ erlaubt nur Freispruch oder Einstellung.`);
    }
    if (errors.length === 0 && checked.sanitized) {
      const verdict = protectedExcuse && !checked.sanitized.protectedReason ? { ...checked.sanitized, protectedReason: input.excuse as VerdictProposal["protectedReason"], consequences: [] } : checked.sanitized;
      return { kind: "urteil", verdict, prosecution: String(raw.prosecution ?? "").trim(), defense: String(raw.defense ?? "").trim(), viaFallback: false };
    }
    messages.push({ role: "assistant", content: out }, { role: "user", content: `Regelbasis verletzt: ${errors.join("; ")}. Fälle ein korrigiertes Urteil (aktion=urteil).` });
  }
  return { kind: "urteil", verdict: fallbackVerdict(input), prosecution: "", defense: "", viaFallback: true, fallbackReason: errors.join("; ") };
}
