// Predspracovanie obrázka pred OCR (tesseract.js) – beží 100 % lokálne
// v prehliadači, obrázok neopúšťa zariadenie.
// 1) zväčší malé obrázky (LSTM tesseractu vyhovuje výška písma ~30 px),
// 2) prevedie na odtiene sivej a roztiahne kontrast (1.–99. percentil),
// 3) vymaže čiary tabuľkovej mriežky (dlhé vodorovné/zvislé tmavé ťahy) –
//    práve tie robili z „1946" → „le" a z okrajov buniek falošné znaky.
// Vracia canvas – tesseract.js recognize() ho prijme priamo.
(function (global) {
  'use strict';

  // vymaž dlhé súvislé tmavé ťahy (rámiky tabuľky), text nechaj
  function odstranCiary(px, w, h) {
    var dark = new Uint8Array(w * h), i, j;
    for (i = 0, j = 0; i < px.length; i += 4, j++) dark[j] = px[i] < 160 ? 1 : 0;
    var minH = Math.max(60, Math.round(w * 0.2));   // vodorovná: aspoň 20 % šírky
    var minV = Math.max(40, Math.round(h * 0.03));  // zvislá: výrazne dlhšia než glyf
    function erase(x, y) { var k = (y * w + x) * 4; px[k] = px[k + 1] = px[k + 2] = 255; }
    var x, y, run, x2, y2;
    for (y = 0; y < h; y++) {
      run = 0;
      for (x = 0; x <= w; x++) {
        if (x < w && dark[y * w + x]) { run++; continue; }
        if (run >= minH) for (x2 = x - run; x2 < x; x2++) { erase(x2, y); if (y > 0) erase(x2, y - 1); if (y < h - 1) erase(x2, y + 1); }
        run = 0;
      }
    }
    for (x = 0; x < w; x++) {
      run = 0;
      for (y = 0; y <= h; y++) {
        if (y < h && dark[y * w + x]) { run++; continue; }
        if (run >= minV) for (y2 = y - run; y2 < y; y2++) { erase(x, y2); if (x > 0) erase(x - 1, y2); if (x < w - 1) erase(x + 1, y2); }
        run = 0;
      }
    }
  }

  async function nacitajBitmap(file) {
    if (typeof createImageBitmap === 'function') return createImageBitmap(file);
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('obrázok sa nedal načítať')); };
      img.src = url;
    });
  }

  async function pripravObrazok(file) {
    var img = await nacitajBitmap(file);
    var iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
    var scale = iw < 1800 ? Math.min(3, 1800 / iw) : 1;
    var w = Math.round(iw * scale), h = Math.round(ih * scale);
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    var d = ctx.getImageData(0, 0, w, h), px = d.data;
    var hist = new Array(256).fill(0), i, g;
    for (i = 0; i < px.length; i += 4) {
      g = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000 | 0;
      px[i] = g; hist[g]++;
    }
    var total = px.length / 4, lo = 0, hi = 255, acc = 0, t;
    for (t = 0; t < 256; t++) { acc += hist[t]; if (acc >= total * 0.01) { lo = t; break; } }
    acc = 0;
    for (t = 255; t >= 0; t--) { acc += hist[t]; if (acc >= total * 0.01) { hi = t; break; } }
    var range = Math.max(1, hi - lo);
    for (i = 0; i < px.length; i += 4) {
      var v = Math.round((px[i] - lo) * 255 / range);
      v = v < 0 ? 0 : (v > 255 ? 255 : v);
      px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255;
    }
    odstranCiary(px, w, h);
    ctx.putImageData(d, 0, 0);
    return c;
  }

  var API = { pripravObrazok: pripravObrazok };
  global.OcrUtils = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
