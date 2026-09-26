import type { Photo } from "@/lib/photos";

/**
 * Required by the CC BY / CC BY-SA licences on every page that shows photos:
 * "Photos: {place}: {author}, {licence} · …", each linking to its source, plus the full list.
 */
export function PhotoCredits({ photos }: { photos: Photo[] }) {
  const unique = photos.filter((p, i) => photos.findIndex((q) => q.key === p.key) === i);
  return (
    <footer className="mt-12 border-t border-border pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm leading-5 text-muted-fg">
      <p>
        Photos:{" "}
        {unique.map((p, i) => (
          <span key={p.key}>
            {i > 0 && " · "}
            <a href={p.sourceUrl} className="underline underline-offset-2" rel="noreferrer" target="_blank">
              {p.place}
            </a>
            : {p.author},{" "}
            <a href={p.licenseUrl} className="underline underline-offset-2" rel="noreferrer" target="_blank">
              {p.license}
            </a>
          </span>
        ))}
      </p>
      <p className="mt-1">
        <a href="/images/places/CREDITS.md" className="inline-flex min-h-12 items-center font-bold text-primary underline underline-offset-2">
          Photo credits
        </a>
      </p>
    </footer>
  );
}
