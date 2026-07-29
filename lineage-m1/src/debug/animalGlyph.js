// @ts-check
/**
 * Procedural animal glyph drawn from biological state (contract §22, and the
 * North Star §13 requirement that appearance be generated from the genome
 * rather than swapped between unrelated sprites).
 *
 * Pure rendering. Never writes to biology. Canvas position comes from time
 * allocation plus uiRng jitter only, and never feeds back into the model.
 */

import { TRAIT_INDEX } from "../config/traits.js";

const T = TRAIT_INDEX;

/**
 * Draw one animal at (x, y).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} scale base body length in pixels
 * @param {ArrayLike<number>} genome length 10
 * @param {Object} [opts]
 * @param {boolean} [opts.focal] draw the non-colour focal marker (§22)
 * @param {boolean} [opts.selected]
 */
export function drawAnimal(ctx, x, y, scale, genome, opts = {}) {
  const webbing = genome[T.toe_webbing];
  const claws = genome[T.curved_claws];
  const fur = genome[T.dense_fur];
  const hind = genome[T.long_hindlimbs];
  const tail = genome[T.strong_tail];
  const eyes = genome[T.large_eyes];
  const streamline = genome[T.streamlined_body];
  const coatShade = genome[T.coat_shade];
  const earTip = genome[T.ear_tip_shape];
  const tailTip = genome[T.tail_tip_marking];

  // Body: streamlining makes it longer and narrower; fur makes it thicker.
  const bodyLength = scale * (0.9 + 0.5 * streamline);
  const bodyHeight = scale * (0.42 + 0.30 * fur - 0.12 * streamline);

  // Coat shade is a neutral trait: it may be visually detectable but must not
  // change any biological path. Rendered as lightness only.
  const light = 30 + Math.round(coatShade * 45);
  const bodyFill = `hsl(28, 30%, ${light}%)`;

  ctx.save();
  ctx.translate(x, y);

  // --- tail ---
  const tailLength = scale * (0.35 + 0.75 * tail);
  ctx.beginPath();
  ctx.moveTo(-bodyLength * 0.45, 0);
  ctx.quadraticCurveTo(
    -bodyLength * 0.45 - tailLength * 0.6,
    -scale * 0.25,
    -bodyLength * 0.45 - tailLength,
    -scale * 0.05
  );
  ctx.lineWidth = Math.max(1, scale * (0.06 + 0.14 * tail));
  ctx.strokeStyle = bodyFill;
  ctx.stroke();
  // Neutral tail-tip marking: a small contrasting cap.
  if (tailTip > 0.55) {
    ctx.beginPath();
    ctx.arc(-bodyLength * 0.45 - tailLength, -scale * 0.05, Math.max(1, scale * 0.08), 0, Math.PI * 2);
    ctx.fillStyle = `hsl(28, 20%, ${Math.min(92, light + 35)}%)`;
    ctx.fill();
  }

  // --- fur halo (thermal retention reads as a soft outline) ---
  if (fur > 0.5) {
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyLength * 0.55, bodyHeight * 0.62 + scale * 0.08 * fur, 0, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(28, 25%, ${light + 12}%, 0.35)`;
    ctx.fill();
  }

  // --- body ---
  ctx.beginPath();
  ctx.ellipse(0, 0, bodyLength * 0.5, bodyHeight * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyFill;
  ctx.fill();

  // --- hind limb (leaping/land mobility) ---
  const hindLength = scale * (0.18 + 0.42 * hind);
  ctx.beginPath();
  ctx.moveTo(-bodyLength * 0.15, bodyHeight * 0.35);
  ctx.lineTo(-bodyLength * 0.15 - hindLength * 0.4, bodyHeight * 0.35 + hindLength);
  ctx.lineWidth = Math.max(1, scale * 0.09);
  ctx.strokeStyle = bodyFill;
  ctx.stroke();

  // --- foot: webbing vs claws. This is the trait the iPad legibility test
  //     asks a human to identify, so it is drawn deliberately large. ---
  const footX = -bodyLength * 0.15 - hindLength * 0.4;
  const footY = bodyHeight * 0.35 + hindLength;
  const footSpan = scale * (0.12 + 0.55 * webbing);
  ctx.beginPath();
  ctx.moveTo(footX, footY);
  ctx.lineTo(footX + footSpan, footY + scale * 0.10);
  ctx.lineTo(footX + footSpan * 0.55, footY + scale * 0.22);
  ctx.closePath();
  // Webbed feet read as a filled fan; unwebbed feet as a thin outline.
  if (webbing >= 0.45) {
    ctx.fillStyle = `hsl(200, 45%, ${Math.min(80, light + 25)}%)`;
    ctx.fill();
    // Explicit web struts so the difference survives greyscale and small size.
    ctx.beginPath();
    for (let k = 1; k <= 3; k++) {
      ctx.moveTo(footX, footY);
      ctx.lineTo(footX + footSpan * (k / 3), footY + scale * 0.10 * (k / 3) + scale * 0.04 * k);
    }
    ctx.lineWidth = Math.max(0.6, scale * 0.03);
    ctx.strokeStyle = `hsl(200, 40%, 30%)`;
    ctx.stroke();
  } else {
    ctx.lineWidth = Math.max(0.6, scale * 0.035);
    ctx.strokeStyle = bodyFill;
    ctx.stroke();
  }

  // --- claws (canopy grip) ---
  if (claws > 0.45) {
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const cx = bodyLength * 0.36 + k * scale * 0.05;
      ctx.moveTo(cx, bodyHeight * 0.30);
      ctx.lineTo(cx + scale * 0.10 * claws, bodyHeight * 0.30 + scale * 0.16 * claws);
    }
    ctx.lineWidth = Math.max(0.6, scale * 0.035);
    ctx.strokeStyle = `hsl(35, 15%, 82%)`;
    ctx.stroke();
  }

  // --- head, ear, eye ---
  const headR = scale * 0.20;
  const headX = bodyLength * 0.44;
  ctx.beginPath();
  ctx.arc(headX, -bodyHeight * 0.12, headR, 0, Math.PI * 2);
  ctx.fillStyle = bodyFill;
  ctx.fill();

  // Neutral ear-tip shape: rounded vs pointed. No biological effect.
  ctx.beginPath();
  if (earTip > 0.5) {
    ctx.moveTo(headX - headR * 0.3, -bodyHeight * 0.12 - headR * 0.8);
    ctx.lineTo(headX, -bodyHeight * 0.12 - headR * 1.9);
    ctx.lineTo(headX + headR * 0.4, -bodyHeight * 0.12 - headR * 0.7);
  } else {
    ctx.arc(headX, -bodyHeight * 0.12 - headR * 1.1, headR * 0.5, 0, Math.PI * 2);
  }
  ctx.fillStyle = bodyFill;
  ctx.fill();

  // Eye size scales with the large_eyes trait.
  const eyeR = Math.max(0.8, scale * (0.035 + 0.075 * eyes));
  ctx.beginPath();
  ctx.arc(headX + headR * 0.35, -bodyHeight * 0.16, eyeR, 0, Math.PI * 2);
  ctx.fillStyle = "#0d0d10";
  ctx.fill();

  // --- focal marker: non-colour, per §22 and North Star §17 ---
  if (opts.focal) {
    ctx.beginPath();
    ctx.moveTo(0, -bodyHeight * 0.5 - scale * 0.55);
    ctx.lineTo(-scale * 0.16, -bodyHeight * 0.5 - scale * 0.22);
    ctx.lineTo(scale * 0.16, -bodyHeight * 0.5 - scale * 0.22);
    ctx.closePath();
    ctx.fillStyle = "#f2f2f2";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#12141a";
    ctx.stroke();
  }

  if (opts.selected) {
    ctx.beginPath();
    ctx.arc(0, 0, bodyLength * 0.62, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#ffffff";
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

/** Approximate hit radius for click-to-inspect. */
export function glyphHitRadius(scale) {
  return scale * 0.7;
}
