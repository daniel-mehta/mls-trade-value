export interface BrowserDownload {
  document: Document;
  Blob: typeof Blob;
  URL: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
}

export type DownloadResult =
  | { kind: "success" }
  | { kind: "failure"; reason: "create" | "download"; error: unknown };

const browserDownload = (): BrowserDownload => ({ document, Blob, URL });

/** Keeps Blob/URL/DOM effects out of formatter and session modules. */
export function downloadBrowserFile(
  content: string,
  filename: string,
  mimeType: string,
  environment: BrowserDownload = browserDownload(),
): DownloadResult {
  let objectUrl: string | undefined;
  let anchor: HTMLAnchorElement | undefined;
  try {
    const blob = new environment.Blob([content], { type: mimeType });
    objectUrl = environment.URL.createObjectURL(blob);
    anchor = environment.document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = "none";
    environment.document.body.append(anchor);
    anchor.click();
    return { kind: "success" };
  } catch (error) {
    return { kind: "failure", reason: objectUrl ? "download" : "create", error };
  } finally {
    anchor?.remove();
    if (objectUrl) {
      try { environment.URL.revokeObjectURL(objectUrl); } catch { /* best-effort cleanup */ }
    }
  }
}
