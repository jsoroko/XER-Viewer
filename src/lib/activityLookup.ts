import type { Activity } from "./xer/model";

/** The activities whose ID (or, failing that, name) matches what was typed: exact ID first, then ID prefix, ID contains, name contains. */
export function findActivities(activities: readonly Activity[], text: string, limit = 6): Activity[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const tiers: Activity[][] = [[], [], [], []];
  for (const a of activities) {
    const code = a.code.toLowerCase();
    const tier = code === q ? 0 : code.startsWith(q) ? 1 : code.includes(q) ? 2 : a.name.toLowerCase().includes(q) ? 3 : -1;
    if (tier >= 0 && tiers[tier]!.length < limit) tiers[tier]!.push(a);
  }
  return tiers.flat().slice(0, limit);
}

/** The one activity whose ID is exactly what was typed (case-insensitive), or undefined. */
export function activityByCode(activities: readonly Activity[], text: string): Activity | undefined {
  const q = text.trim().toLowerCase();
  return q ? activities.find((a) => a.code.toLowerCase() === q) : undefined;
}
