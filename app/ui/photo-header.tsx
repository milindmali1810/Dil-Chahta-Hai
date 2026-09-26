import Image from "next/image";
import type { ReactNode } from "react";
import type { Photo } from "@/lib/photos";
import { PhotoCrossfade } from "./photo-crossfade";

/** The header spans the 480px column; phones get the full viewport width. */
export const HEADER_SIZES = "(max-width: 480px) 100vw, 480px";

export interface PhotoHeaderProps {
  /** One photo, or several to crossfade (create page: Goa → Ladakh → Santorini). */
  photo: Photo | Photo[];
  /** Page title (h1), white over the scrim. */
  title: ReactNode;
  subtitle?: ReactNode;
}

/**
 * Full-width holiday photo, 240px tall (280 on ≥ 400px), with the sunset stripe on the
 * top edge, the wordmark in a brown pill, and the title at the bottom over a warm scrim.
 * The photo is decorative (alt=""): the title says where you are.
 */
export function PhotoHeader({ photo, title, subtitle }: PhotoHeaderProps) {
  const photos = Array.isArray(photo) ? photo : [photo];
  return (
    <header className="relative h-60 w-full overflow-hidden bg-primary-soft min-[400px]:h-70">
      {photos.length > 1 ? (
        <PhotoCrossfade photos={photos} sizes={HEADER_SIZES} />
      ) : (
        <Image src={photos[0].src} alt="" fill preload sizes={HEADER_SIZES} className="object-cover" />
      )}
      <div className="photo-scrim absolute inset-0" aria-hidden="true" />
      <div className="sunset-stripe absolute inset-x-0 top-0" aria-hidden="true" />
      <p className="absolute top-4 left-4 rounded-full bg-fg/70 px-3 py-1 font-display text-lg leading-6 font-semibold text-primary-soft">
        Dil Chahta Hai
      </p>
      {/* Text stays in the bottom 35% of the header, over the darkest part of the scrim. */}
      <div className="photo-text absolute inset-x-0 bottom-0 flex flex-col gap-1 px-4 pb-4 text-white">
        <h1 className="font-display text-3xl leading-9 font-semibold">{title}</h1>
        {subtitle && <p className="text-base leading-6 font-semibold">{subtitle}</p>}
      </div>
    </header>
  );
}
