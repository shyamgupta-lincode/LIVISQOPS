/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    const api = process.env.API_INTERNAL_URL || "http://api:8000";
    return [
      { source: "/api/v1/:path*", destination: `${api}/api/v1/:path*` },
      { source: "/health", destination: `${api}/health` },
      { source: "/ready", destination: `${api}/ready` },
    ];
  },
};
export default nextConfig;
