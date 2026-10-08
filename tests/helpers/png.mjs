import { deflateSync } from 'node:zlib';
// Test encoder uses an independent bitwise CRC implementation.
function crc(bytes) { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; }
export function chunk(type, data) { const result = Buffer.alloc(data.length + 12); result.writeUInt32BE(data.length); result.write(type, 4); data.copy(result, 8); result.writeUInt32BE(crc(result.subarray(4, -4)), result.length - 4); return result; }
export function png(width, height, filter = 0) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const stride = width * 4; const pixels = Buffer.alloc(stride * height);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 17 + 29) % 256;
  const rows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    rows[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y ? pixels[(y - 1) * stride + x] : 0;
      const corner = y && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      const p = left + up - corner;
      const distances = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - corner)];
      const nearest = [left, up, corner][distances.indexOf(Math.min(...distances))];
      const predictor = [0, left, up, Math.floor((left + up) / 2), nearest][filter] ?? 0;
      rows[y * (stride + 1) + x + 1] = (pixels[y * stride + x] - predictor + 256) % 256;
    }
  }
  return { pixels, bytes: Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]) };
}
