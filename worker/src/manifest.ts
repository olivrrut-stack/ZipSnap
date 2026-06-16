import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import JSON5 from "json5";
import type { DetectedSurfaces, ExtensionMeta, ManifestHealth } from "./types";

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

/** Deterministic pre-submission health check against the Chrome Web Store's most common rejection causes. */
export function checkManifestHealth(manifest: any): ManifestHealth {
  const issues: ManifestHealth["issues"] = [];
  const mv: number = manifest?.manifest_version;

  if (mv !== 3) {
    issues.push({
      type: "error",
      code: "MV2_DEPRECATED",
      message: `manifest_version is ${mv ?? "(missing)"} — Manifest V2 extensions are rejected by the Chrome Web Store.`,
      fix: "Set manifest_version to 3 and migrate background scripts to a background.service_worker.",
    });
  }

  const csp = manifest?.content_security_policy;
  const cspPages: string = typeof csp === "string" ? csp : (csp?.extension_pages ?? "");
  if (cspPages.includes("unsafe-eval")) {
    issues.push({
      type: "error",
      code: "CSP_UNSAFE_EVAL",
      message: "'unsafe-eval' in content_security_policy is explicitly blocked by Chrome Web Store policy.",
      fix: "Remove 'unsafe-eval'. Refactor any code that uses eval(), new Function(), or string-argument setTimeout/setInterval.",
    });
  }
  if (cspPages.includes("unsafe-inline")) {
    issues.push({
      type: "warning",
      code: "CSP_UNSAFE_INLINE",
      message: "'unsafe-inline' in content_security_policy weakens security and risks rejection.",
      fix: "Remove 'unsafe-inline'. Move inline scripts to external .js files.",
    });
  }

  if (mv === 3 && Array.isArray(manifest?.background?.scripts)) {
    issues.push({
      type: "error",
      code: "BACKGROUND_SCRIPTS",
      message: "background.scripts is a Manifest V2 pattern not valid in MV3.",
      fix: "Replace background.scripts with background.service_worker pointing to a single bundled JS file.",
    });
  }

  if (!manifest?.description || String(manifest.description).trim() === "") {
    issues.push({
      type: "warning",
      code: "MISSING_DESCRIPTION",
      message: "No 'description' field found in manifest.json.",
      fix: "Add a 'description' field (max 132 characters) explaining what your extension does.",
    });
  }

  return { issues };
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
