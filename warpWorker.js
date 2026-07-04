// Worker for CPU-intensive warping calculations
self.onmessage = function(e) {
  const { srcData, w, h, srcW, srcH, config, qualityStep } = e.data;
  const destData = new Uint8ClampedArray(w * h * 4);
  const activeH = config.activeH;

  const wL_ref = config.L_Bx2 - config.L_Bx1;
  const wM_ref = config.M_Bx2 - config.M_Bx1;
  const wR_ref = config.R_Bx2 - config.R_Bx1;
  const wTotal_ref = wL_ref + wM_ref + wR_ref;

  // With a quality step > 1, we can skip calculating some rows and just duplicate them
  const step = qualityStep || 1;

  for (let dy = 0; dy < h; dy += step) {
    if (dy >= activeH) continue;

    const t = dy / activeH;

    const xL1 = config.L_Tx1 + (config.L_Bx1 - config.L_Tx1) * t;
    const xL2 = config.L_Tx2 + (config.L_Bx2 - config.L_Tx2) * t;
    const xM1 = config.M_Tx1 + (config.M_Bx1 - config.M_Tx1) * t;
    const xM2 = config.M_Tx2 + (config.M_Bx2 - config.M_Tx2) * t;
    const xR1 = config.R_Tx1 + (config.R_Bx1 - config.R_Tx1) * t;
    const xR2 = config.R_Tx2 + (config.R_Bx2 - config.R_Tx2) * t;

    const wL = xL2 - xL1;
    const wM = xM2 - xM1;
    const wR = xR2 - xR1;
    const wTotal = wL + wM + wR;

    const v_sample = t;

    for (let dx = 0; dx < w; dx++) {
      let flatX = -1;

      if (dx >= xL1 && dx < xL2) {
        flatX = dx - xL1;
      } else if (dx >= xM1 && dx < xM2) {
        flatX = wL + (dx - xM1);
      } else if (dx >= xR1 && dx <= xR2) {
        flatX = wL + wM + (dx - xR1);
      }

      if (flatX < 0) continue;

      const u_sample = 0.5 + (flatX - wTotal / 2) / wTotal_ref;

      if (u_sample < 0 || u_sample > 1) continue;

      const spx = Math.max(0, Math.min(u_sample * (srcW - 1), srcW - 1));
      const spy = Math.max(0, Math.min(v_sample * (srcH - 1), srcH - 1));

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

      // If stepping, duplicate this pixel to the rows below
      for(let s = 1; s < step; s++) {
         if (dy + s < h) {
            const dupIdx = ((dy + s) * w + dx) * 4;
            destData[dupIdx] = destData[destIdx];
            destData[dupIdx+1] = destData[destIdx+1];
            destData[dupIdx+2] = destData[destIdx+2];
            destData[dupIdx+3] = destData[destIdx+3];
         }
      }
    }
  }

  // Pass the processed array buffer back
  self.postMessage({ destData: destData.buffer }, [destData.buffer]);
};
