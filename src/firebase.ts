import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, GithubAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  projectId: "gen-lang-client-0660562057",
  appId: "1:245755180293:web:72f4e1de531d8d53d3f36c",
  apiKey: "AIzaSyBXQQVgf1vmDX-4uIGB_HymYsotyFOgDbM",
  authDomain: "gen-lang-client-0660562057.firebaseapp.com",
  storageBucket: "gen-lang-client-0660562057.firebasestorage.app",
  messagingSenderId: "245755180293",
  measurementId: ""
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, "ai-studio-c0c220ef-8ddb-4755-9286-f492ea8f982c");
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();
