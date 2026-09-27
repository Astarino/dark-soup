import { K } from "../data/balance.js";
export function createViewport(cvs) {
  const ctx = cvs.getContext("2d");
  let W = 0,
    H = 0,
    DPR = 1,
    PX = 4,
    LW = 0,
    LH = 0,
    SAFE = { t: 0, r: 0, b: 0, l: 0 };
  function resize() {
    DPR = window.devicePixelRatio || 1;
    W = innerWidth;
    H = innerHeight;
    PX = Math.max(2, Math.round((Math.min(W, H) * DPR) / 270));
    LW = Math.ceil((W * DPR) / PX);
    LH = Math.ceil((H * DPR) / PX);
    cvs.width = LW;
    cvs.height = LH;
    cvs.style.width = (LW * PX) / DPR + "px";
    cvs.style.height = (LH * PX) / DPR + "px";
    ctx.imageSmoothingEnabled = false;
    const cs = getComputedStyle(document.getElementById("safe"));
    SAFE = {
      t: parseFloat(cs.paddingTop) || 0,
      r: parseFloat(cs.paddingRight) || 0,
      b: parseFloat(cs.paddingBottom) || 0,
      l: parseFloat(cs.paddingLeft) || 0,
    };
  }
  addEventListener("resize", resize);
  resize();
  const VW = () => LW * K,
    VH = () => LH * K;

  return {
    snapshot: () => ({ W, H, DPR, PX, LW, LH, SAFE }),
    worldSize: () => ({ width: VW(), height: VH() }),
  };
}
