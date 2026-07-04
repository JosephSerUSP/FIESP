/**
 * FiespWarper
 * Maps input content onto the FIESP building's UV layout using a "cut and slide"
 * approach: for each row, the three panels are joined into a continuous strip and
 * the source image is sampled uniformly across that strip. This preserves object
 * proportions — a circle remains a circle — while the triangular gap zones at the
 * upper corners are simply left black (discarded pixels).
 *
 * Calibrated to FiespScreen.glb TEXCOORD_2 panel corner coordinates.
 */
export class FiespWarper {
  constructor(sourceCanvas, targetCanvas) {
    this.sourceCanvas = sourceCanvas;
    this.targetCanvas = targetCanvas;
    this.sourceCtx = sourceCanvas.getContext('2d');
    this.targetCtx = targetCanvas.getContext('2d');

    this.params = {
      useGrid: true
    };

    // Active region height in output canvas pixels
    this.activeH = 297.0;

    // Panel corner X coordinates extracted from the calibrated UV map.
    // _T = top (y=0), _B = bottom (y=activeH).
    // Left panel
    this.L_Tx1 = 0.499;    this.L_Tx2 = 77.504;
    this.L_Bx1 = 0.499;    this.L_Bx2 = 173.555;
    // Middle panel
    this.M_Tx1 = 241.497;  this.M_Tx2 = 347.494;
    this.M_Bx1 = 199.846;  this.M_Bx2 = 395.097;
    // Right panel
    this.R_Tx1 = 513.497;  this.R_Tx2 = 542.502;
    this.R_Bx1 = 419.993;  this.R_Bx2 = 542.502;
  }

  updateParams(newParams) {
    this.params = { ...this.params, ...newParams };
  }

  warp() {
    const w = this.targetCanvas.width;   // 1280
    const h = this.targetCanvas.height;  // 720

    const srcW = this.sourceCanvas.width;
    const srcH = this.sourceCanvas.height;
    if (srcW === 0 || srcH === 0) return;

    const srcImgData = this.sourceCtx.getImageData(0, 0, srcW, srcH);
    const destImgData = this.targetCtx.createImageData(w, h);
    const destData = destImgData.data;
    const srcData = srcImgData.data;

    const activeH = this.activeH;

    // Reference total width: the bottom row (widest), used as a fixed scale denominator
    const wL_ref = this.L_Bx2 - this.L_Bx1;  // ~173.056
    const wM_ref = this.M_Bx2 - this.M_Bx1;  // ~195.251
    const wR_ref = this.R_Bx2 - this.R_Bx1;  // ~122.509
    const wTotal_ref = wL_ref + wM_ref + wR_ref; // ~490.816

    for (let dy = 0; dy < h; dy++) {
      if (dy >= activeH) continue;

      // t=0 at top row (dy=0), t=1 at bottom row (dy=activeH)
      const t = dy / activeH;

      // Interpolated panel edge X positions at this row
      const xL1 = this.L_Tx1 + (this.L_Bx1 - this.L_Tx1) * t;
      const xL2 = this.L_Tx2 + (this.L_Bx2 - this.L_Tx2) * t;
      const xM1 = this.M_Tx1 + (this.M_Bx1 - this.M_Tx1) * t;
      const xM2 = this.M_Tx2 + (this.M_Bx2 - this.M_Tx2) * t;
      const xR1 = this.R_Tx1 + (this.R_Bx1 - this.R_Tx1) * t;
      const xR2 = this.R_Tx2 + (this.R_Bx2 - this.R_Tx2) * t;

      // Panel widths at this row
      const wL = xL2 - xL1;
      const wM = xM2 - xM1;
      const wR = xR2 - xR1;
      const wTotal = wL + wM + wR;

      // Vertical source coordinate: uniform, top-to-bottom
      const v_sample = t;

      for (let dx = 0; dx < w; dx++) {
        // Determine which panel this pixel belongs to,
        // and compute its position in the "flat joined" strip.
        let flatX = -1;

        if (dx >= xL1 && dx < xL2) {
          flatX = dx - xL1;
        } else if (dx >= xM1 && dx < xM2) {
          flatX = wL + (dx - xM1);
        } else if (dx >= xR1 && dx <= xR2) {
          flatX = wL + wM + (dx - xR1);
        }

        if (flatX < 0) continue;

        // Sample the source using a FIXED scale (bottom row width).
        // Center the strip: the midpoint of the joined strip at this row
        // maps to u=0.5 in the source image.
        const u_sample = 0.5 + (flatX - wTotal / 2) / wTotal_ref;

        // Discard if outside the source image bounds
        if (u_sample < 0 || u_sample > 1) continue;

        const spx = Math.max(0, Math.min(u_sample * (srcW - 1), srcW - 1));
        const spy = Math.max(0, Math.min(v_sample * (srcH - 1), srcH - 1));

        // Bilinear interpolation
        const x0 = Math.floor(spx);
        const x1 = Math.min(x0 + 1, srcW - 1);
        const y0 = Math.floor(spy);
        const y1 = Math.min(y0 + 1, srcH - 1);
        const tx = spx - x0;
        const ty = spy - y0;

        const getPixel = (x, y, c) => srcData[((y * srcW) + x) * 4 + c];
        const destIdx = (dy * w + dx) * 4;

        for (let c = 0; c < 4; c++) {
          destData[destIdx + c] =
            getPixel(x0, y0, c) * (1 - tx) * (1 - ty) +
            getPixel(x1, y0, c) *      tx  * (1 - ty) +
            getPixel(x0, y1, c) * (1 - tx) *      ty  +
            getPixel(x1, y1, c) *      tx  *      ty;
        }
      }
    }

    this.targetCtx.putImageData(destImgData, 0, 0);
  }
}
