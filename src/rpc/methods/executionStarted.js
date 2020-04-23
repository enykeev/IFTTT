const log = require('loglevel')
const models = require('../../models')

module.exports = async ({ id }) => {
  log.info('execution started: %s', id)
  await models.Executions.forge({ id })
    .where('status', 'claimed')
    .save({
      status: 'running'
    })
}
