import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC9PKo_9Jv8DxSq5tLfiEnLjqbRzVStDQ4",
  authDomain: "dpn-pppi.firebaseapp.com",
  databaseURL:
    "https://dpn-pppi-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "dpn-pppi",
  storageBucket: "dpn-pppi.firebasestorage.app",
  messagingSenderId: "181174385108",
  appId: "1:181174385108:web:dc5fb40276c685b1173e41",
  measurementId: "G-FCT710QP5T",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const firestore = getFirestore(app);

export { app, db, firestore };
