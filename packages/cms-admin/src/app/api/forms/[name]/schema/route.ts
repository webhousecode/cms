import { NextRequest, NextResponse } from "next/server";
import { getAdminConfig } from "@/lib/cms";

/**
 * GET /api/forms/[name]/schema — public form schema.
 *
 * Returns the field definitions so the embeddable widget (and any
 * third-party integration) can render the form without hard-coding fields.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const config = await getAdminConfig();
  const form = config.forms?.find((f) => f.name === name);
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 });

  return NextResponse.json({
    name: form.name,
    label: form.label,
    fields: form.fields.map((f) => ({
      name: f.name,
      type: f.type,
      label: f.label,
      required: f.required ?? false,
      placeholder: f.placeholder,
      options: f.options,
      validation: f.validation,
    })),
    successMessage: form.successMessage ?? "Thank you!",
  });
}
