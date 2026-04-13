import { NextRequest, NextResponse } from "next/server";
import { readBrandVoice, readBrandVoiceVersions, writeBrandVoice, readBrandVoiceForLocale, writeBrandVoiceForLocale } from "@/lib/brand-voice";
import { denyViewers } from "@/lib/require-role";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  if (searchParams.get("versions") === "1") {
    return NextResponse.json(await readBrandVoiceVersions());
  }
  // Per-locale read: ?locale=da
  const locale = searchParams.get("locale");
  if (locale) {
    const bv = await readBrandVoiceForLocale(locale);
    return NextResponse.json(bv);
  }
  return NextResponse.json(await readBrandVoice() ?? null);
}

export async function POST(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  try {
    const body = await request.json();
    // Per-locale save: { locale: "da", brandVoice: {...} }
    if (body.locale && body.brandVoice) {
      await writeBrandVoiceForLocale(body.locale, body.brandVoice);
      return NextResponse.json({ ok: true, locale: body.locale });
    }
    const saved = await writeBrandVoice(body);
    return NextResponse.json(saved);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save" }, { status: 500 });
  }
}
