import type { NextConfig } from "next";

/**
 * The deployment is unlisted (blueprint section 1 item 7, NFR-25): every response carries a noindex header and
 * public/robots.txt disallows everything. The remaining headers are the security baseline of NFR-11.
 */
// ADR-009 and ARCHITECTURE section 6: the embedder runs inside the ask and search functions only. The pinned model
// files (fetched into models/ by the build) and the linux-x64 onnxruntime binary are traced into those two functions
// by path, because both are loaded at runtime by file name and the tracer cannot see them; every other platform's
// binary is excluded from every function. No other route carries the model (D-15: health never loads it).
const ORT = "./node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v6";
const EMBEDDER_FILES = ["./models/**/*", `${ORT}/linux/x64/**/*`];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
  outputFileTracingIncludes: {
    "/api/ask": EMBEDDER_FILES,
    "/api/search": EMBEDDER_FILES,
    // G3 embeds the published lesson's chunks inside the transaction (ARCHITECTURE 8.6 step 3), so the publish
    // function needs the pinned model too; without it the route threw past every designed refusal and answered 500.
    // The key is a glob, so the route's own "[id]" would read as a character class matching one of "i" or "d" and
    // the include would land on no function at all, which is what the deployment answered 500 for a second time
    // (libonnxruntime.so.1: cannot open shared object file, in the deployment's own log).
    "/api/drafts/*/publish": EMBEDDER_FILES,
  },
  outputFileTracingExcludes: {
    "*": [`${ORT}/darwin/**`, `${ORT}/win32/**`, `${ORT}/linux/arm64/**`, "./node_modules/.pnpm/onnxruntime-web@*/**"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
