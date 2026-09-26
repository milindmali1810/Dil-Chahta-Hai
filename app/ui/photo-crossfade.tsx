"use client";

import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Photo } from "@/lib/photos";

const INTERVAL_MS = 6000;
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * Slow crossfade between header photos, one every 6s (MASTER section 10).
 * The server render and reduced motion show the first photo only; the others are
 * mounted (and downloaded) only once we know motion is allowed. Photos are decorative.
 */
export function PhotoCrossfade({ photos, sizes }: { photos: Photo[]; sizes: string }) {
  const reduced = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true, // server: static first photo
  );
  const [index, setIndex] = useState(0);
  const animate = !reduced && photos.length > 1;

  useEffect(() => {
    if (!animate) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % photos.length), INTERVAL_MS);
    return () => clearInterval(timer);
  }, [animate, photos.length]);

  const active = animate ? index : 0;
  const shown = animate ? photos : photos.slice(0, 1);

  return (
    <>
      {shown.map((p, i) => (
        <Image
          key={p.key}
          src={p.src}
          alt=""
          fill
          sizes={sizes}
          preload={i === 0}
          className={`object-cover transition-opacity duration-[1500ms] ease-in-out ${
            i === active ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
    </>
  );
}
