
import { initializeApp, getApp, getApps } from "firebase/app";
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
} from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBXR453RBSljV7hU-4nRcrReysD-Iwwpp8",
  authDomain: "likhalocal-82052.firebaseapp.com",
  projectId: "likhalocal-82052",
  storageBucket: "likhalocal-82052.firebasestorage.app",
  messagingSenderId: "596493605408",
  appId: "1:596493605408:web:ea205172778fae88fefa45",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth;

try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (error) {
  if (error.code === "auth/already-initialized") {
    auth = getAuth(app);
  } else {
    throw error;
  }
}

const db = getFirestore(app);

export { app, auth, db };
