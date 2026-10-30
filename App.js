
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.content}>
        <Text style={styles.logo}>LikhaLocal</Text>

        <Text style={styles.tagline}>
          Discover local. Support local.
        </Text>

        <Text style={styles.description}>
          Explore products made by talented local sellers
          in your community.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF9F0",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  logo: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#315C42",
  },
  tagline: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "600",
    color: "#B66A3C",
    textAlign: "center",
  },
  description: {
    marginTop: 16,
    fontSize: 16,
    lineHeight: 24,
    color: "#555555",
    textAlign: "center",
  },
});
