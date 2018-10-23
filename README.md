
# Gatsby Source Cockpit Generic #

GatsbyJS source plugin for fetchting collections from a Cockpit CMS API.


## Usage #

Add `gatsby-source-cockpit-generic` to `gatsby-config.js`:

```javascript
module.exports = {
  plugins: [
    {
      resolve: 'gatsby-source-cockpit-generic',
      options: {
        host: `${process.env.COCKPIT_HOST}`,
        accessToken: `${process.env.COCKPIT_ACCESS_TOKEN}`
      }
    }
  ]
}
```

Use environment variables to configure access to the Cockpit API:

```bash
#!/bin/bash
COCKPIT_HOST="https://www.url-of-your-gatsby-site.com" COCKPIT_ACCESS_TOKEN="[access token as configured in Cockpit]" gatsby develop
```
