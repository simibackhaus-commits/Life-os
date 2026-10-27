import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "@/lib/backend";
import { unlockWithBiometrics } from "@/lib/device";
import { colors, s } from "@/lib/theme";
import { Button, Card } from "./ui";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    const res =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (res.error) setMsg(res.error.message);
    else if (mode === "signup" && !res.data.session) setMsg("Bestätigungs-E-Mail gesendet. Link öffnen, dann hier anmelden.");
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[s.screen, { justifyContent: "center", padding: 20 }]}>
      <Text style={[s.h1, { textAlign: "center", fontSize: 34, letterSpacing: 6 }]}>LIFE OS</Text>
      <Text style={[s.muted, { textAlign: "center", marginBottom: 24 }]}>{mode === "login" ? "Willkommen zurück, Held." : "Erschaffe deinen Charakter."}</Text>
      <Card>
        <Text style={s.label}>E-Mail</Text>
        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          placeholderTextColor={colors.muted}
        />
        <Text style={s.label}>Passwort</Text>
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          textContentType={mode === "login" ? "password" : "newPassword"}
        />
        {msg ? <Text style={{ color: colors.warning, marginTop: 10 }}>{msg}</Text> : null}
        <View style={{ marginTop: 16 }}>
          <Button label={mode === "login" ? "Anmelden" : "Registrieren"} onPress={() => void submit()} disabled={busy || !email || password.length < 8} />
        </View>
      </Card>
      <Pressable onPress={() => setMode(mode === "login" ? "signup" : "login")} style={{ marginTop: 16 }}>
        <Text style={{ color: colors.blue, textAlign: "center" }}>{mode === "login" ? "Noch kein Konto? Registrieren" : "Bereits registriert? Anmelden"}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [failed, setFailed] = useState(false);
  async function attempt() {
    if (await unlockWithBiometrics()) onUnlock();
    else setFailed(true);
  }
  useEffect(() => {
    void attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={[s.screen, { justifyContent: "center", padding: 24, gap: 16 }]}>
      <Text style={[s.h1, { textAlign: "center", letterSpacing: 6 }]}>LIFE OS</Text>
      <Text style={[s.muted, { textAlign: "center" }]}>{failed ? "Entsperren fehlgeschlagen." : "Gesperrt"}</Text>
      <Button label="Mit Face ID entsperren" icon="scan" onPress={() => void attempt()} />
    </View>
  );
}
