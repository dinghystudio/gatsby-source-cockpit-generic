
const createNodeHelpers = require('gatsby-node-helpers').default


const getContentHelpers = (args, config) => {
  const { typePrefix, uploadPath } = config
  const { createNodeFactory, generateNodeId } = createNodeHelpers({ typePrefix })

  const AssetNode = createNodeFactory('content Asset')
  const PlainNode = createNodeFactory('content Plain')
  const RemarkNode = createNodeFactory('content Remark', node => ({
    ...node,
    internal: {
      ...node.internal,
      mediaType: 'text/markdown',
    },
  }))

  const getContentTypeNode = (type, middleware) => (
    createNodeFactory(type, middleware)
  )

  const getValueNode = (parent, type, label, value, assetMap={}) => {
    let node
    switch (type) {
      case 'asset':
        let id
        Object.keys(assetMap).map((key) => {
          if (key.includes(value.path.replace(uploadPath, ''))) id = assetMap[key]
        })
        if (!id) break

        node = AssetNode({ label, id: value.id, content___NODE: id }, { parent })
        break

      case 'markdown':
        node = RemarkNode({ label, ...value }, { parent })
        break

      default:
        node = PlainNode({ label, ...value }, { parent })
        break
    }
    return node
  }

  const getFieldSpecification = (field) => {
    const options = field.options || {}
    const specification = {
      type: field.type,
      name: field.name,
      label: field.label || field.name,
      default: field.default || '',
      localize: field.localize || false,

      link: false,
      multiple: false,
      asset: false,
      remark: false,
    }

    switch (field.type.toLowerCase()) {
      case "text":
      case "textarea":
        return specification

      case "markdown":
        specification.remark = true
        return specification

      case "collectionlink":
        specification.link = true
        specification.multiple = options.multiple || false
        specification.default = null
        if (options.multiple) specification.default = []
        return specification

      case "repeater":
        specification.link = true
        specification.multiple = options.multiple || false
        specification.default = null
        if (options.multiple) specification.default = []
        return specification

      case "asset":
      case "image":
        specification.default = null
        specification.asset = true
        return specification

      default:
        return specification
    }
  }

  const processFieldValue = (suffix, parent, source, spec, sourceField, value, assetMap={}) => {
    let id, processedValue, node, links = [], nodes = []
    let field = sourceField

    const processValue = (suffix, parent, id, index, item, assetMap={}) => {
      const { type, label } = item.field

      if (type === 'asset') return getValueNode(parent, type, label, {
        id: `${id}_${index}_${label}${suffix}`,
        ...item.value,
      }, assetMap)

      return getValueNode(parent, type, label, {
        id: `${id}_${index}_${label}${suffix}`,
        content: item.value,
      }, assetMap)
    }

    switch (spec.type) {
      case "collectionlink":
        field = `${field}___NODE`
        if (!value) break

        if (spec.multiple === false) {
          processedValue = generateNodeId(
            `collection ${value.link}`,
            `${value._id}${suffix}`
          )
          links = [].concat(links, [processedValue])
          break
        }

        processedValue = value.map(v => generateNodeId(
          `collection ${v.link}`,
          `${v._id}${suffix}`
        ))
        links = [].concat(links, processedValue)
        break

      case "asset":
      case "image":
        field = `${field}___NODE`
        if (!value) break

        Object.keys(assetMap).map((key) => {
          if (key.includes(value.path.replace(uploadPath, ''))) id = assetMap[key]
        })
        processedValue = id
        break

      case "text":
      case "textarea":
        processedValue = (value && String(value)) || ''
        break

      case "markdown":
        field = `${field}___NODE`

        id = `${source}_${spec.label}${suffix}`
        node = RemarkNode({
          id,
          content: (value && String(value)) || '',
        }, { parent })
        processedValue = node.id
        nodes.push(node)
        break

      case "repeater":
        field = `${field}___NODE`

        if (!value) break

        nodes = value.map((v, i) => processValue(
          suffix,
          parent,
          `${source}_${spec.label}`,
          i,
          v,
          assetMap,
        ))
        processedValue = nodes.map(n => n.id)
        break

      default:
        processedValue = value
    }

    return { value: processedValue, field, links, nodes }
  }

  return {
    getValueNode,
    getContentTypeNode,
    getFieldSpecification,
    generateNodeId,
    processFieldValue,
    nodeTypes: {
      AssetNode,
      PlainNode,
      RemarkNode,
    },
  }
}


module.exports = getContentHelpers