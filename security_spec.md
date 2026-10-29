# Security Specification — AeroForge / OmniStep / Dimeo Android XR Production Traceability & Workflow Suite

## 1. Data Invariants & Master Source of Truth

1. **Master Identity Source (`/users/{userId}`)**:
   - Every operator record at `/users/{userId}` MUST have `userId == request.auth.uid` and `data.uid == request.auth.uid`, and requires `request.auth.token.email_verified == true`.
   - Read and write access to `/users/{userId}` is restricted strictly to the owning operator (`request.auth.uid == userId`). Blanket `isSignedIn()` reads are forbidden.
2. **PII Split-Collection Isolation (`/users/{userId}/private/{docId}`)**:
   - Stores sensitive PII (`email`). Only `docId == 'info'` is permitted.
   - Relational Master Gate: Access requires the parent `/users/{userId}` document to exist and have `uid == request.auth.uid`.
   - `email` MUST match `request.auth.token.email` and `request.auth.token.email_verified == true`.
3. **Traceability Run Ownership & Referential Integrity (`/traceabilityRuns/{runId}`)**:
   - Cannot be created unless `/users/$(incoming().operatorUid)` exists and `incoming().operatorUid == request.auth.uid`.
   - `completedSteps` is strictly bounded (`size() <= 6`).
   - Terminal State Lock: Once `resource.data.status == 'certified'`, NO further updates or deletes are permitted.
   - Secure List Enforcement: `allow list` restricts results strictly via `resource.data.operatorUid == request.auth.uid` without any `get()`/`exists()` inside `list`.
   - Temporal & Immortal Field Integrity: `createdAt == request.time` on create; `createdAt` and `operatorUid` are immutable on update; `updatedAt == request.time` on update.
4. **Managed Assembly Workflow Steps (`/workflowSteps/{stepDocId}`)**:
   - Cannot be created unless `/users/$(request.auth.uid)` exists with `uid == request.auth.uid`, `incoming().operatorUid == request.auth.uid`, and `incoming().stepDocId == stepDocId`.
   - Torque Envelope Invariant: `0 <= torqueMinNm <= requiredTorqueNm <= torqueMaxNm <= 2000`.
   - Bounded 3D Entity Highlight Array: `modelEntityIds` MUST be a list of `1..6` allowlisted canonical 3D entity IDs (`ENT-F6X-*` / `ENT-TF90-*`), with first element explicitly verified as string (`size() <= 48`).
   - Immutable Structural Keys on Update: `stepDocId`, `operatorUid`, `scenarioId`, `stepNumber`, `canonicalCode`, `partNumber`, and `createdAt` cannot be mutated; `allow update` wraps `isValidWorkflowStep(incoming())` first and restricts `affectedKeys().hasOnly(...)` to named actions.
   - Secure List Enforcement: `allow list` enforces `existing().operatorUid == request.auth.uid` with zero `get()`/`exists()` lookups.
5. **Dimeo Android XR Supervision Runs (`/dimeoRuns/{dimeoRunId}`)**:
   - Stores compact, owner-scoped supervision metrics (QCM outcomes answered, validated steps, AR photo/comment counts, account mode `nominative` vs `shared_station`, and language `en`/`fr`/`es`) without storing raw binary images or videos in Firestore.
   - Cannot be created unless `/users/$(request.auth.uid)` exists with `uid == request.auth.uid`, `incoming().operatorUid == request.auth.uid`, and `incoming().dimeoRunId == dimeoRunId`.
   - Immutable Keys on Update: `dimeoRunId`, `operatorUid`, `scenarioId`, and `createdAt` cannot be mutated; `allow update` wraps `isValidDimeoSupervisionRun(incoming())` first and restricts `affectedKeys().hasOnly(...)` to named actions.
   - Secure List Enforcement: `allow list` enforces `existing().operatorUid == request.auth.uid` with zero `get()`/`exists()` lookups.

## 2. The "Dirty Dozen" Adversarial Payloads (Plus Workflow & Dimeo Supervision Extensions)

1. **Identity Spoofing on Profile Create**: Authenticated user `uid_attacker` writes `/users/uid_victim` with `{ uid: "uid_victim", ... }` -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: Authenticated user with `email_verified: false` writes `/users/uid_1` or `/dimeoRuns/dm_1` -> `PERMISSION_DENIED`.
3. **Shadow Ghost Field Injection**: Authenticated owner sends `{ ..., isAdmin: true }` to `/users/uid_1`, `/workflowSteps/...`, or `/dimeoRuns/...` -> `PERMISSION_DENIED` (`hasOnly` check).
4. **PII Blanket Read Attack**: Authenticated user `uid_attacker` attempts `get` on `/users/uid_victim/private/info` -> `PERMISSION_DENIED`.
5. **Orphaned Private Info Write**: Authenticated user writes `/users/uid_1/private/info` before `/users/uid_1` exists -> `PERMISSION_DENIED` (Master Gate).
6. **ID Poisoning / Oversized Path Variable**: Attacker creates `/traceabilityRuns/<200-char-junk-id>`, `/workflowSteps/<200-char-junk-id>`, or `/dimeoRuns/<200-char-junk-id>` -> `PERMISSION_DENIED` (`isValidId`).
7. **Orphaned Traceability / Workflow / Dimeo Run**: Authenticated user creates `/traceabilityRuns/run_1`, `/workflowSteps/wf_1`, or `/dimeoRuns/dm_1` without an existing `/users/{uid}` profile -> `PERMISSION_DENIED`.
8. **Unbounded Array / Out-of-Range Counts**: Owner writes `completedSteps` >6 items or `photosCount` >12 / `commentsCount` >24 in `/dimeoRuns` -> `PERMISSION_DENIED`.
9. **Value Poisoning on Update**: Owner updates `requiredTorqueNm` to `500` (> max) or passes string `"fr_FR"` to `language` on `/dimeoRuns` -> `PERMISSION_DENIED` (`isValid*` wraps update).
10. **Terminal State / Immutable Field Mutation**: Owner attempts to modify a certified `/traceabilityRuns/run_1` or mutate `scenarioId` on `/workflowSteps/wf_1` or `/dimeoRuns/dm_1` -> `PERMISSION_DENIED`.
11. **Client Timestamp Forgery**: Owner sends a past/future `createdAt` or `updatedAt != request.time` -> `PERMISSION_DENIED`.
12. **Cross-Tenant List Scraping**: Authenticated user queries `collection(db, 'traceabilityRuns')`, `collection(db, 'workflowSteps')`, or `collection(db, 'dimeoRuns')` for another user's documents -> `PERMISSION_DENIED`.
