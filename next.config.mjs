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
  // The app only has locale routes (/de, /fr, /en). The static export covers
  // the site root with public/index.html (language sniffing); server builds
  // (Netlify/Vercel/npm start) need a real redirect or / is a 404.
  async redirects() {
    return process.env.STATIC_EXPORT
      ? []
      : [{ source: "/", destination: "/de/", permanent: false }];
  },
};

export default nextConfig;
