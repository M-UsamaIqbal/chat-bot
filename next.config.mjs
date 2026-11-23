/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep browser automation packages out of the server bundle — they load
  // native binaries that must be required at runtime, not webpack-bundled.
  serverExternalPackages: ["playwright", "playwright-core", "@sparticuz/chromium"],
  // Force the @sparticuz/chromium binary (bin/*.br) into the audit function —
  // file tracing drops it otherwise, so executablePath() can't find Chromium.
  outputFileTracingIncludes: {
    "/api/audit": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  async headers() {
    return [
      {
        // Allow the embeddable widget script + loader to be requested cross-origin.
        source: "/embed/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
        ],
      },
      {
        // The widget page is designed to be iframed on customer sites.
        source: "/widget",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default nextConfig;
