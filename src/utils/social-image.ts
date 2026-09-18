import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';

// Raw hero images can be 5000px+ and several MB. Some social-share crawlers
// (LINE, Facebook, ...) time out or reject the fetch on images that large,
// showing a broken/404 thumbnail instead - so anything shared externally
// (og:image, JSON-LD, RSS thumbnails) goes through this downscale first.
const SOCIAL_IMAGE_WIDTH = 1200;

export async function getSocialImageSrc(source: ImageMetadata | string): Promise<string> {
  if (typeof source === 'string') return source;

  const width = Math.min(SOCIAL_IMAGE_WIDTH, source.width);
  const optimized = await getImage({ src: source, width, format: 'jpg', quality: 75 });

  return optimized.src;
}
