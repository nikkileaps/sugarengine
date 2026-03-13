#!/usr/bin/env node
/**
 * Compress GLB files with Draco for published builds.
 *
 * Strips custom vertex attributes (e.g. _UVOFFSET, _INSTANCEHEIGHT) that are
 * artifacts from procedural generation and not used at runtime, then applies
 * Draco mesh compression.
 *
 * Usage:
 *   node scripts/compress-glb.mjs <input.glb> <output.glb>
 *   node scripts/compress-glb.mjs dist-game/  # compress all GLBs in directory in-place
 */

import fs from 'fs/promises';
import path from 'path';

// Custom attributes to strip before compression (not used at runtime)
const STRIP_ATTRIBUTES = ['_UVOFFSET', '_INSTANCEHEIGHT'];

async function stripCustomAttributes(glbPath) {
  const buf = await fs.readFile(glbPath);

  // Parse GLB header
  const jsonLen = buf.readUInt32LE(12);
  const jsonStr = buf.toString('utf8', 20, 20 + jsonLen);
  const gltf = JSON.parse(jsonStr);

  // Check if any custom attributes exist
  let found = false;
  for (const mesh of gltf.meshes || []) {
    for (const prim of mesh.primitives || []) {
      for (const attr of STRIP_ATTRIBUTES) {
        if (prim.attributes[attr] !== undefined) {
          delete prim.attributes[attr];
          found = true;
        }
      }
    }
  }

  if (!found) return glbPath; // No changes needed

  // Rewrite GLB with modified JSON
  const newJsonStr = JSON.stringify(gltf);
  // Pad JSON to 4-byte alignment
  const padded = newJsonStr + ' '.repeat((4 - (newJsonStr.length % 4)) % 4);
  const newJsonBuf = Buffer.from(padded, 'utf8');

  // BIN chunk starts after: header(12) + json chunk header(8) + json data
  const binChunkOffset = 12 + 8 + jsonLen;
  // Pad original JSON was also 4-byte aligned, so BIN data starts right after
  const binChunkHeader = buf.slice(binChunkOffset, binChunkOffset + 8);
  const binData = buf.slice(binChunkOffset + 8);

  // Build new GLB
  const totalLen = 12 + 8 + newJsonBuf.length + 8 + binData.length;
  const out = Buffer.alloc(totalLen);

  // GLB header
  out.write('glTF', 0, 'ascii');
  out.writeUInt32LE(2, 4); // version
  out.writeUInt32LE(totalLen, 8);

  // JSON chunk
  let offset = 12;
  out.writeUInt32LE(newJsonBuf.length, offset);
  out.writeUInt32LE(0x4E4F534A, offset + 4); // 'JSON'
  newJsonBuf.copy(out, offset + 8);
  offset += 8 + newJsonBuf.length;

  // BIN chunk
  out.writeUInt32LE(binData.length, offset);
  out.writeUInt32LE(0x004E4942, offset + 4); // 'BIN\0'
  binData.copy(out, offset + 8);

  const strippedPath = glbPath.replace('.glb', '.stripped.glb');
  await fs.writeFile(strippedPath, out);
  console.log(`  Stripped ${STRIP_ATTRIBUTES.join(', ')} from ${path.basename(glbPath)}`);
  return strippedPath;
}

async function compressFile(inputPath, outputPath) {
  const sizeBefore = (await fs.stat(inputPath)).size;
  const label = path.basename(inputPath);
  console.log(`Compressing ${label} (${(sizeBefore / 1024 / 1024).toFixed(1)} MB)...`);

  // Strip custom attributes first
  const strippedPath = await stripCustomAttributes(inputPath);

  // Run gltf-transform draco
  const { execSync } = await import('child_process');
  try {
    execSync(
      `npx -y @gltf-transform/cli@3 draco "${strippedPath}" "${outputPath}"`,
      { stdio: 'pipe', timeout: 600000 }
    );
  } finally {
    // Clean up temp stripped file
    if (strippedPath !== inputPath) {
      await fs.unlink(strippedPath).catch(() => {});
    }
  }

  const sizeAfter = (await fs.stat(outputPath)).size;
  const ratio = (sizeBefore / sizeAfter).toFixed(1);
  console.log(`  ${(sizeBefore / 1024 / 1024).toFixed(1)} MB → ${(sizeAfter / 1024 / 1024).toFixed(1)} MB (${ratio}x)`);
}

async function findGlbFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findGlbFiles(full));
    } else if (entry.name.endsWith('.glb')) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node scripts/compress-glb.mjs <file.glb|directory>');
    process.exit(1);
  }

  const stat = await fs.stat(arg);

  if (stat.isDirectory()) {
    // Compress all GLBs in directory in-place
    const files = await findGlbFiles(arg);
    if (files.length === 0) {
      console.log('No .glb files found.');
      return;
    }
    console.log(`Found ${files.length} GLB file(s)\n`);
    for (const file of files) {
      await compressFile(file, file); // in-place
    }
  } else {
    // Single file
    const outputPath = process.argv[3] || arg;
    await compressFile(arg, outputPath);
  }

  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Compression failed:', err.message);
  process.exit(1);
});
