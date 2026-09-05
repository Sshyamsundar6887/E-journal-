# Echo Mind

Echo Mind is a private, AI-assisted journaling web application. It combines a focused writing space with wellbeing insights, semantic memory search, action items, voice capture, image attachments, location context, and optional Google Calendar/Tasks synchronization.

The application supports two data and inference modes:

- **Cloud mode** (the default): journal entries are stored in Firebase Firestore and analysis is performed through the authenticated Express API using Google Gemini.
- **Full-Local mode**: entries are stored in browser IndexedDB and analysis, embeddings, and memory search run on-device with Transformers.js and ONNX models.

## Features

- Google Sign-In through Firebase Authentication.
- Journal entries with titles, free-form text, compressed image attachments, and optional locations.
- Automatic mood, sentiment, theme, summary, embedding, and action-item extraction.
- Insights dashboard with mood trends, themes, streaks, and recent reflections.
- AI Sounding Board with semantic retrieval of relevant journal memories.
- Browser speech-to-text capture where supported by the browser.
- CSV and PDF export for journal archives.
- Local model manager with download progress, model selection, local database statistics, JSON backup, and local database clearing.
- Optional Google Calendar and Google Tasks integration for action items.
- Firestore rules that isolate each user's documents under `users/{userId}`.
- Server-side Firebase ID-token verification and per-user API rate limiting.

## Technology stack

- React 19 and TypeScript
- Vite 6 with Tailwind CSS 4
- Express 4 and `tsx` for the full-stack development server
- Firebase Authentication and Cloud Firestore
- Firebase Admin SDK for server-side token verification
- Google Gemini through `@google/genai`
- Transformers.js with ONNX WebAssembly for local inference
- Recharts, Motion, Lucide React, and jsPDF

## Requirements

- Node.js 18 or newer
- npm (the repository includes `package-lock.json`) or Bun
- A Firebase project with Google Authentication enabled and a Firestore database
- A Gemini API key for Cloud mode

Full-Local mode still requires Firebase configuration for the sign-in gate, but journal content and local inference remain in the browser after the model weights have been downloaded.

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file:

```bash
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Set the following values in `.env`:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Server-side Gemini API access for Cloud mode. |
| `PROJECT_ID` or `GOOGLE_CLOUD_PROJECT` | Optional Google Cloud project override used by Firebase Admin and Secret Manager. |
| `APP_URL` | Optional deployed application URL. |
| `VITE_FIREBASE_API_KEY` | Firebase web app configuration. |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Authentication domain. |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID. |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket name. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID. |
| `VITE_FIREBASE_APP_ID` | Firebase web app ID. |
| `VITE_FIREBASE_FIRESTORE_DATABASE_ID` | Firestore database ID used by the client. |
| `VITE_FIREBASE_OAUTH_CLIENT_ID` | OAuth client ID used when configuring Google Workspace access. |

The `VITE_FIREBASE_*` values are client configuration and are embedded into the browser bundle. Keep `GEMINI_API_KEY` server-side and never commit `.env`.

### 3. Configure Firebase

1. Create or select a Firebase project.
2. Enable **Google** under Authentication providers.
3. Create the Firestore database using the database ID configured in `VITE_FIREBASE_FIRESTORE_DATABASE_ID`.
4. Add the local development origin and deployed origin to Firebase Authentication authorized domains.
5. Deploy the repository rules:

```bash
firebase deploy --only firestore:rules
```

The included [`firestore.rules`](./firestore.rules) allows users to read and write only their own `users/{uid}/...` documents. The connection handshake document is intentionally readable.

### 4. Start the development server

```bash
npm run dev
```

The Express server starts on `http://localhost:3000`, mounts Vite in middleware mode, and exposes the API routes listed below. Open that URL in a browser.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Express + Vite development server. |
| `npm run build` | Build the Vite client and bundle `server.ts` into `dist/server.cjs`. |
| `npm start` | Run the production server from `dist/server.cjs`. |
| `npm run lint` | Run the TypeScript compiler without emitting files. |
| `npm run clean` | Remove generated build output. |

## How the application works

### Authentication

`src/App.tsx` listens for Firebase Authentication state changes. Unauthenticated users see the landing page and Google Sign-In button. Authenticated users enter the dashboard, and the current Firebase ID token is cached in browser storage for authenticated API calls.

### Cloud mode

When a reflection is saved in Cloud mode:

1. The client requests `/api/analyze-entry` with the reflection text.
2. The server verifies the Firebase ID token.
3. Gemini generates structured wellbeing metadata and an embedding.
4. The client writes the resulting entry to `users/{uid}/entries/{entryId}` in Firestore.
5. The dashboard receives updates through a Firestore real-time listener.

