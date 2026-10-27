// Kopiert packages/core/src nach supabase/functions/_shared/core, damit die Edge Functions
// exakt dieselben Spielregeln verwenden wie die Apps. Vor jedem Deploy ausführen (pnpm sync:shared).
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "packages", "core", "src");
const dest = join(root, "supabase", "functions", "_shared", "core");

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
let n = 0;
for (const f of readdirSync(src)) {
  if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
  cpSync(join(src, f), join(dest, f));
  n++;
}
console.log(`sync-shared: ${n} Dateien nach supabase/functions/_shared/core kopiert`);
