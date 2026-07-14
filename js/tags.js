export function parseTagInput(raw) {
  if (!raw) return [];
  const parts = raw.split(/[,、\n]/).map((s) => s.trim()).filter(Boolean);
  return [...new Set(parts)];
}

export function formatTagInput(tags) {
  return (tags || []).join(', ');
}

export function buildTagCloud(works, field) {
  const counts = new Map();
  for (const w of works) {
    for (const v of w[field] || []) {
      counts.set(v, (counts.get(v) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}
