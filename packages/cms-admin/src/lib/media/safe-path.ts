/**
 * F206.7 — a media folder/name may never point outside the uploads area.
 *
 * Every mutating media call (upload, rename, delete, trash) takes `folder` and
 * `name` from the request. Without this check `folder: "../secret"` or
 * `oldName: "../uploads/x"` let an editor overwrite or delete any file the
 * server can write. One validator, used by both adapters, so the filesystem
 * and the GitHub repo refuse the same inputs.
 */

export class UnsafeMediaPathError extends Error {
  readonly code = "EBADPATH";
  constructor(what: string) {
    super(`Invalid media path: ${what}`);
    this.name = "UnsafeMediaPathError";
  }
}

const isUnsafeSegment = (s: string) =>
  s === "" || s === "." || s === ".." || s.includes("\\") || s.includes("\0");

/** folder may be "" or nested ("a/b"); name is a single path segment. */
export function assertSafeMediaPath(folder: string, name?: string): void {
  if (folder) {
    if (folder.startsWith("/") || folder.split("/").some(isUnsafeSegment)) {
      throw new UnsafeMediaPathError(folder);
    }
  }
  if (name !== undefined && (name.includes("/") || isUnsafeSegment(name))) {
    throw new UnsafeMediaPathError(name);
  }
}
