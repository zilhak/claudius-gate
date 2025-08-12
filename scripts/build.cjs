const fs = require('fs').promises;
const path = require('path');

async function copyFile(src, dest) {
  const destDir = path.dirname(dest);
  await fs.mkdir(destDir, { recursive: true });
  await fs.copyFile(src, dest);
  console.log(`Copied ${src} to ${dest}`);
}

async function build() {
  try {
    // Copy CJS files to dist
    await copyFile(
      path.join(__dirname, '../src/main/index.cjs'),
      path.join(__dirname, '../dist/main/index.cjs')
    );
    
    await copyFile(
      path.join(__dirname, '../src/preload/index.cjs'),
      path.join(__dirname, '../dist/preload/index.cjs')
    );
    
    console.log('Build completed successfully');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();