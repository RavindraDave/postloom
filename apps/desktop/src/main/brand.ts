import { AppError, type SenderProfile } from '@postloom/core';
import type { Brand, BrandInput } from '@postloom/contracts';
import type { Repositories } from '@postloom/db';
import { DEFAULT_BRAND, imageContentId, type BrandLook } from '@postloom/editor';
import type { InlineImage } from '@postloom/email';

/** The sender's brand look as the screen shows it, or null if it has none. */
export async function senderBrand(
  repos: Repositories,
  sender: SenderProfile,
): Promise<Brand | null> {
  if (!sender.brandKitId) return null;
  const kit = await repos.brandKits.get(sender.brandKitId);
  let logo: Brand['logo'] = null;
  if (kit.logoAssetId) {
    const asset = await repos.assets.get(kit.logoAssetId);
    logo = { assetId: asset.id, width: asset.width ?? 200, height: asset.height ?? 60 };
  }
  return { primaryColor: kit.primaryColor, fontFamily: kit.fontFamily, logo };
}

/** Saves (or removes) a sender's brand look. Each sender keeps its own brand kit. */
export async function saveSenderBrand(
  repos: Repositories,
  sender: SenderProfile,
  brand: BrandInput | null,
): Promise<void> {
  if (!brand) {
    if (sender.brandKitId) await repos.senders.update(sender.id, { brandKitId: null });
    return;
  }
  if (brand.logoAssetId) await repos.assets.get(brand.logoAssetId); // must exist
  const fields = {
    primaryColor: brand.primaryColor,
    fontFamily: brand.fontFamily,
    logoAssetId: brand.logoAssetId,
  };
  if (sender.brandKitId) {
    await repos.brandKits.update(sender.brandKitId, fields);
  } else {
    const kit = await repos.brandKits.create({
      name: sender.name,
      secondaryColor: null,
      footerText: null,
      ...fields,
    });
    await repos.senders.update(sender.id, { brandKitId: kit.id });
  }
}

/** How an email from this sender looks. */
export function brandLook(brand: Brand | null, logoAlt: string): BrandLook {
  if (!brand) return DEFAULT_BRAND;
  return {
    ...DEFAULT_BRAND,
    primaryColor: brand.primaryColor,
    fontFamily: brand.fontFamily,
    logo: brand.logo
      ? { assetId: brand.logo.assetId, width: brand.logo.width, alt: logoAlt }
      : null,
  };
}

/** The pictures an email shows, ready to travel inside it. */
export async function inlineImagesFor(
  repos: Repositories,
  assetIds: string[],
): Promise<InlineImage[]> {
  const images: InlineImage[] = [];
  for (const id of new Set(assetIds)) {
    const asset = await repos.assets.read(id);
    if (!asset) {
      throw new AppError({
        code: 'TEMPLATE_INVALID',
        messageKey: 'errors.imageMissing',
        details: { assetId: id },
      });
    }
    const extension = asset.mime === 'image/png' ? 'png' : 'jpg';
    images.push({
      cid: imageContentId(id),
      contentType: asset.mime,
      content: asset.bytes,
      filename: `picture-${id.slice(0, 8)}.${extension}`,
    });
  }
  return images;
}
