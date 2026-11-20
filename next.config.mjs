/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep Playwright out of the server bundle — it loads native browser binaries.
  serverExternalPackages: ["playwright"],
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
