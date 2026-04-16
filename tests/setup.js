// jsdom doesn't implement canvas, ResizeObserver, or requestAnimationFrame
// in a form the card is happy with. Stub just enough to let the module load
// and the element construct.

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

// Minimal 2D context stub — card uses canvas for weather particles.
// Tests don't exercise rendering, they just need construction to not throw.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function () {
    return {
      canvas: this,
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: [] }),
      putImageData: () => {},
      createImageData: () => [],
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      measureText: () => ({ width: 0 }),
      fillText: () => {},
      strokeText: () => {},
      set fillStyle(_) {},
      set strokeStyle(_) {},
      set lineWidth(_) {},
      set globalAlpha(_) {},
      set font(_) {},
    };
  };
}
