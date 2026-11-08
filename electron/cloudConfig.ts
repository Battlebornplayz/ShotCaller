// The ShotCaller Firebase project. These values are public by design: a Firebase web config only
// identifies the project, and Firestore security rules (firestore.rules) decide what anyone may do.
// The Google "Desktop app" OAuth client is also public: Google treats desktop client secrets as
// non-confidential, and PKCE protects the sign-in.
//
// Dev override: set SHOTCALLER_FIREBASE_CONFIG to the JSON of FIREBASE below, and
// SHOTCALLER_GOOGLE_CLIENT_ID / SHOTCALLER_GOOGLE_CLIENT_SECRET, before `npm run dev`.

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

const FIREBASE: FirebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  appId: '',
};

const GOOGLE_CLIENT_ID = '';
const GOOGLE_CLIENT_SECRET = '';

function fromEnv(): FirebaseConfig | null {
  try {
    const raw = process.env.SHOTCALLER_FIREBASE_CONFIG;
    return raw ? (JSON.parse(raw) as FirebaseConfig) : null;
  } catch {
    return null;
  }
}

export const FIREBASE_CONFIG: FirebaseConfig = fromEnv() ?? FIREBASE;
export const GOOGLE_OAUTH = {
  clientId: process.env.SHOTCALLER_GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID,
  clientSecret: process.env.SHOTCALLER_GOOGLE_CLIENT_SECRET || GOOGLE_CLIENT_SECRET,
};

export const cloudConfigured = (): boolean => !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId);
export const googleConfigured = (): boolean => /\.apps\.googleusercontent\.com$/.test(GOOGLE_OAUTH.clientId);

/** Loopback ports for the Google sign-in redirect. Desktop OAuth clients accept any 127.0.0.1 port. */
export const LOOPBACK_PORTS = [47615, 47616, 47617];
