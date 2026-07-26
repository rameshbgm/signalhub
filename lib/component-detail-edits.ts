export type ComponentDetailEdit = {
  id: string;
  name: string;
  description: string;
  groupId: string | null;
  visible: boolean;
  showUptime: boolean;
};

export function parseComponentDetailEdits(formData: FormData): ComponentDetailEdit[] {
  const ids = formData.getAll("componentId").map(String);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate component details");
  return ids.map((id) => {
    const name = String(formData.get(`component.${id}.name`) ?? "").trim();
    const description = String(formData.get(`component.${id}.description`) ?? "").trim();
    const groupId = String(formData.get(`component.${id}.groupId`) ?? "").trim() || null;
    if (!name || name.length > 120) {
      throw new Error("Each component name is required and must be 120 characters or fewer");
    }
    if (description.length > 1_000) {
      throw new Error("Component descriptions must be 1,000 characters or fewer");
    }
    return {
      id,
      name,
      description,
      groupId,
      visible: formData.get(`component.${id}.visible`) === "on",
      showUptime: formData.get(`component.${id}.showUptime`) === "on",
    };
  });
}
