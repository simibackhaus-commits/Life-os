import { z } from "zod";

/**
 * Versionierte Regelbasis des „Court of Life“.
 * Jede Änderung an Grenzen oder erlaubten Konsequenzen => Version erhöhen.
 * Urteile speichern die Version, unter der sie gefällt wurden.
 */
export const RULEBOOK_VERSION = "1.0.0";

export const PLEAS = ["schuldig", "nicht_schuldig", "teilweise_schuldig"] as const;
export const PleaSchema = z.enum(PLEAS);
export type Plea = z.infer<typeof PleaSchema>;

export const VERDICTS = [
  "freispruch",
  "einstellung",
  "verwarnung",
  "teilschuld",
  "schuldig_mildernd",
  "schuldig",
] as const;
export const VerdictSchema = z.enum(VERDICTS);
export type Verdict = z.infer<typeof VerdictSchema>;

export const VERDICT_LABELS: Record<Verdict, string> = {
  freispruch: "Freispruch",
  einstellung: "Einstellung des Verfahrens",
  verwarnung: "Verwarnung",
  teilschuld: "Teilschuld",
  schuldig_mildernd: "Schuldig mit mildernden Umständen",
  schuldig: "Schuldig",
};

/** Gründe, die niemals bestraft werden dürfen. */
export const PROTECTED_REASONS = ["krankheit", "verletzung", "regeneration", "notfall"] as const;
export const ProtectedReasonSchema = z.enum(PROTECTED_REASONS);
export type ProtectedReason = z.infer<typeof ProtectedReasonSchema>;

export const ConsequenceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("coins_verlust"), amount: z.number().int().min(1) }),
  z.object({ type: z.literal("xp_abzug"), amount: z.number().int().min(1) }),
  z.object({ type: z.literal("bonus_verlust"), description: z.string().min(1).max(200) }),
  z.object({
    type: z.literal("wiedergutmachung"),
    questTitle: z.string().min(3).max(120),
    estimatedMinutes: z.number().int().min(1).max(60),
  }),
  z.object({ type: z.literal("reflexion"), prompt: z.string().min(10).max(400) }),
]);
export type Consequence = z.infer<typeof ConsequenceSchema>;

export const VerdictProposalSchema = z.object({
  verdict: VerdictSchema,
  reasoning: z.string().min(20).max(3000),
  protectedReason: ProtectedReasonSchema.nullable().default(null),
  consequences: z.array(ConsequenceSchema).max(3).default([]),
});
export type VerdictProposal = z.infer<typeof VerdictProposalSchema>;

interface VerdictLimits {
  maxCoinShare: number; // Anteil der Quest-Coins
  maxXpShare: number; // Anteil der Quest-XP
  allowed: Consequence["type"][];
}

/** Absolute Obergrenzen unabhängig von der Quest. */
export const ABSOLUTE_CAPS = { coins: 100, xp: 50 } as const;

export const VERDICT_LIMITS: Record<Verdict, VerdictLimits> = {
  freispruch: { maxCoinShare: 0, maxXpShare: 0, allowed: [] },
  einstellung: { maxCoinShare: 0, maxXpShare: 0, allowed: [] },
  verwarnung: { maxCoinShare: 0, maxXpShare: 0, allowed: ["reflexion"] },
  teilschuld: { maxCoinShare: 0.5, maxXpShare: 0, allowed: ["coins_verlust", "reflexion", "wiedergutmachung"] },
  schuldig_mildernd: {
    maxCoinShare: 0.75,
    maxXpShare: 0.25,
    allowed: ["coins_verlust", "xp_abzug", "reflexion", "wiedergutmachung", "bonus_verlust"],
  },
  schuldig: {
    maxCoinShare: 1,
    maxXpShare: 0.5,
    allowed: ["coins_verlust", "xp_abzug", "reflexion", "wiedergutmachung", "bonus_verlust"],
  },
};

