/**
 * Tipo real de una imagen por sus primeros bytes (magic number). El `Content-Type` del
 * multipart lo pone el cliente y no prueba nada: un `.png` puede ser un HTML.
 */
export type ImageFormat = 'png' | 'jpeg' | 'webp';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

function startsWith(buffer: Uint8Array, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, i) => buffer[offset + i] === byte);
}

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

export function detectImageFormat(buffer: Uint8Array): ImageFormat | null {
  if (startsWith(buffer, PNG)) return 'png';
  if (startsWith(buffer, JPEG)) return 'jpeg';
  // RIFF <tamaño de 4 bytes> WEBP
  if (startsWith(buffer, ascii('RIFF')) && startsWith(buffer, ascii('WEBP'), 8)) return 'webp';
  return null;
}

export const MIME_BY_FORMAT: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};
