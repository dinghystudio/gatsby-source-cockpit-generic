
const createNodeHelpers = require('gatsby-node-helpers').default
const { GraphQLBoolean, GraphQLList, GraphQLObjectType, GraphQLString } = require(`gatsby/graphql`)

const Cockpit = require('./api')
const utils = require('./utils')


const TYPE_PREFIX = 'CockpitGeneric'


const { createNodeFactory, generateNodeId } = createNodeHelpers({
  typePrefix: TYPE_PREFIX,
})

const { capitalize } = utils


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
    case "markdown":
      specification.transform = str
      specification.default = ''
      specification.graphQLType = GraphQLString
      return specification
    case "repeater":
      specification.transform = valueArrayOnEmpty
      specification.default = []
      specification.graphQLType = GraphQLList(GraphQLString)
      return specification
    case "image":
      specification.default = { path: '' }
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


const createCollectionNodes = async ({ createNode, createParentChildLink }, cockpit, whitelist) => {
  const CollectionNode = createNodeFactory('Collection')

  let collections = whitelist
  if (!collections) collections = await cockpit.listCollections()

  let collection, collectionNode, collectionEntries, entryFactory, name, specifications
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

    entryFactory = createNodeFactory(`Collection${name}`)

    collectionEntries = await cockpit.collectionEntries(collection)
    collectionEntries.entries.map(entry => {
      entry = transformCockpitFields(entry)

      let value, spec
      for (let key in entry) {
        spec = specifications[key] || {}

        value = entry[key]
        if (value && spec.transform) value = spec.transform(value)
        if (!value) value = spec.default
        entry[key] = value

        if (spec.link) {
          entry[`${key}___NODE`] = entry[key]
          delete entry[key]
        }
      }

      const entryNode = entryFactory(entry)
      createNode(entryNode)

      createParentChildLink({ parent: collectionNode, child: entryNode })
    })
  }
}


exports.sourceNodes = async ({ actions }, configOptions) => {
  const { host, accessToken } = configOptions
  const cockpit = new Cockpit(host, accessToken)

  await createCollectionNodes(actions, cockpit, configOptions.collections)
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
