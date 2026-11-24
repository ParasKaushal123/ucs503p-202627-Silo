/** @type {import('next').NextConfig} */
const nextConfig = { distDir: process.env.SILO_DIST_DIR || ".next" };

export default nextConfig;
