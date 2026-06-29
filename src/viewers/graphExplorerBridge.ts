/**
 * Tiny bridge so the genome browser (deep inside the viewer widget tree) can ask
 * the extension to open the Graph Explorer for a clicked entity, without threading
 * a callback through the docregistry factory chain. index.ts registers the handler
 * once it has `app` + the Graph Explorer factory in scope.
 */

type Entity = { id: string; type: string };
let handler: ((entity: Entity) => void) | null = null;

export function setOpenInGraphHandler(h: ((entity: Entity) => void) | null): void {
  handler = h;
}

export function openInGraph(entity: Entity): void {
  handler?.(entity);
}
