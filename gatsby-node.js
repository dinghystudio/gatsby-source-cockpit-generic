
const { camelCase, upperFirst, toLower, trim } = require('lodash')
const { createRemoteFileNode } = require('gatsby-source-filesystem')

const Cockpit = require('./api')
const getContentHelpers = require('./helpers')


const CONFIG_DEFAULTS = {
  host: '',
  accessToken: '',
  typePrefix: 'CockpitGeneric',
  l10n: {},
  contents: [
    { type: 'collection', whitelist: [], blacklist: [] },
    { type: 'singleton', whitelist: [], blacklist: [] },
    { type: 'asset', whitelist: [], blacklist: [] },
  ],
}


exports.sourceNodes = async (args, options) => {
  const config = {
    ...CONFIG_DEFAULTS,
    ...options,
    l10n: {
      ...CONFIG_DEFAULTS.l10n,
      ...options.l10n,
    },
  }

  const { l10n, host, accessToken, uploadPath } = config
  if (!host || !accessToken) throw new Error(
    'Please specify Cockpit host and accessToken in gatsby-config'
  )
  const cockpit = new Cockpit(host, accessToken)
  const contentTypes = [
    { type: 'collection', multiple: true },
    { type: 'singleton', multiple: false },
  ]

  const helpers = getContentHelpers(args, config)
  const { getContentTypeNode, getFieldSpecification } = helpers

  const { actions, cache, createNodeId, store } = args
  const { createNode } = actions


  let links = {}, nodes = [], assetMap = {}

  // fetch assets and create remote file nodes
  const { entries: assets } = await cockpit.assets()
  for (let asset, url, file, a = 0; a < assets.length; a++) {
    asset = assets[a]
    url = cockpit.getApiUrl(`${trim(uploadPath, '/')}/${trim(asset.path, '/')}`)

    file = await createRemoteFileNode({
      url,
      store,
      cache,
      createNode,
      createNodeId,
    })
    assetMap[asset.path] = file.id
  }

  // process content types
  for (let contentType, TypeNode, types, ct = 0; ct < contentTypes.length; ct++) {
    ({ type: contentType, multiple } = contentTypes[ct])
    TypeNode = getContentTypeNode(`${contentType}s`)

    types = await listContentType(cockpit, contentType)

    for (let type, spec, content, parent, Node, t = 0; t < types.length; t++) {
      type = types[t]

      parent = TypeNode({
        id: upperFirst(`${type}`),
        children: [],
        meta: {
          type,
          contentType,
          category: 'list',
        },
      })
      nodes = [].concat(nodes, [parent])

      Node = getContentTypeNode(`${contentType} ${type}`)

      spec = await loadContentTypeSpecification(cockpit, contentType, type)
      spec = spec.fields.map(
        (f) => ([f.name, getFieldSpecification(f)])
      ).reduce(
        (acc, [name, s]) => ({ ...acc, [name]: s, }),
        {},
      )

      content = await loadContentTypeEntries(cockpit, contentType, type)
      if (!content || !content.entries || !content.entries.length) continue

      for (let entry, i = 0; i < content.entries.length; i++) {
        entry = content.entries[i]

        // this is super weird and related to how cockpit api does not supply
        // an _id when fetching actual singleton content
        if (content._id) entry = { _id: content._id, ...entry }
        entry = {
          meta: {
            id: entry._id,
            type,
            contentType,
            category: 'entry',
          },
          ...entry,
        }

        // create node, process fields for all languages specified in config
        let alternates = []

        if (l10n.languages && l10n.languages.length) {
          // process nodes for all languages
          for (let language, processed, l = 0; l < l10n.languages.length; l++) {
            language = l10n.languages[l]
            processed = processEntry(
              Node,
              parent,
              { language, isDefault: language === l10n.default },
              spec,
              entry,
              assetMap,
              helpers,
            )

            nodes = [].concat(nodes, processed.nodes)
            parent.children.push(processed.node.id)

            // create a list of ids used for reverse relations later on
            links = processed.links.reduce((acc, v) => ({
              ...acc,
              [v]: [].concat(acc[v] || [], [{ type, id: processed.node.id}]),
            }), links)

            // keep track of identical nodes in different languages
            alternates = [].concat(alternates, [processed.node])
          }
        } else {
          // no localization configured
          processed = processEntry(
            Node,
            parent,
            {},
            spec,
            entry,
            assetMap,
            helpers,
          )

          nodes = [].concat(nodes, processed.nodes)
          parent.children.push(processed.node.id)

          // create a list of ids used for reverse relations later on
          links = processed.links.reduce((acc, v) => ({
            ...acc,
            [v]: [].concat(acc[v] || [], [{ type, id: processed.node.id}]),
          }), links)

          // keep track of identical nodes in different languages
          alternates = [].concat(alternates, [processed.node])
        }

        // link localized nodes to one another
        alternates = alternates.map(n => ({
          ...n,
          alternates___NODE: alternates.filter(a => a.id !== n.id).map(a => a.id),
        }))

        nodes = [].concat(nodes, alternates)
      }
    }
  }

  // process, create nodes and relation links
  for (let node, nodeLinks, r, i = 0; i < nodes.length; i++) {
    node = nodes[i]

    // process reverse relations
    if (Object.keys(links).includes(node.id)) {
      nodeLinks = links[node.id]
      for (let nl, key, l = 0; l < nodeLinks.length; l++) {
        nl = nodeLinks[l]
        key = `${nl.type}_set___NODE`
        if (!node[key]) node[key] = []
        node[key] = [].concat(node[key], nl.id)
      }
    }

    // finally create node
    createNode(node)
  }
}


const listContentType = async (cockpit, type, whitelist=[], blacklist=[]) => {
  let items = [].concat(whitelist)
  if (items.length > 0) return items

  items = await cockpit[camelCase(`list ${type}s`)]()
  items = items.filter(i => !blacklist.includes(i))
  return items
}


const loadContentTypeSpecification = (cockpit, type, item) => {
  const entries = cockpit[toLower(`${type}`)](item)
  return entries
}


const loadContentTypeEntries = (cockpit, type, item) => {
  const entries = cockpit[camelCase(`${type}Entries`)](item)
  return entries
}



const processEntry = (TypeNode, parent, l10n, specifications, entry, assetMap, helpers) => {
  const { processFieldValue } = helpers
  const { language, isDefault } = l10n

  const suffix = language ? `_${language}` : ''
  let links = [], nodes = [], id = entry._id
  const node = TypeNode({
    ...entry,
    children: [],
    id: `${id}${suffix}`,
    language,
  }, parent && { parent: parent.id })

  // process field values, make nodes for repeaters, generate ids for relations
  for (let [field, spec] of Object.entries(specifications)) {
    key = (spec.localize && !isDefault) ? `${field}${suffix}` : field

    const result = processFieldValue(
      suffix,
      node.id,
      id,
      spec,
      field,
      node[key],
      assetMap,
    )

    delete(node[field])
    node[result.field] = result.value
    node.children = [].concat(node.children, result.nodes.map(n => n.id))

    links = [].concat(links, result.links)
    nodes = [].concat(nodes, result.nodes)
  }

  return { node, nodes, links }
}
