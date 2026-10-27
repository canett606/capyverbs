import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const nx = (x / size - 0.5) * 2;
      const ny = (y / size - 0.55) * 2;
      const body = (nx * nx) / 0.62 + (ny + 0.05) ** 2 / 0.45 < 1;
      const head = (nx * nx) / 0.42 + (ny + 0.38) ** 2 / 0.34 < 1;
      const orange = (nx - 0.62) ** 2 + (ny + 0.2) ** 2 < 0.05;
      let r = 14;
      let g = 124;
      let b = 114;
      if (body || head) {
        r = 168;
        g = 106;
        b = 62;
      }
      if (head && Math.abs(nx) < 0.08 && ny > -0.22 && ny < -0.05) {
        r = 92;
        g = 58;
        b = 40;
      }
      if (orange) {
        r = 239;
        g = 125;
        b = 26;
      }
      const eye = head && ny < -0.32 && ny > -0.46 && (Math.abs(nx - 0.12) < 0.045 || Math.abs(nx + 0.12) < 0.045);
      if (eye) {
        r = 27;
        g = 42;
        b = 40;
      }
      const index = row + 1 + x * 4;
      raw[index] = r;
      raw[index + 1] = g;
      raw[index + 2] = b;
      raw[index + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("public", { recursive: true });
writeFileSync("public/icon-192.png", png(192));
writeFileSync("public/icon-512.png", png(512));
