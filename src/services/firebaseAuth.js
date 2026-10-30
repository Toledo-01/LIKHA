
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { auth, db } from "./firebase";

function formatFirebaseError(error) {
  const messages = {
    "auth/email-already-in-use":
      "This email address is already registered.",
    "auth/invalid-email":
      "Please enter a valid email address.",
    "auth/invalid-credential":
      "The email or password is incorrect.",
    "auth/weak-password":
      "Please choose a stronger password.",
    "auth/network-request-failed":
      "Network error. Check your internet connection.",
    "permission-denied":
      "Firebase permissions do not allow this operation.",
  };

  return new Error(
    messages[error.code] ||
      error.message ||
      "Firebase authentication failed. Please try again."
  );
}

export async function registerFirebaseCustomer({
  full_name,
  email,
  password,
  phone = "",
}) {
  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      email.trim().toLowerCase(),
      password
    );

    const user = credential.user;

    const profile = {
      uid: user.uid,
      full_name: full_name.trim(),
      email: user.email,
      phone: phone.trim(),
      address: "",
      role: "customer",
      profile_image: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, "users", user.uid), profile);

    return {
      user: {
        ...profile,
        createdAt: null,
        updatedAt: null,
      },
    };
  } catch (error) {
    throw formatFirebaseError(error);
  }
}

export async function loginFirebaseUser(email, password) {
  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      email.trim().toLowerCase(),
      password
    );

    const firebaseUser = credential.user;
    const profileRef = doc(db, "users", firebaseUser.uid);
    const profileSnapshot = await getDoc(profileRef);

    if (!profileSnapshot.exists()) {
      await signOut(auth);

      throw new Error(
        "Your Firebase account has no LikhaLocal profile yet. " +
          "Register through LikhaLocal or ask an administrator to provision your account."
      );
    }

    const profile = profileSnapshot.data();

    if (
      !["admin", "staff", "seller", "customer"].includes(profile.role)
    ) {
      await signOut(auth);
      throw new Error("Your account has an invalid role. Please contact an administrator.");
    }

    if (profile.is_active === false) {
      await signOut(auth);
      throw new Error("Your account is inactive. Please contact an administrator.");
    }

    return {
      user: {
        ...profile,
        uid: firebaseUser.uid,
        email: firebaseUser.email,
      },
    };
  } catch (error) {
    throw formatFirebaseError(error);
  }
}

export async function getFirebaseUserProfile(firebaseUser) {
  if (!firebaseUser) {
    return null;
  }

  try {
    const profileSnapshot = await getDoc(
      doc(db, "users", firebaseUser.uid)
    );

    if (!profileSnapshot.exists()) {
      return null;
    }

    const profile = profileSnapshot.data();

    return {
      ...profile,
      uid: firebaseUser.uid,
      email: firebaseUser.email,
    };
  } catch (error) {
    throw formatFirebaseError(error);
  }
}

export async function updateFirebaseProfile(uid, profileData) {
  try {
    const allowedUpdates = {};

    if (profileData.full_name !== undefined) {
      const name = profileData.full_name.trim();

      if (!name) {
        throw new Error("Full name must not be empty.");
      }

      allowedUpdates.full_name = name;
    }

    if (profileData.phone !== undefined) {
      allowedUpdates.phone = profileData.phone.trim();
    }

    if (profileData.address !== undefined) {
      allowedUpdates.address = profileData.address.trim();
    }

    allowedUpdates.updatedAt = serverTimestamp();

    await updateDoc(doc(db, "users", uid), allowedUpdates);

    const snapshot = await getDoc(doc(db, "users", uid));

    if (!snapshot.exists()) {
      throw new Error("Your LikhaLocal profile could not be found.");
    }

    return {
      ...snapshot.data(),
      uid,
    };
  } catch (error) {
    throw formatFirebaseError(error);
  }
}

export async function logoutFirebaseUser() {
  try {
    await signOut(auth);
  } catch (error) {
    throw formatFirebaseError(error);
  }
}
