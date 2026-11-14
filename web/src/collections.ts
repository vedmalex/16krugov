export type CustomBlock = { id: string; title: string; exerciseIds: string[] };
export type Collections = { favorites: string[]; blocks: CustomBlock[] };

const KEY = "articulation-collections";

export function loadCollections(): Collections {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      favorites: Array.isArray(value.favorites) ? value.favorites.filter((id: unknown): id is string => typeof id === "string") : [],
      blocks: Array.isArray(value.blocks) ? value.blocks.filter((block: CustomBlock) => block && typeof block.id === "string" && typeof block.title === "string" && Array.isArray(block.exerciseIds) && block.exerciseIds.every((id: unknown) => typeof id === "string")) : [],
    };
  } catch { return { favorites: [], blocks: [] }; }
}

export function saveCollections(value: Collections): void {
  localStorage.setItem(KEY, JSON.stringify(value));
}
