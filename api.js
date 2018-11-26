
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

  getApiUrl(path) {
    return `${trimSlashes(this.host.trim())}/${trimSlashes(path.trim())}?${this.params}`
  }

  async makeRequest(path) {
    const url = this.getApiUrl(path)
    const response = await fetch(url, { method: 'get', headers: this.headers })
    return await response.json()
  }

  async assets() {
    const { assets: entries } = await this.makeRequest('/api/cockpit/assets')
    return { entries }
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

  async listSingletons() {
    return await this.makeRequest('/api/singletons/listSingletons')
  }

  async singleton(singleton) {
    return await this.makeRequest(`/api/singletons/singleton/${singleton}`)
  }

  async singletonEntries(singleton) {
    return await {
      ...(await this.singleton(singleton)),
      entries: [await this.makeRequest(`/api/singletons/get/${singleton}`)],
    }
  }
}


module.exports = Cockpit;
