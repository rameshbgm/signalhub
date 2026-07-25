import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin-guard";
import { apiError, routeError } from "@/lib/api-response";
import { assetStorageForDriver } from "@/lib/asset-storage";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireCapability("organization.manage");
    const { id } = await params;
    const job = await collections.dataExportJobs().findOne({
      _id: oid(id),
      orgId: oid(session.orgId),
      status: "SUCCEEDED",
    });
    if (!job?.storageKey || !job.storageDriver) {
      return apiError(404, "EXPORT_NOT_FOUND", "Completed export not found");
    }
    const bytes = await assetStorageForDriver(job.storageDriver).get(job.storageKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="status-export-${job.orgId.toHexString()}-${job._id.toHexString()}.json.gz"`,
        "content-length": String(bytes.length),
        "cache-control": "no-store",
        "x-content-sha256": job.checksum ?? "",
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
