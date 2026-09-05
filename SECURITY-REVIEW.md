# Security Review

Date: 2026-09-05

## Findings

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | HIGH | `src/App.tsx` and `src/components/Dashboard.tsx` | 12-24; 461-469 | Firebase ID tokens are persisted in `localStorage` and replayed as bearer tokens. Any script running in the page, including an XSS payload or malicious extension, could read the token and impersonate the user against the protected API. | 8/10 |
| 2 | HIGH | `server.ts` | 690-737 | Untrusted journal entries and chat history are concatenated into the LLM prompt alongside trusted instructions. A malicious entry can attempt prompt injection and influence model behavior or expose internal prompt content. | 8/10 |

## Recommendations

1. Avoid persisting Firebase ID tokens in browser storage. Request fresh tokens from the authenticated Firebase session for API calls, or use a server-issued, `HttpOnly`, `Secure`, and appropriately scoped cookie.
2. Keep journal content and chat history in a separate structured data channel rather than interpolating raw user text into trusted instructions. Treat all persisted text as untrusted input and use a strict data-only prompt schema.

## Scope and limitations

This review reports high-confidence, exploitable findings identified in the repository. It does not replace runtime testing, dependency scanning, infrastructure review, or an assessment of deployed Firebase and API configuration.
