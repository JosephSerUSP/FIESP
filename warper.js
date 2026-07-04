/**
 * FiespWarper
 * Handles the 2D image warping logic to map a rectangular/trapezoidal input
 * into the three-trapezoid split layout matching the FIESP building's UV coordinates.
 * Calibrated and locked to FiespScreen.glb TEXCOORD_2 layout.
 */
export class FiespWarper {
  constructor(sourceCanvas, targetCanvas) {
    this.sourceCanvas = sourceCanvas;
    this.targetCanvas = targetCanvas;
    this.sourceCtx = sourceCanvas.getContext('2d');
    this.targetCtx = targetCanvas.getContext('2d');

    // Configuration parameters
    this.params = {
      useGrid: true
    };

    // Dynamic Layout Bounds extracted from UVs
    this.layout = {
      activeH: 297.0,
      topX: { ll: 0.5, lr: 173.5, ml: 199.8, mr: 395.1, rl: 420.0, rr: 542.5 },
      botX: { ll: 0.5, lr: 77.5, ml: 77.5, mr: 513.5, rl: 513.5, rr: 542.5 }
    };

    // Offscreen canvas for grid generation (removed, rely on TestTexture)
  }

  updateParams(newParams) {
    this.params = { ...this.params, ...newParams };
  }

  warp() {
    const w = this.targetCanvas.width;   // Should be 1280
    const h = this.targetCanvas.height;  // Should be 720

    // Get input source image data
    const srcW = this.sourceCanvas.width;
    const srcH = this.sourceCanvas.height;
    if (srcW === 0 || srcH === 0) return;
    const srcImgData = this.sourceCtx.getImageData(0, 0, srcW, srcH);

    // Prepare output image data
    const destImgData = this.targetCtx.createImageData(w, h);
    const destData = destImgData.data;
    const srcData = srcImgData.data;

    const activeH = 297.0;

    const triangles = [
      // Tri 1 (Middle BL, BR, TR)
      {
        p0: { x: 199.846, y: activeH, u: 0.25, v: 0.0 },
        p1: { x: 395.097, y: activeH, u: 0.75, v: 0.0 },
        p2: { x: 347.494, y: 0, u: 0.75, v: 1.0 }
      },
      // Tri 2 (Middle BL, TR, TL)
      {
        p0: { x: 199.846, y: activeH, u: 0.25, v: 0.0 },
        p1: { x: 347.494, y: 0, u: 0.75, v: 1.0 },
        p2: { x: 241.497, y: 0, u: 0.25, v: 1.0 }
      },
      // Tri 3 (Right TL, BL, BR)
      {
        p0: { x: 513.497, y: 0, u: 0.75, v: 1.0 },
        p1: { x: 419.993, y: activeH, u: 0.75, v: 0.0 },
        p2: { x: 542.502, y: activeH, u: 1.0, v: 0.0 }
      },
      // Tri 4 (Right TL, BR, TR)
      {
        p0: { x: 513.497, y: 0, u: 0.75, v: 1.0 },
        p1: { x: 542.502, y: activeH, u: 1.0, v: 0.0 },
        p2: { x: 542.502, y: 0, u: 1.0, v: 1.0 }
      },
      // Tri 5 (Left bottom-middle, BR, TR)
      {
        p0: { x: 74.099, y: activeH, u: 0.125, v: 0.0 },
        p1: { x: 173.555, y: activeH, u: 0.25, v: 0.0 },
        p2: { x: 77.504, y: 0, u: 0.25, v: 1.0 }
      },
      // Tri 6 (Left BL, bottom-middle, TR)
      {
        p0: { x: 0.499, y: activeH, u: 0.0, v: 0.0 },
        p1: { x: 74.099, y: activeH, u: 0.125, v: 0.0 },
        p2: { x: 77.504, y: 0, u: 0.25, v: 1.0 }
      },
      // Tri 7 (Left BL, TR, TL)
      {
        p0: { x: 0.499, y: activeH, u: 0.0, v: 0.0 },
        p1: { x: 77.504, y: 0, u: 0.25, v: 1.0 },
        p2: { x: 0.499, y: 0, u: 0.0, v: 1.0 }
      }
    ];

    function getBarycentric(px, py, tri) {
      const { p0, p1, p2 } = tri;
      const det = (p1.y - p2.y) * (p0.x - p2.x) + (p2.x - p1.x) * (p0.y - p2.y);
      if (det === 0) return null;
      
      const l1 = ((p1.y - p2.y) * (px - p2.x) + (p2.x - p1.x) * (py - p2.y)) / det;
      const l2 = ((p2.y - p0.y) * (px - p2.x) + (p0.x - p2.x) * (py - p2.y)) / det;
      const l3 = 1.0 - l1 - l2;
      
      if (l1 >= -0.001 && l2 >= -0.001 && l3 >= -0.001) {
        return {
          u: l1 * p0.u + l2 * p1.u + l3 * p2.u,
          v: l1 * p0.v + l2 * p1.v + l3 * p2.v
        };
      }
      return null;
    }

    // Target pixels loop
    for (let dy = 0; dy < h; dy++) {
      if (dy > activeH) continue;
      for (let dx = 0; dx < w; dx++) {
        let uv = null;
        for (let i = 0; i < triangles.length; i++) {
          uv = getBarycentric(dx, dy, triangles[i]);
          if (uv) break;
        }

        if (uv) {
          // Convert normalized u, v to source pixel coordinates
          const spx = Math.max(0, Math.min(uv.u * (srcW - 1), srcW - 1));
          // Use (1.0 - uv.v) to draw the texture upright on the 2D canvas
          const spy = Math.max(0, Math.min((1.0 - uv.v) * (srcH - 1), srcH - 1));

          // Bilinear Interpolation over source texture
          const x0 = Math.floor(spx);
          const x1 = Math.min(x0 + 1, srcW - 1);
          const y0 = Math.floor(spy);
          const y1 = Math.min(y0 + 1, srcH - 1);

          const tx = spx - x0;
          const ty = spy - y0;

          const getPixel = (x, y, offset) => srcData[((y * srcW) + x) * 4 + offset];

          const destIdx = (dy * w + dx) * 4;
          for (let c = 0; c < 4; c++) {
            const c00 = getPixel(x0, y0, c);
            const c10 = getPixel(x1, y0, c);
            const c01 = getPixel(x0, y1, c);
            const c11 = getPixel(x1, y1, c);

            destData[destIdx + c] = (c00 * (1 - tx) * (1 - ty)) +
                                    (c10 * tx * (1 - ty)) +
                                    (c01 * (1 - tx) * ty) +
                                    (c11 * tx * ty);
          }
        }
      }
    }

    this.targetCtx.putImageData(destImgData, 0, 0);
  }
}
