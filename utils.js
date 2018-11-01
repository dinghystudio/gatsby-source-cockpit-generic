
const trimSlashes = (original) => {
  if (original.startsWith('/')) original = original.substr(1)
  if (original.endsWith('/')) original = original.substr(0, original.length - 1)
  return original
}


const capitalize = input => `${input[0].toUpperCase()}${input.substr(1)}`


const getSlug = node => `/${
  node.internal.cockpitType
}/${
  node.internal.cockpitTypeName
}/${
  node.cockpitGenericId
}`


module.exports = {
  trimSlashes,
  capitalize,
  getSlug,
}
