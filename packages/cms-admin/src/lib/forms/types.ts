/** F30 — Form submission types. */

export interface FormSubmission {
  id: string;
  form: string;
  data: Record<string, unknown>;
  status: "new" | "read" | "archived";
  /** SHA-256 prefix of IP — enough for rate limiting, not trackable. */
  ipHash?: string;
  userAgent?: string;
  createdAt: string;
  readAt?: string;
}
