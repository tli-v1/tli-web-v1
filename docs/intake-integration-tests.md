# Intake agent integration tests

The suite uses **Vitest**, which is already installed in this project. No Mocha setup is needed.

## Run the live agent checks

Provide `OPENAI_API_KEY` through your terminal environment or CI secret manager, then run:

```sh
npm run test:intake:live
```

The key must have access to the model exported as `intakeRealtimeModel` in `functions/src/intakeInstructions.ts`. The suite intentionally fails with setup instructions if the key is missing. It does not automatically read `.env` or fetch Firebase secrets. Never put this key in a `VITE_` variable or commit it.

This makes paid OpenAI API calls using synthetic data. It uses the production Realtime model and shared intake instructions, with text output over WebSocket. It does not write to Firebase or create accounts/cases. Expect several minutes for the complete suite.

To run one scenario:

```sh
npm run test:intake:live -- -t 'consent is refused'
```

Coverage:

- A complete conversation through all topics, separate contact questions, and explicit consent, ending with the exact account-form handoff.
- Impossible date clarification without advancing to location.
- Invalid phone number clarification without advancing to contact preference.
- Explicit refusal to provide a phone number.
- Refusal of storage/contact consent blocks completion.
- Prompt injection cannot bypass intake and force completion.
- Two off-topic redirects, followed by a pause on the third consecutive off-topic response.
- A relevant answer resets the off-topic counter.

Each test opens a separate session. The full success test has real multi-turn agent responses; focused guardrail tests seed synthetic prior turns to isolate a stage. Assertions check observable text and the app's exact completion/pause markers, not exact wording for ordinary replies. Failed tests print their synthetic transcript for diagnosis. Model behavior can vary: inspect failures rather than automatically retrying until green.

## Offline checks

```sh
npm test
```

The live suite is skipped by default. Local WebSocket harness tests verify production prompt wiring, text output, completed responses, cancelled/failed/incomplete responses, API errors, disconnects, and timeouts. Those tests do **not** prove model guardrail behavior.

## Scope

This is an agent-service integration suite, not a browser or database end-to-end test. It does not verify microphone capture, UI rendering/locking, Firebase authentication, file uploads, or final case persistence. Agent wording is not a replacement for server-side authorization or consent enforcement.

Protocol reference: [OpenAI Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations).
