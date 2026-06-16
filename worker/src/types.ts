/** Shared shapes for the ZipSnap capture engine. */

export interface ManifestIssue {
  type: "error" | "warning";
  code: string;
  message: string;
  fix: string;
}

export interface ManifestHealth {
  issues: ManifestIssue[];
}

/** What we learn from reading the extension's manifest. */
export interface ExtensionMeta {
  id: string;
  name: string;
  version: string;
  description: string;
  manifestVersion: number;
  /** Combined permissions + host_permissions, for Phase 2's AI copy. */
  permissions: string[];
}

/** Which UI surfaces the manifest says exist, and where their files live. */
export interface DetectedSurfaces {
  popup: string | null; // relative path to popup html, if any
  optionsPage: string | null; // relative path to options page, if any
  hasContentScripts: boolean;
  /** Absolute path to the 128px icon on disk, if declared. */
  iconPath: string | null;
}

/** Record of a single captured screen. */
export interface CapturedSurface {
  exists: boolean;
  /** The manifest file or demo URL this came from. */
  source: string | null;
  /** Screenshot filename (relative to the output folder), if captured. */
  screenshot: string | null;
  size: { width: number; height: number } | null;
  /** Why it was skipped, if it was. */
  note?: string;
}

/** The full structured result, written to output/capture.json. */
export interface CaptureResult {
  extension: ExtensionMeta;
  brandColor: string; // hex, e.g. "#6d5efc"
  surfaces: {
    popup: CapturedSurface;
    options: CapturedSurface;
    contentOverlay: CapturedSurface;
  };
  manifestHealth: ManifestHealth;
  capturedAt: string; // ISO timestamp
}
