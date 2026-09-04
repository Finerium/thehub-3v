// The named type pairing of blueprint section 7.1, self-hosted by next/font at build time (no runtime request to
// Google): Bricolage Grotesque for display and headings, IBM Plex Sans for body and interface, IBM Plex Mono for
// tags, setpoints, hashes, work-order ids, code and every numeral that comes from a typed field. The CSS variables
// are mapped to Tailwind's font namespace in globals.css (@theme inline).
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

export const display = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-bricolage",
  display: "swap",
});

export const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-plex-sans",
  display: "swap",
});

export const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});
