import { randomUUID } from "expo-crypto";

// Hermes hat kein crypto.randomUUID – die gemeinsamen Pakete brauchen es für Event-IDs.
// Im Browser existiert crypto bereits (nur lesbar) und wird nicht angefasst.
const g = globalThis as { crypto?: { randomUUID?: () => string } };
if (!g.crypto) g.crypto = { randomUUID };
else if (typeof g.crypto.randomUUID !== "function") g.crypto.randomUUID = randomUUID;
