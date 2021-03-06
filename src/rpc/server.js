const fs = require('fs')
const path = require('path')
const EventEmitter = require('events')

const Ajv = require('ajv')
const CircularJSON = require('circular-json')
const log = require('loglevel')
const Prometheus = require('prom-client')
const RPC = require('rpc-websockets')
const yaml = require('js-yaml')

const ajv = new Ajv()
const validateSpec = ajv.compile(require('./spec/v0'))

const HEARTBEAT = 30 * 1000

const connectionGauge = new Prometheus.Gauge({
  name: 'ifttt_rpc_clients',
  help: 'Gauge for number of clients currently connected via RPC'
})

class RPCNamespace {
  constructor (originalObject) {
    this.emitter = new EventEmitter()

    for (const key of Object.keys(originalObject)) {
      this[key] = originalObject[key]
    }
  }

  hasClients () {
    return !!this.clients.size
  }

  hasSubscribers (eventname) {
    return !!(this.events[eventname] && this.events[eventname].length)
  }

  emitRandomly (event, ...params) {
    const socketIds = [...this.clients.keys()]

    if (!socketIds.length) {
      return
    }

    const randomId = socketIds[Math.floor(Math.random() * socketIds.length)]
    this.clients.get(randomId).send(CircularJSON.stringify({
      notification: event,
      params: params || []
    }))
  }
}

class RPCServer extends RPC.Server {
  constructor (...args) {
    super(...args)

    this.wss.on('connection', (ws, req) => {
      const namespace = req.url
      log.debug('client connected to rpc namespace %s: %s', namespace, ws._id)
      connectionGauge.set(this.wss.clients.size)

      ws.isAlive = true
      ws.on('pong', () => {
        log.debug('rpc client pongs back: %s', ws._id)
        ws.isAlive = true
      })

      this.of(namespace).emitter.emit('connected', ws, req)

      ws.on('close', () => {
        log.debug('client disconnected from rpc namespace %s: %s', namespace, ws._id)
        connectionGauge.set(this.wss.clients.size)

        this.of(namespace).emitter.emit('disconnected', ws, req)

        this.emit('disconnect', ws, req)
      })
    })

    const pingInterval = setInterval(() => {
      this.wss.clients.forEach(ws => {
        log.debug('pinging rpc client: %s', ws._id)

        if (ws.isAlive === false) {
          log.debug('rpc client times out: %s', ws._id)
          return ws.terminate()
        }

        ws.isAlive = false
        ws.ping(() => {})
      })
    }, HEARTBEAT)

    this.wss.on('listening', () => {
      log.debug('rpc server starts listening')
    })

    this.wss.on('close', () => {
      log.debug('rpc server is closing')
      clearInterval(pingInterval)
    })
  }

  registerSpec (filename) {
    const content = fs.readFileSync(path.join(__dirname, filename), 'utf8')
    const spec = yaml.safeLoad(content)

    if (spec.version !== 0) {
      throw new Error('unsupported version of rpc spec')
    }

    const valid = validateSpec(spec)
    if (!valid) {
      throw new Error('spec validation failed')
    }

    for (const method in spec.methods) {
      const {
        operationId,
        namespaces = ['/']
        // TODO: start checking for parameters
      } = spec.methods[method]

      if (!operationId) {
        continue
      }

      const operation = require(`./methods/${operationId}`)

      for (const namespace of namespaces) {
        this.of(namespace).register(method, operation)
      }
    }

    for (const event in spec.events) {
      const {
        namespaces = ['/']
      } = spec.events[event]

      for (const namespace of namespaces) {
        this.of(namespace).event(event)
      }
    }
  }

  _generateNamespace (name) {
    super._generateNamespace(name)

    this.namespaces[name] = new RPCNamespace({
      ...super.of(name),
      ...this.namespaces[name]
    })
  }

  of (name) {
    if (!this.namespaces[name]) {
      this._generateNamespace(name)
    }

    return this.namespaces[name]
  }
}

module.exports = RPCServer
