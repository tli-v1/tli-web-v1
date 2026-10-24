import WebSocket from 'ws'
import { minervaRealtimeInstructions, intakeRealtimeModel } from '../../../functions/src/intakeInstructions'

export type Message = { role: 'user' | 'assistant'; content: string }
type Event = { type: string; [key: string]: any }

/** A real Realtime session, with bounded waits and no Firebase writes. */
export class IntakeSession {
  readonly transcript: Message[] = []
  private events: Event[] = []
  private failure?: Error
  private wake?: () => void

  private constructor(private socket: WebSocket, private timeout: number) {
    socket.on('message', data => {
      try {
        const event = JSON.parse(data.toString()) as Event
        if (event.type === 'error') this.failure = new Error(`Realtime API: ${event.error?.message ?? 'Unknown error'}`)
        else this.events.push(event)
      } catch { this.failure = new Error('Invalid Realtime JSON') }
      this.wake?.()
    })
    socket.on('error', error => { this.failure = error; this.wake?.() })
    socket.on('close', () => { this.failure ??= new Error('Realtime connection closed'); this.wake?.() })
  }

  static async connect(apiKey: string, options: { url?: string; timeout?: number } = {}) {
    const socket = new WebSocket(options.url ?? `wss://api.openai.com/v1/realtime?model=${intakeRealtimeModel}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const session = new IntakeSession(socket, options.timeout ?? 30_000)
    try {
      await session.waitFor('session.created')
      session.send({ type: 'session.update', session: {
        type: 'realtime', output_modalities: ['text'], instructions: minervaRealtimeInstructions,
      } })
      await session.waitFor('session.updated')
      return session
    } catch (error) { session.close(); throw error }
  }

  private send(event: Event) { this.socket.send(JSON.stringify(event)) }

  private async waitFor(type: string): Promise<Event> {
    const deadline = Date.now() + this.timeout
    while (true) {
      if (this.failure) throw this.failure
      const index = this.events.findIndex(event => event.type === type)
      if (index >= 0) return this.events.splice(index, 1)[0]
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new Error(`Timed out waiting for ${type}`)
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => { this.wake = undefined; resolve() }, remaining)
        this.wake = () => { clearTimeout(timer); this.wake = undefined; resolve() }
      })
    }
  }

  /** Seed prior turns to isolate a specific guardrail without paying for a full intake. */
  seed(messages: Message[]) {
    for (const message of messages) {
      this.transcript.push(message)
      this.send({ type: 'conversation.item.create', item: {
        type: 'message', role: message.role,
        content: [{ type: message.role === 'user' ? 'input_text' : 'output_text', text: message.content }],
      } })
    }
  }

  async answer(content: string): Promise<string> {
    this.seed([{ role: 'user', content }])
    this.send({ type: 'response.create', response: {
      output_modalities: ['text'], instructions: minervaRealtimeInstructions,
    } })
    const event = await this.waitFor('response.done')
    if (event.response?.status !== 'completed') {
      throw new Error(`Realtime response ${event.response?.status}: ${JSON.stringify(event.response?.status_details)}`)
    }
    const text = (event.response.output ?? []).flatMap((item: any) => item.content ?? [])
      .filter((part: any) => part.type === 'output_text' || part.type === 'text')
      .map((part: any) => part.text ?? '').join('').trim()
    if (!text) throw new Error('Realtime returned no text')
    this.transcript.push({ role: 'assistant', content: text })
    this.events = []
    return text
  }

  close() { this.socket.terminate() }
}
