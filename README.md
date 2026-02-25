# AI Test Generator

## Overview
AI Test Generator turns pasted text or uploaded documents into structured quizzes using OpenAI. It is a Node.js 20 + Express API with file uploads (multer) and document parsing (pdf-parse, mammoth).

## Features
- Generate quizzes from raw text or uploaded PDF/DOCX/TXT
- Multiple question types: multiple choice, true/false, open-ended, or mixed
- Defensive parsing of LLM output with JSON recovery
- File size limits and MIME-type filtering
- Prompt-injection safety wrappers

## How it works (flow)
1. Client sends text or a file to the API.
2. The server extracts text (PDF/DOCX/TXT) or uses pasted text.
3. Input is truncated, wrapped as untrusted content, and sent to OpenAI.
4. Response is parsed defensively and validated per question type.
5. The API returns a clean questions array.

## API

### POST /api/generate-test
Generate a quiz from text.

**Request (JSON)**
```json
{
  "text": "Your study notes here...",
  "testType": "mixed",
  "questionCount": 10
}
```

**Responses**
- 200: Array of questions
- 400: Invalid input (missing text, text too short, invalid testType)
- 502: LLM returned invalid JSON
- 500: Server error

**Response (JSON)**
```json
[
  {
    "type": "multiple_choice",
    "question": "What is X?",
    "options": ["A", "B", "C"],
    "correctAnswerIndex": 1,
    "explanation": "Based on the text, X is B."
  }
]
```

### POST /api/upload-and-generate
Generate a quiz from an uploaded file.

**Request (multipart/form-data)**
- file: PDF/DOCX/TXT
- testType: multiple_choice | true_false | open_ended | mixed
- questionCount: integer (1–30)

**Responses**
- 200: Array of questions
- 400: Unsupported file type or invalid testType or text too short
- 413: File too large
- 502: LLM returned invalid JSON
- 500: Server error

## Output format
The API returns an array of questions. Each question matches one of the following shapes:

```json
[
  {
    "type": "multiple_choice",
    "question": "Which statement is correct?",
    "options": ["Option A", "Option B", "Option C"],
    "correctAnswerIndex": 2,
    "explanation": "The text explicitly states Option C."
  },
  {
    "type": "true_false",
    "question": "The document mentions topic X.",
    "correctAnswer": true,
    "explanation": "Topic X is discussed in section 2."
  },
  {
    "type": "open_ended",
    "question": "Explain concept Y.",
    "idealAnswer": "Concept Y is ...",
    "explanation": "The definition is stated in the text."
  }
]
```

## Safety & reliability
- **Input limits**: text is truncated to 15,000 characters; JSON body limit is 10MB.
- **File limits**: 10MB max; only PDF, DOCX, TXT allowed.
- **Anti-injection**: user text is wrapped in `<<USER_TEXT_START>>...<<USER_TEXT_END>>` and treated as untrusted.
- **Defensive parsing**: JSON is parsed directly or recovered via regex; invalid JSON returns 502.
- **Validation**: questions are filtered by required fields and correct types.

## Local run
```bash
npm install
npm start
```

Server runs at: http://localhost:3001

## Environment variables
- `OPENAI_API_KEY` (required)
- `PORT` (optional, default 3001)

## Deployment notes (Railway)
- Node version: 20.x
- Build command: `npm install && mkdir -p uploads`
- Start command: `npm start`
- Ensure `OPENAI_API_KEY` is set in Railway environment variables.

## Talking points
- Mitigates prompt injection by wrapping user input with USER_TEXT markers.
- Uses response_format json_object and safeParseJSON fallback for resilience.
- Enforces strict validation of question objects before returning results.
- Applies file upload safety via MIME allowlist and 10MB size cap.
- Defensive parsing reduces brittle failures in LLM integrations.
- Returns clear error signals (400/413/502/500) for predictable clients.
