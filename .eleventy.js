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
 * @typedef {Omit<EleventySolidPluginGlobalOptions & {
 *    props?: any | ((any) => any)
 *    on?: string
 * }, "extensions">} EleventySolidSettings
 */

/**
 * @param {import("@11ty/eleventy").UserConfig} eleventy
 * @param {EleventySolidPluginGlobalOptions} options
 * */
export default (eleventy, globalOptions = {}) => {
	const {
		extensions = ["11ty.solid.tsx", "11ty.solid.jsx"],
		hydrate = false,
		island = false,
		timeout = 30000,
		external,
		babel,
	} = globalOptions
	const solid = new EleventySolid({extensions})
	eleventy.addGlobalData("solid", {external, hydrate, island, babel})
	eleventy.on("beforeWatch", function (changedFiles) {
		const changedSolidFiles = (changedFiles || []).filter(
			/**
			 *
			 * @param {string} filename
			 */
			filename => extensions.some(ext => filename.endsWith(ext))
		)
		if (changedSolidFiles) {
			for (const file of changedSolidFiles) {
			}
			solid.build({
				...globalOptions,
			})
			return Promise.all(
				changedSolidFiles.map(async inputPath => {
					let data = await solid.data(inputPath, globalOptions, true)
					return solid.build({
						inputPath,
						force: true,
						...globalOptions,
						...data?.solid,
					})
				})
			)
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
			solid.setOutputDir(eleventy.dir.output)
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
				const isLayout = !!data?.content
				if (str) return typeof str === "function" ? str(data) : str

				const componentSpec = solid.getComponent(path.normalize(inputPath))
				const settings = /**@type {EleventySolidSettings} */ (
					Object.assign({}, {hydrate, island, timeout}, data.solid)
				)

				const props =
					typeof settings.props == "function"
						? settings.props.bind(componentSpec)(data)
						: settings.props || {}

				const serverProps = isLayout ? {...data, ...props} : props

				const timeoutMs = settings.timeout
				const serverComponent = componentSpec.server.bind(
					this.config.javascriptFunctions
				)
				const parsed = path.parse(inputPath)
				const renderId = Math.random().toString(36).slice(4).replace(/\d+/, "")

				const componentHTML =
					typeof timeoutMs == "number" && timeoutMs > 0
						? await componentSpec.solid.renderToStringAsync(
								() => serverComponent(serverProps),
								{timeoutMs, renderId: isLayout ? undefined : renderId}
							)
						: componentSpec.solid.renderToString(
								() => serverComponent(serverProps),
								{renderId: isLayout ? undefined : renderId}
							)

				// these two weird if statements make me think layouts should be
				// a different function, and perhaps more of this function
				// should be in the class
				// anyway, exiting here early so a layout can include a doctype
				// but it does mean layouts are harder to hydrate!
				// you'd have to add the hydration yourself
				// anyway layouts aren't even supported
				if (isLayout) return componentHTML

				if (data.page) {
					data.page.solid ||= {}
					data.page.solid.assets ||= []
					data.page.solid.assets.push(componentSpec.solid.getAssets())
				}

				const solidJS = dedent/*html*/ `
					<script type="module">
						import component from "/solid/${parsed.name}.js"
						import {hydrate} from "solid-js/web"
						for (const el of document.querySelectorAll("solid-island[name='${parsed.name}']"))
							hydrate(
								() => component(${JSON.stringify(props)}),
								el,
								{renderId: "${renderId}"}
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
						solidJS
					)
				}
				return componentHTML
			}
		},
	})
}
