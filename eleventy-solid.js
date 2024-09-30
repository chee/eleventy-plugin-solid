import path from "node:path"
import {transformAsync} from "@babel/core"
import {readFile, writeFile} from "node:fs/promises"
import solid from "babel-preset-solid"
import env from "@babel/preset-env"
import typescript from "@babel/preset-typescript"
import {importFromString} from "module-from-string"

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
	const code = await readFile(options.inputPath, "utf-8")
	/**
	 * @type {Promise<string>[]}
	 */
	const builds = [buildServer(code, options)]
	if (options.context.hydrate) {
		builds.push(buildClient(code, options))
	}
	const [ssr] = await Promise.all(builds)
	const module = /** @type {EleventySolidComponentModule} */ (
		await importFromString(
			// so i have access to the sharedConfig.context when rendering
			ssr + "\nexport * as solid from 'solid-js/web'",
			{filename: options.inputPath, useCurrentGlobal: true}
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
 * @param {string} code
 * @param {Omit<EleventySolidBuildOptions, "outdir">} options
 */
export async function buildServer(code, options) {
	const filename = path.basename(options.inputPath)
	return await transformAsync(code, {
		compact: true,
		presets: [
			[typescript],
			[env, {bugfixes: true, modules: false, targets: "last 1 years"}],
			[solid, {generate: "ssr", hydratable: options.context.hydrate}],
		],
		filename,
	}).then(result => result?.code ?? "")
}

/**
 * @param {string} code
 * @param {EleventySolidBuildOptions} options
 */
async function buildClient(code, options) {
	const filename = path.basename(options.inputPath)
	const {name} = path.parse(options.inputPath)
	return await transformAsync(code, {
		compact: true,
		presets: [
			[typescript],
			[env, {bugfixes: true, modules: false, targets: "last 1 years"}],
			[solid, {generate: "dom", hydratable: options.context.hydrate}],
		],
		filename,
	}).then(async result => {
		await writeFile(
			path.join(options.outdir, options.context.clientDir, name + ".js"),
			result?.code ?? ""
		)
		return result?.code ?? ""
	})
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
