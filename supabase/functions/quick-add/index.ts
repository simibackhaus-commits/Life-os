import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { callClaude, parseDraft, questDraftJsonSchema, toolUses } from "../_shared/ai.ts";
import { HttpError, anthropicKey, handler, json } from "../_shared/http.ts";

const Body = z.object({ text: z.string().trim().min(1).max(1000), today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

Deno.serve(
  handler(async (req) => {
    const body = Body.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "Ungültige Eingabe");
    const { text, today } = body.data;

    const client = new Anthropic({ apiKey: anthropicKey() });
    const res = await callClaude(client, {
      effort: "low",
      system: [
        "Du wandelst eine deutschsprachige Freitexteingabe in genau einen Quest-Entwurf für ein Real-Life-RPG um.",
        `Heute ist ${today}. Zeitzone Europe/Berlin.`,
        "Rufe immer das Tool create_quest_draft genau einmal auf.",
        "Wiederkehrendes → recurrence setzen (startDate = heute, falls nicht anders genannt), dueAt = null.",
        "Mehrere Uhrzeiten am selben Tag (z. B. morgens und abends) → recurrence.times, jede wird eine eigene Instanz.",
        "Langfristige Ziele (z. B. Sparziel, Trainingsplan) → type 'main' oder 'epic', sinnvolle Teilaufgaben in subtasks.",
        "Routinen/Erinnerungen an Pflichten → mandatory = true.",
        "Wähle 1–3 passende Attribute.",
      ].join("\n"),
      messages: [{ role: "user", content: text }],
      tools: [{ name: "create_quest_draft", description: "Erzeugt den Quest-Entwurf zur Vorschau.", input_schema: questDraftJsonSchema as never }],
    });

    if (res.stop_reason === "refusal") throw new HttpError(422, "Eingabe konnte nicht verarbeitet werden");
    const call = toolUses(res.content, "create_quest_draft")[0];
    if (!call) throw new HttpError(422, "Kein Entwurf erzeugt");
    const parsed = parseDraft(call.input);
    if (!parsed.ok) throw new HttpError(422, "Entwurf ungültig");
    return json({ draft: parsed.draft, notes: ["Von der KI erkannt – bitte prüfen"] });
  }),
);
