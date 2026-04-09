/**
 * F30 — Form submission service.
 *
 * Stores submissions as individual JSON files under
 * `<dataDir>/submissions/<formName>/<id>.json`. One file per submission,
 * newest first when listed.
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type { FormSubmission } from "./types";

export class FormService {
  constructor(private dataDir: string) {}

  private dir(formName: string): string {
    return path.join(this.dataDir, "submissions", formName);
  }

  async list(formName: string, opts?: { status?: FormSubmission["status"] }): Promise<FormSubmission[]> {
    const dir = this.dir(formName);
    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch {
      return [];
    }
    const subs: FormSubmission[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(dir, f), "utf-8");
        const sub = JSON.parse(raw) as FormSubmission;
        if (opts?.status && sub.status !== opts.status) continue;
        subs.push(sub);
      } catch {
        // skip corrupted files
      }
    }
    // newest first
    subs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return subs;
  }

  async get(formName: string, id: string): Promise<FormSubmission | null> {
    try {
      const raw = await fs.readFile(path.join(this.dir(formName), `${id}.json`), "utf-8");
      return JSON.parse(raw) as FormSubmission;
    } catch {
      return null;
    }
  }

  async create(
    formName: string,
    data: Record<string, unknown>,
    meta: { ipHash?: string; userAgent?: string },
  ): Promise<FormSubmission> {
    const dir = this.dir(formName);
    await fs.mkdir(dir, { recursive: true });

    const sub: FormSubmission = {
      id: crypto.randomUUID(),
      form: formName,
      data,
      status: "new",
      ipHash: meta.ipHash,
      userAgent: meta.userAgent,
      createdAt: new Date().toISOString(),
    };

    await fs.writeFile(path.join(dir, `${sub.id}.json`), JSON.stringify(sub, null, 2));
    return sub;
  }

  async updateStatus(formName: string, id: string, status: FormSubmission["status"]): Promise<FormSubmission> {
    const sub = await this.get(formName, id);
    if (!sub) throw new Error("Submission not found");
    sub.status = status;
    if (status === "read" && !sub.readAt) sub.readAt = new Date().toISOString();
    await fs.writeFile(path.join(this.dir(formName), `${id}.json`), JSON.stringify(sub, null, 2));
    return sub;
  }

  async delete(formName: string, id: string): Promise<void> {
    try {
      await fs.unlink(path.join(this.dir(formName), `${id}.json`));
    } catch {
      throw new Error("Submission not found");
    }
  }

  /**
   * Count unread (status=new) submissions across ALL forms.
   * Returns { formName: count }.
   */
  async unreadCounts(): Promise<Record<string, number>> {
    const subsDir = path.join(this.dataDir, "submissions");
    let formDirs: string[];
    try {
      formDirs = await fs.readdir(subsDir);
    } catch {
      return {};
    }

    const counts: Record<string, number> = {};
    for (const name of formDirs) {
      const stat = await fs.stat(path.join(subsDir, name)).catch(() => null);
      if (!stat?.isDirectory()) continue;
      const subs = await this.list(name, { status: "new" });
      if (subs.length > 0) counts[name] = subs.length;
    }
    return counts;
  }

  /** Export all submissions for a form as CSV. */
  async exportCsv(formName: string): Promise<string> {
    const subs = await this.list(formName);
    if (subs.length === 0) return "";

    // Gather all unique data keys across all submissions
    const keys = new Set<string>();
    for (const s of subs) {
      for (const k of Object.keys(s.data)) keys.add(k);
    }
    const dataKeys = Array.from(keys).sort();
    const headers = ["id", "status", "createdAt", "readAt", ...dataKeys];

    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const rows = [headers.join(",")];
    for (const sub of subs) {
      const row = [sub.id, sub.status, sub.createdAt, sub.readAt ?? "", ...dataKeys.map((k) => escape(sub.data[k]))];
      rows.push(row.join(","));
    }
    return rows.join("\n");
  }
}
