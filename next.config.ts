import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "127.0.0.1:3000",
    "localhost:3000",
    "127.0.0.1:3002",
    "localhost:3002",
  ],
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "127.0.0.1:3000",
        "localhost:3000",
        "zany-train-6v9wqr7g9xw4246vr-3000.app.github.dev"
      ],
    },
  },
};

export default nextConfig;
