import { NextRequest, NextResponse } from "next/server";
import { getAllForms } from "@/lib/forms/store";
import { TURNSTILE_TEST_SITE_KEY } from "@/lib/forms/spam";

// Public, read-only, embeddable from any origin (same intent as widget.js) —
// this is the runtime delivery point for the Turnstile SITE key (public by
// design) alongside the rest of the field schema.
const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /api/forms/[name]/schema — public form schema.
 *
 * Returns the field definitions so the embeddable widget (and any
 * third-party integration) can render the form without hard-coding fields.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const allForms = await getAllForms();
  const form = allForms.find((f) => f.name === name);
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404, headers: CORS_HEADERS });

  return NextResponse.json(
    {
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
      ...(form.spam?.turnstile === true && {
        turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || TURNSTILE_TEST_SITE_KEY,
      }),
    },
    { headers: CORS_HEADERS },
  );
}
