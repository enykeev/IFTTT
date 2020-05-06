const React = require('react')
const ReactDOM = require('react-dom')

const { Provider } = require('react-redux')
const RPC = require('rpc-websockets')

const store = require('./store')
const Intro = require('./components/intro')
const Executions = require('./components/executions')

require('./css/index.css')

const socket = new Promise((resolve, reject) => {
  const ws = window.ws = new RPC.Client(`ws://${location.hostname}:1234/api/`)

  ws.once('open', () => resolve(ws))
  ws.once('error', reject)
})

async function fetchExecutions () {
  const ws = await socket
  store.dispatch({ type: 'EXECUTION_FETCH', status: 'pending' })
  try {
    const data = await ws.call('execution.list', { pageSize: 15 })
    store.dispatch({ type: 'EXECUTION_FETCH', status: 'success', data })
  } catch (error) {
    console.log(error)
    store.dispatch({ type: 'EXECUTION_FETCH', status: 'error', error })
  }
}

function App () {
  React.useEffect(() => {
    fetchExecutions()
  }, [])

  return <div className="page">
    <Intro />
    <Executions />
  </div>
}

ReactDOM.render(
  <Provider store={store}>
    <App />
  </Provider>,
  document.getElementById('root')
)
