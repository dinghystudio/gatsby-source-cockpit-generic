
# Gatsby Source Cockpit Generic #

GatsbyJS source plugin for fetchting collections and singletons from a [Cockpit CMS API](https://getcockpit.com/documentation/api).


## Current Featureset #

* Asset loading and linking
* Collection relations
* i18n
* (naive) Repeater fields


## Usage #

* Installation, configuration options & defaults
* Fetching contents
* Creating pages
* Generating slugs
* Internationalization


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
          default: "en"
        }
      }
    }
  ]
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
    entry: cockpitGenericCollectionArtworks(
      meta: { id: { eq: $id } }
    ) {
      title
    }
  }
`
```


### Generating slugs #
### Internationalization #


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
