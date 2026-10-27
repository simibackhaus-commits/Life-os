import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LevelUpOverlay, Toasts } from "@/components/game";
import { RightPanel, Sidebar, type Page } from "@/components/layout";
import { QuickAdd } from "@/components/QuickAdd";
import { createCloudStore, createLocalStore, supabase } from "@/lib/store";
import { CourtPage } from "@/pages/Court";
import { Dashboard } from "@/pages/Dashboard";
import { AuthPage, CharacterPage, SettingsPage } from "@/pages/Other";
import { QuestsPage } from "@/pages/Quests";
import { CalendarPage } from "@/pages/Calendar";
import { CareerPage } from "@/pages/Career";
import { FinancePage } from "@/pages/Finance";
import { FitnessPage } from "@/pages/Fitness";
import { ShopPage } from "@/pages/Shop";
import { SkilltreePage } from "@/pages/Skilltree";
import { StatsPage } from "@/pages/Stats";
import { GameProvider } from "@/state/GameProvider";

function Shell() {
  const [page, setPage] = useState<Page>("dashboard");
  const [quickAdd, setQuickAdd] = useState(false);

  useEffect(() => {
    // Strg+K öffnet Quick-Add von überall
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuickAdd(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-full">
      <Sidebar page={page} setPage={setPage} />
      <main className="min-w-0 flex-1 overflow-y-auto p-5">
        {page === "dashboard" && <Dashboard onQuickAdd={() => setQuickAdd(true)} />}
        {page === "quests" && <QuestsPage />}
        {page === "character" && <CharacterPage />}
        {page === "court" && <CourtPage />}
        {page === "calendar" && <CalendarPage />}
        {page === "skills" && <SkilltreePage />}
        {page === "shop" && <ShopPage />}
        {page === "career" && <CareerPage />}
        {page === "fitness" && <FitnessPage />}
        {page === "finance" && <FinancePage />}
        {page === "stats" && <StatsPage />}
        {page === "settings" && <SettingsPage />}
      </main>
      <RightPanel onQuickAdd={() => setQuickAdd(true)} goCourt={() => setPage("court")} />
      <QuickAdd open={quickAdd} onOpenChange={setQuickAdd} />
      <LevelUpOverlay />
      <Toasts />
    </div>
  );
}

function CloudApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    void supabase!.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase!.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  const userId = session?.user.id;
  const store = useMemo(() => (userId ? createCloudStore(userId) : null), [userId]);
  if (session === undefined) return <div className="grid h-full place-items-center text-muted">Verbinde…</div>;
  if (!store) return <AuthPage />;
  return (
    <GameProvider key={userId} store={store}>
      <Shell />
    </GameProvider>
  );
}

export function App() {
  const localStore = useMemo(() => (supabase ? null : createLocalStore()), []);
  if (localStore)
    return (
      <GameProvider store={localStore}>
        <Shell />
      </GameProvider>
    );
  return <CloudApp />;
}
