import {nodeResolve as resolve} from "@rollup/plugin-node-resolve"
import {babel} from "@rollup/plugin-babel"
import path from "node:path"
import {createRequire, Module} from "node:module"
import {rollup} from "rollup"
import typescript from "@babel/preset-typescript"
import env from "@babel/preset-env"

/**
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
 * @typedef {Object} EleventySolidContext
 * @prop {Map<string, ComponentSpec>} cache
 * @prop {string} clientDir
 * @prop {() => string} getId
 */

/**
 * @typedef {Object} EleventySolidBuildOptions
 * @prop {string} inputPath
 * @prop {EleventySolidContext} context
 * @prop {string} outdir
 * @prop {boolean} [hydrate=false]
 * @prop {boolean} [force=false]
 */

export default function createEleventySolidContext() {
	const clientDir = "solid"
	const getId = createIdGenerator()
	return {cache: new Map(), clientDir, getId}
}

/**
 * @param {EleventySolidBuildOptions} options
 */
async function build(options) {
	const cachepoint = path.relative(".", options.inputPath)
	if (!options.force && this.cache.has(cachepoint)) {
		return /** @type {ComponentSpec} */ (this.cache.get(cachepoint))
	}

	const ssr = await this.server(options)
	options.hydrate && (await this.client(options))

	const [chunk] = ssr.output
	const module = /** @type {EleventySolidComponentModule} */ (
		requireFromString(
			// so i have access to the sharedConfig.context when rendering
			chunk.code + `module.exports.solid = require("solid-js/web")`,
			chunk.facadeModuleId
		)
	)

	const renderId = this.cache.has(cachepoint)
		? /** @type {string} */ (this.cache.get(cachepoint)?.renderId)
		: this.getId()

	/** @type {ComponentSpec} */
	const result = {
		solid: module.solid,
		server: module.default,
		client: options.hydrate
			? path.join(outdir, this.clientDir, chunk.fileName)
			: undefined,
		data: module.data || {},
		props: module.props || module.createProps
		renderId,
	}

	if (!("save" in options) || options.save) {
		this.cache.set(cachepoint, result)
	}

	return result
}

/**
 * @param {string} input the input path
 * @param {{hydrate?: boolean}} options
 */
async function importServer(input, options) {
	const server = await buildServer(input, options)
	const [chunk] = server.output
	return /** @type {EleventySolidComponentModule} */ (
		requireFromString(
			// so i have access to the sharedConfig.context when rendering
			chunk.code + `module.exports.solid = require("solid-js/web")`,
			chunk.facadeModuleId
		)
	)
}

/**
 * @param {string} input the input path
 * @param {{hydrate?: boolean}} options
 */
async function buildServer(input, options) {
	return rollup(
		createRollupConfig({
			input,
			exportConditions: ["solid", "node", "import", "module", "default"],
			generate: "ssr",
			hydratable: !!options.hydrate,
			external: ["solid-js", "solid-js/web", "solid-js/store"],
		})
	).then(build =>
		build.generate({
			format: "cjs",
			exports: "named",
		})
	)
}

/**
 * @param {{
 *  inputPath: string
 *  hydrate?: boolean
 *  external?: string[]
 *  outdir: string
 * }} options
 * @param {EleventySolidContext} context
 */
async function buildClient(options, context) {
	return rollup(
		createRollupConfig({
			input: options.inputPath,
			exportConditions: ["solid", "browser", "import", "default"],
			generate: "dom",
			hydratable: !!options.hydrate,
			external: [
				"solid-js",
				"solid-js/web",
				"solid-js/store",
				...(options.external || []),
			],
		})
	).then(build =>
		build.write({
			dir: path.join(options.outdir, this.clientDir),
			format: "esm",
			exports: "named",
		})
	)
}


/**
 *
 * @param {{
 *  input: string
 *  exportConditions: string[]
 *  external?: string[]
 *  babel?: RollupBabelInputPluginOptions
 *  generate: string
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
		targets = "last 1 year"
	} = options
	return {
		input,
		plugins: [
			resolve({
				exportConditions,
				extensions: rollupExtensions,
			}),
			babel({				
				presets: [				
					typescript,
					[env, {bugfixes: true, targets}],
					["solid", {generate, hydratable}],
				],
				extensions: rollupExtensions,
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
