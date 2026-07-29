// @ts-check
/**
 * Test-only scripted RNG. Serves scripted uniform draws in order and counts
 * consumption directly, so tests can assert exact draw counts rather than
 * inferring them from RNG-state inequality (required by §20.8).
 *
 * Shares the Rng surface used by production code (nextFloat / nextNormal /
 * clone / toState). Test helper only; never imported by src/.
 */

export class ScriptedRng {
  /**
   * @param {number[]} uniforms scripted uniform draws in [0,1)
   * @param {number[]} [normals] scripted normal draws
   */
  constructor(uniforms, normals = []) {
    this.uniforms = uniforms.slice();
    this.normals = normals.slice();
    this.uniformIndex = 0;
    this.normalIndex = 0;
  }

  /** Uniform draws consumed so far. */
  get drawsConsumed() {
    return this.uniformIndex;
  }

  nextFloat() {
    if (this.uniformIndex >= this.uniforms.length) {
      throw new Error(`ScriptedRng: exhausted uniform draws (requested #${this.uniformIndex + 1})`);
    }
    return this.uniforms[this.uniformIndex++];
  }

  nextNormal() {
    if (this.normalIndex >= this.normals.length) {
      throw new Error(`ScriptedRng: exhausted normal draws (requested #${this.normalIndex + 1})`);
    }
    return this.normals[this.normalIndex++];
  }

  clone() {
    const r = new ScriptedRng(this.uniforms, this.normals);
    r.uniformIndex = this.uniformIndex;
    r.normalIndex = this.normalIndex;
    return r;
  }

  toState() {
    return {
      s: [this.uniformIndex, this.normalIndex, 0, 0],
      hasSpareNormal: false,
      spareNormal: 0,
    };
  }
}
