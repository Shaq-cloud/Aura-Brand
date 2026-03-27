import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDtlq_fKly3gNwCuj3F08l11lKPzxSunxI",
  authDomain: "the-aura-brand-96e5c.firebaseapp.com",
  projectId: "the-aura-brand-96e5c",
  storageBucket: "the-aura-brand-96e5c.firebasestorage.app",
  messagingSenderId: "567101413061",
  appId: "1:567101413061:web:1ea715e69e51a3f3c082ac"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
