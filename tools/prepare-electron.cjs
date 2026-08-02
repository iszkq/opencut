const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const web = path.join(root, "apps", "web");
const standalone = path.join(web, ".next", "standalone", "apps", "web");
const staticSource = path.join(web, ".next", "static");
const staticTarget = path.join(standalone, ".next", "static");
const publicSource = path.join(web, "public");
const publicTarget = path.join(standalone, "public");
const wasmSource = path.join(web, ".next", "server", "chunks", "static", "wasm");
// Webpack writes server-side WASM beside its chunks, while Next's server
// runtime resolves it from `.next/server/static/wasm` at runtime.  The
// standalone trace does not include it, so materialize the runtime location.
const wasmTarget = path.join(standalone, ".next", "server", "static", "wasm");

if (!fs.existsSync(path.join(standalone, "server.js"))) {
	throw new Error("Next standalone build is missing. Run the web build first.");
}
fs.mkdirSync(path.dirname(staticTarget), { recursive: true });
fs.cpSync(staticSource, staticTarget, { recursive: true, force: true });
if (fs.existsSync(publicSource)) {
	fs.cpSync(publicSource, publicTarget, { recursive: true, force: true });
}
if (fs.existsSync(wasmSource)) {
	fs.mkdirSync(wasmTarget, { recursive: true });
	fs.cpSync(wasmSource, wasmTarget, { recursive: true, force: true });
}

// Bun's standalone trace preserves `next` as a Windows junction. NSIS/7-Zip
// cannot reliably archive that link, so materialize this required runtime
// dependency inside the standalone folder before it is embedded in the app.
const nextLink = path.join(standalone, "node_modules", "next");
const nextSource = path.join(web, "node_modules", "next");
const nextTarget = fs.realpathSync(nextSource);
fs.rmSync(nextLink, { recursive: true, force: true });
fs.cpSync(nextTarget, nextLink, {
	recursive: true,
	force: true,
	dereference: true,
});

// Bun stores transitive packages in its internal package store rather than as
// normal sibling folders. Next resolves these by package name at runtime, so
// materialize its server-side runtime dependencies beside the standalone app.
function resolvePackageDirectory(packageName) {
	let current = path.dirname(
		require.resolve(packageName, { paths: [nextTarget] }),
	);
	while (!fs.existsSync(path.join(current, "package.json"))) {
		const parent = path.dirname(current);
		if (parent === current) {
			throw new Error(`Could not locate package root for ${packageName}`);
		}
		current = parent;
	}
	return current;
}

for (const packageName of [
	"@next/env",
	"@swc/helpers",
	"baseline-browser-mapping",
	"caniuse-lite",
	"postcss",
	"styled-jsx",
	"react",
	"react-dom",
	"scheduler",
	// The offline subtitle engine is intentionally external to webpack. Bun
	// represents it as a junction, so materialize it for portable Windows apps.
	"sherpa-onnx",
]) {
	const sourceDirectory = resolvePackageDirectory(packageName);
	const targetDirectory = path.join(
		standalone,
		"node_modules",
		...packageName.split("/"),
	);
	fs.rmSync(targetDirectory, { recursive: true, force: true });
	fs.mkdirSync(path.dirname(targetDirectory), { recursive: true });
	fs.cpSync(sourceDirectory, targetDirectory, {
		recursive: true,
		force: true,
		dereference: true,
	});
}
