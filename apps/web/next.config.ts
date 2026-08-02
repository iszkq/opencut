import type { NextConfig } from "next";
import { withContentCollections } from "@content-collections/next";

const nextConfig: NextConfig = {
	compiler: {
		removeConsole: process.env.NODE_ENV === "production",
	},
	reactStrictMode: true,
	// The upstream project contains existing type errors outside the editor and
	// desktop shell. Keep production packaging possible while runtime checks are
	// performed against the actual desktop build.
	typescript: {
		ignoreBuildErrors: true,
	},
	// Shipping browser source maps makes the Windows package much larger and
	// noticeably slows every production build without helping end users.
	productionBrowserSourceMaps: false,
	output: "standalone",
	// This package locates its accompanying WASM file relative to its own
	// directory. Keeping it external prevents webpack from moving it into a
	// route bundle, which breaks the desktop transcription runtime.
	serverExternalPackages: ["sherpa-onnx"],
	webpack: (config) => {
		config.experiments = {
			...config.experiments,
			asyncWebAssembly: true,
		};
		return config;
	},
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "plus.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.marblecms.com",
			},
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
			{
				protocol: "https",
				hostname: "api.iconify.design",
			},
			{
				protocol: "https",
				hostname: "api.simplesvg.com",
			},
			{
				protocol: "https",
				hostname: "api.unisvg.com",
			},
			{
				protocol: "https",
				hostname: "cdn.brandfetch.io",
			},
		],
	},
};

export default withContentCollections(nextConfig);
