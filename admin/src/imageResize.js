// Shrinks a chosen picture in the browser before it is sent, so a 12 MB phone photo becomes a
// ~200 KB JPEG. Photos are drawn onto a canvas, so the server only ever receives clean JPEGs.

export const MAX_EDGE = 1200;

function load(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as a picture. Use a JPG, PNG or WebP image.'));
    };
    img.src = url;
  });
}

/**
 * file: the File the person picked.
 * square: crop the middle to a square (the shop's thumbnail is square).
 * Resolves to a File named "<name>.jpg".
 */
export async function prepareImage(file, { square = false, maxEdge = MAX_EDGE, quality = 0.88 } = {}) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new Error('Use a JPG, PNG or WebP picture.');
  }
  const img = await load(file);
  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (!sw || !sh) throw new Error('That picture looks empty.');
  if (square) {
    const side = Math.min(sw, sh);
    sx = Math.floor((sw - side) / 2);
    sy = Math.floor((sh - side) / 2);
    sw = side;
    sh = side;
  }
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // transparent PNGs get a white background
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not prepare that picture.');
  const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}
