import fs from 'fs';
import zlib from 'zlib';

/**
 * Pure Node.js PNG Creator with Liquid Glass & MEI text rendering
 */
function createPng(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth 8
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const ihdrChunk = createChunk('IHDR', ihdr);

  const rawScanlines = Buffer.alloc(height * (width * 4 + 1));
  let rawOffset = 0;
  let rgbaOffset = 0;

  for (let y = 0; y < height; y++) {
    rawScanlines[rawOffset++] = 0;
    for (let x = 0; x < width; x++) {
      rawScanlines[rawOffset++] = rgbaBuffer[rgbaOffset++];
      rawScanlines[rawOffset++] = rgbaBuffer[rgbaOffset++];
      rawScanlines[rawOffset++] = rgbaBuffer[rgbaOffset++];
      rawScanlines[rawOffset++] = rgbaBuffer[rgbaOffset++];
    }
  }

  const compressedData = zlib.deflateSync(rawScanlines);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(8 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crcTarget = chunk.subarray(4, 8 + len);
  const crc = crc32(crcTarget);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ -1) >>> 0;
}

// 5x7 Pixel Font for 'M', 'E', 'I'
const FONT_5X7 = {
  'M': [
    [1,0,0,0,1],
    [1,1,0,1,1],
    [1,0,1,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1]
  ],
  'E': [
    [1,1,1,1,1],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,1,1,1,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,1,1,1,1]
  ],
  'I': [
    [1,1,1,1,1],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [1,1,1,1,1]
  ]
};

function renderMeiIcon(size) {
  const buffer = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const cornerRadius = size * 0.24;
  const pad = size * 0.05;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Rounded rect distance
      const rx = Math.max(0, Math.abs(x - cx) - (cx - pad - cornerRadius));
      const ry = Math.max(0, Math.abs(y - cy) - (cy - pad - cornerRadius));
      const dist = Math.sqrt(rx * rx + ry * ry);

      if (dist > cornerRadius) {
        buffer[idx] = 0; buffer[idx + 1] = 0; buffer[idx + 2] = 0; buffer[idx + 3] = 0;
        continue;
      }

      const edgeAlpha = Math.min(1, Math.max(0, cornerRadius - dist + 0.5));

      // Liquid glass gradient: #4f46e5 (79, 70, 229) -> #7c3aed (124, 58, 237) -> #06b6d4 (6, 182, 212)
      const gradT = (x + y) / (size * 2);
      let r = 79 + (124 - 79) * gradT;
      let g = 70 + (58 - 70) * gradT;
      let b = 229 + (237 - 229) * gradT;

      // Top specular highlight
      if (y < size * 0.45) {
        const spec = (1 - y / (size * 0.45)) * 45;
        r += spec; g += spec; b += spec;
      }

      buffer[idx] = Math.min(255, Math.max(0, Math.round(r)));
      buffer[idx + 1] = Math.min(255, Math.max(0, Math.round(g)));
      buffer[idx + 2] = Math.min(255, Math.max(0, Math.round(b)));
      buffer[idx + 3] = Math.min(255, Math.max(0, Math.round(255 * edgeAlpha)));
    }
  }

  // Draw "MEI" text onto the buffer
  const letters = ['M', 'E', 'I'];
  const charWidth = 5;
  const charHeight = 7;
  const spacing = 1;
  const totalCharWidth = letters.length * charWidth + (letters.length - 1) * spacing; // 5*3 + 2 = 17

  // Calculate scale factor
  const scale = Math.max(1, Math.floor(size / 24));
  const renderedWidth = totalCharWidth * scale;
  const renderedHeight = charHeight * scale;

  const startX = Math.round((size - renderedWidth) / 2);
  const startY = Math.round((size - renderedHeight) / 2);

  letters.forEach((char, charIdx) => {
    const grid = FONT_5X7[char];
    const charStartX = startX + charIdx * (charWidth + spacing) * scale;

    for (let row = 0; row < charHeight; row++) {
      for (let col = 0; col < charWidth; col++) {
        if (grid[row][col] === 1) {
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              const px = charStartX + col * scale + dx;
              const py = startY + row * scale + dy;
              if (px >= 0 && px < size && py >= 0 && py < size) {
                const idx = (py * size + px) * 4;
                // Bright white text (#ffffff)
                buffer[idx] = 255;
                buffer[idx + 1] = 255;
                buffer[idx + 2] = 255;
                buffer[idx + 3] = 255;
              }
            }
          }
        }
      }
    }
  });

  return buffer;
}

// Generate icon files
const sizes = [16, 32, 48, 128];
for (const s of sizes) {
  const buf = renderMeiIcon(s);
  const png = createPng(s, s, buf);
  fs.writeFileSync(`icons/icon${s}.png`, png);
  console.log(`Generated icons/icon${s}.png (${s}x${s}) with MEI branding`);
}
