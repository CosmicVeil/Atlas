// Pure helpers for the schema-driven profile form (fields come from GET /api/profile).

// Number inputs hold strings while typing; convert back before saving.
export function toPayloadValue(field, raw) {
  if (field.type === 'number') {
    return raw === '' ? raw : Number(raw);
  }
  return raw;
}

// Only send fields the user changed, so untouched legacy values are never re-validated.
export function changedValues(fields, saved, draft) {
  const changes = {};
  for (const field of fields) {
    const value = toPayloadValue(field, draft[field.key]);
    if (value !== saved[field.key]) {
      changes[field.key] = value;
    }
  }
  return changes;
}

// Many options read better as a dropdown; a few as chips.
export function usesDropdown(field) {
  return field.type === 'select' && field.options.length > 7;
}
