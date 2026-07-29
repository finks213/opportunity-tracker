// @ts-check
/**
 * Pre-declaration calibration sweep, retained as evidence for DECISIONS.md D-009
 * and D-010.
 *
 * This is the script that selected `zoneCapacity`. It was run BEFORE
 * CHARACTERIZATION_PLAN.md was frozen and is NOT the declared characterization
 * batch: it uses seeds 1..40 (and a later 1..12 pass) purely to find a capacity
 * that can satisfy the §21.4 median-population band. It informed exactly one
 * constant and nothing else.
 *
 * It is kept in the audit bundle rather than deleted because §27 forbids
 * excluding superseded tuning material just because it looks unhelpful.
 *
 * Usage: node tools/calibrationSweep.mjs
 */

import { createInitialState } from "../src/core/individual.js";
import { runGenerations, isExtinct } from "../src/core/simulation.js";
import { computeZoneLoads } from "../src/core/survival.js";
import { currentModelConfig } from "../src/config/modelConfig.js";
import { ordinaryMedian } from "../src/core/math.js";
function trial(overrides, seeds){
  const cfg = {...currentModelConfig, ...overrides};
  const pops=[], concs=[]; let extinct=0; const zoneMed=[[],[],[]];
  for(const s of seeds){
    const st = createInitialState(s, cfg);
    runGenerations(st, 180, cfg);
    if(isExtinct(st)){extinct++; continue;}
    const load = computeZoneLoads(st.currentIndividuals,3);
    const tot = load[0]+load[1]+load[2];
    pops.push(st.currentIndividuals.length);
    concs.push(Math.max(...load)/tot);
    for(let z=0;z<3;z++) zoneMed[z].push(load[z]);
  }
  return { extinctPct:(extinct/seeds.length*100).toFixed(1),
    medPop: pops.length?ordinaryMedian(pops).toFixed(0):"NA",
    medConc: concs.length?ordinaryMedian(concs).toFixed(3):"NA",
    zoneMed: zoneMed.map(a=>a.length?ordinaryMedian(a).toFixed(1):"NA") };
}
const seeds=[]; for(let s=1;s<=40;s++) seeds.push(s);
for(const cap of [90,70,55,45]){
  for(const fzOff of [0.0,0.3,0.6]){
    const fz = currentModelConfig.fitnessZero.map(x=>x+fzOff);
    const r = trial({zoneCapacity:[cap,cap,cap], fitnessZero:fz}, seeds);
    console.log(`cap=${cap} fzOff=${fzOff}  medPop=${r.medPop} ext%=${r.extinctPct} medConc=${r.medConc} zoneMed=[${r.zoneMed}]`);
  }
}
