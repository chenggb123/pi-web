import { requireRole } from "@/lib/user-auth";
import { testConnection } from "@/lib/wechat-work";

export const dynamic = "force-dynamic";

// POST /api/admin/wechat-test — test WeChat Work connection
export async function POST(req: Request) {
  const auth = requireRole(req, "models:write");
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as { corpId?: string; corpSecret?: string };
    if (!body.corpId || !body.corpSecret) {
      return Response.json({ ok: false, message: "Corp ID and Corp Secret are required" });
    }
    const result = await testConnection(body.corpId, body.corpSecret);
    return Response.json(result);
  } catch (e) {
    return Response.json({ ok: false, message: String(e) });
  }
}
