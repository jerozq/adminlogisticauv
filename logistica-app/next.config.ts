import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	experimental: {
		serverActions: {
			bodySizeLimit: "4mb",
		},
	},
	// Turbopack would bundle these OTel packages as ESM, breaking the
	// `new Resource()` constructor (ESM/CJS interop issue). Marking them
	// external lets Node.js resolve them natively via require().
	serverExternalPackages: [
		"@opentelemetry/api",
		"@opentelemetry/sdk-node",
		"@opentelemetry/sdk-trace-base",
		"@opentelemetry/sdk-trace-node",
		"@opentelemetry/resources",
		"@opentelemetry/semantic-conventions",
	],
};

export default nextConfig;
