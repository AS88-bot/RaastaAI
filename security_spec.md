# RaastaAI Security Specification & Adversarial Test Plan

## 1. Data Invariants
1. **Identity Integrity**: A user can only create a `users/{uid}` document for their own `request.auth.uid`, and can never self-assign `role: "admin"` unless verified in `/admins/{uid}` or matching the bootstrapped verified admin email.
2. **PII Isolation**: `users/{uid}` documents (which contain user email) are readable only by the document owner or a verified admin. Public `reports/{reportId}` documents never store emails, phone numbers, or private residential unit details.
3. **Official Status Lock**: Ordinary citizens can only create reports with `status == "Submitted"`, `verificationCount == 0`, `resolutionNotes == ""`, and `resolutionImageUrl == ""`. Citizens can never change `status`, `resolutionNotes`, or `resolutionImageUrl`.
4. **Atomic Single-Vote Verification**: A verification record `/verifications/{reportId}_{uid}` must reference an existing `/reports/{reportId}` and can only be created once per `(reportId, uid)` in an atomic batch that increments `reports/{reportId}.verificationCount` by exactly `1`. Verifying a `Resolved` report is blocked.
5. **Temporal Integrity**: `createdAt` on creation and `updatedAt` on mutation must strictly equal `request.time`. `createdAt` and `creatorUid` are immutable after creation.
6. **Admin Auditability**: Only verified admins can update official report statuses, upload resolution photos, or write to `/adminActivity/{activityId}`. Audit logs in `adminActivity` are append-only (update and delete denied).

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Self-Admin Privilege Escalation**: Citizen creates `/users/{uid}` with `{ role: "admin" }`.
2. **Role Mutation on Profile Update**: Citizen updates `/users/{uid}` changing `role` from `"citizen"` to `"admin"`.
3. **PII Blanket Scraping**: Authenticated non-admin executes `list` or `get` on `/users/{otherUid}`.
4. **Spoofed Report Creator**: Citizen creates `/reports/rep1` with `creatorUid: "victim_uid"`.
5. **Pre-Resolved Report Injection**: Citizen creates `/reports/rep2` with `status: "Resolved"` and `verificationCount: 99`.
6. **Unauthorized Status Transition**: Citizen (even report creator) updates `/reports/{reportId}` changing `status` to `"Resolved"` or adding `resolutionNotes`.
7. **Shadow Field Injection**: Citizen updates `/reports/{reportId}` adding undeclared field `officialTicketId: "GHMC-123"`.
8. **Duplicate Verification Inflation**: Citizen updates `verificationCount` from `1` to `5` without creating a matching `/verifications/{reportId}_{uid}` in the same batch.
9. **Double-Vote Verification**: Citizen attempts to verify the same `reportId` twice or uses a forged verification ID `/verifications/arbitrary_id`.
10. **Path ID Poisoning**: Attacker writes to `/reports/invalid$id!with/slashes` or an ID exceeding 128 characters.
11. **Timestamp Forgery**: Client submits `createdAt: Timestamp.fromDate(new Date('2020-01-01'))` instead of `serverTimestamp()`.
12. **Audit Log Tampering**: Ordinary user creates or admin attempts to delete/edit an entry in `/adminActivity/{id}`.
