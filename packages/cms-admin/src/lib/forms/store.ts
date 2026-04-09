/**
 * F30 — Admin-defined form storage.
 *
 * Forms can come from two sources:
 *   1. cms.config.ts → `config.forms` (code-defined, read-only in admin)
 *   2. _data/forms.json → admin-created forms (editable in admin UI)
 *
 * This module manages source 2 and provides a merged view that combines both.
 * Name collisions: config-defined wins (code is the source of truth).
 */

import fs from "fs/promises";
import path from "path";
import type { FormConfig } from "@webhouse/cms";
import { getActiveSitePaths } from "../site-paths";
import { getAdminConfig } from "../cms";

function formsFilePath(dataDir: string): string {
  return path.join(dataDir, "forms.json");
}

/** Read admin-defined forms from _data/forms.json. */
export async function getAdminForms(): Promise<FormConfig[]> {
  const { dataDir } = await getActiveSitePaths();
  try {
    const raw = await fs.readFile(formsFilePath(dataDir), "utf-8");
    const forms = JSON.parse(raw) as FormConfig[];
    return forms.map((f) => ({ ...f, _source: "admin" as const }));
  } catch {
    return [];
  }
}

/** Save admin-defined forms to _data/forms.json. */
export async function saveAdminForms(forms: FormConfig[]): Promise<void> {
  const { dataDir } = await getActiveSitePaths();
  await fs.mkdir(dataDir, { recursive: true });
  // Strip _source before persisting
  const clean = forms.map(({ _source, ...rest }) => rest);
  await fs.writeFile(formsFilePath(dataDir), JSON.stringify(clean, null, 2));
}

/**
 * Get ALL forms (config + admin), tagged with _source.
 * Config-defined forms take precedence on name collision.
 */
export async function getAllForms(): Promise<FormConfig[]> {
  const config = await getAdminConfig();
  const configForms = (config.forms ?? []).map((f) => ({ ...f, _source: "config" as const }));
  const adminForms = await getAdminForms();

  // Merge: config wins on collision
  const configNames = new Set(configForms.map((f) => f.name));
  const merged = [
    ...configForms,
    ...adminForms.filter((f) => !configNames.has(f.name)),
  ];
  return merged;
}

/** Create or update an admin-defined form. Cannot overwrite config-defined forms. */
export async function upsertAdminForm(form: FormConfig): Promise<void> {
  const config = await getAdminConfig();
  const configNames = new Set((config.forms ?? []).map((f) => f.name));
  if (configNames.has(form.name)) {
    throw new Error(`Form "${form.name}" is defined in cms.config.ts and cannot be modified from the admin UI`);
  }
  const forms = await getAdminForms();
  const idx = forms.findIndex((f) => f.name === form.name);
  if (idx >= 0) {
    forms[idx] = form;
  } else {
    forms.push(form);
  }
  await saveAdminForms(forms);
}

/** Delete an admin-defined form. Cannot delete config-defined forms. */
export async function deleteAdminForm(name: string): Promise<void> {
  const config = await getAdminConfig();
  const configNames = new Set((config.forms ?? []).map((f) => f.name));
  if (configNames.has(name)) {
    throw new Error(`Form "${name}" is defined in cms.config.ts and cannot be deleted from the admin UI`);
  }
  const forms = await getAdminForms();
  const filtered = forms.filter((f) => f.name !== name);
  if (filtered.length === forms.length) throw new Error("Form not found");
  await saveAdminForms(filtered);
}
