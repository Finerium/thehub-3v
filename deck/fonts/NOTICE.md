# Fonts vendored for the deck build

The named type pairing of blueprint section 7.1, the same three families the product loads through
`src/app/fonts.ts`. The files here are the latin subsets `next/font` fetched at build time, copied out of
`.next/static/media` so the deck prints without a network request.

| File | Family | Licence |
|---|---|---|
| `BricolageGrotesque-var.woff2` | Bricolage Grotesque (variable, `opsz` 12 to 96, `wght` 200 to 800) | SIL Open Font License 1.1 |
| `IBMPlexSans-var.woff2` | IBM Plex Sans (variable, `wght` 100 to 700) | SIL Open Font License 1.1 |
| `IBMPlexMono-400.woff2` | IBM Plex Mono Regular | SIL Open Font License 1.1 |
| `IBMPlexMono-600.woff2` | IBM Plex Mono SemiBold | SIL Open Font License 1.1 |

Chromium subsets each face to the glyphs the deck actually uses when it writes the PDF, which is the
subsetting blueprint 7.1 asks for; the fallback to a metric-matched system stack is not exercised because
the subset fits the byte budget with room to spare (`deck/build.ts` prints the measured size).
