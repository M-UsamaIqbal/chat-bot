/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep browser automation packages out of the server bundle — they load
  // native binaries that must be required at runtime, not webpack-bundled.
  serverExternalPackages: ["playwright", "playwright-core", "@sparticuz/chromium"],
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
