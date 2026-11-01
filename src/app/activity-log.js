import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Redirect, router, useFocusEffect } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { fetchMyActivity } from "../services/auth";
import AccountMenu from "../components/AccountMenu";

function ActivityList({ activities }) {
  if (activities.length === 0) {
    return (
      <Text style={styles.stateText}>
        Your recent actions will appear here.
      </Text>
    );
  }

  return activities.map((activity) => {
    const timestamp = new Date(activity.created_at);
    const dateLabel = Number.isNaN(timestamp.getTime())
      ? String(activity.created_at || "")
      : timestamp.toLocaleString();

    return (
      <View key={String(activity.id)} style={styles.activityRow}>
        <View style={styles.activityDot} />
        <View style={styles.activityContent}>
          <Text style={styles.activitySummary}>{activity.summary}</Text>
          <Text style={styles.activityMeta}>{dateLabel}</Text>
        </View>
      </View>
    );
  });
}

export default function ActivityLogScreen() {
  const { user, isLoading: authLoading } = useAuth();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadActivity = useCallback(async () => {
    setError("");

    try {
      setActivities(await fetchMyActivity());
    } catch (loadError) {
      console.error("Could not load activity history:", loadError);
      setError(
        loadError.message || "Could not load your activity history."
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (authLoading || !user) {
        return undefined;
      }

      let active = true;

      async function load() {
        setLoading(true);
        await loadActivity();
        if (active) {
          setLoading(false);
        }
      }

      load();
      return () => {
        active = false;
      };
    }, [authLoading, loadActivity, user])
  );

  const refreshActivity = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadActivity();
    } finally {
      setRefreshing(false);
    }
  }, [loadActivity]);

  if (authLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#245B43" />
      </SafeAreaView>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshActivity}
            tintColor="#245B43"
          />
        }
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back to profile"
          >
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
          <AccountMenu />
        </View>

        <Text style={styles.eyebrow}>ACCOUNT</Text>
        <Text style={styles.title}>Activity Log</Text>
        <Text style={styles.subtitle}>
          Recent actions from your {user.role} account.
        </Text>

        <View style={styles.activityCard}>
          {loading ? (
            <View style={styles.stateContainer}>
              <ActivityIndicator color="#245B43" />
              <Text style={styles.stateText}>Loading activity log...</Text>
            </View>
          ) : error ? (
            <View style={styles.stateContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={refreshActivity}
                disabled={refreshing}
                accessibilityRole="button"
              >
                <Text style={styles.retryText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ActivityList activities={activities} />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FAF9F5" },
  container: { padding: 18, paddingBottom: 30 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  backButton: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#245B43",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 13,
  },
  backText: { color: "#245B43", fontSize: 13, fontWeight: "700" },
  eyebrow: { color: "#78907B", fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: "#214D39", fontSize: 28, fontWeight: "900", marginTop: 4 },
  subtitle: { color: "#758173", fontSize: 13, lineHeight: 20, marginTop: 6, marginBottom: 18 },
  activityCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#EEEEE7",
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0E8",
  },
  activityDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#5B8968",
    marginTop: 5,
    marginRight: 12,
  },
  activityContent: { flex: 1 },
  activitySummary: { fontSize: 13, lineHeight: 19, fontWeight: "600", color: "#2C4031" },
  activityMeta: { fontSize: 11, color: "#899389", marginTop: 4 },
  stateContainer: { alignItems: "center", paddingVertical: 20 },
  stateText: { fontSize: 12, color: "#758173", textAlign: "center", paddingVertical: 17 },
  errorText: { fontSize: 12, color: "#B42318", textAlign: "center", marginBottom: 12 },
  retryButton: { backgroundColor: "#245B43", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 },
  retryText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
});
