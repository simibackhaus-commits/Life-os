/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExpoConfig } from "expo/config";

/** Liest die öffentlichen Supabase-Werte aus der gemeinsamen .env.local im Repo-Wurzelordner. */
function rootEnv(): Record<string, string> {
  try {
    const text = readFileSync(join(__dirname, "..", "..", ".env.local"), "utf8").replace(/^﻿/, "");
    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    );
  } catch {
    return {};
  }
}

// LIFE_OS_LOCAL=1 erzwingt den lokalen Modus (ohne Konto), z. B. für UI-Tests.
const env = process.env.LIFE_OS_LOCAL === "1" ? {} : rootEnv();

const config: ExpoConfig = {
  name: "LIFE OS",
  slug: "life-os",
  version: "0.1.0",
  scheme: "lifeos",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  backgroundColor: "#0d0f14",
  ios: {
    supportsTablet: false,
    bundleIdentifier: "app.lifeos.mobile",
    infoPlist: { NSFaceIDUsageDescription: "LIFE OS nutzt Face ID, um deinen Spielstand zu schützen." },
  },
  android: { package: "app.lifeos.mobile", adaptiveIcon: { backgroundColor: "#0d0f14", foregroundImage: "./assets/android-icon-foreground.png" } },
  web: { favicon: "./assets/favicon.png", bundler: "metro" },
  plugins: [
    "expo-router",
    "expo-secure-store",
    ["expo-local-authentication", { faceIDPermission: "LIFE OS nutzt Face ID, um deinen Spielstand zu schützen." }],
    ["expo-notifications", { color: "#e6b450" }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    supabaseUrl: env.VITE_SUPABASE_URL ?? "",
    supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY ?? "",
  },
};

export default config;
