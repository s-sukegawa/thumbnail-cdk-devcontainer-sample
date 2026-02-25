import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { generateThumbnailBuffer, THUMB_WIDTH, normalizeContentType } from '../lambda/src/thumbnail.js';

test('normalizeContentType allows only png', () => {
  assert.equal(normalizeContentType('image/png'), 'image/png');
  assert.equal(normalizeContentType('image/jpeg'), 'application/octet-stream');
});

test('generateThumbnailBuffer resizes width to expected max', async () => {
  const original = await sharp({
    create: { width: 800, height: 400, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } }
  })
    .png()
    .toBuffer();

  const thumb = await generateThumbnailBuffer(original, THUMB_WIDTH);
  const metadata = await sharp(thumb).metadata();

  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, THUMB_WIDTH);
  assert.equal(metadata.height, 120);
});
