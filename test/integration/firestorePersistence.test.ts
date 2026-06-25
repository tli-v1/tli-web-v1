import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const runLiveTest = process.env.RUN_FIRESTORE_INTEGRATION === '1'
const projectId = 'peak-bit-486121-n6'
const functionUrl =
  `https://us-central1-${projectId}.cloudfunctions.net/persistConversationalIntake`

describe.runIf(runLiveTest)('deployed conversational intake persistence', () => {
  it('writes the intake document and both messages to Firestore', async () => {
    const marker = `firestore-integration-${crypto.randomUUID()}`
    let sessionId = ''

    try {
      const functionResponse = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            action: 'exchange',
            sessionId: null,
            userMessage: {
              role: 'user',
              content: marker,
            },
            assistantMessage: {
              role: 'assistant',
              content: 'Integration-test response',
            },
            intake: {
              step: 'whatHappened',
              answer: marker,
              complete: false,
            },
          },
        }),
      })
      expect(functionResponse.ok).toBe(true)
      const functionBody = await functionResponse.json() as {
        result?: { sessionId?: string }
      }
      sessionId = functionBody.result?.sessionId || ''
      expect(sessionId).not.toBe('')

      const processingResponse = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            action: 'processing',
            sessionId,
            status: 'processed',
            caseId: 'integration-case-id',
            structuredData: {
              description: marker,
              city: 'Seattle',
              stateCode: 'WA',
            },
          },
        }),
      })
      expect(processingResponse.ok).toBe(true)

      const accessToken = execFileSync('gcloud', ['auth', 'print-access-token'], {
        encoding: 'utf8',
      }).trim()
      const firestoreBase =
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`
      const headers = { Authorization: `Bearer ${accessToken}` }

      const documentResponse = await fetch(
        `${firestoreBase}/conversationalIntakes/${sessionId}`,
        { headers },
      )
      expect(documentResponse.ok).toBe(true)
      const document = await documentResponse.json() as {
        fields?: {
          recordType?: { stringValue?: string }
          processingStatus?: { stringValue?: string }
          caseId?: { stringValue?: string }
          rawAnswers?: {
            mapValue?: {
              fields?: {
                whatHappened?: { stringValue?: string }
              }
            }
          }
        }
      }
      expect(document.fields?.recordType?.stringValue).toBe('conversational_intake')
      expect(document.fields?.processingStatus?.stringValue).toBe('processed')
      expect(document.fields?.caseId?.stringValue).toBe('integration-case-id')
      expect(
        document.fields?.rawAnswers?.mapValue?.fields?.whatHappened?.stringValue,
      ).toBe(marker)

      const messagesResponse = await fetch(
        `${firestoreBase}/conversationalIntakes/${sessionId}/messages?pageSize=10`,
        { headers },
      )
      expect(messagesResponse.ok).toBe(true)
      const messages = await messagesResponse.json() as {
        documents?: Array<{
          name: string
          fields?: {
            content?: { stringValue?: string }
          }
        }>
      }
      const contents = (messages.documents || [])
        .map((message) => message.fields?.content?.stringValue)
      expect(contents).toContain(marker)
      expect(contents).toContain('Integration-test response')
      expect(messages.documents).toHaveLength(2)

      for (const message of messages.documents || []) {
        await fetch(
          `https://firestore.googleapis.com/v1/${message.name}`,
          { method: 'DELETE', headers },
        )
      }
      await fetch(
        `${firestoreBase}/conversationalIntakes/${sessionId}`,
        { method: 'DELETE', headers },
      )
      sessionId = ''
    } finally {
      if (sessionId) {
        const accessToken = execFileSync('gcloud', ['auth', 'print-access-token'], {
          encoding: 'utf8',
        }).trim()
        await fetch(
          `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/conversationalIntakes/${sessionId}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        )
      }
    }
  }, 30000)
})
