import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	turbopack: {
		root: process.cwd(),
	},
	experimental: {
		serverActions: {
			bodySizeLimit: "4mb",
		},
	},
};

export default nextConfig;
