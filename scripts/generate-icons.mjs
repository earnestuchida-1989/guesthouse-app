import sharp from 'sharp';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, 'icon-source.svg');
const outDir = path.join(__dirname, '..', 'public');

const sizes = [
  { size: 192, name: 'pwa-192x192.png' },
  { size: 512, name: 'pwa-512x512.png' },
  { size: 180, name: 'apple-touch-icon.png' },
];

async function main() {
  for (const { size, name } of sizes) {
    await sharp(src).resize(size, size).png().toFile(path.join(outDir, name));
    console.log('generated', name);
  }

  // maskable icon: same design with extra padding (safe zone) so OS can crop to circle/rounded shape
  await sharp(src)
    .resize(410, 410)
    .extend({ top: 51, bottom: 51, left: 51, right: 51, background: '#3B82F6' })
    .png()
    .toFile(path.join(outDir, 'pwa-maskable-512x512.png'));
  console.log('generated pwa-maskable-512x512.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
