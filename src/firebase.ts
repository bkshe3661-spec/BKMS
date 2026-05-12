import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB9y2FMBDdPjO-BTeUXfWzWAOvW3NqGS1s",
  authDomain: "bkms-571d6.firebaseapp.com",
  projectId: "bkms-571d6",
  storageBucket: "bkms-571d6.firebasestorage.app",
  messagingSenderId: "641767921595",
  appId: "1:641767921595:web:db0fe233219dc3f07e969e",
  measurementId: "G-4QWHWSMRQJ"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
