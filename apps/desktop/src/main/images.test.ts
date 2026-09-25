import { describe, expect, it, vi } from 'vitest';
import { MAX_IMAGE_FILE_BYTES, prepareImage, type CodecImage, type ImageCodec } from './images';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

function fakeImage(width: number, height: number, pngBytes = 1_000): CodecImage {
  return {
    getSize: () => ({ width, height }),
    resize: vi.fn(({ width: newWidth }: { width: number }) =>
      fakeImage(newWidth, Math.round((height * newWidth) / width), pngBytes),
    ),
    toPNG: () => new Uint8Array(pngBytes).fill(1),
    toJPEG: () => new Uint8Array(500).fill(2),
  };
}

const codecFor = (image: CodecImage | null): ImageCodec => ({ decode: () => image });

describe('preparing a picture', () => {
  it('keeps a small PNG as a PNG (logos keep their transparency)', () => {
    const prepared = prepareImage(PNG, codecFor(fakeImage(300, 100)));
    expect(prepared).toMatchObject({ mime: 'image/png', width: 300, height: 100 });
    expect(prepared.bytes[0]).toBe(1);
  });

  it('re-encodes JPEG photos, which drops hidden data like location', () => {
    const prepared = prepareImage(JPEG, codecFor(fakeImage(800, 600)));
    expect(prepared).toMatchObject({ mime: 'image/jpeg', width: 800, height: 600 });
    expect(prepared.bytes[0]).toBe(2);
  });

  it('makes very wide pictures smaller', () => {
    const image = fakeImage(4000, 3000);
    const prepared = prepareImage(JPEG, codecFor(image));
    expect(image.resize).toHaveBeenCalledWith({ width: 1200, quality: 'best' });
    expect(prepared).toMatchObject({ width: 1200, height: 900 });
  });

  it('stores a heavy PNG as a JPEG', () => {
    const prepared = prepareImage(PNG, codecFor(fakeImage(1000, 1000, 2_000_000)));
    expect(prepared.mime).toBe('image/jpeg');
  });

  it('refuses files that are not PNG or JPEG, whatever their name', () => {
    const gif = new TextEncoder().encode('GIF89a...');
    expect(() => prepareImage(gif, codecFor(fakeImage(1, 1)))).toThrow(
      expect.objectContaining({ messageKey: 'errors.imageType' }),
    );
    const html = new TextEncoder().encode('<svg onload=alert(1)>');
    expect(() => prepareImage(html, codecFor(fakeImage(1, 1)))).toThrow(
      expect.objectContaining({ messageKey: 'errors.imageType' }),
    );
  });

  it('refuses damaged pictures and huge files', () => {
    expect(() => prepareImage(PNG, codecFor(null))).toThrow(
      expect.objectContaining({ messageKey: 'errors.imageUnreadable' }),
    );
    const huge = new Uint8Array(MAX_IMAGE_FILE_BYTES + 1);
    expect(() => prepareImage(huge, codecFor(fakeImage(1, 1)))).toThrow(
      expect.objectContaining({ messageKey: 'errors.imageTooBig' }),
    );
  });
});
