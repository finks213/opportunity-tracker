// @ts-check
/**
 * Genealogy retention and deterministic pruning (contract §15, tested by §20.11).
 *
 * At the end of generation G the retained complete-event window begins at
 *   firstRetainedGeneration = max(0, G - (window - 1))     // window = 360
 * Complete records older than that are pruned unless they belong to a currently
 * living individual. Retained children whose parent left the window resolve to
 * an explicit PrunedAncestorBoundary. No dangling parent id is permitted.
 *
 * Pruning is deterministic and idempotent: a second prune at the same generation
 * produces byte-identical state, and observer actions never affect it.
 */

/**
 * Prune retained genealogy and event arrays for `state` at its current
 * generation, creating boundary records as needed.
 * @param {Object} state biological state (mutated)
 * @param {Object} config provides genealogyRetentionWindow
 * @returns {void}
 */
export function pruneGenealogy(state, config) {
  const window = config.genealogyRetentionWindow;
  const G = state.generation;
  const firstRetained = Math.max(0, G - (window - 1));

  const livingIds = new Set(state.currentIndividuals.map((i) => i.id));

  // Existing boundary coverage (by original individual id) — never recreated.
  const boundaryFor = new Set(state.prunedAncestorBoundaries.map((b) => b.originalIndividualId));

  // 1. Decide which birth records / genealogy entries are retained.
  const keepBirth = (r) => r.generation >= firstRetained || livingIds.has(r.childId);
  state.birthEvents = state.birthEvents.filter(keepBirth);
  state.retainedGenealogy = state.retainedGenealogy.filter(keepBirth);

  // 2. Prune non-parentage event arrays by generation only.
  const keepGen = (e) => e.generation >= firstRetained;
  state.deathEvents = state.deathEvents.filter(keepGen);
  state.biologicalMatingEvents = state.biologicalMatingEvents.filter(keepGen);
  state.bodyMutationEvents = state.bodyMutationEvents.filter(keepGen);
  state.allocationMutationEvents = state.allocationMutationEvents.filter(keepGen);

  // 3. Set of ids whose birth record is still resolvable directly.
  const retainedChildIds = new Set();
  for (const r of state.retainedGenealogy) retainedChildIds.add(r.childId);
  for (const id of livingIds) retainedChildIds.add(id);

  // 4. Create boundary records for parents referenced by a retained child but no
  //    longer resolvable. Deterministic order: ascending child id, then parent
  //    order within the child. boundaryId is derived from array position.
  const sortedChildren = state.retainedGenealogy
    .filter((r) => r.parentIds !== null)
    .slice()
    .sort((a, b) => a.childId - b.childId);
  for (const r of sortedChildren) {
    for (const parentId of r.parentIds) {
      if (retainedChildIds.has(parentId) || boundaryFor.has(parentId)) continue;
      const boundaryId = state.prunedAncestorBoundaries.length + 1;
      state.prunedAncestorBoundaries.push({
        boundaryId,
        originalIndividualId: parentId,
        lastRetainedGeneration: firstRetained - 1,
        reason: "genealogy_retention_boundary",
      });
      boundaryFor.add(parentId);
    }
  }
}

/**
 * Resolve a parent id to either a living/retained individual id or a boundary
 * record. Used by integrity tests (§20.11) to prove no dangling references.
 * @param {Object} state
 * @param {number} parentId
 * @returns {{kind:"retained"}|{kind:"boundary", boundaryId:number}|{kind:"unresolved"}}
 */
export function resolveParent(state, parentId) {
  const inGenealogy = state.retainedGenealogy.some((r) => r.childId === parentId);
  const living = state.currentIndividuals.some((i) => i.id === parentId);
  if (inGenealogy || living) return { kind: "retained" };
  const b = state.prunedAncestorBoundaries.find((x) => x.originalIndividualId === parentId);
  if (b) return { kind: "boundary", boundaryId: b.boundaryId };
  return { kind: "unresolved" };
}
