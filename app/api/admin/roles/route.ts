import { getAllRoles, saveRole, deleteRole, requireRole, getDefaultRoleId } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

// GET /api/admin/roles — list all roles
export async function GET(req: Request) {
  const auth = requireRole(req, "users:manage");
  if (!auth.ok) return auth.response;
  return Response.json({ roles: getAllRoles() });
}

// PUT /api/admin/roles — create or update a role
export async function PUT(req: Request) {
  const auth = requireRole(req, "users:manage");
  if (!auth.ok) return auth.response;

  let body: { id?: string; label?: string; permissions?: string[]; isDefault?: boolean };
  try {
    body = (await req.json()) as { id?: string; label?: string; permissions?: string[]; isDefault?: boolean };
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.id?.trim()) return Response.json({ error: "Role ID is required" }, { status: 400 });
  if (!body.label?.trim()) return Response.json({ error: "Role label is required" }, { status: 400 });

  saveRole(body.id.trim(), body.label.trim(), body.permissions ?? [], body.isDefault ?? false);
  return Response.json({ success: true });
}

// DELETE /api/admin/roles — delete a role
export async function DELETE(req: Request) {
  const auth = requireRole(req, "users:manage");
  if (!auth.ok) return auth.response;

  let body: { id?: string };
  try {
    body = (await req.json()) as { id?: string };
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.id) return Response.json({ error: "Role ID is required" }, { status: 400 });
  if (await deleteRole(body.id)) {
    return Response.json({ success: true });
  }
  return Response.json({ error: "Cannot delete the last role" }, { status: 400 });
}
