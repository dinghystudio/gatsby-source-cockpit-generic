
const createNodeHelpers = require('gatsby-node-helpers').default
const { createRemoteFileNode } = require('gatsby-source-filesystem')
const { GraphQLBoolean, GraphQLList, GraphQLObjectType, GraphQLString } = require(`gatsby/graphql`)

const Cockpit = require('./api')
const utils = require('./utils')


const TYPE_PREFIX = 'CockpitGeneric'


const { createNodeFactory, generateNodeId } = createNodeHelpers({
  typePrefix: TYPE_PREFIX,
})

const { capitalize, getSlug } = utils


const COCKPIT_FIELDS = {
  '_id': { key: 'id', resolve: v => v },
  '_created': { key: 'created', resolve: v => new Date(v * 1000) },
  '_modified': { key: 'modified', resolve: v => new Date(v * 1000) },
}


const getFieldSpecification = (field) => {
  const noop = v => v
  const linkSingle = v => v && generateNodeId(`Collection${capitalize(v.link)}`, v._id)
  const linkMultiple = v => v ? v.map(linkSingle) : []
  const str = v => String(v)
  const arrayOnEmpty = v => v ? v : []
  const valueArrayOnEmpty = v => v ? v.map(vv => vv.value) : []

  const options = field.options || {}
  const specification = {
    default: field.default || '',
    localize: field.localize,
    transform: noop,
    file: false,
    remark: false,
    link: false,
  }

  switch (field.type.toLowerCase()) {
    case "collectionlink":
      specification.transform = linkSingle
      defaultValue = {}

      if (options.multiple) {
        specification.transform = linkMultiple
        defaultValue = []
      }
      specification.default = defaultValue
      specification.link = true
      specification.graphQLType = GraphQLObjectType

      return specification
    case "text":
    case "textarea":
      specification.transform = str
      specification.default = ''
      specification.graphQLType = GraphQLString
      return specification
    case "markdown":
      specification.transform = str
      specification.default = ''
      specification.remark = true
      specification.graphQLType = GraphQLString
      return specification
    case "repeater":
      specification.transform = valueArrayOnEmpty
      specification.default = []
      specification.graphQLType = GraphQLList(GraphQLString)
      return specification
    case "image":
      specification.default = { path: '' }
      specification.file = true
      specification.graphQLType = GraphQLObjectType
      return specification
    default:
      return specification
  }
}


const getFieldSpecifications = (fields) => {
  const specifications = {}
  for (let field, spec, i = 0; i < fields.length; i++) {
    field = fields[i]
    spec = getFieldSpecification(field)
    specifications[field.name] = spec
  }
  return specifications
}


const transformCockpitFields = (entry) => {
  let spec
  for (let key in entry) {
    if (Object.keys(COCKPIT_FIELDS).indexOf(key) === -1) continue

    spec = COCKPIT_FIELDS[key]
    entry[spec.key] = spec.resolve(entry[key])
  }
  return entry
}


