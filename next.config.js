/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/gtranslate/:path*",
        destination: "https://translate.googleapis.com/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
