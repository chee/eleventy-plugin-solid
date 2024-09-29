import {nodeResolve as resolve} from "@rollup/plugin-node-resolve"
import {babel} from "@rollup/plugin-babel"
import path from "node:path"
import {createRequire, Module} from "node:module"
import {rollup} from "rollup"
import typescript from "@babel/preset-typescript"
import env from "@babel/preset-env"

/**
 * @import {EleventySolidPluginGlobalOptions} from "./.eleventy.js"
 * @import {RollupOptions} from "rollup"
 * @import {RollupBabelInputPluginOptions} from "@rollup/plugin-babel"
 */

/**
 * @typedef {Object} ComponentSpec
 * @prop {import("solid-js").Component} server
 * @prop {string} [client]
 * @prop {Record<any, any>} [data]
 * @prop {import("solid-js/web")} solid
 * @prop {(data: any) => Record<any, any>?} [props]
 * @prop {string} renderId
 */

/**
 * @typedef {Object} EleventySolidComponentModule
 * @prop {import("solid-js").Component} default
 * @prop {import("solid-js/web")} solid
 * @prop {Record<any, any>} [data]
 * @prop {(data: any) => Record<any, any>?} [props]
 * @prop {(data: any) => Record<any, any>?} [createProps]
 */

/**
 * @typedef {EleventySolidPluginGlobalOptions & {
 *  cache: Map<string, ComponentSpec>
 *  clientDir: string
 *  getId: () => string
 * }} EleventySolidContext
 */

/**
 * @typedef {Object} EleventySolidBuildOptions
 * @prop {string} inputPath
 * @prop {string} outdir
 * @prop {EleventySolidContext} context
 * @prop {boolean} [force=false]
 */

/**
 *
 * @param {EleventySolidPluginGlobalOptions} options
 * @returns {EleventySolidContext}
 */
export function createContext(options) {
	const clientDir = "solid"
	const getId = createIdGenerator()
	return {
		cache: new Map(),
		clientDir,
		getId,
		...options,
	}
}

/**
 * @param {EleventySolidBuildOptions} options
 */
export async function build(options) {
	const cachepoint = path.relative(".", options.inputPath)
	if (!options.force && options.context.cache.has(cachepoint)) {
		return /** @type {ComponentSpec} */ (options.context.cache.get(cachepoint))
	}

	/**
	 * @type {Promise<import("rollup").RollupOutput>[]}
	 */
	const builds = [buildServer(options)]
	if (options.context.hydrate) {
		builds.push(buildClient(options))
	}
	const [server] = await Promise.all(builds)
	const [chunk] = server.output
	const module = /** @type {EleventySolidComponentModule} */ (
		requireFromString(
			// so i have access to the sharedConfig.context when rendering
			chunk.code + `module.exports.solid = require("solid-js/web")`,
			chunk.facadeModuleId
		)
	)

	const renderId = options.context.cache.has(cachepoint)
		? /** @type {string} */ (options.context.cache.get(cachepoint)?.renderId)
		: options.context.getId()

	/** @type {ComponentSpec} */
	const result = {
		solid: module.solid,
		server: module.default,
		client: options.context.hydrate
			? path.join(options.outdir, options.context.clientDir, chunk.fileName)
			: undefined,
		data: module.data || {},
		props: module[options.context.derivePropsKey],
		renderId,
	}

	options.context.cache.set(cachepoint, result)

	return result
}

/**
 * @param {Omit<EleventySolidBuildOptions, "outdir">} options
 *
 * this is unfortunate, and i don't much like it. it would be much preferable to
 * use frontmatter for the data, but i can't see any way around building
 * the file fresh just for the data if i want to work towards a world where
 * you can use solid for layouts, and selectively hydrate templates.
 */
export async function getData(options) {
	const [chunk] = (await buildServer(options)).output
	return /** @type {EleventySolidComponentModule} */ (
		requireFromString(
			/* [norm macdonald voice] i'm an old */ chunk.code,
			chunk.facadeModuleId
		)
	)?.data
}

/**
 * @param {Omit<EleventySolidBuildOptions, "outdir">} options
 */
export async function buildServer(options) {
	return rollup(
		createRollupConfig({
			input: options.inputPath,
			exportConditions: ["solid", "node", "import", "module", "default"],
			generate: "ssr",
			hydratable: !!options.context.hydrate,
			external: ["solid-js", "solid-js/web", "solid-js/store"],
			babel: options.context.babel,
			rollup: options.context.rollup,
		})
	).then(build =>
		build.generate({
			format: "cjs",
			exports: "named",
		})
	)
}

/**
 * @param {EleventySolidBuildOptions} options
 */
async function buildClient(options) {
	return rollup(
		createRollupConfig({
			input: options.inputPath,
			exportConditions: ["solid", "browser", "import", "default"],
			generate: "dom",
			hydratable: !!options.context.hydrate,
			external: [
				"solid-js",
				"solid-js/web",
				"solid-js/store",
				...(options.context.external || []),
			],
			babel: options.context.babel,
			rollup: options.context.rollup,
		})
	).then(build =>
		build.write({
			dir: path.join(options.outdir, options.context.clientDir),
			format: "esm",
			exports: "named",
		})
	)
}

/**
 * @param {{
 *  input: string
 *  exportConditions: string[]
 *  generate: string
 *  external?: string[]
 *  rollup?: RollupOptions
 *  babel?: RollupBabelInputPluginOptions
 *  hydratable?: boolean
 *  targets?: string
 * }} options
 * @returns {import("rollup").RollupOptions}
 */
function createRollupConfig(options) {
	const {
		input,
		exportConditions,
		external,
		generate,
		hydratable = false,
		targets = "last 1 year",
	} = options
	return {
		...options.rollup,
		input,
		plugins: [
			...(Array.isArray(options.rollup?.plugins)
				? options.rollup.plugins
				: options.rollup?.plugins
					? [options.rollup?.plugins]
					: []),
			resolve({
				exportConditions,
				extensions: rollupExtensions,
			}),
			babel({
				...options.babel,
				presets: [
					...(options.babel?.presets ?? []),
					typescript,
					[env, {bugfixes: true, targets}],
					["solid", {generate, hydratable}],
				],
				extensions: options.babel?.extensions || rollupExtensions,
				babelHelpers: "bundled",
			}),
		],
		external,
	}
}

/**
 *
 * @param {string} src
 * @param {string} filename
 */
const require = createRequire(import.meta.url)
function requireFromString(src, filename) {
	const module = new Module(filename)
	module.require = require
	// @ts-expect-error
	module._compile(src, filename)
	return module.exports
}

const rollupExtensions = ["js", "jsx", "ts", "tsx"]

function createIdGenerator(
	alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
) {
	const alphabetLength = alphabet.length
	let counter = 0

	const incrementString = str => {
		const lastChar = str[str.length - 1]
		const restOfString = str.slice(0, -1)

		if (lastChar === "z") {
			return incrementString(restOfString) + "a"
		} else {
			const nextChar = alphabet[alphabet.indexOf(lastChar) + 1]
			return restOfString + nextChar
		}
	}

	return function getId() {
		counter++
		let id = ""
		let remaining = counter - 1

		while (remaining >= 0) {
			id = alphabet[remaining % alphabetLength] + id
			remaining = Math.floor(remaining / alphabetLength) - 1
		}

		return id
	}
}
