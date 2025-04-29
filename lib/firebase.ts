import { initializeApp, getApps, getApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"
import { getStorage } from "firebase/storage"

const firebaseConfig = {
  apiKey: "AIzaSyA-DnTdqjQW9-gq6UBEcnhIk7gT1dHdSBI",
  authDomain: "invoice-bed82.firebaseapp.com",
  databaseURL: "https://invoice-bed82-default-rtdb.firebaseio.com",
  projectId: "invoice-bed82",
  storageBucket: "invoice-bed82.firebasestorage.app",
  messagingSenderId: "387761020229",
  appId: "1:387761020229:web:a22e0b4058ae9fb7b0f22c",
  measurementId: "G-SB2H7229YE",
}

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp()
const auth = getAuth(app)
const db = getFirestore(app)
const storage = getStorage(app)

export { app, auth, db, storage }
