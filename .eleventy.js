import EleventySolid from "./eleventy-solid.js"
import path from "node:path"
import {generateHydrationScript} from "solid-js/web"

/**
 * @import {RollupBabelInputPluginOptions as BabelOptions} from "@rollup/plugin-babel"
 */

/**
 * @typedef {Object} EleventySolidPluginGlobalOptions
 * @prop {string[]} extensions extensions the template should treat as
 *                               solid-js (defaults to `["11ty.solid.tsx",
 *                               "11ty.solid.jsx"]`)
 * @prop {string[]} external extra modules to treat as external in the client-side bundle
 * @prop {boolean} hydrate if we should output client side js to hydrate
 *                           (default `false`)
 * @prop {number} timeout the max time (in ms) to wait for suspense
 *                          boundaries to resolve during SSR. Set to 0 to use
 *                          sync renderToString (default `30000`)
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
	let globalOptions = Object.assign(
		{
			extensions: ["11ty.solid.tsx", "11ty.solid.jsx"],
			hydrate: false,
			timeout: 30000,
			external: [],
			babel: {},
		},
		opts
	)
	let solid = new EleventySolid(globalOptions)
	eleventy.on("beforeWatch", async function (changedFiles) {
		let changedSolidFiles = (changedFiles || []).filter(
			/**
			 *
			 * @param {string} filename
			 */
			filename => globalOptions.extensions.some(ext => filename.endsWith(ext))
		)

		if (changedSolidFiles) {
			// todo only build changed files
			// @ts-expect-error incorrect types for eleventy.dir
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

	eleventy.addTemplateFormats(globalOptions.extensions)
	eleventy.addExtension(globalOptions.extensions, {
		read: false,
		getData: true,
		cache: false,
		async init() {
			// @ts-expect-error incorrect types for eleventy.dir
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

				let thisContext = this.config.javascriptFunctions

				let props =
					typeof componentSpec.props == "function"
						? componentSpec.props.bind(thisContext)(data)
						: componentSpec.props || {}

				let timeoutMs = globalOptions.timeout

				let render =
					typeof timeoutMs == "number" && timeoutMs > 0
						? componentSpec.solid.renderToStringAsync
						: componentSpec.solid.renderToString

				let html = await render(
					() => componentSpec.server.bind(thisContext)(props),
					timeoutMs ? {timeoutMs} : {}
				)

				let parsed = path.parse(inputPath)
				if (data.page) {
					data.page.solid ||= {}
					data.page.solid.assets ||= []
					data.page.solid.assets.push(componentSpec.solid.getAssets())
				}

				let solidJS =
					/* prettier-ignore */
					`<script type="module" defer async>` +
						`import {hydrate} from "solid-js/web";` +
						`import component from "/solid/${parsed.name}.js";` +
						`for (let el of document.querySelectorAll("solid-island[island='${parsed.name}']"))  {` +
							`hydrate(() => component(${JSON.stringify(props)}), el)` +
							`el.setAttribute("hydrated", "")` +
						`}` +
					`</script>`

				if (globalOptions.hydrate) {
					return (
						/*html*/ `<solid-island island="${parsed.name}">${html}</solid-island>` +
						solidJS
					)
				}
				return html
			}
		},
	})
}
