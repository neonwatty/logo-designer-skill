// Bounded decoder for static, non-interlaced 8-bit PNGs produced by logo renderers.
// Chunk/CRC/filter definitions: https://www.w3.org/TR/png/
import { inflateSync } from 'node:zlib';
import { requireThat } from '../workflows/contracts.mjs';
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
const check = (condition, message) => requireThat(condition, 'INVALID_PNG', message);
function paeth(a, b, c) {
  const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
export function decodePng(bytes) {
  check(bytes.length <= 64 * 1024 * 1024 && bytes.subarray(0, 8).equals(signature), 'Invalid PNG signature or size.');
  let offset = 8, header, ended = false, dataEnded = false, palette;
  const chunks = [];
  while (offset < bytes.length) {
    check(offset + 12 <= bytes.length, 'Truncated PNG chunk.');
    const length = bytes.readUInt32BE(offset); const end = offset + 12 + length;
    check(end <= bytes.length, 'PNG chunk length exceeds file.');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    check(/^[A-Za-z]{4}$/u.test(type) && crc32(bytes.subarray(offset + 4, end - 4)) === bytes.readUInt32BE(end - 4), 'PNG chunk type or CRC is invalid.');
    const data = bytes.subarray(offset + 8, end - 4);
    check(header || type === 'IHDR', 'IHDR must be first.');
    if (type === 'IHDR') {
      check(!header && length === 13, 'Invalid IHDR.');
      const width = data.readUInt32BE(0), height = data.readUInt32BE(4), color = data[9];
      const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
      check(width > 0 && height > 0 && width <= 4096 && height <= 4096 && channels
        && data[8] === 8 && data[10] === 0 && data[11] === 0 && data[12] === 0,
      'Only bounded non-interlaced 8-bit PNGs are supported.');
      header = { width, height, color, channels };
    } else if (type === 'PLTE') {
      check(!palette && chunks.length === 0 && length > 0 && length <= 768 && length % 3 === 0 && ![0, 4].includes(header.color), 'Invalid PNG palette.');
      palette = data;
    } else if (type === 'IDAT') {
      check(!dataEnded && (header.color !== 3 || palette), 'Invalid PNG image data ordering.');
      chunks.push(data);
    } else if (type === 'IEND') {
      check(length === 0 && chunks.length > 0 && end === bytes.length, 'Invalid PNG ending.'); ended = true;
    } else {
      check(type[0] === type[0].toLowerCase() && !['acTL', 'fcTL', 'fdAT'].includes(type), 'Unsupported critical or animated PNG chunk.');
      if (chunks.length) dataEnded = true;
    }
    offset = end;
  }
  check(ended, 'PNG has no IEND.');
  const { width, height, channels, color } = header;
  const stride = width * channels, expected = height * (stride + 1);
  let raw;
  try { raw = inflateSync(Buffer.concat(chunks), { maxOutputLength: expected }); } catch { check(false, 'Invalid or oversized PNG compressed data.'); }
  check(raw.length === expected, 'PNG scanline count is wrong.');
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]; check(filter <= 4, 'Unknown PNG filter.');
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y ? pixels[(y - 1) * stride + x] : 0;
      const c = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const predictor = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      pixels[y * stride + x] = (raw[y * (stride + 1) + x + 1] + predictor) & 255;
    }
  }
  if (color === 3) for (const index of pixels) check(index * 3 < palette.length, 'Palette index is out of range.');
  return { width, height, channels, pixels };
}