const createCollectionNodes = async (args, cockpit, configOptions) => {
  const { actions, cache, createNodeId, store } = args
  const { createNode, createParentChildLink, touchNode } = actions
  const CollectionNode = createNodeFactory('Collection')
  const RemarkNode = createNodeFactory('Remark', node => ({
    ...node,
    internal: {
      ...node.internal,
      mediaType: 'text/markdown',
    },
  }))
  const l10n = configOptions.l10n

  let collections = configOptions.collections
  if (!collections) collections = await cockpit.listCollections()

  let collection, collectionNode, collectionEntries, entryFactory
  let name, specifications, internalCockpit
  for (let key in collections) {
    collection = collections[key]

    name = capitalize(collection)
    collectionNode = CollectionNode({
      id: name,
      name,
    })
    createNode(collectionNode)

    collectionSpecification = await cockpit.collection(collection)
    specifications = getFieldSpecifications(collectionSpecification.fields)

    // we need to postpone entry node creation, but access internal fields
    // before. So we mock the final object
    internalCockpit = {
      cockpitType: 'collection',
      cockpitTypeName: `${name.toLowerCase()}`,
    }
    entryFactory = createNodeFactory(`Collection${name}`)

    collectionEntries = await cockpit.collectionEntries(collection)
    for (let entry, slug, i = 0; i < collectionEntries.entries.length; i++) {
      entry = collectionEntries.entries[i]
      entry = transformCockpitFields(entry)
      entry = {
        ...entry,
        internal: {
          ...(entry.internal || {}),
          ...internalCockpit,
        },
      }

      slug = (configOptions.getCollectionSlug || getSlug)(entry)
      entry = {
        ...entry,
        slug,
      }

      let spec, keys
      for (let key in specifications) {
        spec = specifications[key] || {}
        keys = {[key]: key}
        if (spec.localize) {
          for (let code, localKey, valueKey, j = 0; j < l10n.languages.length; j++) {
            code = l10n.languages[j]
            localKey = `${key}_${code}`
            valueKey = localKey

            if (code === l10n.default && Object.keys(entry).indexOf(localKey) === -1) {
              valueKey = key
            }
            keys = {
              ...keys,
              [localKey]: valueKey,
            }
          }
        }

        let value, transformed = {}
        for (let current in keys) {
          if (Object.keys(transformed).indexOf(keys[current]) !== -1) {
            value = transformed[keys[current]]
          } else {
            value = entry[keys[current]]
            if (value && spec.transform) value = spec.transform(value)
            if (!value) value = spec.default
            transformed[keys[current]] = value
          }
          entry[current] = value

          if (spec.remark) {
            let remarkNodeId

            const mediaDataCacheKey = `cockpit-asset-${entry.id}-${keys[current]}`
            const cacheMediaData = await cache.get(mediaDataCacheKey)
            if (cacheMediaData && entry.modified.toISOString() === cacheMediaData.modified) {
              remarkNodeId = cacheMediaData.remarkNodeId
              touchNode({ nodeId: remarkNodeId })
            }

            if (!remarkNodeId) {
              remarkNode = RemarkNode({
                id: `${name}_${entry.id}_${current}`,
                content: value,
                slug,
              })
              createNode(remarkNode)

              remarkNodeId = remarkNode.id
              await cache.set(mediaDataCacheKey, {
                remarkNodeId,
                modified: entry.modified.toISOString(),
              })
            }

            if (remarkNodeId) entry[`${current}___NODE`] = remarkNodeId
          }
          if (spec.file) {
            let url = value.path
            if (url) {
              let fileNodeId

              const mediaDataCacheKey = `cockpit-asset-${entry.id}`
              const cacheMediaData = await cache.get(mediaDataCacheKey)
              if (cacheMediaData && entry.modified.toISOString() === cacheMediaData.modified) {
                fileNodeId = cacheMediaData.fileNodeId
                touchNode({ nodeId: fileNodeId })
              }

              if (!fileNodeId) {
                url = cockpit.getApiUrl(cockpit.host, url, cockpit.params)
                const fileNode = await createRemoteFileNode({
                  url,
                  store,
                  cache,
                  createNode,
                  createNodeId,
                })

                fileNodeId = fileNode.id
                await cache.set(mediaDataCacheKey, {
                  fileNodeId,
                  modified: entry.modified.toISOString(),
                })
              }

              if (fileNodeId) entry[`${current}___NODE`] = fileNodeId
            }
          }
          if (spec.link) {
            entry[`${current}___NODE`] = value
          }
        }
      }

      entry = entryFactory(entry)
      createNode(entry)

      createParentChildLink({ parent: collectionNode, child: entry })
    }
  }
}


exports.sourceNodes = async (args, configOptions) => {
  const { host, accessToken } = configOptions
  const cockpit = new Cockpit(host, accessToken)

  await createCollectionNodes(args, cockpit, configOptions)
}


const getLocalizedFieldFromSpec = (
  key,
  { default: defaultValue, graphQLType, transform },  // field specifications
  { l10n },  // configOptions
) => ({
  type: graphQLType,
  args: {
    lang: {
      type: GraphQLString,
    },
    fallback: {
      type: GraphQLBoolean,
      default: false
    }
  },
  resolve: (source, fieldArgs) => {
    const { lang, fallback } = fieldArgs
    // attempt to access localized value, handle fallback when non-existent
    if (lang === l10n.default) return source[key]

    let value = source[`${key}_${lang}`]
    if (value && transform) value = transform(value)
    if (!value && fallback) value = source[key]
    if (!value) value = defaultValue
    return value
  },
})


exports.setFieldsOnGraphQLNodeType = async ({ type }, configOptions) => {
  if (!type.name.startsWith(TYPE_PREFIX)) return {}

  const { host, accessToken, l10n } = configOptions
  const cockpit = new Cockpit(host, accessToken)

  const entity = type.name.replace(TYPE_PREFIX, '')
  if (entity.startsWith('Collection')) {
    const collection = entity.replace('Collection', '').toLowerCase()
    // Only works on collections for now
    if (!collection) return {}

    const collectionSpecification = await cockpit.collection(collection)
    specifications = getFieldSpecifications(collectionSpecification.fields)

    const fields = {}
    const keys = Object.keys(specifications)

    for (let key, spec, i = 0; i < keys.length; i++) {
      key = keys[i]
      spec = specifications[key]

      // skip further processing if field is not localized
      if (!spec.localize) continue

      fields[`${key}_localized`] = getLocalizedFieldFromSpec(key, spec, configOptions)
    }

    return fields
  }
  return {}
}
