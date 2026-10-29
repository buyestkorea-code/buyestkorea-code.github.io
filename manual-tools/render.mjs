import fs from 'fs';
import * as mupdf from 'mupdf';
const [,, file, outDir, ...pgs] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const doc = mupdf.Document.openDocument(fs.readFileSync(file), 'application/pdf');
console.log('pages', doc.countPages());
for (const n of pgs.map(Number)) {
  const pix = doc.loadPage(n - 1).toPixmap(mupdf.Matrix.scale(1.2, 1.2), mupdf.ColorSpace.DeviceRGB, false, true);
  fs.writeFileSync(`${outDir}/p${n}.png`, pix.asPNG());
}
