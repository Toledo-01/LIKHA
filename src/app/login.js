
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth } from "../context/AuthContext";

export default function LoginScreen() {
  const { login } = useAuth();

  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  async function handleLogin() {
    setError("");

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    try {
      setLoading(true);

    const data = await login(
  email.trim().toLowerCase(),
  password
);

const role = data.user.role;

if (role === "admin") {
  router.replace("/admin");
} else if (role === "seller") {
  router.replace("/seller");
} else if (role === "staff") {
  router.replace("/staff");
} else {
  router.replace("/");
}
    } catch (err) {
      setError(err.message || "Login failed. Please try again.");
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
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            keyboardVisible && styles.scrollContentKeyboard,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            disabled={loading}
          >
          </TouchableOpacity>

          <View
            style={[
              styles.header,
              keyboardVisible && styles.headerKeyboard,
            ]}
          >
            {!keyboardVisible && (
              <Image
                source={require("../../assets/likhalocal-logo.png")}
                style={styles.logo}
                resizeMode="contain"
                accessibilityLabel="LikhaLocal logo"
              />
            )}
            <Text style={styles.brand}>LikhaLocal</Text>
            {!keyboardVisible && (
              <Text style={styles.tagline}>
                Discover the unique talents of Filipino creators.
              </Text>
            )}
          </View>

          <View
            style={[
              styles.card,
              keyboardVisible && styles.cardKeyboard,
            ]}
          >
            <Text style={styles.title}>Welcome back!</Text>
            <Text style={styles.subtitle}>
              Explore the creativity of the Filipinos.
            </Text>

            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

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
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor="#99958B"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              maxLength={72}
              editable={!loading}
              onSubmitEditing={handleLogin}
              returnKeyType="go"
            />

            <TouchableOpacity
              style={styles.showPasswordRow}
              onPress={() => setShowPassword(!showPassword)}
              disabled={loading}
            >
              <Text style={styles.showPasswordText}>
                {showPassword ? "Hide password" : "Show password"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.disabledButton]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Log In</Text>
              )}
            </TouchableOpacity>

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Don&apos;t have an account?{" "}
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/register")}
                disabled={loading}
              >
                <Text style={styles.linkText}>Register</Text>
              </TouchableOpacity>
            </View>
          </View>

          {!keyboardVisible && (
            <Text style={styles.bottomNote}>
              Supporting local makers, one purchase at a time.
            </Text>
          )}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContentKeyboard: {
    justifyContent: "flex-start",
    paddingTop: 4,
    paddingBottom: 16,
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
    marginTop: 12,
    marginBottom: 24,
  },
  headerKeyboard: {
    marginTop: 0,
    marginBottom: 8,
  },
  logo: {
    width: 88,
    height: 88,
    marginBottom: 8,
  },
  brand: {
    color: "#294D37",
    fontSize: 27,
    fontWeight: "800",
  },
  tagline: {
    color: "#77766D",
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
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
  cardKeyboard: {
    padding: 18,
  },
  title: {
    color: "#294D37",
    fontSize: 25,
    fontWeight: "800",
  },
  subtitle: {
    color: "#77766D",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
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
    marginTop: 24,
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
    marginTop: 24,
    color: "#89877D",
    fontSize: 12,
    textAlign: "center",
  },
});
