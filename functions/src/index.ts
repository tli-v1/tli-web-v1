import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { VertexAI } from '@google-cloud/vertexai';
import textToSpeech from '@google-cloud/text-to-speech';

admin.initializeApp();

const projectId = 'peak-bit-486121-n6';
const location = 'us-central1';
const model = 'gemini-2.5-flash-lite';
const speechClient = new textToSpeech.TextToSpeechClient({
  apiEndpoint: 'us-texttospeech.googleapis.com',
});
const conversationalVoicePrompt = `Speak as a warm, attentive male legal-intake guide in a natural conversation.
Use a neutral North American accent with a deep, grounded register, gentle concern, and calm confidence.
Sound human and present, never like an announcer, phone tree, or formal narrator.
Use a soothing tone, natural rhythm, short pauses, and soft emphasis. Keep the delivery conversational and direct rather than slow or meditative.
Keep questions inviting and concise.
Do not sound distressed, overly cheerful, theatrical, patronizing, or flirtatious.
When discussing injuries or difficult events, convey quiet empathy without exaggerating emotion.`;
const conversationalIntakes = admin.firestore().collection('conversationalIntakes');

interface IntakeMessage {
  role: 'user' | 'assistant';
  content: string;
}

function validIntakeMessage(value: unknown): value is IntakeMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (message.role === 'user' || message.role === 'assistant')
    && typeof message.content === 'string'
    && message.content.trim().length > 0
    && message.content.length <= 10000;
}

