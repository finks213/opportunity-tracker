// @ts-check
/**
 * Click-to-inspect debug panel (contract §22).
 *
 * Read-only view of biological state plus observer-side tracer values. It never
 * writes to biology. Inspected ids live in observer state.
 */

import { TRAITS } from "../config/traits.js";
import { ZONES } from "../config/zones.js";
import { currentZoneBinName } from "../observer/currentZoneBins.js";

/**
 * Render the inspector panel for one individual.
 * @param {HTMLElement} element
 * @param {import("../core/individual.js").Individual|null} individual
 * @param {Object} context
 * @param {Object} context.state biological state (read-only here)
 * @param {import("../observer/tracerChannels.js").ObserverState} context.observer
 * @param {boolean} context.showRawValues
 */
export function renderInspector(element, individual, context) {
  if (!individual) {
    element.innerHTML = `<p class="hint">Click an animal to inspect it.</p>`;
    return;
  }
  const { state, observer, showRawValues } = context;

  const genomeRows = TRAITS.map((name, i) => {
    const v = individual.bodyGenome[i];
    const neutral = i >= 7;
    const bar = Math.round(v * 100);
    return `<tr class="${neutral ? "neutral" : ""}">
      <td>${name}${neutral ? ' <span class="tag">neutral</span>' : ""}</td>
      <td class="num">${showRawValues ? v.toFixed(4) : ""}</td>
      <td class="barcell"><span class="bar" style="width:${bar}%"></span></td>
    </tr>`;
  }).join("");

  const allocRows = ZONES.map((z, i) => {
    const v = individual.timeAllocation[i];
    return `<tr>
      <td>${z}</td>
      <td class="num">${showRawValues ? v.toFixed(6) : `${Math.round(v * 100)}%`}</td>
      <td class="barcell"><span class="bar alloc" style="width:${Math.round(v * 100)}%"></span></td>
    </tr>`;
  }).join("");

  const tracerRows = [...observer.channels.entries()]
    .map(([id, ch]) => {
      const v = ch.values.get(individual.id) ?? 0;
      return `<tr><td>${id}</td><td class="num">${v.toFixed(4)}</td>
        <td>${v >= 0.5 ? "focal" : v > 0 ? "mixed relative" : "no retained contribution"}</td></tr>`;
    })
    .join("");

  const birthEvent = state.birthEvents.find((b) => b.childId === individual.id);
  const bodyMutations = state.bodyMutationEvents.filter((e) => e.childId === individual.id);
  const allocMutations = state.allocationMutationEvents.filter((e) => e.childId === individual.id);

  element.innerHTML = `
    <h3>Individual ${individual.id}</h3>
    <dl class="facts">
      <dt>parents</dt><dd>${individual.parentIds ? individual.parentIds.join(" &amp; ") : "founder"}</dd>
      <dt>born</dt><dd>generation ${individual.birthGeneration}</dd>
      <dt>age</dt><dd>${individual.ageGenerations} generations</dd>
      <dt>current zone bin</dt><dd>${currentZoneBinName(individual)} <span class="tag">debug only</span></dd>
      <dt>birth event</dt><dd>${birthEvent ? birthEvent.id : "pruned"}</dd>
    </dl>

    <h4>Inherited time allocation <span class="tag">immutable at birth</span></h4>
    <table class="traits">${allocRows}</table>

    <h4>Body genome <span class="tag">immutable at birth</span></h4>
    <table class="traits">${genomeRows}</table>

    <h4>Observer tracer channels <span class="tag">outside biology</span></h4>
    ${tracerRows ? `<table class="traits">${tracerRows}</table>` : `<p class="hint">No tracer channels.</p>`}

    <h4>Birth-only variation events</h4>
    ${
      bodyMutations.length === 0 && allocMutations.length === 0
        ? `<p class="hint">No mutation events recorded for this individual.</p>`
        : `<ul class="events">
            ${bodyMutations
              .map(
                (e) =>
                  `<li>body #${e.id} gen ${e.generation}: <strong>${TRAITS[e.traitId]}</strong>
                   ${e.preMutationValue.toFixed(3)} &rarr; ${e.postMutationValue.toFixed(3)}
                   (requested ${e.requestedDelta >= 0 ? "+" : ""}${e.requestedDelta.toFixed(3)})</li>`
              )
              .join("")}
            ${allocMutations
              .map(
                (e) =>
                  `<li>allocation #${e.id} gen ${e.generation}: ${e.fromZone} &rarr; ${e.toZone},
                   realized ${e.realizedTransfer.toFixed(4)} of ${e.requestedTransfer.toFixed(4)}</li>`
              )
              .join("")}
          </ul>`
    }
  `;
}
