import { safeEqual } from "@/lib/server/access";
import { getDb } from "@/lib/server/data";

// Daily Vercel Cron ping (R1): one cheap read so the free Supabase project never
// sits idle for 7 days. Vercel sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  // A short or placeholder secret (e.g. "replace-me") counts as unset.
  if (!secret || secret.length < 16 || !safeEqual(header, `Bearer ${secret}`)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  try {
    const { error } = await getDb().from("destinations").select("id").limit(1);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("keepalive: database read failed:", err instanceof Error ? err.message : err);
    return Response.json({ ok: false }, { status: 500 });
  }
}
