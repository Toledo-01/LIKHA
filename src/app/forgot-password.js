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
import { requestPasswordReset } from "../services/auth";

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams();
  const initialEmail = Array.isArray(params.email)
    ? params.email[0]
    : params.email;
  const [email, setEmail] = useState(initialEmail || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleRequestReset() {
    setError("");
    setMessage("");

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    try {
      setLoading(true);
      const result = await requestPasswordReset(cleanEmail);
      setMessage(
        result.message ||
          "If an active account uses that email, reset instructions will be sent."
      );
    } catch (requestError) {
      setError(
        requestError.message ||
          "Unable to send reset instructions. Please try again later."
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
          <TouchableOpacity
            style={styles.backLink}
            onPress={() => router.replace("/login")}
            accessibilityRole="button"
          >
            <Text style={styles.backLinkText}>‹ Back to Log In</Text>
          </TouchableOpacity>

          <View style={styles.card}>
            <Text style={styles.brand}>LikhaLocal</Text>
            <Text style={styles.title}>Forgot your password?</Text>
            <Text style={styles.description}>
              Enter the email address linked to your account. If it is active,
              we will send a secure password reset link.
            </Text>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {message ? (
              <View style={styles.successBox}>
                <Text style={styles.successText}>{message}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>Email address</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor="#99958B"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={190}
              editable={!loading}
              accessibilityLabel="Email address"
            />

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.disabledButton]}
              onPress={handleRequestReset}
              disabled={loading}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Send Reset Link</Text>
              )}
            </TouchableOpacity>
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
  backLink: {
    width: "100%",
    maxWidth: 480,
    paddingVertical: 14,
  },
  backLinkText: {
    color: "#426B50",
    fontSize: 14,
    fontWeight: "700",
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
    marginTop: 8,
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
  successBox: {
    backgroundColor: "#EEF6EE",
    borderColor: "#C9DDCA",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  successText: {
    color: "#245B43",
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    backgroundColor: "#426B50",
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
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
