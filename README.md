# Aura Journal & Sounding Board

A secure, user-isolated journaling web application integrated with Gemini RAG semantic memory, voice speech-to-text venting, vision processing, and automated wellbeing trend mapping.

---

## 1. Security Architecture & Threat Model

### Threat Summary Mapping

| Threat Zone | Specific Threat Scenarios | Countermeasures & Mitigations |
| :--- | :--- | :--- |
| **Input Surfaces** | Malicious script injections (XSS) or payload tampering. | Strict validation schemas on incoming JSON payloads. Input cleaning before rendering. |
| **Planning & Reasoning**| Prompt injections bypass system limits or leak keys. | Isolated system instructions defining rigid coaching boundaries. |
| **Tool Execution** | SSRF or backend privilege escalation. | Token validation middleware utilizing `firebase-admin` JWT checks. |
| **Memory & State** | Cross-user data contamination or cache leaks. | Strict, owner-bound `firestore.rules` verifying authentication. |
| **Inter-System Comm** | API key leakages or compromised credentials. | Server-side API proxy routing; API key isolated via Secret Manager. |

---

## 2. Secure Firestore Rules

Deploy the exact owner-bound security configuration below to ensure complete user isolation:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## 3. Secret Management Setup

The Aura Journal server keeps critical credentials completely out of source code by retrieving them dynamically from **Google Cloud Secret Manager**.

Run the following commands to create and populate the secret, then grant permissions to your Cloud Run computing service account:

```bash
# 1. Create the secret container
gcloud secrets create GEMINI_API_KEY \
  --replication-policy="automatic"

# 2. Add your active API key version
echo -n "YOUR_GEMINI_API_KEY_HERE" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# 3. Grant the Cloud Run computing service account secret access rights
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 4. Google Cloud Run Deployment

Deploy the fullstack container to Cloud Run with standard secure options:

```bash
# Build & Deploy to Google Cloud Run
gcloud run deploy aura-journal \
  --source=. \
  --region=us-central1 \
  --allow-unauthenticated \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest"
```

---

## 5. Automated Verification Campaign Binding

To enroll your service for challenge verification, apply the campaign label to your deployed Cloud Run service instance:

```bash
gcloud run services update aura-journal \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=us-central1
```

---

## 6. Functional Verification Walkthrough

Verify system integrity using the step-by-step cases below:

### Test Case 1: Google Identity Federated Auth
- **Action**: Visit the landing page, click the **Continue with Google Sign-In** button.
- **Expected Outcome**: Google login popup prompts for credentials. After authentication, the secure handshake passes successfully, loading the private Aura workspace.

### Test Case 2: Frictionless Capture & Analysis
- **Action**: Enter a title and write: *"I had a deeply exhausting work day today. Finished our release milestones, but feeling totally burned out and drained."* Click **Save Securely**.
- **Expected Outcome**: The entry is submitted, and the save button shows analysis loading state. The UI displays a secure database commit success message and lists the entry in historical archives.

### Test Case 3: Interactive Visual Theme & Wellbeing Analytics
- **Action**: Check the dashboards widgets after saving the burnout entry.
- **Expected Outcome**: 
  - The custom SVG Line graph shows a dip in the trendline towards negative values.
  - The dominant mental themes list updates to include **#Work** or **#Health**.
  - The Weekly Reflection Synthesis renders a custom, auto-generated summary.

### Test Case 4: Structured Action Items Checklist
- **Action**: Check the checklist on the right. Toggling complete or deleting items.
- **Expected Outcome**: The checklist displays goals or commitments automatically parsed from the burnout entry. Toggling the item triggers real-time Firestore updates, persisting the status changes.

### Test Case 5: Conversational Semantic RAG Loop
- **Action**: In the Sounding Board panel, enter: *"How have I been feeling about work recently?"* Click send.
- **Expected Outcome**: The AI backend calculates cosine similarity, fetches the burnout entry as a semantic memory, displays the source citation block, and writes an empathetic response explicitly acknowledging past fatigue.
