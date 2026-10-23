/**
 * F211.2 — the built-in blocks (Columns, Image, Video …) come from @webhouse/cms
 * with English labels. Their NAMES, field names and option VALUES are stored in
 * documents and must never change (builtin-blocks.ts is an immutable contract);
 * only the LABELS a person reads are swapped for the admin language here, from
 * editor.builtinBlocks.<block>.… in the catalog.
 */
import type { BlockConfig } from "@webhouse/cms";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** The catalog text for `key`, or `fallback` when the catalog has none. */
function pick(t: Translate, key: string, fallback: string | undefined): string | undefined {
  const v = t(key);
  return v === key ? fallback : v;
}

export function localizeBuiltinBlocks(blocks: BlockConfig[], t: Translate): BlockConfig[] {
  return blocks.map((block) => {
    const base = `editor.builtinBlocks.${block.name}`;
    return {
      ...block,
      label: pick(t, `${base}.label`, block.label) ?? block.label,
      fields: block.fields?.map((field) => {
        const fkey = `${base}.fields.${field.name}`;
        const options = (field as { options?: { label: string; value: string }[] }).options;
        return {
          ...field,
          label: pick(t, `${fkey}.label`, field.label),
          ...(options
            ? { options: options.map((o) => ({ ...o, label: pick(t, `${fkey}.options.${o.value}`, o.label) ?? o.label })) }
            : {}),
        };
      }),
    } as BlockConfig;
  });
}
