# eleventy-plugin-solid

<center>🏝️💖</center>

Adds [SolidJS](https://www.solidjs.com) support to
[Eleventy](https://www.11ty.dev). Eleventy processes `11ty.solid.tsx` and
`11ty.solid.jsx` as Eleventy templates and outputs server-side rendered
components that are optionally hydrated with
[`<is-land>`](https://github.com/11ty/is-land) on the client side!

## usage

compatible with eleventy 3+

### config

```ts
// .eleventy.js
import solid from "eleventy-plugin-solid"

export default eleventyConfig => {
	eleventyConfig.addPlugin(solid, {
        // default options shown

        // the file extensions the plugin should register
        extensions: ["11ty.solid.tsx", "11ty.solid.jsx"],

        // if we should output solid's client side js to hydrate the component
        // in the browser
        hydrate: false

        // (when hydrate: true) if the hydration output should be wrapped in a
        // @11ty/is-land web component, with the hydration script in a data-island
        // this requires you to set up @11ty/is-land as per the instructions
        // https://github.com/11ty/is-land
        island: false
    })
}
```

### templates

```jsx
import {createSignal as signal} from "solid-js"

export const data = {
	title: "my post title",
	solid: {
		// the global `island` and `hydrate` settings can be overridden on a
		// template-by-template basis
		hydrate: true,
		island: true,
		// when is-land is in use, you can set the `on:` attr here. see is-land
		// docs for other valid values
		on: "visible",
		// the props passed on to the component when hydrating. this can be an object
		// or a function that gets passed the eleventy data object
		props(data) {
			return {title: data.title}
		},
	},
}

// during server-side rendering the component gets passed the _entire_ data
// object as props like any other template. make sure you provide anything you
// need in the serialized props function in the data.solid export!
export default function Counter(props) {
	const [count, update] = signal(0)
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

## thanks

thanks to [eleventy-plugin-vue](https://github.com/11ty/eleventy-plugin-vue/)
and [eleventy-plugin-svelte](https://github.com/gobeli/eleventy-plugin-svelte)
for showing me the light

## todo

- [ ] write tests
- [ ] buy a lucy and yak jumpsuit
- [ ] return to mexico
- [ ] eat tacos
