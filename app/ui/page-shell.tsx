import type { ReactNode } from "react";
import type { Photo } from "@/lib/photos";
import { PhotoCredits } from "./photo-credits";

export interface PageProps {
  /** Usually a <PhotoHeader>. Without one, the page still gets the sunset stripe on top. */
  header?: ReactNode;
  /** Every photo shown on the page (header + result cards), credited at the bottom. */
  creditPhotos?: Photo[];
  children: ReactNode;
}

/**
 * Page shell: header, then one centred column (max 480px, 16px sides) with 32px between
 * sections; content starts 12px below the photo. PhotoCredits close the page.
 */
export function Page({ header, creditPhotos, children }: PageProps) {
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col">
      {header ?? <div className="sunset-stripe" aria-hidden="true" />}
      <main className="flex flex-1 flex-col gap-8 px-4 pt-3 pb-8">{children}</main>
      {creditPhotos && creditPhotos.length > 0 && (
        <div className="px-4">
          <PhotoCredits photos={creditPhotos} />
        </div>
      )}
    </div>
  );
}
