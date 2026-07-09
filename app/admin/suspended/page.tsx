import { LogoutButton } from "@/components/admin/LogoutButton";

export default function OrgSuspendedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md text-center space-y-3 bg-white border rounded-lg p-8">
        <h1 className="text-lg font-semibold text-red-700">Organization suspended</h1>
        <p className="text-sm text-gray-600">
          This organization has been suspended by a platform administrator. Contact support if you believe this is a mistake.
        </p>
        <LogoutButton />
      </div>
    </div>
  );
}
