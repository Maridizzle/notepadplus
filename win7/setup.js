const fs = require('fs');
const path = require('path');

const parentDir = path.resolve(__dirname, '..');
const thisDir = __dirname;

const filesToCopy = [
  'main.js',
  'preload.js',
  'THIRD_PARTY_NOTICES.txt',
];

const dirsToCopy = [
  'src',
];

function copyFileSync(src, dest) {
  fs.copyFileSync(src, dest);
}

function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

for (const file of filesToCopy) {
  const src = path.join(parentDir, file);
  const dest = path.join(thisDir, file);
  if (fs.existsSync(src)) {
    copyFileSync(src, dest);
    console.log(`Copied ${file}`);
  }
}

for (const dir of dirsToCopy) {
  const src = path.join(parentDir, dir);
  const dest = path.join(thisDir, dir);
  if (fs.existsSync(src)) {
    copyDirSync(src, dest);
    console.log(`Copied ${dir}/`);
  }
}

console.log('Win7 build files ready.');
