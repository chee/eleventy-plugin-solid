import EleventySolid from "./eleventy-solid.js"
import {generateHydrationScript, renderToStringAsync} from "solid-js/web"
import path from "node:path"
import dedent from "dedent"

/**
 * @typedef {Object} EleventySolidPluginGlobalOptions
 * @prop {string[]} [extensions] extensions the template should treat as
 *                               solid-js (defaults to `["11ty.solid.tsx",
 *                               "11ty.solid.jsx"]`)
 * @prop {boolean} [hydrate] if we should output client side js to hydrate
 *                           (default `false`)
 * @prop {boolean} [island] if we should output in `@11ty/is-land`. only valid
 *                          when hydrate is true (default `false`)
 */

/**
 * @param {import("@11ty/eleventy").UserConfig} eleventy
 * @param {EleventySolidPluginGlobalOptions} options
 *
 * */
export default (
	eleventy,
	{
		extensions = ["11ty.solid.tsx", "11ty.solid.jsx"],
		hydrate = false,
		island = false,
	} = {}
) => {
	let solid = new EleventySolid({extensions, hydrate})
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

	eleventy.addShortcode("solidHydrationScript", () => {
		return generateHydrationScript()
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
				let component = solid.getComponent(path.normalize(inputPath))
				let settings = Object.assign({}, {hydrate, island}, data.solid)

				let hydrationData =
					typeof settings.props == "function"
						? settings.props(data)
						: settings.props || {}

				let html = await renderToStringAsync(() =>
					component.server(Object.assign({}, data, hydrationData))
				)
				let parsed = path.parse(inputPath)

				let hydrationScript = dedent/*html*/ `
					<script type="module">
						import component from "/solid/${parsed.name}.js"
						import {hydrate} from "solid-js/web"
						for (let el of document.querySelectorAll("solid-island[name='${parsed.name}']"))
							hydrate(
								() => component(${JSON.stringify(hydrationData)}),
								el
							)
					</script>
				`

				if (settings.hydrate && settings.island) {
					return dedent/*html*/ `
						<is-land ${settings.on ? `on:${settings.on}` : ""}>
							<solid-island name="${parsed.name}">${html}</solid-island>
							<template data-island>${hydrationScript}</template>
						</is-land>`
				} else if (settings.hydrate) {
					return (
						/*html*/ `<solid-island name="${parsed.name}">${html}</solid-island>` +
						hydrationScript
					)
				}
				return /*html*/ `<solid-island name="${parsed.name}">${html}</solid-island>`
			}
		},
	})
}
