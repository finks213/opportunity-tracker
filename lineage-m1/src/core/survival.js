// @ts-check
/**
 * Zone-specific survival, density, and composition (contract §10).
 *
 * The `combineZoneSurvival` function is the exact survival combiner tested in
 * §20.12. It must NOT average fitness/load/capacity first: each zone is
 * converted to a survival value independently, then composed by inherited time
 * allocation, then the age multiplier is applied last.
 */

import { clamp, logistic } from "./math.js";
import { zoneFitness } from "./performance.js";

/**
 * Exact survival combiner (contract §10, tested exactly in §20.12).
 *
 * Steps per zone:
 *   pFitZone[z]  = 1 / (1 + exp(-selectionSlope * (fitnessZone[z] - fitnessZero[z])))
 *   densityFactor[z] = 2 * cap[z] / (cap[z] + load[z])
 *   pZone[z] = clamp(pFitZone[z] * densityFactor[z], minZoneSurvival, maxZoneSurvival)
 * Then:
 *   pEcological = sum_z(timeAllocation[z] * pZone[z])
 *   pSurvival = clamp(pEcological * ageMultiplier, minIndividualSurvival, maxIndividualSurvival)
 *
 * @param {Object} p
 * @param {number[]} p.fitnessZone         per-zone fitness
 * @param {number} p.selectionSlope
 * @param {number[]} p.fitnessZero          per-zone
 * @param {number[]} p.zoneCapacity         per-zone
 * @param {number[]} p.zoneLoad             per-zone (pre-survival snapshot)
 * @param {ArrayLike<number>} p.timeAllocation  per-zone, sums to 1
 * @param {number} p.minZoneSurvival
 * @param {number} p.maxZoneSurvival
 * @param {number} p.ageSurvivalMultiplier
 * @param {number} p.minIndividualSurvival
 * @param {number} p.maxIndividualSurvival
 * @returns {{pZone:number[], pFitZone:number[], densityFactor:number[], pEcological:number, pSurvival:number}}
 */
export function combineZoneSurvival(p) {
  const nZones = p.fitnessZone.length;
  const pFitZone = new Array(nZones);
  const densityFactor = new Array(nZones);
  const pZone = new Array(nZones);
  let pEcological = 0;
  for (let z = 0; z < nZones; z++) {
    pFitZone[z] = logistic(p.fitnessZone[z], p.selectionSlope, p.fitnessZero[z]);
    densityFactor[z] = (2 * p.zoneCapacity[z]) / (p.zoneCapacity[z] + p.zoneLoad[z]);
    pZone[z] = clamp(pFitZone[z] * densityFactor[z], p.minZoneSurvival, p.maxZoneSurvival);
    pEcological += p.timeAllocation[z] * pZone[z];
  }
  const pSurvival = clamp(
    pEcological * p.ageSurvivalMultiplier,
    p.minIndividualSurvival,
    p.maxIndividualSurvival
  );
  return { pZone, pFitZone, densityFactor, pEcological, pSurvival };
}

/**
 * Full production survival probability for one individual given the
 * pre-survival zone-load snapshot and versioned config.
 * @param {{bodyGenome:ArrayLike<number>, timeAllocation:ArrayLike<number>, ageGenerations:number}} individual
 * @param {number[]} zoneLoad pre-survival snapshot loads in canonical zone order
 * @param {Object} config currentModelConfig
 * @returns {{pSurvival:number, pZone:number[], pEcological:number, fitnessZone:number[]}}
 */
export function survivalProbability(individual, zoneLoad, config) {
  const fitnessZone = zoneFitness(individual.bodyGenome, config);
  const ageMult =
    individual.ageGenerations < config.ageSurvivalMultiplier.length
      ? config.ageSurvivalMultiplier[individual.ageGenerations]
      : 0;
  const r = combineZoneSurvival({
    fitnessZone,
    selectionSlope: config.selectionSlope,
    fitnessZero: config.fitnessZero,
    zoneCapacity: config.zoneCapacity,
    zoneLoad,
    timeAllocation: individual.timeAllocation,
    minZoneSurvival: config.minZoneSurvival,
    maxZoneSurvival: config.maxZoneSurvival,
    ageSurvivalMultiplier: ageMult,
    minIndividualSurvival: config.minIndividualSurvival,
    maxIndividualSurvival: config.maxIndividualSurvival,
  });
  return {
    pSurvival: r.pSurvival,
    pZone: r.pZone,
    pEcological: r.pEcological,
    fitnessZone,
  };
}

/**
 * Compute zone loads from a living population (§10): zoneLoad[z] = sum of
 * timeAllocation[z] across individuals.
 * @param {Array<{timeAllocation:ArrayLike<number>}>} individuals
 * @param {number} nZones
 * @returns {number[]}
 */
export function computeZoneLoads(individuals, nZones) {
  const load = new Array(nZones).fill(0);
  for (const ind of individuals) {
    for (let z = 0; z < nZones; z++) load[z] += ind.timeAllocation[z];
  }
  return load;
}
