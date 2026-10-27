import { z } from "zod";

/**
 * Belohnungsshop: Der Spieler legt eigene reale Belohnungen an und kauft sie mit LIFE COINS.
 * Der Kauf (Coin-Abzug) läuft serverseitig über purchase_shop_item() – muss mit diesen Grenzen übereinstimmen.
 */
export const SHOP_LIMITS = { maxCost: 100_000, maxTitle: 80 } as const;

export const ShopItemDraftSchema = z.object({
  title: z.string().trim().min(1, "Titel fehlt").max(SHOP_LIMITS.maxTitle),
  description: z.string().max(300).default(""),
  cost: z.number().int().min(1, "Preis mindestens 1 Coin").max(SHOP_LIMITS.maxCost),
  icon: z.string().max(8).default("🎁"),
  active: z.boolean().default(true),
});
export type ShopItemDraft = z.infer<typeof ShopItemDraftSchema>;
export type ShopItemDraftInput = z.input<typeof ShopItemDraftSchema>;

export interface ShopItem extends ShopItemDraft {
  id: string;
  createdAt: string;
}

export interface ShopPurchase {
  id: string;
  itemId: string | null;
  title: string;
  cost: number;
  eventId: string;
  purchasedAt: string;
}

/** Startvorschläge – der Spieler kann sie übernehmen und anpassen. */
export const SHOP_SUGGESTIONS: ShopItemDraftInput[] = [
  { title: "Eine Folge meiner Serie", cost: 30, icon: "📺" },
  { title: "Lieblingssnack", cost: 40, icon: "🍫" },
  { title: "1 Stunde Gaming ohne schlechtes Gewissen", cost: 60, icon: "🎮" },
  { title: "Ausschlafen am Wochenende", cost: 80, icon: "😴" },
  { title: "Essen bestellen", cost: 150, icon: "🍕" },
  { title: "Neues Buch oder Spiel", cost: 400, icon: "📚" },
];

export type PurchaseResult =
  | { applied: true; coinsAfter: number }
  | { applied: false; reason: "duplicate_event" | "not_found" | "inactive" | "insufficient_coins" };

export function checkPurchase(coins: number, item: Pick<ShopItem, "cost" | "active"> | undefined): PurchaseResult | null {
  if (!item) return { applied: false, reason: "not_found" };
  if (!item.active) return { applied: false, reason: "inactive" };
  if (coins < item.cost) return { applied: false, reason: "insufficient_coins" };
  return null;
}
