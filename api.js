
const fetch = require('node-fetch')
const querystring = require('querystring')

const utils = require('./utils')


const { trimSlashes } = utils


class Cockpit {
  constructor(host, token, headers = {}) {
    this.host = host
    this.token = token
    this.headers = headers
    this.params = querystring.stringify({ token, })
  }

  getApiUrl(host, path, params = '') {
    return `${trimSlashes(host.trim())}/${trimSlashes(path.trim())}?${params}`
  }

  async makeRequest(path) {
    const url = this.getApiUrl(this.host, path, this.params)
    const response = await fetch(url, { method: 'get', headers: this.headers })
    return await response.json()
  }

  async listCollections() {
    return await this.makeRequest('/api/collections/listCollections')
  }

  async collection(collection) {
    return await this.makeRequest(`/api/collections/collection/${collection}`)
  }

  async collectionEntries(collection) {
    return await this.makeRequest(`/api/collections/get/${collection}`)
  }
}


module.exports = Cockpit;
