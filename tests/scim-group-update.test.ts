import { describe, expect, it } from "vitest";
import { parseScimGroupUpdate } from "@/lib/scim-group-update";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const operation = (op: string, value: string) => ({ op, path: "members", value: [{ value }] });

describe("SCIM group update validation", () => {
  it("applies mixed operations to the result of the previous operation", () => {
    expect(parseScimGroupUpdate({ Operations: [operation("add", a), operation("remove", b), operation("add", b)] }, [b]))
      .toEqual({ displayName: undefined, members: [a, b] });
  });
  it("supports pathless attributes, filtered removal, and removing all members", () => {
    expect(parseScimGroupUpdate({ Operations: [
      { op: "Replace", value: { displayName: " Renamed ", members: [{ value: a }, { value: b }] } },
      { op: "remove", path: `members[value eq "${a}"]` },
    ] }, [])).toEqual({ displayName: "Renamed", members: [b] });
    expect(parseScimGroupUpdate({ Operations: [{ op: "remove", path: "members" }] }, [a])?.members).toEqual([]);
  });
  it.each([
    null, [], {}, { members: {} }, { members: [null] }, { members: [{ value: "invalid" }] },
    { displayName: 12 }, { displayName: " " }, { displayName: "x".repeat(256) },
    { Operations: {} }, { Operations: [null] }, { Operations: [{ op: 1, path: "members" }] },
    { Operations: [{ op: "add", path: 42 }] }, { Operations: [{ op: "add", path: "members", value: {} }] },
    { Operations: [{ op: "delete", path: "members" }] }, { Operations: [{ op: "remove", path: "members.bad" }] },
    { Operations: [{ op: "remove", path: 'members[value co "1"]' }] },
    { Operations: [{ op: "remove", path: "displayName" }] },
    { Operations: Array.from({ length: 101 }, () => operation("add", a)) },
    { members: Array.from({ length: 10_001 }, () => ({ value: a })) },
  ])("rejects malformed or unsupported updates: %#", (raw) => {
    expect(parseScimGroupUpdate(raw, [a])).toBeNull();
  });
  it("caps the accumulated membership across individually valid operations", () => {
    const members = Array.from({ length: 10_000 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
    expect(parseScimGroupUpdate({ Operations: [operation("add", a)] }, members)).toBeNull();
  });
});
