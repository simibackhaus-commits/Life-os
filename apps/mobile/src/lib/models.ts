import * as Device from "expo-device";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { MODEL_CATALOG, type ModelSpec } from "@life-os/ai";

/**
 * Modellmanager: Download (fortsetzbar), Prüfung, Löschen, Speicheranzeige.
 * Modelle liegen im Dokumente-Ordner der App und sind danach komplett offline nutzbar.
 */
const DIR = `${FileSystem.documentDirectory ?? ""}models/`;

export const modelPath = (m: ModelSpec) => `${DIR}${m.fileName}`;
export const deviceRam = (): number | null => Device.totalMemory;
export const deviceName = (): string => Device.modelName ?? "Unbekanntes Gerät";

export async function freeDisk(): Promise<number | null> {
  if (Platform.OS === "web") return null;
  try {
    return await FileSystem.getFreeDiskStorageAsync();
  } catch {
    return null;
  }
}

export interface InstalledInfo {
  installed: boolean;
  bytes: number;
}

export async function modelInfo(m: ModelSpec): Promise<InstalledInfo> {
  if (Platform.OS === "web") return { installed: false, bytes: 0 };
  const info = await FileSystem.getInfoAsync(modelPath(m));
  const bytes = info.exists && "size" in info ? (info.size ?? 0) : 0;
  // Vollständig nur bei exakter Größe – halbe Downloads werden nicht als „installiert“ gezählt.
  return { installed: info.exists && bytes === m.sizeBytes, bytes };
}

export async function modelExists(m: ModelSpec): Promise<boolean> {
  return (await modelInfo(m)).installed;
}

export async function deleteModel(m: ModelSpec) {
  await FileSystem.deleteAsync(modelPath(m), { idempotent: true });
}

export type DownloadState = { status: "läuft" | "pausiert" | "fertig" | "fehler"; written: number; total: number; error?: string };

/** Fortsetzbarer Download; der Fortsetzungsstand wird pro Modell gemerkt (auch über App-Neustarts im selben Lauf). */
const resumable = new Map<string, FileSystem.DownloadResumable>();
const resumeData = new Map<string, string>();

export async function startDownload(m: ModelSpec, onProgress: (s: DownloadState) => void): Promise<DownloadState> {
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  let dl = resumable.get(m.id);
  if (!dl) {
    dl = FileSystem.createDownloadResumable(
      m.url,
      modelPath(m),
      {},
      (p) => onProgress({ status: "läuft", written: p.totalBytesWritten, total: p.totalBytesExpectedToWrite || m.sizeBytes }),
      resumeData.get(m.id),
    );
    resumable.set(m.id, dl);
  }
  try {
    const res = resumeData.has(m.id) ? await dl.resumeAsync() : await dl.downloadAsync();
    if (!res) return { status: "pausiert", written: 0, total: m.sizeBytes };
    resumable.delete(m.id);
    resumeData.delete(m.id);
    const info = await modelInfo(m);
    if (!info.installed) {
      await deleteModel(m);
      return { status: "fehler", written: info.bytes, total: m.sizeBytes, error: `Datei unvollständig (${info.bytes} von ${m.sizeBytes} Bytes) – bitte erneut laden.` };
    }
    return { status: "fertig", written: m.sizeBytes, total: m.sizeBytes };
  } catch (e) {
    return { status: "fehler", written: 0, total: m.sizeBytes, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function pauseDownload(m: ModelSpec) {
  const dl = resumable.get(m.id);
  if (!dl) return;
  const r = await dl.pauseAsync();
  if (r.resumeData) resumeData.set(m.id, r.resumeData);
}

export function isDownloading(m: ModelSpec) {
  return resumable.has(m.id) && !resumeData.has(m.id);
}

export const catalog = MODEL_CATALOG;