/** Begriffe, die in Wiedergutmachungs- oder Reflexionsaufgaben nicht vorkommen dürfen. */
const FORBIDDEN_PATTERNS = [
  /fast(en|e)\b/i,
  /hunger/i,
  /schlafentzug|kein(en)? schlaf|wach bleiben/i,
  /kalt(es|e)? (dusche|bad)|eisbad/i,
  /schmerz/i,
  /verletz/i,
  /demütig|erniedrig|bloßstell|schäm/i,
  /alkohol|drogen/i,
  /\b(\d{3,})\s*(liegestütz|burpee|kniebeuge|km)/i,
];

export interface CaseContext {
  questXp: number;
  questCoins: number;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  /** Regelkonform beschnittener Vorschlag (immer gesetzt, wenn das Schema passt). */
  sanitized: VerdictProposal | null;
}

/**
 * Prüft einen KI-Urteilsvorschlag gegen die Regelbasis.
 * Harte Verstöße (Schema, verbotene Inhalte, Bestrafung trotz Schutzgrund) => ok=false.
 * Zu hohe Beträge werden auf die Grenzen gekappt und als Hinweis gemeldet.
 */
export function validateVerdict(input: unknown, ctx: CaseContext): ValidationResult {
  const parsed = VerdictProposalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`), sanitized: null };
  }
  const p = parsed.data;
  const errors: string[] = [];
  const limits = VERDICT_LIMITS[p.verdict];

  if (p.protectedReason && !["freispruch", "einstellung"].includes(p.verdict)) {
    errors.push(`Geschützter Grund "${p.protectedReason}" erlaubt nur Freispruch oder Einstellung.`);
  }

  const maxCoins = Math.min(ABSOLUTE_CAPS.coins, Math.floor(ctx.questCoins * limits.maxCoinShare));
  const maxXp = Math.min(ABSOLUTE_CAPS.xp, Math.floor(ctx.questXp * limits.maxXpShare));
  const consequences: Consequence[] = [];

  for (const c of p.consequences) {
    if (!limits.allowed.includes(c.type)) {
      errors.push(`Konsequenz "${c.type}" ist beim Urteil "${p.verdict}" nicht erlaubt.`);
      continue;
    }
    const text = c.type === "wiedergutmachung" ? c.questTitle : c.type === "reflexion" ? c.prompt : "";
    if (text && FORBIDDEN_PATTERNS.some((re) => re.test(text))) {
      errors.push(`Konsequenz enthält unzulässige Inhalte: "${text}".`);
      continue;
    }
    if (c.type === "coins_verlust") {
      if (maxCoins <= 0) continue;
      consequences.push({ ...c, amount: Math.min(c.amount, maxCoins) });
    } else if (c.type === "xp_abzug") {
      if (maxXp <= 0) continue;
      consequences.push({ ...c, amount: Math.min(c.amount, maxXp) });
    } else consequences.push(c);
  }

  const sanitized: VerdictProposal = {
    ...p,
    consequences: p.protectedReason ? [] : consequences,
  };
  return { ok: errors.length === 0, errors, sanitized };
}

export function consequenceDeltas(cs: Consequence[]): { xp: number; coins: number } {
  let xp = 0;
  let coins = 0;
  for (const c of cs) {
    if (c.type === "xp_abzug") xp -= c.amount;
    if (c.type === "coins_verlust") coins -= c.amount;
  }
  return { xp, coins };
}

export const EXCUSES = ["keine", "vergessen", "keine_zeit", "keine_motivation", ...PROTECTED_REASONS] as const;
export type Excuse = (typeof EXCUSES)[number];

export const EXCUSE_LABELS: Record<Excuse, string> = {
  keine: "Keine Entschuldigung",
  vergessen: "Vergessen",
  keine_zeit: "Keine Zeit / Termine",
  keine_motivation: "Keine Motivation",
  krankheit: "Krankheit",
  verletzung: "Verletzung",
  regeneration: "Notwendige Regeneration",
  notfall: "Unvorhersehbarer Notfall",
};

/**
 * Regelbasierter Richter für den Offline-/Lokalmodus (ohne KI).
 * Ergebnis durchläuft dieselbe Validierung wie KI-Urteile.
 */
export function simpleJudge(input: {
  plea: Plea;
  excuse: Excuse;
  priorConvictions: number;
  questTitle: string;
}): VerdictProposal {
  const { plea, excuse, priorConvictions, questTitle } = input;
  if ((PROTECTED_REASONS as readonly string[]).includes(excuse)) {
    return {
      verdict: "freispruch",
      protectedReason: excuse as ProtectedReason,
      reasoning: `Das Gericht erkennt "${EXCUSE_LABELS[excuse]}" als geschützten Grund an. Gesundheit und Notfälle gehen vor – keine Konsequenzen.`,
      consequences: [],
    };
  }
  const reflexion: Consequence = {
    type: "reflexion",
    prompt: `Was hat dich heute davon abgehalten, "${questTitle}" zu erledigen, und was machst du beim nächsten Mal anders?`,
  };
  if (plea === "nicht_schuldig" && excuse === "keine_zeit") {
    return {
      verdict: "verwarnung",
      protectedReason: null,
      reasoning: "Terminkonflikte sind nachvollziehbar, die Quest hätte aber verschoben werden können. Das Gericht belässt es bei einer Verwarnung.",
      consequences: [reflexion],
    };
  }
  if (priorConvictions === 0 && plea !== "nicht_schuldig") {
    return {
      verdict: "verwarnung",
      protectedReason: null,
      reasoning: "Erstes Versäumnis und ehrliches Geständnis. Das Gericht spricht eine Verwarnung aus.",
      consequences: [reflexion],
    };
  }
  if (plea === "teilweise_schuldig") {
    return {
      verdict: "teilschuld",
      protectedReason: null,
      reasoning: "Das Gericht erkennt eine Teilschuld an. Ein Teil der Coins wird einbehalten.",
      consequences: [{ type: "coins_verlust", amount: 5 }, reflexion],
    };
  }
  const mild = plea === "schuldig";
  return {
    verdict: mild ? "schuldig_mildernd" : "schuldig",
    protectedReason: null,
    reasoning: mild
      ? "Wiederholtes Versäumnis, aber das Geständnis wirkt strafmildernd."
      : "Wiederholtes Versäumnis ohne anerkannten Grund. Das Gericht verhängt die regelkonforme Konsequenz.",
    consequences: [
      { type: "coins_verlust", amount: 10 },
      { type: "wiedergutmachung", questTitle: `Nachholen: ${questTitle}`.slice(0, 120), estimatedMinutes: 15 },
    ],
  };
}

/** Text der Regelbasis für den KI-Richter (wird in den System-Prompt eingefügt). */
export function rulebookText(): string {
  const lines = VERDICTS.map((v) => {
    const l = VERDICT_LIMITS[v];
    return `- ${v}: erlaubte Konsequenzen [${l.allowed.join(", ") || "keine"}], max. Coins ${Math.round(
      l.maxCoinShare * 100,
    )}% der Quest-Coins, max. XP ${Math.round(l.maxXpShare * 100)}% der Quest-XP`;
  });
  return [
    `Regelbasis Version ${RULEBOOK_VERSION}`,
    `Absolute Obergrenzen: ${ABSOLUTE_CAPS.coins} Coins, ${ABSOLUTE_CAPS.xp} XP pro Urteil.`,
    `Geschützte Gründe (${PROTECTED_REASONS.join(", ")}) führen immer zu Freispruch oder Einstellung ohne Konsequenzen.`,
    "Wiedergutmachungsquests dauern höchstens 60 Minuten, sind sinnvoll, sicher und würdevoll.",
    "Verboten: gesundheitsschädliche, gefährliche, entwürdigende oder reale finanzielle Konsequenzen.",
    "Urteile:",
    ...lines,
  ].join("\n");
}
