import createEleventySolidContext from "./eleventy-solid.js"
import path from "node:path"
import {generateHydrationScript} from "solid-js/web"

/**
 * @import {RollupBabelInputPluginOptions as BabelOptions} from "@rollup/plugin-babel"
 */

/**
 * @typedef {Object} EleventySolidPluginGlobalOptions
 * @prop {string[]} extensions extensions the template should treat as
 *                             solid-js (defaults to `["11ty.solid.tsx",
 *                             "11ty.solid.jsx"]`)
 * @prop {string[]} external extra modules to treat as external in the client-side bundle
 * @prop {boolean} hydrate if we should output client side js to hydrate
 *                         (default `false`)
 * @prop {number} timeout the max time (in ms) to wait for suspense
 *                        boundaries to resolve during SSR. Set to 0 to use
 *                        sync renderToString (default `30000`)
 *  @prop {BabelOptions} babel extra options to pass to the babel rollup plugin
 */

/**
 * @typedef {EleventySolidPluginGlobalOptions & {
 * props?: any | ((any) => any)
 * on?: string
 * }} EleventySolidSettings
 */

/**
 * @param {import("@11ty/eleventy").UserConfig} eleventy
 * @param {Partial<EleventySolidPluginGlobalOptions>} opts
 * */
export default (eleventy, opts = {}) => {
	/** @type {EleventySolidPluginGlobalOptions} */
	const globalOptions = Object.assign(
		{
			extensions: ["11ty.solid.tsx", "11ty.solid.jsx"],
			hydrate: false,
			timeout: 30000,
			external: [],
			babel: {},
		},
		opts
	)

	const context = createEleventySolidContext()

	eleventy.addShortcode("solidHydrationScript", function (options = {}) {
		/** @ts-expect-error outdated types */
		return generateHydrationScript(options)
	})

	eleventy.addShortcode("solidAssets", function () {
		return this.page?.solid?.assets?.join?.("") ?? ""
	})

	eleventy.addTemplateFormats(globalOptions.extensions)
	eleventy.addExtension(globalOptions.extensions, {
		read: false,
		getData: true,
		cache: false,
		// async init() {
		// 	// @ts-expect-error incorrect types for eleventy.dir
		// 	await solid.build(eleventy.dir.output)
		// },
		/**
		 *
		 * @param {string} inputPath
		 * @returns
		 */
		getInstanceFromInputPath(inputPath) {
			return solid.getData(path.normalize(inputPath))
		},
		/**
		 *
		 * @param {string | ((any) => any)} str
		 * @param {string} inputPath
		 * @returns
		 */
		compile(str, inputPath) {
			return async data => {
				console.log("am i recompiling?")
				if (str) return typeof str === "function" ? str(data) : str
				const componentSpec = await solid.build(
					path.normalize(inputPath),
					globalOptions,
					eleventy.dir.output
				)

				const thisContext = this.config.javascriptFunctions

				const props =
					typeof componentSpec.props == "function"
						? componentSpec.props.bind(thisContext)(data)
						: componentSpec.props || {}

				const timeoutMs = globalOptions.timeout
				const {renderId} = componentSpec

				const render =
					typeof timeoutMs == "number" && timeoutMs > 0
						? componentSpec.solid.renderToStringAsync
						: componentSpec.solid.renderToString
				const html = await render(
					() => componentSpec.server.bind(thisContext)(props),
					timeoutMs ? {timeoutMs, renderId} : {renderId}
				)

				if (data.page) {
					data.page.solid ||= {}
					data.page.solid.assets ||= []
					data.page.solid.assets.push(componentSpec.solid.getAssets())
				}

				const {name} = path.parse(inputPath)

				if (globalOptions.hydrate) {
					return (
						/*html*/ `<solid-island island="${islandId(name, renderId)}">${
							html
						}</solid-island>` + createClientScript(name, props, renderId)
					)
				}
				return html
			}
		},
	})
}

/**
 *
 * @param {string} name
 * @param {string} renderId
 */
function islandId(name, renderId) {
	return `${name}#${renderId}`
}

/**
 * @param {string} name
 * @param {any} props
 * @param {string} renderId
 * @returns
 */
function createClientScript(name, props, renderId) {
	return (
		`<script type="module">` +
		`import{hydrate as h}from"solid-js/web";` +
		`import e from"/solid/${name}.js";` +
		`for(let o of document.querySelectorAll("solid-island[island='${islandId(
			name,
			renderId
		)}']"))h((()=>e(${JSON.stringify(props)})),o,{renderId:${
			renderId ? JSON.stringify(renderId) : "undefined"
		}}),o.setAttribute("hydrated","")` +
		"</script>"
	)
}
