/**
 * Shape the object handed to the desktop automation IPC.
 *
 * Electron structured-clone rejects functions, and the bot component's
 * props include an `onClose` callback. Spreading those props into the
 * IPC payload throws before a run can start and, because the start
 * effect used to depend on `props`, every failed attempt restarted it.
 * Copy only the data fields the worker reads.
 */
export interface DesktopAutomationIpcPayload {
  outline: unknown;
  kdpMarketingInfo: unknown;
  authorProfile: unknown;
  /** Data URL (`data:application/epub+zip;base64,...`), not a Blob. */
  epubBlob: string;
  coverImageUrl: string;
  aiDisclosure: unknown;
}

export function buildDesktopAutomationPayload(
  source: {
    outline: unknown;
    kdpMarketingInfo: unknown;
    authorProfile: unknown;
    coverImageUrl: string;
    aiDisclosure: unknown;
  },
  epubDataUrl: string,
): DesktopAutomationIpcPayload {
  return {
    outline: source.outline,
    kdpMarketingInfo: source.kdpMarketingInfo,
    authorProfile: source.authorProfile,
    epubBlob: epubDataUrl,
    coverImageUrl: source.coverImageUrl,
    aiDisclosure: source.aiDisclosure,
  };
}
