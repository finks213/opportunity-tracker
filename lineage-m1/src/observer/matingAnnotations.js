// @ts-check
/**
 * Derived mating annotations (contract §14.4). Optional debug output produced
 * AFTER a biological mating event exists. Excluded from canonical biological
 * state. Milestone 1 does not use it to declare separation or gene flow.
 */

import { currentZoneBinName } from "./currentZoneBins.js";

export const ANNOTATION_MODEL_VERSION = "lineage-m1-mating-annotation-1";

/**
 * Produce a derived annotation for a biological mating event using a snapshot
 * lookup of individuals by id (for their current zone bins).
 * @param {{id:number, parentAId:number, parentBId:number}} matingEvent
 * @param {Map<number, {timeAllocation:ArrayLike<number>}>} individualsById
 * @returns {{biologicalMatingEventId:number, parentACurrentZoneBin:string|null, parentBCurrentZoneBin:string|null, annotationModelVersion:string}}
 */
export function annotateMatingEvent(matingEvent, individualsById) {
  const a = individualsById.get(matingEvent.parentAId);
  const b = individualsById.get(matingEvent.parentBId);
  return {
    biologicalMatingEventId: matingEvent.id,
    parentACurrentZoneBin: a ? currentZoneBinName(a) : null,
    parentBCurrentZoneBin: b ? currentZoneBinName(b) : null,
    annotationModelVersion: ANNOTATION_MODEL_VERSION,
  };
}
