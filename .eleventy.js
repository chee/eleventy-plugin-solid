import EleventySolid from "./eleventy-solid.js"
import path from "node:path"
import dedent from "dedent"
import {generateHydrationScript} from "solid-js/web"

/**
 * @import {RollupBabelInputPluginOptions as BabelOptions} from "@rollup/plugin-babel"
 */

/**
 * @typedef {Object} EleventySolidPluginGlobalOptions
 * @prop {string[]} [extensions] extensions the template should treat as
 *                               solid-js (defaults to `["11ty.solid.tsx",
 *                               "11ty.solid.jsx"]`)
 * @prop {string[]} [external] extra modules to treat as external in the client-side bundle
 * @prop {boolean} [hydrate] if we should output client side js to hydrate
 *                           (default `false`)
 * @prop {boolean} [island] if we should output in `@11ty/is-land`. only valid
 *                          when hydrate is true (default `false`)
 * @prop {number} [timeout] the max time (in ms) to wait for suspense
 *                          boundaries to resolve during SSR. Set to 0 to use
 *                          sync renderToString (default `30000`)
 *  @prop {BabelOptions} [babel] extra options to pass to the babel rollup plugin
 */

/**
 * @typedef {EleventySolidPluginGlobalOptions & {
 * props?: any | ((any) => any)
 * on?: string
 * }} EleventySolidSettings
 */

/**
 * @param {import("@11ty/eleventy").UserConfig} eleventy
 * @param {EleventySolidPluginGlobalOptions} options
 * */
export default (
	eleventy,
	{
		extensions = ["11ty.solid.tsx", "11ty.solid.jsx"],
		hydrate = false,
		island = false,
		timeout = 30000,
		external,
		babel,
	} = {}
) => {
	let solid = new EleventySolid({extensions, hydrate, external, babel})
	eleventy.on("beforeWatch", function (changedFiles) {
		let changedSolidFiles = (changedFiles || []).filter(
			/**
			 *
			 * @param {string} filename
			 */
			filename => extensions.some(ext => filename.endsWith(ext))
		)
		if (changedSolidFiles) {
			// todo only build changed files
			return solid.build(eleventy.dir.output)
		}
	})

	eleventy.addShortcode("solidHydrationScript", function (options = {}) {
		/** @ts-expect-error outdated types */
		return generateHydrationScript(options)
	})

	eleventy.addShortcode("solidAssets", function () {
		return this.page?.solid?.assets?.join?.("") ?? ""
	})

	eleventy.addTemplateFormats(extensions)
	eleventy.addExtension(extensions, {
		read: false,
		getData: true,
		cache: false,
		async init() {
			await solid.build(eleventy.dir.output)
		},
		/**
		 *
		 * @param {string} inputPath
		 * @returns
		 */
		getInstanceFromInputPath(inputPath) {
			return solid.getComponent(path.normalize(inputPath))
		},
		/**
		 *
		 * @param {string | ((any) => any)} str
		 * @param {string} inputPath
		 * @returns
		 */
		compile(str, inputPath) {
			return async data => {
				if (str) return typeof str === "function" ? str(data) : str
				let componentSpec = solid.getComponent(path.normalize(inputPath))

				let settings = /**@type {EleventySolidSettings} */ (
					Object.assign({}, {hydrate, island, timeout}, data.solid)
				)

				let thisContext = this.config.javascriptFunctions

				let props =
					typeof settings.props == "function"
						? settings.props.bind(thisContext)(data)
						: settings.props || {}

				let timeoutMs = settings.timeout
				let componentHTML =
					typeof timeoutMs == "number" && timeoutMs > 0
						? await componentSpec.solid.renderToStringAsync(
								() => componentSpec.server.bind(thisContext)(props),
								{timeoutMs}
							)
						: componentSpec.solid.renderToString(() =>
								componentSpec.server.bind(thisContext)(props)
							)

				let parsed = path.parse(inputPath)
				if (data.page) {
					data.page.solid ||= {}
					data.page.solid.assets ||= []
					data.page.solid.assets.push(componentSpec.solid.getAssets())
				}

				// todo output this only once per template
				let solidJS = dedent/*html*/ `
					<script type="module">
					    /*${props}*/
						import component from "/solid/${parsed.name}.js"
						import {hydrate} from "solid-js/web"
						for (let el of document.querySelectorAll("solid-island[name='${parsed.name}']"))
							hydrate(
								() => component(${JSON.stringify(props)}),
								el
							)
					</script>
				`

				if (settings.hydrate && settings.island) {
					return dedent/*html*/ `
						<is-land ${settings.on ? `on:${settings.on}` : ""}>
							<solid-island name="${parsed.name}">${componentHTML}</solid-island>
							<template data-island>${solidJS}</template>
						</is-land>`
				} else if (settings.hydrate) {
					return (
						/*html*/ `<solid-island name="${parsed.name}">${componentHTML}</solid-island>` +
						`<!--hydrate:${parsed.name}-->${solidJS}<!--/hydrate:${parsed.name}-->`
					)
				}
				return componentHTML
			}
		},
	})
}
