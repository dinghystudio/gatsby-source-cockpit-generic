
# Gatsby Source Cockpit Generic #

GatsbyJS source plugin for fetchting collections and singletons from a [Cockpit CMS API](https://getcockpit.com/documentation/api).


## Current Featureset #

* Asset loading and linking
* Collection relations
* i18n
* (naive) Repeater fields
* Black- / Whitelisting of Cockpit Collections, Singletons, Media Assets


## Usage #

* Installation, configuration options & defaults
* Fetching contents
* Creating pages
* Generating slugs
* Multilingual setup
* Serving remote files / documents
* Black- / Whitelisting


### Installation, configuration & defaults #

Add `gatsby-source-cockpit-generic` to `gatsby-config.js`:

```javascript
module.exports = {
  plugins: [
    {
      resolve: 'gatsby-source-cockpit-generic',
      options: {
        host: `${process.env.COCKPIT_HOST}`,
        accessToken: `${process.env.COCKPIT_ACCESS_TOKEN}`,
        l10n: {
          default: "en",
        },
      },
    },
  ],
}
```

Add `l10n` and define a default language code that may be used to access field’s default values. Additionally the plugin will create an entry `alternates` with relations to the node in all available languages.


### Fetching contents #

Use environment variables to configure access to the Cockpit API:

```bash
#!/bin/bash
COCKPIT_HOST="https://www.url-of-your-gatsby-site.com" COCKPIT_ACCESS_TOKEN="[access token as configured in Cockpit]" gatsby develop
```


### Creating pages #

Create pages based on Cockpit data by hooking into `createPages` in `gatsby-node.js`:

```js
// gatsby-node.js
const path = require(`path`)

exports.createPages = ({ graphql, actions }) => {
  const { createPage } = actions

  const component = path.resolve('src/templates/page.js')
  const query = `
  {
    allCockpitGenericCollectionEntries {
      edges {
        node {
          slug
          meta {
            id
          }
        }
      }
    }
  }
  `

  return graphql(query).then(result => {
    if (result.errors) {
      throw result.errors
    }

    result.data.allCockpitGenericCollectionEntries.edges.forEach(
      ({ node }) => {
        const { slug, meta: { id } } = node
        createPage({
          path: slug,
          component,
          context: {
            id,
          },
        })
      }
    )
  })
}
```

The page template should then query for nodes using the id from context:

```js
// src/templates/page.js
import React from 'react'
import { graphql } from 'gatsby'

const Entry = ({ data: { entry } }) => (
  <>
    <h1>Entry "{entry.title}"</h1>
    <pre>{JSON.stringify(entry, null, 2)}</pre>
  </>
)

export default Entry

export const query = graphql`
  query Entry($id: String!) {
    entry: cockpitGenericCollectionEntries(
      meta: { id: { eq: $id } }
    ) {
      title
    }
  }
`
```


### Generating slugs #

Add custom slugs to Cockpit sourced nodes by hooking into `onCreateNode`:

```js
// gatsby-node.js

exports.onCreateNode = ({ node, actions }) => {
  const { createNodeField } = actions

  if (node.internal.type === 'CockpitGenericCollectionEntries') {
    const value = slugify(node.title)
    createNodeField({ node, name: 'slug', value })
  }
}

// minimal slugify taken from https://gist.github.com/mathewbyrne/1280286
// for production probably better to use https://www.npmjs.com/package/slugify
function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')         // Replace spaces with -
    .replace(/&/g, '-and-')       // Replace & with 'and'
    .replace(/[^\w\-]+/g, '')     // Remove all non-word chars
    .replace(/\--+/g, '-')        // Replace multiple - with single -
    .replace(/^-+/, '')           // Trim - from start of text
    .replace(/-+$/, '')           // Trim - from end of text
}
```

The slug field can then be used in page creation:

```diff
    const query = `
    {
      allCockpitGenericCollectionEntries {
        edges {
          node {
-           slug
+           fields {
+             slug
+           }
            meta {
              id
            }
          }
        }
      }
    }
    `
    // …
    result.data.allCockpitGenericCollectionEntries.edges.forEach(
      ({ node }) => {
-       const { slug, meta: { id } } = node
+       const { fields: { slug }, meta: { id } } = node
        createPage({
          path: slug,
          component,
          context: {
            id,
          },
        })
      }
    )
```


### Multilingual setup #

If Cockpit is configured for multiple languages, alternates can be created by updating configuration and sourcing like this:

```diff
// gatsby-config.js
module.exports = {
  plugins: [
    {
      resolve: 'gatsby-source-cockpit-generic',
      options: {
        host: `${process.env.COCKPIT_HOST}`,
        accessToken: `${process.env.COCKPIT_ACCESS_TOKEN}`,
        l10n: {
          default: "en",
+         languages: ['de', 'en'],
        },
      },
    },
  ],
}
```

```diff
// gatsby-node.js
+ const { isObject, merge } = require('lodash')
+
+ const PATH_LOCALIZATIONS = {
+   exceptions: ['/404/', '/404.html', '/dev-404-page/'],
+ }
+
+ function getLanguageConfig(config) {
+   // return the l10n configuration from gatsby-source-cockpit-generic
+   const {
+     options: { l10n },
+   } = config.plugins.find(
+     p => isObject(p) && p.resolve === 'gatsby-source-cockpit-generic'
+   )
+   return l10n
+ }

// …

    result.data.allCockpitGenericCollectionArtworks.edges.forEach(
      ({ node }) => {
-       const { fields: { slug }, meta: { id } } = node
+       const { language, fields: { slug }, meta: { id } } = node

        createPage({
          path: slug,
          component,
          context: {
            id,
+           language,
          },
        })
      }
    )

// …

+ exports.onCreatePage = ({ page, actions, store }) => {
+   // for every page that is not yet localized, remove existing path, create
+   // new path and page for every language specified in config
+   const { exceptions } = PATH_LOCALIZATIONS
+   if (exceptions.includes(page.path)) return
+
+   const { config } = store.getState()
+   const l10n = getLanguageConfig(config)
+
+   console.log('l10n', l10n)
+   if (l10n && l10n.languages) {
+     const { createPage, deletePage } = actions
+     const { languages, default: defaultLanguage } = l10n
+
+     deletePage(page)
+
+     let updatedPage, localePath
+     languages.forEach(language => {
+       localePath = language === defaultLanguage && page.path === '/'
+         ? page.path
+         : `/${language}${page.path}`
+
+       updatedPage = merge({}, page, {
+         path: localePath,
+         context: { language },
+       })
+
+       createPage(updatedPage)
+     })
+   }
+ }
```

Afterwards `language` is available through page context (for further usage in react-i18next, linguiJS and other i18n libraries). Query for alternates (to be added to html head) via graphql:

```diff
// src/templates/page.js
import React from 'react'
import { graphql } from 'gatsby'

- const Entry = ({ data: { entry } }) => (
+ const Entry = ({ data: { entry }, pageContext }) => (
  <>
    <h1>Entry "{entry.title}"</h1>
+   <p>language: <code>{pageContext.language}</code></p>
    <pre>{JSON.stringify(entry, null, 2)}</pre>
  </>
)

export default Entry

export const query = graphql`
  query Entry($id: String!) {
    entry: cockpitGenericCollectionEntries(
      meta: { id: { eq: $id } }
    ) {
      title
+     language
+
+     alternates {
+       title
+       language
+
+       fields {
+         slug
+       }
+     }
    }
  }
`
```


### Serving remote files / documents (that are not images) #

To serve assets that are not of an image mime type that Gatsby image recognizes, you need to configure a separate `gatsby-source-filesystem` before the `gatsby-source-cockpit-generic` and create a placeholder file (e.g. `${__dirname}/gatsby-filesystem-placeholder.txt`) which apparently is needed for the `publicURL` attribute to be available:

```js
// gatsby-config.js
module.exports = {
  siteMetadata: {
    title: '…',
  },
  plugins: [
    {
      // We need filesystem source plugin to add publicURL function to File nodes
      resolve: 'gatsby-source-filesystem',
      options: {
        name: 'placeholder',
        path: `${__dirname}/gatsby-filesystem-placeholder.txt`,
      },
    },
    {
      resolve: 'gatsby-source-cockpit-generic',
      options: {
        '//': '…',
      },
    },
  ],
}
```

Then you can query the remote file with a `publicURL` field.
See [Issue #4993](https://github.com/gatsbyjs/gatsby/issues/4993) for details.


### Black- / Whitelisting #

To only fetch certain Collections, Singletons or Assets it is possible to configure blacklists, whitelists and filetypes:

```diff
    {
      resolve: 'gatsby-source-cockpit-generic',
      options: {
        '//': '…',
+       contents: [
+         {
+           type: 'collection',
+           blacklist: ['news'],
+           whitelist: ['entries', 'news', 'tags'],
+         },
+         { type: 'singleton', whitelist: ['contact'], blacklist: [] },
+         {
+           type: 'asset',
+           filetypes: {
+             image: true,
+             video: true,
+             audio: true,
+             archive: true,
+             document: true,
+             code: true,
+           },
+           tags: {
+             whitelist: [],
+             blacklist: [],
+           },
+         },
+       ],
      },
    },
```

If no white- or blacklists are specified, the plugin will fetch a complete list via Cockpit’s API. Blacklists precede whitelists. Entries should be the lowercase names as given per Cockpit’s API at `/api/collections/listCollections` and `/api/singletons/listSingletons`.

*Note* blacklisting a collection, that has relations to other collections will currently break the setup.


## Development Status #

As of February 2019 this plug in is in productive use on at least two public sites. However there are currently no automated tests. Also the current usage is highly specific and contents are heavily controlled.

Please see the source repositories at GitHub and GitLab for issues and current status.
Issues and pull requests welcome!


## Todos #

* Test
* Add full example
* Implement node caching and cache invalidation
* Enhance console output using Gatsby’s `reporter`
* White- and blacklisting of Collections and Singletons. Could either be
  * naive: simply ignore a list of blacklisted Collections/Singletons or only fetch whitelisted contents.
  * smarter: considering relations between Collections


## Reasoning #

Why **yet another Cockpit Source Plugin?**

At the time of writing, plenty other plugins were available but heavily in development, not officially working with GatsbyJS v2, did not handle i18n, repeater fields or put emphasis on things we didn’t need in a source plugin (layout fields).
The features needed in our project were straight forward and writing a custom plugin seemed easy enough. Also the featureset grew with our needs.


## Previous work #

* [Ginetta Cockpit Source Plugin](https://github.com/ginetta/ginetta-gatsby-source-plugin/)
* [@fika/Gatsby-Source-Cockpit](https://github.com/fikaproductions/fika-gatsby-source-cockpit) as featured in the official GatsbyJS docs
* [Gatsby-Source-Cockpit](https://github.com/mpartipilo/gatsby-source-cockpit) by @mpartipilo


## Thanks #

Thanks to [@mpartipilo](https://github.com/mpartipilo/) for interesting exchange on Gatsby-Source-Plugin development and oddities of the Cockpit API via the [Gatsby Discord channel](https://discordapp.com/channels/102860784329052160/103314369600843776).
