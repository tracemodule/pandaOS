// Afbeelding van de 3D-auto (in de eigen lakkleur) voor Settings > Software, zoals de Tesla zijn auto bovenaan toont.
// Het 3D-canvas in het autopaneel registreert hier een functie die één beeld rendert en als PNG teruggeeft;
// zo is er geen tweede 3D-canvas nodig (dat zou de radio zwaar belasten).
type Capture = () => string | null;

let capture: Capture | null = null;

export const registerCarCapture = (fn: Capture | null) => { capture = fn; };

export const takeCarSnapshot = (): string | null => {
  try { return capture?.() ?? null; } catch { return null; }
};

// Lege (doorzichtige) rand weghalen, zodat de auto het hele vak vult. Geeft een nieuwe PNG terug.
export const cropToContent = (dataUrl: string): Promise<string> => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return resolve(dataUrl);
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
    let top = height, left = width, right = -1, bottom = -1;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        if (data[(y * width + x) * 4 + 3] > 24) {
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }
    if (right < 0) return resolve(dataUrl);
    const pad = 6;
    left = Math.max(0, left - pad); top = Math.max(0, top - pad);
    right = Math.min(width - 1, right + pad); bottom = Math.min(height - 1, bottom + pad);
    const out = document.createElement('canvas');
    out.width = right - left + 1;
    out.height = bottom - top + 1;
    out.getContext('2d')!.drawImage(canvas, left, top, out.width, out.height, 0, 0, out.width, out.height);
    resolve(out.toDataURL('image/png'));
  };
  img.onerror = () => resolve(dataUrl);
  img.src = dataUrl;
});
