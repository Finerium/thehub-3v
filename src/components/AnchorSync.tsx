"use client";

// The citation anchor of 6.2 surface 4 is a fragment, `#page=n&span=<span_id>`, and a fragment never reaches the
// server, so the page it names cannot be resolved from the database on the request that renders it. This mirrors the
// fragment into the query on mount and on every hash change, then asks Next.js for that URL, so the page and the span
// the chip named are served from the database rather than guessed in the browser.
//
// It runs as a client component rather than an inline script because a citation chip navigates on the client: a
// script element in the page's markup executes on a full document load and never again, which left a chip followed
// from a drawer sitting on its fragment with the viewer showing page one (AC-UI-02).
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AnchorSync(): null {
  const router = useRouter();
  useEffect(() => {
    function sync(): void {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash === "") return;
      const fragment = new URLSearchParams(hash);
      const page = fragment.get("page");
      if (page === null || page === "") return;
      const span = fragment.get("span") ?? "";
      const url = new URL(window.location.href);
      if (url.searchParams.get("page") === page && (url.searchParams.get("span") ?? "") === span) return;
      url.searchParams.set("page", page);
      if (span === "") url.searchParams.delete("span");
      else url.searchParams.set("span", span);
      // replace, never push: the back button leaves the viewer rather than walking the pages it turned.
      router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
    }
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [router]);
  return null;
}
