export type RequiredField = {
  label: string;
  value: unknown;
};

export function findMissingFields(fields: RequiredField[]) {
  return fields
    .filter((field) => {
      if (field.value === null || field.value === undefined) return true;
      if (typeof field.value === "string") return field.value.trim() === "";
      if (typeof field.value === "number") return !Number.isFinite(field.value);
      return false;
    })
    .map((field) => field.label);
}
