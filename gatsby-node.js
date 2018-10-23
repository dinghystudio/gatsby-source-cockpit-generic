
const createNodeHelpers = require('gatsby-node-helpers').default

const Cockpit = require('./api')
const utils = require('./utils')


const { createNodeFactory, generateNodeId } = createNodeHelpers({
  typePrefix: 'CockpitGeneric'
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

      return specification
    case "text":
    case "markdown":
      specification.transform = str
      specification.default = ''
      return specification
    case "repeater":
      specification.transform = arrayOnEmpty
      specification.default = []
      return specification
    case "image":
      specification.default = { path: '' }
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

    entryFactory = createNodeFactory(`Collection${name}`, node => ({
      ...node,
      internal: {
        ...node.internal,
        localize: Object.entries(specifications).map(([k, v]) => v.localize ? k : null).filter(v => v !== null) || [],
      },
    }))

    collectionEntries = await cockpit.collectionEntries(collection)
    collectionEntries.entries.map(entry => {
      entry = transformCockpitFields(entry)

      let value, spec
      for (let key in entry) {
        spec = specifications[key] || {}
        value = entry[key]

        if (spec.transform) entry[key] = spec.transform(value)
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
