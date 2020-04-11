const util = require('util')

const express = require('express')

const pubsub = require('../pubsub')
const models = require('../models')

const router = express.Router()

router.get('/', (req, res) => {
  res.send('Hello World')
})

router.get('/executions', async (req, res) => {
  const collection = await models.Executions
    .fetchAll({
      withRelated: ['result']
    })
    .map(execution => {
      return {
        ...execution.serialize(),
        result: execution.relations.result.get('result')
      }
    })

  res.json(collection)
})

async function handleMessages (msg) {
  const message = JSON.parse(msg.content.toString())
  console.log('%s:%s', msg.fields.routingKey, util.inspect(message))

  if (msg.fields.routingKey === 'execution') {
    const mod = models.Executions.forge(message)
    await mod.save(null, { method: 'insert' })
  }

  if (msg.fields.routingKey === 'result') {
    const mod = models.Results.forge(message)
    await mod.save(null, { method: 'insert' })
  }

  pubsub.channel.ack(msg)
}

async function main () {
  await pubsub.init()
  pubsub.subscribe('*', handleMessages)

  const app = express()
  app.use(express.json())

  app.use(router)

  app.listen(3000)
}

main()
  .catch(e => console.error(e))