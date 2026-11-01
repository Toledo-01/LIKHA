import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { resetAccountPassword } from "../services/auth";

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  async function handleResetPassword() {
    setError("");

    if (!token) {
      setError("This reset link is invalid or has expired.");
      return;
    }

    if (password.length < 8 || password.length > 72) {
      setError("Password must contain between 8 and 72 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      await resetAccountPassword(String(token), password);
      setComplete(true);
    } catch (resetError) {
      setError(
        resetError.message ||
          "Unable to reset your password. Request a new link and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.brand}>LikhaLocal</Text>
            <Text style={styles.title}>
              {complete ? "Password updated" : "Create a new password"}
            </Text>

            {complete ? (
              <>
                <Text style={styles.description}>
                  Your password has been changed. You can now log in with your
                  new password.
                </Text>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => router.replace("/login")}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryButtonText}>Go to Log In</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.description}>
                  Choose a password between 8 and 72 characters.
                </Text>

                {error ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Text style={styles.label}>New password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter a new password"
                  placeholderTextColor="#99958B"
                  secureTextEntry
                  autoCapitalize="none"
                  maxLength={72}
                  editable={!loading}
                  accessibilityLabel="New password"
                />

                <Text style={styles.label}>Confirm new password</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter your new password"
                  placeholderTextColor="#99958B"
                  secureTextEntry
                  autoCapitalize="none"
                  maxLength={72}
                  editable={!loading}
                  onSubmitEditing={handleResetPassword}
                  returnKeyType="done"
                  accessibilityLabel="Confirm new password"
                />

                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.disabledButton]}
                  onPress={handleResetPassword}
                  disabled={loading}
                  accessibilityRole="button"
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Reset Password</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8F5EC",
  },
  keyboard: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 22,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#FFFFFF",
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E9E5D9",
  },
  brand: {
    color: "#426B50",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  title: {
    color: "#294D37",
    fontSize: 24,
    fontWeight: "800",
    marginTop: 16,
  },
  description: {
    color: "#77766D",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 14,
  },
  label: {
    color: "#344A39",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 7,
    marginTop: 14,
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#DEDCCF",
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 14,
    color: "#292D28",
    fontSize: 15,
    backgroundColor: "#FFFEFB",
  },
  errorBox: {
    backgroundColor: "#FFF0ED",
    borderColor: "#E9B9AE",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: "#A33C2D",
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    backgroundColor: "#426B50",
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    minHeight: 50,
  },
  disabledButton: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
