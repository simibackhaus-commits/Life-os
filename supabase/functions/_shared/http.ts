import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new HttpError(500, `Server-Konfiguration fehlt: ${name}`);
  return v;
}

export interface RequestContext {
  userId: string;
  /** Client mit den Rechten des Nutzers (RLS greift). */
  user: SupabaseClient;
  /** Service-Role-Client – nur für geprüfte Schreibvorgänge. */
  admin: SupabaseClient;
}

export async function authenticate(req: Request): Promise<RequestContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new HttpError(401, "Nicht angemeldet");
  const url = env("SUPABASE_URL");
  const user = createClient(url, env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await user.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Ungültige Sitzung");
  const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  return { userId: data.user.id, user, admin };
}

/** Einheitliche Hülle: CORS, Auth, Fehlerbehandlung ohne Ausgabe personenbezogener Daten. */
export function handler(fn: (req: Request, ctx: RequestContext) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Nur POST" }, 405);
    try {
      return await fn(req, await authenticate(req));
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      // Nur Fehlertyp loggen, keine Inhalte
      console.error("unhandled", e instanceof Error ? e.name + ": " + e.message.slice(0, 200) : "unknown");
      return json({ error: "Interner Fehler" }, 500);
    }
  };
}

export function anthropicKey(): string {
  return env("ANTHROPIC_API_KEY");
}
