const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

const dir1 = '/tmp/screenshot-run1';
const dir2 = '/tmp/screenshot-run2';

const features = fs.readdirSync(dir1);
let identical = 0, different = 0, diffs = [];

for (const feature of features) {
  const files = fs.readdirSync(path.join(dir1, feature)).filter(f => f.endsWith('.png'));
  for (const file of files) {
    const p1 = path.join(dir1, feature, file);
    const p2 = path.join(dir2, feature, file);
    if (!fs.existsSync(p2)) { diffs.push({ feature, file, reason: 'missing in run2' }); different++; continue; }
    const img1 = PNG.sync.read(fs.readFileSync(p1));
    const img2 = PNG.sync.read(fs.readFileSync(p2));
    if (img1.width !== img2.width || img1.height !== img2.height) {
      diffs.push({ feature, file, reason: 'size mismatch: ' + img1.width + 'x' + img1.height + ' vs ' + img2.width + 'x' + img2.height });
      different++;
      continue;
    }
    const numDiff = pixelmatch(img1.data, img2.data, null, img1.width, img1.height, { threshold: 0.1 });
    const pct = (numDiff / (img1.width * img1.height) * 100).toFixed(4);
    if (numDiff === 0) { identical++; }
    else { different++; diffs.push({ feature, file, diffPixels: numDiff, pct: pct + '%' }); }
  }
}

console.log('Identical: ' + identical + '/' + (identical + different));
console.log('Different: ' + different);
if (diffs.length) { console.log('\nDiffs:'); diffs.forEach(d => console.log('  ' + d.feature + '/' + d.file + ': ' + (d.pct || d.reason))); }
