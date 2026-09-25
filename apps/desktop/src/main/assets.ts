import type { Repositories } from '@postloom/db';
import { prepareImage, type ImageCodec } from './images';
import type { IpcHandlers } from './ipc-router';

export interface PickedFile {
  name: string;
  bytes: Uint8Array;
}

export interface AssetDeps {
  repos: Repositories;
  codec: ImageCodec;
  /** Shows the computer's file picker (pictures only); null if cancelled. */
  pickImageFile: () => Promise<PickedFile | null>;
}

/**
 * Pictures come in only through a file the person picks in the computer's
 * own dialog: the renderer never sees or chooses file paths.
 */
export function createAssetHandlers({
  repos,
  codec,
  pickImageFile,
}: AssetDeps): Pick<IpcHandlers, 'assets:pickImage' | 'assets:totalSize'> {
  return {
    'assets:pickImage': async () => {
      const file = await pickImageFile();
      if (!file) return null;
      const prepared = prepareImage(file.bytes, codec);
      const asset = await repos.assets.put({ ...prepared, name: file.name.slice(0, 120) });
      return {
        id: asset.id,
        mime: asset.mime,
        size: asset.size,
        width: asset.width,
        height: asset.height,
        name: asset.name,
      };
    },
    'assets:totalSize': async ({ ids }) => {
      let bytes = 0;
      for (const id of new Set(ids)) {
        bytes += await repos.assets
          .get(id)
          .then((asset) => asset.size)
          .catch(() => 0);
      }
      return { bytes };
    },
  };
}
