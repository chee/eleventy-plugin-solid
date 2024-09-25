import {nodeResolve as resolve} from "@rollup/plugin-node-resolve"
import {babel} from "@rollup/plugin-babel"
import path from "node:path"
import {createRequire, Module} from "node:module"
import {rollup} from "rollup"
import typescript from "@babel/preset-typescript"
import env from "@babel/preset-env"
/**
 * @typedef {Object} EleventySolidOptions
 * @prop {string[]} [extensions] extensions the template should treat as solid-js
 *                               (defaults to `[".11ty.solid.tsx", ".11ty.solid.jsx"]`)
 */

/**
 * @typedef {Object} ComponentSpec
 * @prop {import("solid-js").Component} server
 * @prop {string?} client
 * @prop {import("solid-js/web")} solid
 */

/**
 * @typedef {Object} EleventySolidComponentModule
 * @prop {import("solid-js").Component} default
 * @prop {Record<any, any>?} data
 * @prop {import("solid-js/web")} solid
 */

/**
 * @import {EleventySolidPluginGlobalOptions, EleventySolidSettings} from "./.eleventy.js"
 */

/**
 * @typedef {EleventySolidSettings & {inputPath: string, isLayout: boolean, force: boolean}} EleventySolidBuildOptions
 */
export default class EleventySolid {
	outdir = "public"
	clientdir = "solid"

	/**
	 * @type {Map<string, ComponentSpec>}
	 */
	cache = new Map()

	/**
	 * @type {Map<string, any>}
	 */
	dataCache = new Map()
	/**
	 *
	 * @param {EleventySolidOptions} opts
	 */
	constructor({extensions = ["11ty.solid.tsx", "11ty.solid.jsx"]} = {}) {
		this.cwd = process.cwd()
		this.extensions = extensions
	}

	/**
	 *
	 * @param {string} string
	 */
	setOutputDir(string) {
		this.outdir = string
	}

	/**
	 * @param {EleventySolidBuildOptions} options
	 */
	hash(options) {
		let {inputPath, isLayout, babel, external, hydrate, island, props} = options
		// todo faster hasher
		return JSON.stringify({
			inputPath,
			isLayout,
			babel,
			external,
			hydrate,
			island,
			props,
		})
	}

	/**
	 * @param {EleventySolidBuildOptions} options
	 */
	async build(options) {
		/** @type string */
		let hash
		if (!options.force && this.cache.has((hash = this.hash(options)))) {
			return this.cache.get(hash)
		}
		let ssr = await this.server(options)
		options.hydrate && (await this.client(options))
		let [chunk] = ssr.output

		let module = /** @type {EleventySolidComponentModule} */ (
			requireFromString(
				// so i have access to the sharedConfig.context when rendering
				chunk.code + `module.exports.solid = require("solid-js/web")`,
				chunk.facadeModuleId
			)
		)

		this.cache.set(hash, {
			solid: module.solid,
			server: module.default,
			client: options.hydrate
				? path.join(this.outdir, this.clientdir, chunk.fileName)
				: null,
		})
	}

	/**
	 * @param {string} inputPath
	 * @param {EleventySolidPluginGlobalOptions} globalOptions
	 *
	 * i've been so foolish. unless i do this i can't allow templates to
	 * override hydrate on a case-by-case basis. maybe i should drop
	 * that as a design goal?
	 */
	async data(inputPath, globalOptions, force = false) {
		if (!force && this.dataCache.has(inputPath)) {
			return this.dataCache.get(inputPath)
		}

		const module = requireFromString(
			rollup({
				input: inputPath,
				plugins: [
					resolve({
						exportConditions: ["solid", "node", "import", "module", "default"],
						extensions: rollupExtensions,
					}),
					babel({
						...globalOptions.babel,
						presets: [
							...(globalOptions.babel?.presets ?? []),
							typescript,
							[env, {bugfixes: true, targets: "last 1 year"}],
							["solid", {generate: "ssr"}],
						],
						extensions: rollupExtensions,
						babelHelpers: "bundled",
					}),
				],
			}).then(build =>
				build.generate({
					format: "cjs",
					exports: "named",
				})
			)
		)
		this.dataCache.set(inputPath, module.data)
		return module.data
	}

	/**
	 * @param {EleventySolidBuildOptions} options
	 */
	async server(options) {
		return rollup({
			input: options.inputPath,
			plugins: [
				resolve({
					exportConditions: ["solid", "node", "import", "module", "default"],
					extensions: rollupExtensions,
				}),
				babel({
					...options.babel,
					presets: [
						...(options.babel?.presets ?? []),
						typescript,
						[env, {bugfixes: true, targets: "last 1 year"}],
						[
							"solid",
							{
								generate: "ssr",
								hydratable: options.hydrate,
							},
						],
					],
					extensions: rollupExtensions,
					babelHelpers: "bundled",
				}),
			],
			external: ["solid-js", "solid-js/web", "solid-js/store"],
		}).then(build =>
			build.generate({
				format: "cjs",
				exports: "named",
			})
		)
	}

	/**
	 * @param {EleventySolidBuildOptions} options
	 */
	async client(options) {
		return rollup({
			input: options.inputPath,
			plugins: [
				resolve({
					exportConditions: ["solid"],
					extensions: rollupExtensions,
				}),
				babel({
					...options.babel,
					presets: [
						...(options.babel?.presets ?? []),
						["solid", {generate: "dom", hydratable: options.hydrate}],
						typescript,
						[env, {bugfixes: true, targets: "last 1 year"}],
					],
					extensions: rollupExtensions,
					babelHelpers: "bundled",
				}),
			],
			external: [
				"solid-js",
				"solid-js/web",
				"solid-js/store",
				...options.external,
			],
		}).then(build =>
			build.write({
				dir: path.join(this.outdir, this.clientdir),
				format: "esm",
				exports: "named",
			})
		)
	}
}

/**
 *
 * @param {string} src
 * @param {string} filename
 */
let require = createRequire(import.meta.url)
function requireFromString(src, filename) {
	let module = new Module(filename)
	module.require = require
	// @ts-expect-error
	module._compile(src, filename)
	return module.exports
}

let rollupExtensions = ["js", "jsx", "ts", "tsx"]
