import { z } from "zod";
import { isDatabaseId } from "@/lib/database-id";

const MAX_MEMBERS = 10_000;
const displayNameSchema = z.string().trim().min(1).max(255);
const membersSchema = z.array(z.object({ value: z.string().refine(isDatabaseId) })).max(MAX_MEMBERS);
const attributesSchema = z.object({
  displayName: displayNameSchema.optional(), members: membersSchema.optional(),
});
const updateSchema = attributesSchema.extend({
  Operations: z.array(z.object({
    op: z.string().toLowerCase().pipe(z.enum(["add", "remove", "replace"])),
    path: z.string().max(256).optional(), value: z.unknown().optional(),
  })).min(1).max(100).optional(),
});

/** Validate the complete update before writing, applying operations in request order. */
export function parseScimGroupUpdate(raw: unknown, previousMembers: string[]) {
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return null;
  let displayName = parsed.data.displayName;
  let members = parsed.data.members?.map((member) => member.value);
  for (const operation of parsed.data.Operations ?? []) {
    const path = operation.path?.toLowerCase();
    const current = members ?? previousMembers;
    if (path === "displayname") {
      if (operation.op === "remove") return null; // Required group attribute.
      const name = displayNameSchema.safeParse(operation.value);
      if (!name.success) return null;
      displayName = name.data;
    } else if (path === "members") {
      if (operation.op === "remove" && operation.value === undefined) members = [];
      else {
        const values = membersSchema.safeParse(operation.value);
        if (!values.success) return null;
        const ids = new Set(values.data.map((member) => member.value));
        members = operation.op === "add" ? [...new Set([...current, ...ids])]
          : operation.op === "remove" ? current.filter((id) => !ids.has(id)) : [...ids];
      }
    } else if (path === undefined) {
      // Some providers send attribute objects without a path for add/replace.
      if (operation.op === "remove") return null;
      const attributes = attributesSchema.safeParse(operation.value);
      if (!attributes.success || (attributes.data.displayName === undefined && attributes.data.members === undefined)) return null;
      if (attributes.data.displayName !== undefined) displayName = attributes.data.displayName;
      if (attributes.data.members !== undefined) {
        const ids = attributes.data.members.map((member) => member.value);
        members = operation.op === "add" ? [...new Set([...current, ...ids])] : [...new Set(ids)];
      }
    } else {
      // Support the common SCIM filtered removal, but never silently widen its scope.
      const match = operation.path?.match(/^members\[value\s+eq\s+"([^"]+)"\]$/i);
      if (operation.op !== "remove" || !match || !isDatabaseId(match[1]) || operation.value !== undefined) return null;
      members = current.filter((id) => id !== match[1]);
    }
    if (members && members.length > MAX_MEMBERS) return null;
  }
  if (displayName === undefined && members === undefined) return null;
  return { displayName, members: members === undefined ? undefined : [...new Set(members)] };
}
