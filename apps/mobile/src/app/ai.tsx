import { useCallback, useEffect, useState } from "react";
import { ScrollView, Switch, Text, TextInput, View } from "react-native";
import { OnDeviceProvider, PROFILE_LABELS, adviseModels, type ModelSpec } from "@life-os/ai";
import { Badge, Bar, Button, Card } from "@/components/ui";
import { ENGINE_AVAILABLE } from "@/lib/llm";
import { catalog, deleteModel, deviceName, deviceRam, freeDisk, isDownloading, modelInfo, pauseDownload, startDownload, type DownloadState } from "@/lib/models";
import { colors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

const GB = 1024 ** 3;
const gb = (b: number) => `${(b / GB).toFixed(2)} GB`;

interface Bench {
  loadMs: number | null;
  tokensPerSecond: number | null;
  totalMs: number;
  answer: string;
}

/** KI-Zentrale: Modelle verwalten, Anbieter wählen, Leistung auf dem Gerät messen. */
export default function AiCenter() {
  const { ai, notify } = useGame();
  const [installed, setInstalled] = useState<Record<string, number>>({});
  const [progress, setProgress] = useState<Record<string, DownloadState>>({});
  const [disk, setDisk] = useState<number | null>(null);
  const [bench, setBench] = useState<Bench | null>(null);
  const [benchBusy, setBenchBusy] = useState(false);
  const ram = deviceRam();
  const advice = adviseModels(ram, disk);

  const refresh = useCallback(async () => {
    setDisk(await freeDisk());
    const entries = await Promise.all(catalog.map(async (m) => [m.id, (await modelInfo(m)).installed ? m.sizeBytes : 0] as const));
    setInstalled(Object.fromEntries(entries));
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function download(m: ModelSpec) {
    setProgress((p) => ({ ...p, [m.id]: { status: "läuft", written: p[m.id]?.written ?? 0, total: m.sizeBytes } }));
    const r = await startDownload(m, (st) => setProgress((p) => ({ ...p, [m.id]: st })));
    setProgress((p) => ({ ...p, [m.id]: r }));
    if (r.status === "fertig") {
      notify("info", `${m.name} ist geladen und offline nutzbar.`);
      if (ai.settings.provider !== "geraet" || ai.settings.deviceModel !== m.id) await ai.save({ ...ai.settings, provider: "geraet", deviceModel: m.id });
    }
    if (r.status === "fehler") notify("error", r.error ?? "Download fehlgeschlagen");
    await refresh();
  }

  async function runBench() {
    const p = ai.provider;
    if (!(p instanceof OnDeviceProvider)) return;
    setBenchBusy(true);
    const t = Date.now();
    try {
      const answer = await p.generate({ system: "Du bist der Spielleiter von LIFE OS. Antworte auf Deutsch in einem Satz.", messages: [{ role: "user", content: "Motiviere mich für mein Training heute." }] });
      setBench({ loadMs: p.stats.loadMs, tokensPerSecond: p.stats.lastTokensPerSecond, totalMs: Date.now() - t, answer });
    } catch (e) {
      notify("error", e instanceof Error ? e.message : String(e));
    } finally {
      setBenchBusy(false);
    }
  }

  const active = ai.settings.provider;
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Card title="Dein Gerät">
        <Text style={s.text}>{deviceName()}</Text>
        <Text style={s.small}>
          Arbeitsspeicher: {ram ? gb(ram) : "unbekannt"} · frei: {disk !== null ? gb(disk) : "unbekannt"}
        </Text>
        {!ENGINE_AVAILABLE ? (
          <Text style={[s.small, { color: colors.warning, marginTop: 6 }]}>
            Die Geräte-KI läuft nur in der installierten LIFE-OS-App (nicht im Browser oder in Expo Go). Alles andere funktioniert hier trotzdem.
          </Text>
        ) : null}
      </Card>

      <Card title="KI-Modus">
        {(
          [
            ["geraet", "Auf dem iPhone (offline, privat)", "Empfohlen. Nach dem einmaligen Download ohne Internet."],
            ["aus", "Aus", "Regelrichter und Offline-Erkennung – alles Spielwichtige funktioniert."],
            ["gemini", "Gemini Free Tier (optional, Internet)", "Nur mit Zustimmung; Google darf Daten im Free Tier nutzen."],
          ] as const
        ).map(([id, label, hint]) => (
          <View key={id} style={[s.row, { justifyContent: "space-between", paddingVertical: 6 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.text, active === id && { color: colors.gold }]}>{label}</Text>
              <Text style={s.small}>{hint}</Text>
            </View>
            <Switch value={active === id} onValueChange={(v) => void ai.save({ ...ai.settings, provider: v ? id : "aus" })} trackColor={{ true: colors.gold }} />
          </View>
        ))}
        {active === "gemini" ? (
          <View style={{ gap: 6, marginTop: 6 }}>
            <Text style={s.label}>Gemini-API-Schlüssel (bleibt auf diesem iPhone)</Text>
            <TextInput style={s.input} secureTextEntry autoCapitalize="none" value={ai.settings.geminiKey} onChangeText={(v) => void ai.save({ ...ai.settings, geminiKey: v })} />
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <Text style={[s.small, { flex: 1 }]}>Ich stimme zu, dass Google im Free Tier Ein- und Ausgaben zur Produktverbesserung nutzen darf.</Text>
              <Switch value={ai.settings.geminiConsent} onValueChange={(v) => void ai.save({ ...ai.settings, geminiConsent: v })} trackColor={{ true: colors.gold }} />
            </View>
          </View>
        ) : null}
        <View style={[s.row, { justifyContent: "space-between", paddingTop: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.text}>Spieldaten als Kontext</Text>
            <Text style={s.small}>Quests, Abschlüsse und Werte für Tagesplanung und Rat. Bei der Geräte-KI verlässt nichts das iPhone.</Text>
          </View>
          <Switch value={ai.settings.shareGameData} onValueChange={(v) => void ai.save({ ...ai.settings, shareGameData: v })} trackColor={{ true: colors.gold }} />
        </View>
        {ai.status ? <Text style={[s.small, { marginTop: 6, color: ai.status.ok ? colors.success : colors.warning }]}>{ai.status.detail}</Text> : null}
      </Card>

      <Card title="Modelle (Qwen3, Apache-2.0)">
        {advice.map(({ model: m, fits, recommended, reason }) => {
          const has = (installed[m.id] ?? 0) > 0;
          const pr = progress[m.id];
          const running = pr?.status === "läuft" || isDownloading(m);
          const selected = active === "geraet" && ai.settings.deviceModel === m.id;
          return (
            <View key={m.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 6 }}>
              <View style={[s.row, { justifyContent: "space-between" }]}>
                <Text style={[s.text, { fontWeight: "700" }]}>{m.name}</Text>
                <View style={[s.row, { gap: 4 }]}>
                  <Badge text={PROFILE_LABELS[m.profile]} color={m.profile === "eco" ? colors.success : m.profile === "balanced" ? colors.blue : colors.violet} />
                  {recommended ? <Badge text="Empfohlen" color={colors.gold} /> : null}
                  {selected ? <Badge text="Aktiv" color={colors.success} /> : null}
                </View>
              </View>
              <Text style={s.small}>
                {gb(m.sizeBytes)} · {m.description}
              </Text>
              <Text style={[s.small, { color: fits ? colors.muted : colors.warning }]}>{reason}</Text>
              {pr && (pr.status === "läuft" || pr.status === "pausiert") ? (
                <View style={{ gap: 4 }}>
                  <Bar value={pr.total ? pr.written / pr.total : 0} color={colors.blue} />
                  <Text style={s.small}>
                    {gb(pr.written)} / {gb(pr.total)} · {pr.status}
                  </Text>
                </View>
              ) : null}
              <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
                {!has && !running ? <Button label={pr?.status === "pausiert" ? "Fortsetzen" : "Herunterladen"} icon="cloud-download" variant="blue" disabled={!fits || !ENGINE_AVAILABLE} onPress={() => void download(m)} /> : null}
                {running ? (
                  <Button
                    label="Pausieren"
                    variant="outline"
                    onPress={async () => {
                      await pauseDownload(m);
                      setProgress((p) => ({ ...p, [m.id]: { ...(p[m.id] ?? { written: 0, total: m.sizeBytes }), status: "pausiert" } }));
                    }}
                  />
                ) : null}
                {has && !selected ? <Button label="Verwenden" variant="gold" onPress={() => void ai.save({ ...ai.settings, provider: "geraet", deviceModel: m.id })} /> : null}
                {has ? (
                  <Button
                    label="Löschen"
                    variant="outline"
                    icon="trash"
                    onPress={async () => {
                      await deleteModel(m);
                      await refresh();
                      notify("info", `${m.name} gelöscht (${gb(m.sizeBytes)} frei).`);
                    }}
                  />
                ) : null}
              </View>
            </View>
          );
        })}
        <Text style={[s.small, { marginTop: 8 }]}>Download nur im WLAN empfohlen. Danach braucht die KI kein Internet.</Text>
      </Card>

      {active === "geraet" && ai.provider instanceof OnDeviceProvider ? (
        <Card title="Leistungstest auf diesem iPhone">
          <Button label={benchBusy ? "Messe…" : "Test starten"} icon="speedometer" disabled={benchBusy || !ENGINE_AVAILABLE} onPress={() => void runBench()} />
          {bench ? (
            <View style={{ marginTop: 8, gap: 2 }}>
              <Text style={s.small}>Modell laden: {bench.loadMs !== null ? `${(bench.loadMs / 1000).toFixed(1)} s` : "war schon geladen"}</Text>
              <Text style={s.small}>Antwort: {(bench.totalMs / 1000).toFixed(1)} s · {bench.tokensPerSecond ? `${bench.tokensPerSecond.toFixed(1)} Tokens/s` : "–"}</Text>
              <Text style={[s.text, { marginTop: 4 }]}>„{bench.answer}“</Text>
            </View>
          ) : (
            <Text style={[s.small, { marginTop: 6 }]}>Misst Ladezeit und Geschwindigkeit. Der erste Start dauert länger (Modell wird geladen).</Text>
          )}
        </Card>
      ) : null}
    </ScrollView>
  );
}
