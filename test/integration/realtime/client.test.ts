import { once } from 'node:events'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer, type WebSocket } from 'ws'
import { IntakeSession } from './client'
import { minervaRealtimeInstructions } from '../../../functions/src/intakeInstructions'

let server: WebSocketServer
let client: IntakeSession | undefined
const received: any[] = []
async function fixture(onResponse: (socket: WebSocket) => void) {
  received.length = 0
  server = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  await once(server, 'listening')
  server.on('connection', socket => {
    socket.send(JSON.stringify({ type: 'session.created' }))
    socket.on('message', raw => {
      const event = JSON.parse(raw.toString())
      received.push(event)
      if (event.type === 'session.update') socket.send(JSON.stringify({ type: 'session.updated' }))
      if (event.type === 'response.create') onResponse(socket)
    })
  })
  const address = server.address() as { port: number }
  client = await IntakeSession.connect('fake-test-key', { url: `ws://127.0.0.1:${address.port}`, timeout: 500 })
  return client
}
afterEach(async () => {
  client?.close()
  if (server) {
    for (const socket of server.clients) socket.terminate()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
describe('Realtime integration harness (local transport)', () => {
  it('sends production instructions and reads completed text', async () => {
    const agent = await fixture(socket => socket.send(JSON.stringify({ type: 'response.done', response: {
      status: 'completed', output: [{ content: [{ type: 'output_text', text: 'When did this happen?' }] }],
    } })))
    expect(await agent.answer('My car was damaged.')).toBe('When did this happen?')
    expect(received[0].session.instructions).toBe(minervaRealtimeInstructions)
    expect(received[0].session.output_modalities).toEqual(['text'])
    expect(received[1].item.content[0].text).toBe('My car was damaged.')
    expect(received[2].response.instructions).toBe(minervaRealtimeInstructions)
    expect(agent.transcript).toHaveLength(2)
  })
  it.each(['cancelled', 'failed', 'incomplete'])('rejects a %s response', async status => {
    const agent = await fixture(socket => socket.send(JSON.stringify({ type: 'response.done', response: { status } })))
    await expect(agent.answer('Hello')).rejects.toThrow(`Realtime response ${status}`)
  })
  it('surfaces API errors', async () => {
    const agent = await fixture(socket => socket.send(JSON.stringify({ type: 'error', error: { message: 'Rate limit' } })))
    await expect(agent.answer('Hello')).rejects.toThrow('Rate limit')
  })
  it('fails on connection closure instead of hanging', async () => {
    const agent = await fixture(socket => socket.close())
    await expect(agent.answer('Hello')).rejects.toThrow('connection closed')
  })
  it('times out when the server does not finish a response', async () => {
    const agent = await fixture(() => {})
    await expect(agent.answer('Hello')).rejects.toThrow('Timed out waiting for response.done')
  })
})
