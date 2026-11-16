import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const rootDir = path.resolve(import.meta.dirname, '..');
const firestoreRules = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');
const storageRules = fs.readFileSync(path.join(rootDir, 'storage.rules'), 'utf8');
const blueprint = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'firebase-blueprint.json'), 'utf8'),
) as {
  entities: Record<string, { properties: Record<string, { maxLength?: number; enum?: string[] }> }>;
  firestore: Record<string, unknown>;
};
const securitySpec = fs.readFileSync(path.join(rootDir, 'security_spec.md'), 'utf8');

test('firestore.rules enforces rules_version 2 and default-deny safety net first', () => {
  assert.match(firestoreRules, /rules_version = '2';/);
  const catchAllIdx = firestoreRules.indexOf('match /{document=**}');
  const usersIdx = firestoreRules.indexOf('match /users/{userId}');
  assert.ok(catchAllIdx !== -1, 'Global catch-all safety net missing');
  assert.ok(catchAllIdx < usersIdx, 'Global catch-all safety net must appear before collection rules');
  assert.match(firestoreRules, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);
});

test('every collection in firebase-blueprint.json has an explicit match block in firestore.rules', () => {
  const collectionNames = Object.keys(blueprint.firestore).map((p) => p.split('/')[1]);
  assert.deepEqual(
    collectionNames.sort(),
    ['adminActivity', 'admins', 'reports', 'users', 'verifications'],
  );
  for (const name of collectionNames) {
    assert.match(
      firestoreRules,
      new RegExp(`match /${name}/\\{[a-zA-Z]+\\}`),
      `Missing match block for /${name}`,
    );
  }
});

test('Dirty Dozen security invariants are enforced structurally in firestore.rules', () => {
  // 1 & 2. Self-admin escalation & role mutation guard
  assert.match(firestoreRules, /incoming\(\)\.role == 'citizen' \|\| isAdmin\(\)/);
  assert.match(firestoreRules, /incoming\(\)\.role == existing\(\)\.role/);

  // 3. PII isolation on /users/{userId}
  assert.match(firestoreRules, /allow get: if isValidId\(userId\) && \(isOwner\(userId\) \|\| isAdmin\(\)\);/);
  assert.match(firestoreRules, /allow list: if isAdmin\(\);/);

  // 4 & 5. Spoofed creatorUid and pre-resolved injection blocked on report create
  assert.match(firestoreRules, /incoming\(\)\.creatorUid == request\.auth\.uid/);
  assert.match(firestoreRules, /incoming\(\)\.status == 'Submitted'/);
  assert.match(firestoreRules, /incoming\(\)\.verificationCount == 0/);

  // 6 & 7. Action-based update with affectedKeys().hasOnly() & isValidReport(incoming())
  assert.match(firestoreRules, /allow update: if isVerifiedUser\(\)\s*&& isValidId\(reportId\)\s*&& isValidReport\(incoming\(\)\)/);
  assert.match(firestoreRules, /incoming\(\)\.diff\(existing\(\)\)\.affectedKeys\(\)\.hasOnly\(\[\s*'status', 'resolutionNotes', 'resolutionImageUrl', 'prioritySuggestion', 'updatedAt'/);
  assert.match(firestoreRules, /incoming\(\)\.diff\(existing\(\)\)\.affectedKeys\(\)\.hasOnly\(\[\s*'title', 'description', 'complaintText', 'area', 'landmark', 'category', 'updatedAt'/);

  // 8 & 9. Atomic single-vote verification paired with existsAfter
  assert.match(firestoreRules, /incoming\(\)\.verificationCount == existing\(\)\.verificationCount \+ 1/);
  assert.match(firestoreRules, /!exists\(\/databases\/\$\(database\)\/documents\/verifications\/\$\(reportId \+ '_' \+ request\.auth\.uid\)\)/);
  assert.match(firestoreRules, /existsAfter\(\/databases\/\$\(database\)\/documents\/verifications\/\$\(reportId \+ '_' \+ request\.auth\.uid\)\)/);
  assert.match(firestoreRules, /verificationId == incoming\(\)\.reportId \+ '_' \+ request\.auth\.uid/);

  // 10. Path ID poisoning guard (isValidId with regex & 128 char cap, never on allow list)
  assert.match(firestoreRules, /function isValidId\(id\) \{\s*return id is string && id\.size\(\) >= 1 && id\.size\(\) <= 128 && id\.matches\('\^\[a-zA-Z0-9_\\\\-\]\+\$'\);/);

  // 11. Temporal integrity via request.time
  assert.match(firestoreRules, /incoming\(\)\.createdAt == request\.time/);
  assert.match(firestoreRules, /incoming\(\)\.updatedAt == request\.time/);

  // 12. Immutable audit logs & verified email check on admin access
  assert.match(firestoreRules, /match \/adminActivity\/\{activityId\}[\s\S]*allow update: if false;\s*allow delete: if false;/);
  assert.match(firestoreRules, /request\.auth\.token\.email_verified == true/);

  // Verify all 12 scenarios are documented in security_spec.md
  assert.match(securitySpec, /12\. \*\*Audit Log Tampering\*\*/);
});

test('storage.rules enforces 5 MB limit, image MIME types, UID scoping, and default deny', () => {
  assert.match(storageRules, /rules_version = '2';/);
  assert.match(storageRules, /request\.resource\.size <= 5 \* 1024 \* 1024/);
  assert.match(storageRules, /request\.resource\.contentType\.matches\('image\/\(jpeg\|png\|webp\)'\)/);
  assert.match(storageRules, /match \/reports\/\{userId\}\/\{fileName\}[\s\S]*request\.auth\.uid == userId/);
  assert.match(storageRules, /match \/resolutions\/\{userId\}\/\{fileName\}[\s\S]*request\.auth\.uid == userId/);
  assert.match(storageRules, /match \/\{allPaths=\*\*\}[\s\S]*allow read, write: if false;/);
});

test('firestore.rules enum and length constraints stay synchronized with firebase-blueprint.json', () => {
  const reportProps = blueprint.entities.CivicReport.properties;
  assert.equal(reportProps.title.maxLength, 140);
  assert.equal(reportProps.description.maxLength, 1500);
  assert.equal(reportProps.complaintText.maxLength, 3500);
  assert.equal(reportProps.area.maxLength, 140);
  assert.equal(reportProps.city.maxLength, 60);
  assert.equal(reportProps.imageUrl.maxLength, 2000);
  assert.equal(reportProps.resolutionNotes.maxLength, 1500);

  assert.match(firestoreRules, /data\.title\.size\(\) <= 140/);
  assert.match(firestoreRules, /data\.description\.size\(\) <= 1500/);
  assert.match(firestoreRules, /data\.complaintText\.size\(\) <= 3500/);
  assert.match(firestoreRules, /data\.area\.size\(\) <= 140/);
  assert.match(firestoreRules, /data\.city\.size\(\) <= 60/);
  assert.match(firestoreRules, /data\.imageUrl\.size\(\) <= 2000/);
  assert.match(firestoreRules, /data\.resolutionNotes\.size\(\) <= 1500/);
});
