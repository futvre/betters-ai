import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
  if (!key) return NextResponse.json({
    status: "not_configured", model,
    error: "No Gemini API key is configured in Vercel.",
  }, { status: 503 });

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(model) + "?key=" + encodeURIComponent(key),
      { method: "GET", cache: "no-store", signal: AbortSignal.timeout(10000) }
    );
    if (!response.ok) {
      let error = "";
      try {
        const data = await response.json() as { error?: { message?: string; status?: string } };
        error = data.error?.message || data.error?.status || "";
      } catch { /* Keep the HTTP status only. */ }
      return NextResponse.json({
        status: "error", model, httpStatus: response.status,
        error: error.slice(0, 220) || "Gemini rejected the configured key or model.",
      }, { status: 502 });
    }
    const data = await response.json() as { name?: string; displayName?: string };
    return NextResponse.json({
      status: "connected", model, modelName: data.displayName || data.name || model,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      status: "unreachable", model,
      error: "Could not reach Google's Gemini API.",
    }, { status: 502 });
  }
}
