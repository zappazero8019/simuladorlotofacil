import * as THREE from 'three';
import { COLORS } from './constants.js';

/** Fonte bitmap 5×7 para os dígitos, evitando canvas e DOM. */
const DIGITS = Object.freeze([
  ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
]);

const SCALE = 2;
const TEXTURE_WIDTH = 48;
const TEXTURE_HEIGHT = 32;

/**
 * Cria uma textura RGBA com o número de duas casas (01–25), em alto contraste.
 * Pureamente computada em memória: não usa `document` nem canvas.
 */
export function createNumberTexture(number) {
  if (!Number.isInteger(number) || number < 1 || number > 25) {
    throw new RangeError('Número deve estar entre 1 e 25.');
  }

  const label = String(number).padStart(2, '0');
  const pixels = new Uint8Array(TEXTURE_WIDTH * TEXTURE_HEIGHT * 4);
  const ink = new Uint8Array([
    (COLORS.ink >> 16) & 0xff,
    (COLORS.ink >> 8) & 0xff,
    COLORS.ink & 0xff,
    255,
  ]);

  const glyphWidth = 5 * SCALE;
  const glyphHeight = 7 * SCALE;
  const gap = 2 * SCALE;
  const blockWidth = glyphWidth * 2 + gap;
  const startX = Math.floor((TEXTURE_WIDTH - blockWidth) / 2);
  const startY = Math.floor((TEXTURE_HEIGHT - glyphHeight) / 2);

  for (let digitIndex = 0; digitIndex < label.length; digitIndex += 1) {
    const glyph = DIGITS[Number(label[digitIndex])];
    const originX = startX + digitIndex * (glyphWidth + gap);

    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] !== '1') continue;

        for (let dy = 0; dy < SCALE; dy += 1) {
          for (let dx = 0; dx < SCALE; dx += 1) {
            const x = originX + column * SCALE + dx;
            const y = startY + row * SCALE + dy;
            const offset = (y * TEXTURE_WIDTH + x) * 4;
            pixels[offset] = ink[0];
            pixels[offset + 1] = ink[1];
            pixels[offset + 2] = ink[2];
            pixels[offset + 3] = ink[3];
          }
        }
      }
    }
  }

  const texture = new THREE.DataTexture(
    pixels,
    TEXTURE_WIDTH,
    TEXTURE_HEIGHT,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
