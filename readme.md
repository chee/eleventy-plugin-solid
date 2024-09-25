# eleventy-plugin-solid

<br><br><div align="center">🏝️💖</div><br><br>

Adds [SolidJS](https://www.solidjs.com) support to
[Eleventy](https://www.11ty.dev). Eleventy processes `11ty.solid.tsx` and
`11ty.solid.jsx` as Eleventy templates and outputs server-side rendered
components that are (optionally) hydrated.

## usage

compatible with eleventy 3

### config

```ts
// .eleventy.js
import solid from "eleventy-plugin-solid"

export default eleventyConfig => {
	eleventyConfig.addPlugin(solid, {
		// default options shown

		// the file extensions the plugin should register
		extensions: ["11ty.solid.tsx", "11ty.solid.jsx"],

		// extra modules to treat as external in the client-side component bundle
		external: []

		// extra config options for rollup-plugin-babel
		babel: {}

		// if we should output solid's client side js to hydrate the component
		// in the browser
		// (experimental / unstable)
		hydrate: false

		// the max time (in ms) to wait for suspense boundaries to resolve during
		// SSR. you can set this to 0 to use the sync renderToString that resolves
		// all its suspense boundaries on hydration
		timeout: 30000
	})
}
```

### templates

```jsx
export const data = {
	title: "my post title",
}

// how to derive the component's props. may be an object, or a function
// that returns an object. the function from is called with your eleventy
// data during build. `this` is eleventy.config.javascriptFunctions
// [aliased as createProps]
export function props(data) {
	return {title: data.title}
}

import {createSignal} from "solid-js"

export default function Counter(props) {
	const [count, update] = createSignal(0)
	return (
		<article>
			<h1 style={{background: "lime"}}>{props.title}</h1>
			<center>
				<button onclick={() => update(c => c + 1)}>
					Clicks so far: {count()}
				</button>
			</center>
		</article>
	)
}
```

### hydration (experimental / unstable)

hydration takes a little setup. you'll need these two things

- solid's hydrationScript
- an [importmap](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap)

#### solidHydrationScript shortcode

somewhere in your layout add the `{% solidHydrationScript %}` shortcode. this
outputs the same thing as solid's
[generateHydrationScript](https://docs.solidjs.com/reference/rendering/hydration-script#hydrationscript)
function and accepts the same arguments.

it's best to do this in `<head>` so solid can start capturing events asap.

#### importmap

your
[importmap](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap)
will tell the browser how to acquire solid-js.

you could use a service like [jspm](https://jspm.org/),
[esm.sh](https://esm.sh/) etc or perhaps you'd prefer to self-host.

##### e.g. esm.sh

you can use esm.sh like this:

```html
<script type="importmap">
	{
		"solid-js": "https://esm.sh/solid-js@1.8.23",
		"solid-js/store": "https://esm.sh/solid-js@1.8.23/store"
		"solid-js/web": "https://esm.sh/solid-js@1.8.23/web"
	}
</script>
```

you'll be responsible for making sure the solid version is the same as the one
you've installed to satisfy eleventy-plugin-solid's peer dependency! if it's
different, you may see errors during hydration.

##### e.g. self-hosted

you can add an [eleventy passthrough copy](https://www.11ty.dev/docs/copy/) of
the solid-js in your `node_modules` like this:

```ts
// in .eleventy.js
eleventyConfig.addPassthroughCopy({
	"node_modules/solid-js": "/solid-js",
})
```

then your importmap might look like:

```html
<script type="importmap">
	{
		"solid-js": "/solid-js/dist/solid.js",
		"solid-js/store": "/solid-js/store/dist/store.js"
		"solid-js/web": "/solid-js/web/dist/web.js"
	}
</script>
```

## weaknesses

- layouts are unsupported
- as the components are all rendered up front (so we can get the data export
  early), it's not possible to selectively decide if a specific template should
  be hydrated

## thanks

thanks to [eleventy-plugin-vue](https://github.com/11ty/eleventy-plugin-vue/)
and [eleventy-plugin-svelte](https://github.com/gobeli/eleventy-plugin-svelte)
for showing me the light

## todo

- [ ] write tests
- [x] buy a lucy and yak jumpsuit
- [ ] return to mexico
- [ ] eat tacos
