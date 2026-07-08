import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-6">
      <div>
        <h1 className="text-3xl font-semibold mb-2">Statuspage Platform</h1>
        <p className="text-gray-500 max-w-md">
          A status page & incident communication platform. Create your organization, build a branded status page, run
          incidents, and keep customers informed.
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/signup" className="bg-blue-600 text-white rounded-md px-5 py-2.5 text-sm font-medium">
          Start Free
        </Link>
        <Link href="/admin" className="border rounded-md px-5 py-2.5 text-sm font-medium">
          Admin Console
        </Link>
        <Link href="/acme" className="border rounded-md px-5 py-2.5 text-sm font-medium">
          Demo Status Page
        </Link>
      </div>
      <p className="text-xs text-gray-400">Free plan includes 1 status page and 3 team members — no card required.</p>
    </div>
  );
}
