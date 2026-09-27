// Vacation photos shown behind page headers and on result cards.
// All from Wikimedia Commons under CC BY / CC BY-SA; each must be credited
// wherever it is shown (see photoCredit). Files live in public/images/places,
// resized to 1600px wide and converted to WebP (an adaptation, shared under
// the same licence as the original).

export type PhotoKey =
  | "goa"
  | "ladakh"
  | "jaipur"
  | "kerala"
  | "andaman"
  | "santorini"
  | "bali"
  | "alps"
  | "manali"
  | "rishikesh";

export interface Photo {
  key: PhotoKey;
  /** Short place name, also used as the image's alt text. */
  place: string;
  src: string;
  author: string;
  license: "CC BY 2.0" | "CC BY 4.0" | "CC BY-SA 4.0";
  licenseUrl: string;
  sourceUrl: string;
}

const BY_2 = "https://creativecommons.org/licenses/by/2.0/";
const BY_4 = "https://creativecommons.org/licenses/by/4.0/";
const BY_SA_4 = "https://creativecommons.org/licenses/by-sa/4.0/";

export const PHOTOS: Record<PhotoKey, Photo> = {
  goa: {
    key: "goa",
    place: "Palm trees over Vagator–Chapora bay at sunset, Goa",
    src: "/images/places/goa.webp",
    author: "Vyacheslav Argenberg",
    license: "CC BY 4.0",
    licenseUrl: BY_4,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Romantic_Vagator-Chapora_Bay_after_sunset,_Goa,_India.jpg",
  },
  ladakh: {
    key: "ladakh",
    place: "Pangong Tso lake, Ladakh",
    src: "/images/places/ladakh.webp",
    author: "KennyOMG",
    license: "CC BY-SA 4.0",
    licenseUrl: BY_SA_4,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Pangong_Tso_2.jpg",
  },
  jaipur: {
    key: "jaipur",
    place: "Amer Fort, Jaipur",
    src: "/images/places/jaipur.webp",
    author: "Diego Delso",
    license: "CC BY-SA 4.0",
    licenseUrl: BY_SA_4,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Amber_Fort-Jaipur-India0010.JPG",
  },
  kerala: {
    key: "kerala",
    place: "Houseboats on the Kerala backwaters",
    src: "/images/places/kerala.webp",
    author: "thursdaynext (Flickr)",
    license: "CC BY 2.0",
    licenseUrl: BY_2,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Kerala_backwater_scene.jpg",
  },
  andaman: {
    key: "andaman",
    place: "Radhanagar Beach, Havelock Island, Andaman",
    src: "/images/places/andaman.webp",
    author: "Vyacheslav Argenberg",
    license: "CC BY 4.0",
    licenseUrl: BY_4,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Havelock_Island,_Radhanagar_Beach,_Andaman_Islands.jpg",
  },
  santorini: {
    key: "santorini",
    place: "Oia, Santorini",
    src: "/images/places/santorini.webp",
    author: "Anna.Tsolidou",
    license: "CC BY-SA 4.0",
    licenseUrl: BY_SA_4,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Oia_-_Santorini_2019.jpg",
  },
  bali: {
    key: "bali",
    place: "Tegallalang rice terraces, Bali",
    src: "/images/places/bali.webp",
    author: "Philip Nalangan",
    license: "CC BY 4.0",
    licenseUrl: BY_4,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Tegallalang_Rice_Terraces_Bali_1.jpg",
  },
  alps: {
    key: "alps",
    place: "The Matterhorn above a lake, Swiss Alps",
    src: "/images/places/alps.webp",
    author: "Roy Egloff",
    license: "CC BY-SA 4.0",
    licenseUrl: BY_SA_4,
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:CH.VS.Zermatt_Sunnegga_Grindjisee_Matterhorn_9034_16x9-R_16K.jpg",
  },
  manali: {
    key: "manali",
    place: "Parvati river at Kasol, Himachal Pradesh",
    src: "/images/places/manali.webp",
    author: "Alok Kumar",
    license: "CC BY-SA 4.0",
    licenseUrl: BY_SA_4,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Parvati_Valley_river_kasol.jpg",
  },
  rishikesh: {
    key: "rishikesh",
    place: "Lakshman Jhula bridge over the Ganga, Rishikesh",
    src: "/images/places/rishikesh.webp",
    author: "Kaustubh Nayyar",
    license: "CC BY-SA 4.0",
    licenseUrl: BY_SA_4,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Rishikesh-Lakshman_Jhula_by_Kaustubh_Nayyar.jpg",
  },
};

/** Header photos rotate through these; Indian places first. */
export const HEADER_ROTATION: PhotoKey[] = [
  "goa",
  "ladakh",
  "jaipur",
  "kerala",
  "andaman",
  "manali",
  "rishikesh",
  "santorini",
  "bali",
  "alps",
];

/**
 * Photo for a destination row, when its id isn't itself a photo key
 * (e.g. a destination "palolem" could map to "goa"). Destination ids come from
 * the hand-checked sheet (002_destinations.sql).
 */
export const DESTINATION_PHOTOS: Partial<Record<string, PhotoKey>> = {};

/** Stable pick from a list based on a string (e.g. a trip or destination id). */
export function pickPhoto(seed: string): Photo {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PHOTOS[HEADER_ROTATION[h % HEADER_ROTATION.length]];
}

/**
 * The photo of THIS destination, or null. Never a random other place: a Ladakh
 * photo on the Goa card would be misleading, so unmatched cards show no photo.
 */
export function destinationPhoto(destinationId: string): Photo | null {
  const key = DESTINATION_PHOTOS[destinationId] ?? (destinationId in PHOTOS ? (destinationId as PhotoKey) : undefined);
  return key ? PHOTOS[key] : null;
}

/** One-line credit, e.g. "Oia, Santorini: Anna.Tsolidou, CC BY-SA 4.0". */
export function photoCredit(p: Photo): string {
  return `${p.place}: ${p.author}, ${p.license}`;
}
