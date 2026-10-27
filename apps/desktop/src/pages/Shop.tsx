import { useState } from "react";
import { Coins, EyeOff, Plus, ShoppingBag } from "lucide-react";
import { SHOP_SUGGESTIONS, ShopItemDraftSchema, type ShopItem } from "@life-os/core";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardTitle, Input, Label } from "@/components/ui/primitives";
import { cn, formatDateTime } from "@/lib/utils";
import { useGame } from "@/state/GameProvider";

const REASONS: Record<string, string> = {
  insufficient_coins: "Nicht genug LIFE COINS.",
  inactive: "Diese Belohnung ist deaktiviert.",
  not_found: "Belohnung nicht gefunden.",
  duplicate_event: "Kauf wurde bereits gebucht.",
};

function ItemForm({ initial, onDone }: { initial?: ShopItem; onDone: () => void }) {
  const { run, notify } = useGame();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [cost, setCost] = useState(String(initial?.cost ?? 50));
  const [icon, setIcon] = useState(initial?.icon ?? "🎁");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const parsed = ShopItemDraftSchema.safeParse({ title, cost: Number(cost), icon, description });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Ungültig");
    const ok = initial ? await run((s) => s.updateShopItem(initial.id, parsed.data).then(() => true)) : await run((s) => s.createShopItem(parsed.data));
    if (ok) {
      notify("info", initial ? "Belohnung gespeichert." : `Belohnung „${parsed.data.title}" angelegt.`);
      onDone();
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid grid-cols-[80px_1fr] gap-3">
        <div>
          <Label htmlFor="s-icon">Symbol</Label>
          <Input id="s-icon" value={icon} onChange={(e) => setIcon(e.target.value)} className="text-center text-lg" />
        </div>
        <div>
          <Label htmlFor="s-title">Belohnung</Label>
          <Input id="s-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Kinoabend" />
        </div>
      </div>
      <div>
        <Label htmlFor="s-desc">Beschreibung (optional)</Label>
        <Input id="s-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="max-w-40">
        <Label htmlFor="s-cost">Preis in LIFE COINS</Label>
        <Input id="s-cost" type="number" min={1} value={cost} onChange={(e) => setCost(e.target.value)} />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Abbrechen
        </Button>
        <Button type="submit" variant="gold">
          Speichern
        </Button>
      </div>
    </form>
  );
}

export function ShopPage() {
  const { snap, run, notify } = useGame();
  const [editing, setEditing] = useState<ShopItem | "new" | null>(null);
  const coins = snap.character.coins;
  const items = [...snap.shopItems].sort((a, b) => Number(b.active) - Number(a.active) || a.cost - b.cost);

  async function buy(item: ShopItem) {
    const r = await run((s) => s.purchase(item.id));
    if (!r) return;
    if (r.applied) notify("xp", `${item.icon} ${item.title} eingelöst – viel Spaß! (−${item.cost} Coins)`);
    else notify("error", REASONS[r.reason] ?? r.reason);
  }

  async function addSuggestions() {
    for (const s of SHOP_SUGGESTIONS) await run((st) => st.createShopItem(s));
    notify("info", "Vorschläge hinzugefügt – passe die Preise nach Belieben an.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="heading text-2xl">Belohnungsshop</h1>
          <p className="text-sm text-muted">Lege echte Belohnungen fest und tausche sie gegen deine LIFE COINS.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 rounded-md border border-electric/40 bg-electric/10 px-3 py-1.5 text-electric">
            <Coins size={16} /> {coins} LIFE COINS
          </span>
          <Button variant="gold" onClick={() => setEditing("new")}>
            <Plus size={16} /> Belohnung
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <Card className="p-8 text-center">
          <ShoppingBag className="mx-auto mb-3 text-gold" />
          <p className="text-sm text-muted">Noch keine Belohnungen. Lege eigene an oder starte mit Vorschlägen.</p>
          <Button className="mt-4" onClick={() => void addSuggestions()}>
            Vorschläge übernehmen
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {items.map((it) => {
            const affordable = coins >= it.cost;
            return (
              <Card key={it.id} className={cn("flex flex-col gap-3", !it.active && "opacity-50")}>
                <div className="flex items-start gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-surface-2 text-2xl">{it.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{it.title}</div>
                    {it.description && <p className="text-xs text-muted">{it.description}</p>}
                    <div className="mt-1 text-sm text-electric">{it.cost} Coins</div>
                  </div>
                </div>
                {!affordable && it.active && <div className="text-[11px] text-muted">Es fehlen noch {it.cost - coins} Coins</div>}
                <div className="mt-auto flex gap-2">
                  <Button className="flex-1" variant={affordable && it.active ? "gold" : "outline"} disabled={!affordable || !it.active} onClick={() => void buy(it)}>
                    Einlösen
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(it)}>
                    Bearbeiten
                  </Button>
                  <Button variant="ghost" size="sm" title={it.active ? "Deaktivieren" : "Aktivieren"} onClick={() => void run((s) => s.updateShopItem(it.id, { active: !it.active }))}>
                    <EyeOff size={14} />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardTitle>Eingelöst</CardTitle>
        {snap.purchases.length === 0 ? (
          <p className="text-sm text-muted">Noch nichts eingelöst.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {snap.purchases.slice(0, 20).map((p) => (
              <li key={p.id} className="flex justify-between py-2">
                <span>{p.title}</span>
                <span className="text-muted">
                  −{p.cost} Coins · {formatDateTime(p.purchasedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "Neue Belohnung" : "Belohnung bearbeiten"}>
        {editing && <ItemForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}
