# ShotCaller cloud (Firebase)

Accounts and synced profiles use one Firebase project on the free **Spark** plan: Firebase Auth +
Firestore. There's no server code, so security lives in [`firestore.rules`](../firestore.rules).

## How it works

- **The main process does it all.** It runs the Firebase SDK, keeps the session in `userData/auth.json`
  (encrypted with the OS keychain via Electron `safeStorage`) and sends the renderer an `AuthState`
  snapshot. Tokens never reach the renderer.
- **Google:** the installed-app OAuth flow with PKCE. ShotCaller opens Google in your browser and catches
  the redirect on `127.0.0.1:47615` (or 47616 / 47617). It swaps the code for a Google ID token, then
  calls `signInWithCredential`.
- **Email / password:** Firebase email auth. The verification and password-reset links open Firebase's
  own pages; when you come back to ShotCaller it re-checks whether you've verified.
- **Linking:** Settings → Account links Google to an email account (or the reverse), so both sign-ins open
  the same profile.
- **Profile:** `users/{uid}`, created on first sign-in with a unique username, which is reserved in
  `usernames/{name}` in the same transaction. A live listener shows edits made on another PC.

| Collection | Who can do what |
| --- | --- |
| `users/{uid}` | Owner creates (XP 0, no Steam ID) and edits name, username, bio, avatar, visibility. Others read it per its visibility: public, friends, private. |
| `usernames/{name}` | Reserved/released only together with the owner's profile change |
| `users/{uid}/unlocks`, `/proofs` | Owner writes; readable per profile visibility |
| `friends/{a_b}` | Requester creates a pending request, addressee accepts, either side deletes (Phase 10) |
| `games`, `games/*/achievements` | Read-only cache (a server fills it later) |
| `crashReports` | Create-only, anonymous, validated; nobody can read them through the app |

XP and the Steam ID can't be written by clients. A server will write them once one exists (Phase 5).

## One-time setup

1. **Create the project:** <https://console.firebase.google.com> → Add project. Analytics: **off**
   (ShotCaller has no usage analytics).
2. **Add a Web app** (Project settings → General → Your apps → `</>`). Copy `apiKey`, `authDomain`,
   `projectId` and `appId` into `electron/cloudConfig.ts`. These are public identifiers.
3. **Authentication → Sign-in method:** enable **Email/Password** and **Google**.
4. **Firestore Database → Create database** (production mode, a region near you).
5. **Google desktop OAuth client:** Google Cloud Console (same project) → APIs & Services → Credentials →
   Create credentials → OAuth client ID → Application type **Desktop app**. Copy its client ID and
   secret into `electron/cloudConfig.ts`. Google treats desktop secrets as non-confidential; PKCE
   protects the flow. If asked, configure the OAuth consent screen (External, app name ShotCaller) and
   add yourself as a test user, or publish it.
6. **Deploy the rules** from the repo folder:

   ```bash
   npx firebase login
   npx firebase use --add
   npx firebase deploy --only firestore
   ```
