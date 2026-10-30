
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { router } from "expo-router";
import { useAuth } from "../context/AuthContext";

export default function RegisterScreen() {
  const { register } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleRegister() {
    setError("");

    if (!fullName.trim() || !email.trim() || !password) {
      setError("Please fill in your name, email, and password.");
      return;
    }

    if (password.length < 8) {
      setError("Your password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Your passwords do not match.");
      return;
    }

    try {
      setLoading(true);

      await register({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: phone.trim(),
      });

      router.replace("/");
    } catch (err) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Image
              source={require("../../assets/likhalocal-logo.png")}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="LikhaLocal logo"
            />
            <Text style={styles.brand}>LikhaLocal</Text>
            <Text style={styles.tagline}>
              Discover products made by local creators.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Create an account</Text>
            <Text style={styles.subtitle}>
              Join LikhaLocal and discover local products.
            </Text>

            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Text style={styles.label}>Full name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your full name"
              placeholderTextColor="#99958B"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              maxLength={120}
              editable={!loading}
            />

            <Text style={styles.label}>Email address *</Text>
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
            />

            <Text style={styles.label}>Phone number (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="09XXXXXXXXX"
              placeholderTextColor="#99958B"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              maxLength={30}
              editable={!loading}
            />

            <Text style={styles.label}>Password *</Text>
            <TextInput
              style={styles.input}
              placeholder="At least 8 characters"
              placeholderTextColor="#99958B"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              maxLength={72}
              editable={!loading}
            />

            <Text style={styles.label}>Confirm password *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your password again"
              placeholderTextColor="#99958B"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              maxLength={72}
              editable={!loading}
            />

            <TouchableOpacity
              style={styles.showPasswordRow}
              onPress={() => setShowPassword(!showPassword)}
              disabled={loading}
            >
              <Text style={styles.showPasswordText}>
                {showPassword ? "Hide passwords" : "Show passwords"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.disabledButton]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  Create Account
                </Text>
              )}
            </TouchableOpacity>

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Already have an account?{" "}
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/login")}
                disabled={loading}
              >
                <Text style={styles.linkText}>Log in</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.bottomNote}>
            Supporting local makers, one purchase at a time.
          </Text>
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
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 32,
    alignItems: "center",
  },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  backText: {
    color: "#426B50",
    fontSize: 15,
    fontWeight: "600",
  },
  header: {
    alignItems: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  logo: {
    width: 60,
    height: 60,
    marginBottom: 8,
  },
  brand: {
    color: "#294D37",
    fontSize: 26,
    fontWeight: "800",
  },
  tagline: {
    color: "#77766D",
    fontSize: 13,
    marginTop: 5,
    textAlign: "center",
  },
  card: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#FFFFFF",
    padding: 22,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E9E5D9",
  },
  title: {
    color: "#294D37",
    fontSize: 24,
    fontWeight: "800",
  },
  subtitle: {
    color: "#77766D",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
    marginBottom: 20,
  },
  errorBox: {
    backgroundColor: "#FFF0ED",
    borderColor: "#E9B9AE",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    color: "#A33C2D",
    fontSize: 13,
    lineHeight: 19,
  },
  label: {
    color: "#344A39",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 7,
    marginTop: 13,
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#DEDCCF",
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 13,
    color: "#292D28",
    fontSize: 15,
    backgroundColor: "#FFFEFB",
  },
  showPasswordRow: {
    alignSelf: "flex-start",
    paddingVertical: 12,
  },
  showPasswordText: {
    color: "#426B50",
    fontSize: 13,
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: "#426B50",
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    minHeight: 50,
  },
  disabledButton: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 22,
  },
  footerText: {
    color: "#77766D",
    fontSize: 14,
  },
  linkText: {
    color: "#426B50",
    fontSize: 14,
    fontWeight: "800",
  },
  bottomNote: {
    marginTop: 22,
    color: "#89877D",
    fontSize: 12,
    textAlign: "center",
  },
});
