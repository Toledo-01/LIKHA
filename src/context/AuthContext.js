
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  getToken,
  getMyProfile,
  loginCustomer,
  recordLogoutActivity,
  registerAccount,
  removeToken,
  updateMyProfile,
  uploadProfilePicture,
} from "../services/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore the user's session when the app starts.
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const token = await getToken();

        if (token) {
          const profile = await getMyProfile();

          if (isMounted) {
            setUser(profile?.user ?? profile ?? null);
          }
        }
      } catch (error) {
        console.error("Could not restore session:", error);

        try {
          await removeToken();
        } catch (storageError) {
          console.error(
            "Could not clear invalid session:",
            storageError
          );
        }

        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // Sign in an existing customer.
  async function login(email, password) {
    const data = await loginCustomer(email, password);

    if (!data?.user) {
      throw new Error(
        "Login succeeded without returning user details."
      );
    }

    setUser(data.user);
    return data;
  }

  // Register a new account.
  async function register(accountData) {
    const data = await registerAccount(accountData);

    if (!data?.user) {
      throw new Error(
        "Registration succeeded without returning user details."
      );
    }

    setUser(data.user);
    return data;
  }

  // Update the logged-in customer's profile.
  async function updateProfile(profileData) {
    const updatedUser = await updateMyProfile(profileData);

    if (!updatedUser) {
      throw new Error(
        "Profile update succeeded without returning user details."
      );
    }

    setUser(updatedUser);
    return updatedUser;
  }

  // Upload and update the logged-in customer's profile picture.
  async function updateProfilePicture(image) {
    const updatedUser = await uploadProfilePicture(image);

    if (!updatedUser) {
      throw new Error(
        "Profile picture upload succeeded without returning user details."
      );
    }

    setUser(updatedUser);
    return updatedUser;
  }

  // Sign out and clear the saved session.
  async function logout() {
    try {
      await recordLogoutActivity();
    } catch (error) {
      console.error("Could not record logout activity:", error);
    }

    await removeToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isLoggedIn: Boolean(user),
        login,
        register,
        updateProfile,
        updateProfilePicture,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider."
    );
  }

  return context;
}
