import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import JSON5 from "json5";
import type { DetectedSurfaces, ExtensionMeta } from "./types";

/**
 * Reads and parses an unpacked extension's manifest.json. Chrome's own
 * manifest loader tolerates `//` comments and trailing commas, so some
 * real-world extensions ship manifests that aren't strict JSON — parse with
 * JSON5, which accepts standard JSON too.
 */
export async function readManifest(extensionPath: string): Promise<any> {
  const manifestPath = path.join(extensionPath, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      `No manifest.json found in ${extensionPath} — is that an unpacked extension?`,
    );
  }
  return JSON5.parse(await readFile(manifestPath, "utf8"));
}

/** Pulls the descriptive fields we hand to the AI later. `id` is filled in once known. */
export function extractMeta(manifest: any): Omit<ExtensionMeta, "id"> {
  const permissions = [
    ...(Array.isArray(manifest?.permissions) ? manifest.permissions : []),
    ...(Array.isArray(manifest?.host_permissions) ? manifest.host_permissions : []),
  ];
  return {
    name: manifest?.name ?? "(unnamed)",
    version: manifest?.version ?? "?",
    description: manifest?.description ?? "",
    manifestVersion: manifest?.manifest_version ?? 0,
    permissions,
  };
}

/** Reports which UI surfaces exist, so we only try to capture real ones. */
export function detectSurfaces(manifest: any, extensionPath: string): DetectedSurfaces {
  const popup = manifest?.action?.default_popup ?? null;
  const optionsPage = manifest?.options_page ?? manifest?.options_ui?.page ?? null;
  const hasContentScripts =
    Array.isArray(manifest?.content_scripts) && manifest.content_scripts.length > 0;

  // The 128px icon may be declared under "icons" or "action.default_icon".
  const icon128 =
    manifest?.icons?.["128"] ??
    manifest?.icons?.[128] ??
    manifest?.action?.default_icon?.["128"] ??
    manifest?.action?.default_icon?.[128] ??
    null;
  const iconPath = icon128 ? path.join(extensionPath, icon128) : null;

  return { popup, optionsPage, hasContentScripts, iconPath };
}
