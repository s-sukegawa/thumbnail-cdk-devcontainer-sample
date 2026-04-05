import sharp from 'sharp';

export const THUMB_WIDTH = 240;

export function normalizeContentType(contentType?: string): string {
  return contentType?.toLowerCase() === 'image/png' ? 'image/png' : 'application/octet-stream';
}

export async function generateThumbnailBuffer(input: Buffer, width = THUMB_WIDTH): Promise<Buffer> {
  return sharp(input)
    .resize({ width, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
}