Cloud chat sends the current query, recent history, and authorized entries to `/api/chat`. The server calculates semantic and keyword scores, selects up to three memories, and asks Gemini for a concise response with retrieved-memory citations.

### Full-Local mode

Full-Local mode stores entries in the browser's `AuraJournal_LocalDB` IndexedDB database and falls back to user-scoped localStorage if IndexedDB is unavailable. The model manager can download:

- `Xenova/distilbert-base-uncased-finetuned-sst-2-english` for sentiment analysis.
- `Xenova/all-MiniLM-L6-v2` for 384-dimensional semantic embeddings.

Model files are cached by the browser. Once a selected model is available, entry analysis and Sounding Board retrieval run locally without sending journal content to the application server. Local backups can be exported as JSON from Settings.

## API reference

All routes except `/api/health` require:

```http
Authorization: Bearer <Firebase ID token>
```

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Return server health and timestamp. |
| `POST` | `/api/embeddings` | Generate an embedding for a text string. |
| `POST` | `/api/analyze-entry` | Analyze a journal reflection and return structured metadata. |
| `POST` | `/api/generate-prompt` | Generate a reflective writing prompt from recent entries. |
| `POST` | `/api/chat` | Retrieve relevant memories and generate a Sounding Board response. |

The server limits request sizes and input lengths, verifies Firebase tokens, applies an in-memory limit of 60 authenticated requests per minute, and uses fallback analysis when Gemini capacity is unavailable.

## Project structure

```text
.
├── server.ts                 # Express server, Gemini integration, auth middleware, API routes
├── src/
│   ├── App.tsx               # Authentication gate and application shell
│   ├── components/           # Landing page, dashboard, editor, charts, chat, settings
│   ├── lib/
│   │   ├── firebase.ts       # Firebase client initialization and Firestore errors
│   │   ├── localDb.ts        # IndexedDB/localStorage persistence
│   │   ├── localInference.ts # Transformers.js models and local RAG
│   │   └── workspaceAuth.ts  # Google Calendar/Tasks OAuth helpers
│   ├── types.ts              # Shared domain types
│   └── utils/exportUtils.ts  # CSV and PDF exports
├── firestore.rules            # User-isolated Firestore access rules
├── .env.example               # Environment variable template
├── vite.config.ts             # Vite and Tailwind configuration
└── package.json               # Scripts and dependencies
```

## Google Workspace synchronization

The optional synchronization flow requests these Google OAuth scopes:

- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/tasks`

Users can enable Calendar or Tasks sync from Settings. Action items are not pushed automatically unless the user enables the relevant setting and confirms the sync dialog.

## Production deployment

Build the application and server bundle:

```bash
npm run build
NODE_ENV=production npm start
```

For Google Cloud Run, provide `GEMINI_API_KEY` through Secret Manager rather than committing it to an environment file. The runtime must also have permission to access the secret and to verify Firebase Authentication tokens. Configure Firebase authorized domains and Firestore rules for the deployed URL before inviting users.

## Privacy and security notes

- Cloud mode sends reflection text to the server for Gemini analysis and semantic search.
- Full-Local mode keeps reflection content in browser storage after model download; model weights are fetched from the configured Hugging Face model IDs.
- Firestore documents are scoped to the authenticated user's UID.
- The server filters client-submitted entries and prompt context by the authenticated UID before processing.
- Do not place `GEMINI_API_KEY` in any `VITE_*` variable; Vite exposes `VITE_*` values to the browser.
- Treat exported CSV, PDF, and JSON backups as sensitive personal data.
- Browser speech recognition and Google Workspace access are subject to the browser and Google account permissions.

## Troubleshooting

### Firebase configuration errors

Confirm every required `VITE_FIREBASE_*` variable is present and that the Firestore database ID matches the database configured in Firebase. Restart the development server after changing `.env`.

### Gemini requests fail

Confirm `GEMINI_API_KEY` is available to the server process. In deployed environments, verify Secret Manager access and the service account permissions. The server includes local fallbacks for some analysis and chat failures, but embeddings may be zero-vector fallbacks when no Gemini embedding model is available.

### Local mode cannot save or chat

Open Settings and download the selected local model first. The initial download may take time and requires network access. Ensure the browser permits IndexedDB and has enough storage for the model cache.

### Google Sign-In popup does not open

Allow pop-ups for the application origin and add the origin to Firebase Authentication's authorized domains.

## License

No license file is currently included in this repository. Treat the project as all rights reserved unless the repository owner specifies otherwise.
