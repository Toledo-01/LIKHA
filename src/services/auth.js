import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { fetch as expoFetch } from "expo/fetch";
import { File as ExpoFile } from "expo-file-system";

// Use your computer's LAN IP address when testing with Expo Go

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://likhalocal-api.onrender.com";

const TOKEN_KEY = "likhalocal_auth_token";

/* =========================
   TOKEN STORAGE
========================= */

export async function saveToken(token) {
  if (!token) {
    throw new Error("Authentication token is missing.");
  }

  if (Platform.OS === "web") {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
}

export async function getToken() {
  if (Platform.OS === "web") {
    return localStorage.getItem(TOKEN_KEY);
  }

  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function removeToken() {
  if (Platform.OS === "web") {
    localStorage.removeItem(TOKEN_KEY);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

/* =========================
   API RESPONSE HANDLING
========================= */

async function parseResponse(response, fallbackMessage) {
  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(fallbackMessage);
  }

  if (!response.ok) {
    throw new Error(data.message || fallbackMessage);
  }

  return data;
}

/* =========================
   CUSTOMER REGISTRATION
========================= */

export async function registerCustomer(customerData) {
  const response = await fetch(
    `${API_BASE_URL}/api/auth/register`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(customerData),
    }
  );

  const data = await parseResponse(
    response,
    "Registration failed."
  );

  if (data.token) {
    await saveToken(data.token);
  }

  return data;
}

/* =========================
   LOGIN
========================= */

export async function loginCustomer(email, password) {
  const response = await fetch(
    `${API_BASE_URL}/api/auth/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
      }),
    }
  );

  const data = await parseResponse(
    response,
    "Login failed."
  );

  if (!data.token) {
    throw new Error(
      "Login response did not include an authentication token."
    );
  }

  if (!data.user) {
    throw new Error(
      "Login response did not include user information."
    );
  }

  await saveToken(data.token);

  return data;
}

/* =========================
   GET CURRENT USER
========================= */

export async function getMyProfile() {
  const token = await getToken();

  if (!token) {
    throw new Error("Please log in first.");
  }

  const response = await fetch(
    `${API_BASE_URL}/api/auth/me`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await parseResponse(
    response,
    "Could not load your profile."
  );

  if (!data.user) {
    throw new Error(
      "The server did not return the current user's information."
    );
  }

  return data.user;
}

/* =========================
   UPDATE CURRENT USER
========================= */

export async function updateMyProfile(profileData) {
  const token = await getToken();

  if (!token) {
    throw new Error("Please log in first.");
  }

  if (
    !profileData ||
    typeof profileData.full_name !== "string" ||
    !profileData.full_name.trim()
  ) {
    throw new Error("Please enter your full name.");
  }

  const response = await fetch(
    `${API_BASE_URL}/api/auth/me`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        full_name: profileData.full_name.trim(),
        phone:
          typeof profileData.phone === "string"
            ? profileData.phone.trim()
            : "",
        address:
          typeof profileData.address === "string"
            ? profileData.address.trim()
            : "",
      }),
    }
  );

  const data = await parseResponse(
    response,
    "Could not update your profile."
  );

  if (!data.user) {
    throw new Error(
      "The server did not return the updated profile."
    );
  }

  return data.user;
}

/* =========================
   PROFILE PICTURE UPLOAD
========================= */

export async function uploadProfilePicture(image) {
  const token = await getToken();

  if (!token) {
    throw new Error(
      "Please log in before uploading a profile picture."
    );
  }

  if (!image?.uri) {
    throw new Error(
      "Please select a valid image first."
    );
  }

  const uri = image.uri;

  const fileName =
    image.fileName ||
    uri.split("/").pop()?.split("?")[0] ||
    `profile-${Date.now()}.jpg`;

  const extension = fileName
    .split(".")
    .pop()
    .toLowerCase();

  const mimeType =
    image.mimeType ||
    ({
      png: "image/png",
      webp: "image/webp",
      heic: "image/heic",
      heif: "image/heif",
    }[extension] || "image/jpeg");

  const formData = new FormData();

  if (Platform.OS === "web") {
    let file = image.file;

    if (!file) {
      const imageResponse = await fetch(uri);

      if (!imageResponse.ok) {
        throw new Error(
          "Could not read the selected image."
        );
      }

      const blob = await imageResponse.blob();

      file = new globalThis.File(
        [blob],
        fileName,
        { type: mimeType }
      );
    }

    formData.append(
      "profile_picture",
      file,
      fileName
    );
  } else {
    // Create an Expo File from the selected image URI.
    // Expo's fetch supports this File in multipart FormData.
    const photoFile = new ExpoFile(uri);

    formData.append(
      "profile_picture",
      photoFile
    );
  }

  const response = await expoFetch(
    `${API_BASE_URL}/api/auth/me/profile-picture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message ||
        data.error ||
        `Profile picture upload failed (HTTP ${response.status}).`
    );
  }

  const updatedUser = data.user || data;

  if (
    !updatedUser ||
    updatedUser.id == null
  ) {
    throw new Error(
      "The server did not return the updated user information."
    );
  }

  return updatedUser;
}