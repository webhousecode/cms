import { NextRequest, NextResponse } from "next/server";
import { getAllForms } from "@/lib/forms/store";
import { deleteAdminForm } from "@/lib/forms/store";
import { denyViewers } from "@/lib/require-role";

/** GET /api/admin/forms/[name] — full form config (for the builder). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const forms = await getAllForms();
  const form = forms.find((f) => f.name === name);
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 });
  return NextResponse.json({ form });
}

/** DELETE /api/admin/forms/[name] — delete an admin-defined form. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const denied = await denyViewers(); if (denied) return denied;
  const { name } = await params;
  try {
    await deleteAdminForm(name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
