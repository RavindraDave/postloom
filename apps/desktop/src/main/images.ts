import { AppError } from '@postloom/core';

/** Pictures are stored at most this wide: plenty for a 600px email, even on sharp screens. */
export const STORED_IMAGE_MAX_WIDTH = 1200;
/** Files larger than this are refused before decoding. */
export const MAX_IMAGE_FILE_BYTES = 20 * 1024 * 1024;
/** Above this, a PNG is stored as a JPEG instead to keep every email light. */
const PNG_KEEP_LIMIT_BYTES = 800 * 1024;
const JPEG_QUALITY = 85;

/** The subset of Electron's NativeImage used here (keeps it testable). */
export interface CodecImage {
  getSize(): { width: number; height: number };
  resize(options: { width: number; quality?: 'good' | 'better' | 'best' }): CodecImage;
  toPNG(): Uint8Array;
  toJPEG(quality: number): Uint8Array;
}

export interface ImageCodec {
  /** Returns null when the bytes aren't a picture it can read. */
  decode(bytes: Uint8Array): CodecImage | null;
}

export interface PreparedImage {
  mime: 'image/png' | 'image/jpeg';
  bytes: Uint8Array;
  width: number;
  height: number;
}

/**
 * Checks and re-encodes a picture before it is stored. Re-encoding means
 * only plain pixels are kept: hidden data (like the GPS location in a phone
 * photo) is dropped, and anything that merely pretends to be a picture is
 * refused. Large pictures are made smaller.
 */
export function prepareImage(bytes: Uint8Array, codec: ImageCodec): PreparedImage {
  if (bytes.byteLength > MAX_IMAGE_FILE_BYTES) {
    throw new AppError({ code: 'VALIDATION_FAILED', messageKey: 'errors.imageTooBig' });
  }
  const kind = sniff(bytes);
  if (!kind) {
    throw new AppError({ code: 'VALIDATION_FAILED', messageKey: 'errors.imageType' });
  }
  let image = codec.decode(bytes);
  if (!image) {
    throw new AppError({ code: 'VALIDATION_FAILED', messageKey: 'errors.imageUnreadable' });
  }
  if (image.getSize().width > STORED_IMAGE_MAX_WIDTH) {
    image = image.resize({ width: STORED_IMAGE_MAX_WIDTH, quality: 'best' });
  }
  const { width, height } = image.getSize();

  if (kind === 'png') {
    const png = image.toPNG();
    if (png.byteLength <= PNG_KEEP_LIMIT_BYTES) {
      return { mime: 'image/png', bytes: png, width, height };
    }
  }
  return { mime: 'image/jpeg', bytes: image.toJPEG(JPEG_QUALITY), width, height };
}

/** Recognises PNG and JPEG by their first bytes, never by the file name. */
function sniff(bytes: Uint8Array): 'png' | 'jpeg' | null {
  const starts = (...signature: number[]) => signature.every((value, i) => bytes[i] === value);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (starts(0xff, 0xd8, 0xff)) return 'jpeg';
  return null;
}
