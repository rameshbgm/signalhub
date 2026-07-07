"use client";

import { useState } from "react";

type Component = { id: string; name: string };

function defaultDateTime(offsetHours: number) {
  const d = new Date(Date.now() + offsetHours * 3600 * 1000);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}

export function MaintenanceForm({ action, pageId, components }: { action: (formData: FormData) => void; pageId: string; components: Component[] }) {
  const [selected, setSelected] = useState<string[]>([]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="pageId" value={pageId} />
      <label className="block text-sm">
        <span className="text-xs text-gray-500 block mb-1">Title</span>
        <input name="name" className="w-full border rounded-md px-3 py-2 text-sm" required />
      </label>
      <label className="block text-sm">
        <span className="text-xs text-gray-500 block mb-1">Message</span>
        <textarea name="body" rows={3} className="w-full border rounded-md px-3 py-2 text-sm" />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="text-xs text-gray-500 block mb-1">Start</span>
          <input name="scheduledStart" type="datetime-local" defaultValue={defaultDateTime(24)} className="w-full border rounded-md px-3 py-2 text-sm" required />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-gray-500 block mb-1">End</span>
          <input name="scheduledEnd" type="datetime-local" defaultValue={defaultDateTime(27)} className="w-full border rounded-md px-3 py-2 text-sm" required />
        </label>
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-2">Affected components (set to Under Maintenance during the window)</p>
        <div className="space-y-1 border rounded-md p-3 max-h-56 overflow-y-auto">
          {components.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="componentIds"
                value={c.id}
                checked={selected.includes(c.id)}
                onChange={(e) => setSelected(e.target.checked ? [...selected, c.id] : selected.filter((id) => id !== c.id))}
              />
              {c.name}
            </label>
          ))}
          {components.length === 0 && <p className="text-xs text-gray-400">No components on this page yet.</p>}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="autoTransition" defaultChecked /> Automatically start/complete based on the window above
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="notify" defaultChecked /> Notify subscribers now (and remind before start)
      </label>
      <button className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium">Schedule Maintenance</button>
    </form>
  );
}
