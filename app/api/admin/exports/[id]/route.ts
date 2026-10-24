import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin-guard";
import { apiError, routeError } from "@/lib/api-response";
import { assetStorageForDriver } from "@/lib/asset-storage";
import { isDatabaseId } from "@/lib/database-id";
import { database } from "@/lib/postgres/client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireCapability("organization.manage");
    const { id } = await params;
    if (!isDatabaseId(id)) return apiError(404, "EXPORT_NOT_FOUND", "Completed export not found");
    const job = await database.selectFrom("dataExportJobs").selectAll()
      .where("id", "=", id).where("orgId", "=", session.orgId)
      .where("status", "=", "SUCCEEDED").executeTakeFirst();
    if (!job?.storageKey || !job.storageDriver) {
      return apiError(404, "EXPORT_NOT_FOUND", "Completed export not found");
    }
    const bytes = await assetStorageForDriver(job.storageDriver).get(job.storageKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="signalhub-export-${job.orgId}-${job.id}.json.gz"`,
        "content-length": String(bytes.length),
        "cache-control": "no-store",
        "x-content-sha256": job.checksum ?? "",
      },
    });
  } catch (error) {
    return routeError(error, { route: "GET /api/admin/exports/:id" });
  }
}
