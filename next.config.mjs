/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  // Static export only for the GitHub Pages prototype build (CI sets
  // STATIC_EXPORT=1 and strips app/api). Without it, the app runs as a full
  // server with API routes and the database.
  output: process.env.STATIC_EXPORT ? "export" : undefined,
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
};

export default nextConfig;
