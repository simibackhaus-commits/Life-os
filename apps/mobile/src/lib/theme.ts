import { StyleSheet } from "react-native";
import { colors } from "@life-os/ui-tokens";

export { attributeColors, colors, questTypeColors } from "@life-os/ui-tokens";

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14 },
  cardTitle: { color: colors.gold, fontSize: 12, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 },
  h1: { color: colors.gold, fontSize: 26, fontWeight: "700", letterSpacing: 1 },
  text: { color: colors.text, fontSize: 15 },
  muted: { color: colors.muted, fontSize: 13 },
  small: { color: colors.muted, fontSize: 11 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  label: { color: colors.muted, fontSize: 12, marginBottom: 4, marginTop: 8 },
});