export const persistConversationalIntake = onCall(
  {
    region: 'us-central1',
    maxInstances: 20,
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    const action = request.data?.action;
    const providedSessionId = typeof request.data?.sessionId === 'string'
      ? request.data.sessionId.trim()
      : '';
    const sessionRef = providedSessionId
      ? conversationalIntakes.doc(providedSessionId)
      : conversationalIntakes.doc();
    const userId = request.auth?.uid ?? null;

    if (action === 'ensure') {
      await sessionRef.set({
        id: sessionRef.id,
        recordType: 'conversational_intake',
        displayName: 'Conversational Intake',
        agent: 'conversational-intake',
        intakeStatus: 'in_progress',
        rawAnswers: {},
        userId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});
      return {sessionId: sessionRef.id};
    }

    if (action === 'exchange') {
      const userMessage = request.data?.userMessage;
      const assistantMessage = request.data?.assistantMessage;
      if (!validIntakeMessage(userMessage) || !validIntakeMessage(assistantMessage)) {
        throw new HttpsError('invalid-argument', 'Valid user and assistant messages are required.');
      }

      const intake = request.data?.intake;
      const batch = admin.firestore().batch();
      batch.set(sessionRef, {
        id: sessionRef.id,
        recordType: 'conversational_intake',
        displayName: 'Conversational Intake',
        agent: 'conversational-intake',
        intakeStatus: intake?.complete === true ? 'complete' : 'in_progress',
        userId,
        lastMessage: assistantMessage.content,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(intake?.complete === true
          ? {completedAt: admin.firestore.FieldValue.serverTimestamp()}
          : {}),
      }, {merge: true});
      batch.set(sessionRef.collection('messages').doc(), {
        ...userMessage,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batch.set(sessionRef.collection('messages').doc(), {
        ...assistantMessage,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (
        intake
        && typeof intake.step === 'string'
        && typeof intake.answer === 'string'
        && intake.step.length <= 100
        && intake.answer.length <= 10000
      ) {
        batch.set(sessionRef, {
          rawAnswers: {
            [intake.step]: intake.answer,
          },
        }, {merge: true});
      }

      await batch.commit();
      return {sessionId: sessionRef.id};
    }

    if (action === 'file') {
      const file = request.data?.file;
      if (
        !file
        || typeof file.name !== 'string'
        || typeof file.contentType !== 'string'
        || typeof file.size !== 'number'
        || typeof file.storagePath !== 'string'
      ) {
        throw new HttpsError('invalid-argument', 'Valid file metadata is required.');
      }

      if (!userId || !file.storagePath.startsWith(`conversational-intakes/${userId}/`)) {
        throw new HttpsError('permission-denied', 'File ownership could not be verified.');
      }

      await sessionRef.set({
        files: admin.firestore.FieldValue.arrayUnion({
          name: file.name.slice(0, 500),
          contentType: file.contentType.slice(0, 200),
          size: file.size,
          storagePath: file.storagePath.slice(0, 2000),
          uploadedAt: new Date().toISOString(),
        }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});
      return {sessionId: sessionRef.id};
    }

    if (action === 'processing') {
      const status = request.data?.status;
      if (!['processing', 'processed', 'failed'].includes(status)) {
        throw new HttpsError('invalid-argument', 'Valid processing status is required.');
      }

      await sessionRef.set({
        processingStatus: status,
        structuredData: request.data?.structuredData ?? null,
        caseId: typeof request.data?.caseId === 'string' ? request.data.caseId : null,
        processingError:
          typeof request.data?.error === 'string' ? request.data.error.slice(0, 2000) : null,
        processedAt:
          status === 'processed' ? admin.firestore.FieldValue.serverTimestamp() : null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});
      return {sessionId: sessionRef.id};
    }

    throw new HttpsError('invalid-argument', 'Unsupported persistence action.');
  },
);

export const synthesizeConversationalSpeech = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    const text = typeof request.data?.text === 'string'
      ? request.data.text.replace(/\s+/g, ' ').trim()
      : '';

    if (!text) {
      throw new HttpsError('invalid-argument', 'Text is required.');
    }

    if (text.length > 1200) {
      throw new HttpsError('invalid-argument', 'Text must be 1,200 characters or fewer.');
    }

    try {
      const [response] = await speechClient.synthesizeSpeech({
        input: {
          text,
          prompt: conversationalVoicePrompt,
        },
        voice: {
          languageCode: 'en-US',
          name: 'Achernar',
          modelName: 'gemini-2.5-flash-tts',
        },
        audioConfig: {
          audioEncoding: 'MP3',
        },
      });

      if (!response.audioContent) {
        throw new Error('Cloud Text-to-Speech returned no audio.');
      }

      return {
        audioContent: Buffer.from(response.audioContent).toString('base64'),
        contentType: 'audio/mpeg',
        voice: 'Achernar',
        model: 'gemini-2.5-flash-tts',
      };
    } catch (error) {
      console.error('Cloud Text-to-Speech synthesis failed', error);
      throw new HttpsError('internal', 'Unable to synthesize speech.');
    }
  },
);

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: any;
}

interface ChatRequest {
  messages: ChatMessage[];
  userId?: string;
}

interface ChatResponse {
  message: string;
  extractedData?: any;
}

export const chat = onRequest(
  {
    region: 'us-central1',
    cors: true,
    maxInstances: 10,
    memory: '512MiB',
    timeoutSeconds: 60,
  },
  async (req, res) => {
  // CORS is handled automatically by the cors: true option
  
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Verify Firebase Auth token (optional for now)
    const authHeader = req.headers.authorization;
    
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        await admin.auth().verifyIdToken(token);
        // Token is valid - could use for additional security checks
      } catch (error) {
        console.warn('Token verification failed:', error);
        // Continue without auth for now - can make this required later
      }
    }

    const { messages, userId }: ChatRequest = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Messages array is required' });
      return;
    }

    // Initialize Vertex AI
    const vertexAI = new VertexAI({ project: projectId, location });
    const generativeModel = vertexAI.getGenerativeModel({
      model,
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.7,
        topP: 0.8,
      },
    });

    // Build conversation history for Gemini
    const conversationHistory = messages.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    // System prompt for legal case intake
    const systemPrompt = `You are a helpful AI assistant for a legal case intake system. Your job is to:
1. Ask clarifying questions about the user's legal incident
2. Gather key information: what happened, when, where, who was involved, damages/injuries
3. Be empathetic and professional
4. Extract structured data from the conversation

When you have enough information, extract it in this JSON format at the end of your response:
EXTRACTED_DATA: {
  "incident_description": "brief summary",
  "incident_date": "YYYY-MM-DD or null",
  "city": "city name or null",
  "state": "state code or null",
  "damages": {
    "medical_expenses": number or null,
    "lost_wages": number or null
  },
  "parties": [
    { "role": "defendant", "name": "party name" }
  ]
}

Only include EXTRACTED_DATA when you have concrete information to extract.`;

    // Add system prompt to the beginning
    const chat = generativeModel.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: systemPrompt }],
        },
        {
          role: 'model',
          parts: [{ text: 'Understood. I will help gather legal case information professionally and extract structured data when available.' }],
        },
        ...conversationHistory.slice(0, -1), // All messages except the last user message
      ],
    });

    // Send the latest user message
    const lastMessage = messages[messages.length - 1];
    const result = await chat.sendMessage(lastMessage.content);
    const response = result.response;
    const aiMessage = response.candidates?.[0]?.content?.parts?.[0]?.text || 
                      "I'm sorry, I couldn't process that. Could you rephrase?";

    // Try to extract structured data from the response
    let extractedData = null;
    const extractedMatch = aiMessage.match(/EXTRACTED_DATA:\s*({[\s\S]*?})/);
    if (extractedMatch) {
      try {
        extractedData = JSON.parse(extractedMatch[1]);
      } catch (e) {
        console.error('Failed to parse extracted data:', e);
      }
    }

    // Remove the EXTRACTED_DATA section from the user-facing message
    const cleanMessage = aiMessage.replace(/EXTRACTED_DATA:[\s\S]*$/, '').trim();

    const responseData: ChatResponse = {
      message: cleanMessage,
    };

    if (extractedData) {
      responseData.extractedData = extractedData;
    }

    // Log for debugging (no PHI in logs for HIPAA)
    console.log('Chat request processed', {
      userId: userId || 'anonymous',
      messageCount: messages.length,
      hasExtractedData: !!extractedData,
    });

    res.status(200).json(responseData);
  } catch (error: any) {
    console.error('Chat function error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message || 'Failed to process chat request',
    });
  }
}
);
