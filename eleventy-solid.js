import {nodeResolve as resolve} from "@rollup/plugin-node-resolve"
import {babel} from "@rollup/plugin-babel"
import path from "node:path"
import {globby} from "globby"
import {createRequire, Module} from "node:module"
import {rollup} from "rollup"
import typescript from "@babel/preset-typescript"
import env from "@babel/preset-env"
/**
 * @typedef {Object} EleventySolidOptions
 * @prop {string[]} [extensions] extensions the template should treat as solid-js
 *                               (defaults to `[".11ty.solid.tsx", ".11ty.solid.jsx"]`)
 * @prop {boolean} [hydrate]
 * @prop {string[]} [external]
 * @prop {import("@rollup/plugin-babel").RollupBabelInputPluginOptions} [babel]
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
 * @prop {Record<any, any>} [data]
 * @prop {import("solid-js/web")} solid
 * @prop {(data: any) => Record<any, any>?} [props]
 * @prop {(data: any) => Record<any, any>?} [createProps]
 */

export default class EleventySolid {
	clientDir = "solid"

	/**
	 * @type {Record<string, ComponentSpec>}
	 */
	components = {}
	getId = createIdGenerator()

	/**
	 *
	 * @param {EleventySolidOptions} opts
	 */
	constructor({
		extensions = ["11ty.solid.tsx", "11ty.solid.jsx"],
		hydrate = false,
		external = [],
		babel,
	} = {}) {
		this.cwd = process.cwd()
		this.components = {}
		this.extensions = extensions
		this.hydrate = hydrate
		this.extraExternals = external
		this.babel = babel
	}

	/**
	 * @param {string} outdir
	 */
	async build(outdir) {
		let inputs = await globby(
			this.extensions.map(ext => `**/*.${ext}`),
			{
				gitignore: true,
			}
		)
		let ssr = await this.server(inputs)
		this.hydrate && (await this.client(inputs, outdir))
		for (let {output} of ssr) {
			let [chunk] = output
			let module = /** @type {EleventySolidComponentModule} */ (
				requireFromString(
					// so i have access to the sharedConfig.context when rendering
					chunk.code + `module.exports.solid = require("solid-js/web")`,
					chunk.facadeModuleId
				)
			)

			this.components[path.relative(this.cwd, chunk.facadeModuleId ?? "")] = {
				solid: module.solid,
				server: module.default,
				client: this.hydrate
					? path.join(outdir, this.clientDir, chunk.fileName)
					: undefined,
				data: module.data || {},
				props: module.props || module.createProps || module.data?.solid?.props,
				renderId: this.getId(),
			}
		}
	}

	/**
	 *
	 * @param {string[]} inputs
	 */
	async server(inputs) {
		return Promise.all(
			inputs.map(input =>
				rollup({
					input,
					plugins: [
						resolve({
							exportConditions: [
								"solid",
								"node",
								"import",
								"module",
								"default",
							],
							extensions: rollupExtensions,
						}),
						babel({
							...this.babel,
							presets: [
								...(this.babel?.presets ?? []),
								typescript,
								[env, {bugfixes: true, targets: "last 1 year"}],
								["solid", {generate: "ssr", hydratable: this.hydrate}],
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
			)
		)
	}

	/**
	 *
	 * @param {string[]} inputs
	 * @param {string} outdir
	 * @returns
	 */
	async client(inputs, outdir) {
		return Promise.all(
			inputs.map(input =>
				rollup({
					input,
					plugins: [
						resolve({
							exportConditions: ["solid"],
							extensions: rollupExtensions,
						}),
						babel({
							...this.babel,
							presets: [
								...(this.babel?.presets ?? []),
								["solid", {generate: "dom", hydratable: this.hydrate}],
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
						...this.extraExternals,
					],
				}).then(build =>
					build.write({
						dir: path.join(outdir, this.clientDir),
						format: "esm",
						exports: "named",
					})
				)
			)
		)
	}

	/**
	 *
	 * @param {string} inputPath
	 * @returns
	 */
	getComponent(inputPath) {
		if (!this.components[inputPath]) {
			throw new Error(
				`"${inputPath}" doesn't seem to have been compiled by the solid plugin idk why im so sorry`
			)
		}
		return this.components[inputPath]
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
