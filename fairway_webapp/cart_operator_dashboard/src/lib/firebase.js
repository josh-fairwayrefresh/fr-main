import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBn1xnLsP_0l1SmDvfGIj_iyEpAL8jYgzY",
  authDomain: "savvy-kit-496703-r5.firebaseapp.com",
  projectId: "savvy-kit-496703-r5",
  storageBucket: "savvy-kit-496703-r5.firebasestorage.app",
  messagingSenderId: "936892386735",
  appId: "1:936892386735:web:57e3f4224d54b039edb35a",
  measurementId: "G-WWQ8C28VW7"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  hd: "fairwayrefresh.com"
});