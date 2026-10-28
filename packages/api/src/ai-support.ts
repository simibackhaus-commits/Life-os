import { EXCUSE_LABELS, describeRule, levelFromXp, type Excuse, type Plea } from "@life-os/core";
import type { JudgeInput } from "@life-os/ai";
import type { CourtCase, CourtMessage, Snapshot } from "./types.ts";

/** Spieldaten als Kontext für den Spielleiter – nur mit Freigabe verwendet. */
export function gameContext(snap: Snapshot, today: string): string {
  const c = snap.character;
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const titles = new Map(snap.quests.map((q) => [q.id, q.title]));
  const done = new Map<string, number>();
  for (const i of snap.instances) {
    if (i.status !== "erledigt" || !i.completedAt || i.completedAt < since) continue;
    const t = titles.get(i.questId) ?? "?";
    done.set(t, (done.get(t) ?? 0) + 1);
  }
  const quests = snap.quests
    .filter((q) => q.status === "aktiv" || q.status === "pausiert")
    .slice(0, 80)
    .map((q) => {
      const when = q.recurrence ? describeRule(q.recurrence) : q.dueAt ? `fällig ${q.dueAt.slice(0, 16)}` : "ohne Termin";
      return `- [${q.status}] ${q.title} (${q.type}, ${q.difficulty}, Prio ${q.priority}${q.mandatory ? ", Pflicht" : ""}${q.estimatedMinutes ? `, ${q.estimatedMinutes} min` : ""}) – ${when}`;
    });
  return [
    `Heute (Spieltag): ${today}`,
    `Charakter: ${c.name}, Level ${levelFromXp(c.totalXp).level}, ${c.coins} Coins, Klasse ${c.className || "–"}`,
    "Aktive Quests:",
    ...quests,
    "Abschlüsse der letzten 14 Tage:",
    ...[...done].map(([t, n]) => `- ${t}: ${n}×`),
  ].join("\n");
}

export function priorConvictions(snap: Snapshot, caseId: string): number {
  return snap.cases.filter((x) => x.id !== caseId && x.status === "urteil" && x.verdict && !["freispruch", "einstellung"].includes(x.verdict)).length;
}

export function pleaMessage(plea: Plea, excuse: Excuse, statement: string): string {
  return `Plädoyer: ${plea.replace("_", " ")}. Grund: ${EXCUSE_LABELS[excuse]}.${statement.trim() ? `\n${statement.trim()}` : ""}`;
}

/** Fallakte + Verlauf für den KI-Richter. Beweismittel: Questdaten und Erfüllungsquote der letzten 14 Tage. */
export function judgeInput(snap: Snapshot, c: CourtCase): JudgeInput {
  const q = snap.quests.find((x) => x.id === c.questId);
  const lines = [`Anklage: ${c.charge}`, `Quest-Belohnung: ${c.questXp} XP, ${c.questCoins} Coins`, `Plädoyer: ${c.plea ?? "noch keins"}`];
  if (c.excuse) lines.push(`Geltend gemachter Grund: ${EXCUSE_LABELS[c.excuse]}`);
  if (q) {
    lines.push(`Quest: ${q.title}${q.recurrence ? ` (${describeRule(q.recurrence)})` : ""}`);
    if (q.consequences) lines.push(`Vom Spieler festgelegte mögliche Konsequenzen: ${q.consequences}`);
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    const done = snap.instances.filter((i) => i.questId === q.id && i.status === "erledigt" && i.occurrenceKey >= since).length;
    lines.push(`Erledigte Vorkommen dieser Quest in den letzten 14 Tagen: ${done}`);
  }
  const prior = priorConvictions(snap, c.id);
  lines.push(`Frühere Verurteilungen: ${prior}`);
  const log = snap.courtMessages
    .filter((m: CourtMessage) => m.caseId === c.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    // Bei einer Berufung zählen nur Rückfragen nach dem letzten Urteil.
    .slice(lastVerdictIndex(snap.courtMessages.filter((m) => m.caseId === c.id)) + 1)
    .map((m) => ({ role: m.role, content: m.content }));
  return {
    caseFile: lines.join("\n"),
    log,
    caseCtx: { questXp: c.questXp, questCoins: c.questCoins },
    plea: c.status === "berufung" ? "nicht_schuldig" : (c.plea ?? "nicht_schuldig"),
    excuse: c.excuse ?? "keine",
    priorConvictions: prior,
    questTitle: q?.title ?? c.charge,
  };
}

function lastVerdictIndex(msgs: CourtMessage[]): number {
  const sorted = [...msgs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let idx = -1;
  sorted.forEach((m, i) => {
    if (m.role === "system" && /urteil/i.test(m.content) && /verkündet|regelrichter/i.test(m.content)) idx = i;
  });
  return idx;
}
