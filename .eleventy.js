import * as eleventySolid from "./eleventy-solid.js"
import path from "node:path"
import {generateHydrationScript} from "solid-js/web"

/**
 * @import {RollupBabelInputPluginOptions as BabelOptions} from "@rollup/plugin-babel"
 * @import {RollupOptions} from "rollup"
 */

/**
 * @typedef {Object} EleventySolidPluginGlobalOptions
 * @prop {string[]} extensions extensions the template should treat as solid-js
 * (defaults to `["11ty.solid.tsx", "11ty.solid.jsx"]`)
 * @prop {boolean} hydrate if we should output client side js to hydrate
 * (default `false`)
 * @prop {number} timeout the max time (in ms) to wait for suspense boundaries
 * to resolve during SSR. Set to 0 to use sync renderToString (default `30000`)
 * @prop {string} derivePropsKey the name of the exported function that derives
 * props from eleventy data. (default `props`)
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
			derivePropsKey: "props",
		},
		opts
	)

	const context = eleventySolid.createContext(globalOptions)
	/** @type {Set<string>} */
	const changes = new Set()

	eleventy.on("beforeWatch", changedFiles => {
		;(changedFiles || [])
			.filter(
				/**
				 *
				 * @param {string} filename
				 */
				filename => globalOptions.extensions.some(ext => filename.endsWith(ext))
			)
			.forEach(path => {
				changes.add(path)
			})
	})

	eleventy.addShortcode("solidHydrationScript", function (options = {}) {
		/** @ts-expect-error outdated types */
		return generateHydrationScript(options)
	})

	eleventy.addShortcode("solidAssets", function () {
		return this.page?.solid?.assets?.join?.("") ?? ""
	})

	/**
	 *
	 * @param {string} inputPath
	 */
	async function build(inputPath) {
		const spec = await eleventySolid.build({
			inputPath: path.normalize(inputPath),
			context,
			// @ts-expect-error incorrect types in @11ty/eleventy.UserConfig
			outdir: eleventy.dir.output,
			force: changes.has(inputPath),
		})
		changes.delete(inputPath)
		return spec
	}

	eleventy.addTemplateFormats(globalOptions.extensions)
	eleventy.addExtension(globalOptions.extensions, {
		read: false,
		getData: ["data"],
		getInstanceFromInputPath: build,
		/**
		 *
		 * @param {string | ((any) => any)} str
		 * @param {string} inputPath
		 * @returns
		 */
		async compile(str, inputPath) {
			return async data => {
				if (str) return typeof str === "function" ? str(data) : str
				const componentSpec = await build(inputPath)

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
