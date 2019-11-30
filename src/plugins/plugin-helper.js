const fs = require('fs')
const readYaml = require('read-yaml')

const getConfig = configFilePath => {
  if (configFilePath !== '' && fs.existsSync(configFilePath)) {
    return readYaml.sync(configFilePath)
  }
}

module.exports = {
  getConfig
}
