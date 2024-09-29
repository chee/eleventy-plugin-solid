import path from "node:path"
import {createRequire, Module} from "node:module"
import {transformAsync} from "@babel/core"
import {readFile, writeFile} from "node:fs/promises"
import solid from "babel-preset-solid"
import typescript from "@babel/preset-typescript"
import env from "@babel/preset-env"
import vm from "node:vm"

/**
 * @import {EleventySolidPluginGlobalOptions} from "./.eleventy.js"
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
	 * @type {Promise<string>[]}
	 */
	const builds = [buildServer(options)]
	if (options.context.hydrate) {
		builds.push(buildClient(options))
	}
	const [server] = await Promise.all(builds)
	const module = /** @type {EleventySolidComponentModule} */ (
		requireFromString(
			// so i have access to the sharedConfig.context when rendering
			server + `\n;module.exports.solid = require("solid-js/web")`,
			options.inputPath
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
			? path.join(
					options.outdir,
					options.context.clientDir,
					options.inputPath.replace(/[tj]sx$/, "tsx")
				)
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
	const output = await buildServer(options)
	return /** @type {EleventySolidComponentModule} */ (
		requireFromString(output, options.inputPath)
	)?.data
}

/**
 * @param {Omit<EleventySolidBuildOptions, "outdir">} options
 */
export async function buildServer(options) {
	const source = await readFile(options.inputPath, "utf-8")
	const filename = path.basename(options.inputPath)
	return await transformAsync(source, {
		presets: [
			[typescript],
			[solid, {generate: "ssr", hydratable: options.context.hydrate}],
			[env, {modules: "commonjs"}],
		],
		filename,
		sourceMaps: "inline",
	}).then(result => result?.code ?? "")
}

/**
 * @param {EleventySolidBuildOptions} options
 */
async function buildClient(options) {
	const source = await readFile(options.inputPath, "utf-8")
	const filename = path.basename(options.inputPath)
	const {name} = path.parse(options.inputPath)
	return await transformAsync(source, {
		presets: [
			[typescript],
			[solid, {generate: "dom", hydratable: options.context.hydrate}],
			[env, {modules: false}],
		],
		filename,
		sourceMaps: "inline",
	}).then(async result => {
		await writeFile(
			path.join(options.outdir, options.context.clientDir, name + ".js"),
			result?.code ?? ""
		)
		return result?.code ?? ""
	})
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
