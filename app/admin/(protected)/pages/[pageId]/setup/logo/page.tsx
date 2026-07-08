import Link from "next/link";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { SetupStepper } from "@/components/admin/SetupStepper";
import { LayoutPicker } from "@/components/admin/LayoutPicker";
import { saveSetupBranding } from "../actions";

export default async function SetupLogoPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const pageDoc = await collections.pages().findOne({ _id: oid(pageId) });
  const page = toId(pageDoc!);
  const boundSave = saveSetupBranding.bind(null, pageId);

  return (
    <div>
      <SetupStepper pageId={pageId} current="logo" />
      <h1 className="text-2xl font-semibold">Add your logo</h1>
      <p className="mt-3 text-sm text-gray-600 leading-relaxed max-w-lg">
        Your logo and brand color appear on your public status page and in every notification email. Pick a layout, drop in a
        logo URL, and choose the color that matches your brand.
      </p>

      <form action={boundSave} className="mt-8 space-y-6">
        <LayoutPicker defaultValue={page.layout ?? "STANDARD"} brandColor={page.brandColor} />
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-xs text-gray-500 block mb-1">Logo URL</span>
            <input name="logoUrl" defaultValue={page.logoUrl ?? ""} placeholder="https://.../logo.png" className="w-full border rounded-md px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-gray-500 block mb-1">Brand color</span>
            <input name="brandColor" type="color" defaultValue={page.brandColor} className="h-9 w-20 border rounded-md" />
          </label>
        </div>

        <div className="flex justify-between items-center pt-6 border-t">
          <Link href={`/admin/pages/${pageId}/setup/components`} className="text-sm text-gray-500 hover:text-gray-800">
            ← Back
          </Link>
          <div className="flex gap-3">
            <Link href={`/admin/pages/${pageId}/setup/notifications`} className="text-sm text-gray-500 hover:text-gray-800 self-center">
              Skip
            </Link>
            <button className="bg-blue-600 text-white rounded-md px-5 py-2.5 text-sm font-medium">Next: Notifications →</button>
          </div>
        </div>
      </form>
    </div>
  );
}
