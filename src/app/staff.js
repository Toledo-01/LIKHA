
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { getToken } from "../services/auth";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://likhalocal-api.onrender.com";

export default function StaffScreen() {
  const router = useRouter();
  const { logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [message, setMessage] = useState("");
  const [staffRole, setStaffRole] = useState("");

  const verifyStaffAccess = useCallback(async () => {
    setMessage("");
    setHasAccess(false);

    try {
      const token = await getToken();

      if (!token) {
        setMessage("Please log in to access the staff dashboard.");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/staff/test`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401) {
          setMessage(
            "Your session is invalid or has expired. Please log in again."
          );
        } else if (response.status === 403) {
          setMessage(
            "Access denied. This dashboard is only available to staff accounts."
          );
        } else {
          setMessage(
            data.message || "Could not verify staff access. Please try again."
          );
        }
        return;
      }

      if (data.success !== true || data.role !== "staff") {
        setMessage("The server did not confirm staff access.");
        return;
      }

      setStaffRole(data.role);
      setHasAccess(true);
    } catch (error) {
      setMessage(
        "Cannot connect to the server. Check that your backend is running and your API address is correct."
      );
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      setLoading(true);
      await verifyStaffAccess();

      if (active) {
        setLoading(false);
      }
    }

    checkAccess();

    return () => {
      active = false;
    };
  }, [verifyStaffAccess]);

  const handleRefresh = async () => {
    setRefreshing(true);

    try {
      await verifyStaffAccess();
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.replace("/login");
    } catch (error) {
      console.error("Logout failed:", error);
      setMessage("Could not log out. Please try again.");
    }
  };

  const openScreen = (path) => {
    router.push(path);
  };

  const openProductCatalog = () => {
    router.push({
      pathname: "/explore",
      params: { fromStaff: "true" },
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={["#166534"]}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Image
            source={require("../../assets/likhalocal-logo.png")}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="LikhaLocal logo"
          />
          <Text style={styles.brand}>LikhaLocal</Text>
        </View>
        <Text style={styles.heading}>Staff Dashboard</Text>
        <Text style={styles.subtitle}>
          Your workspace for reviewing and exploring local products.
        </Text>
      </View>

      {loading ? (
        <View style={styles.statusCard}>
          <ActivityIndicator size="large" color="#166534" />
          <Text style={styles.statusText}>
            Verifying staff access...
          </Text>
        </View>
      ) : hasAccess ? (
        <>
          <View style={styles.successCard}>
            <View style={styles.successIcon}>
              <Text style={styles.successIconText}>✓</Text>
            </View>

            <View style={styles.successInfo}>
              <Text style={styles.successTitle}>
                Staff access verified
              </Text>
              <Text style={styles.successText}>
                Your account is authorized to use the staff dashboard.
              </Text>
              <Text style={styles.role}>
                Role: {staffRole}
              </Text>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Product Management</Text>
            <Text style={styles.sectionSubtitle}>
              Choose what you want to do.
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.featureCard,
              pressed && styles.cardPressed,
            ]}
            onPress={() => openScreen("/staff-products")}
          >
            <View style={styles.featureTop}>
              <View style={styles.reviewIconBox}>
                <Text style={styles.featureIcon}>▤</Text>
              </View>
              <View style={styles.featureTag}>
                <Text style={styles.featureTagText}>STAFF TOOL</Text>
              </View>
            </View>

            <Text style={styles.cardTitle}>Product Review</Text>
            <Text style={styles.cardDescription}>
              View sellers with pending products and inspect their
              submissions before they are reviewed by an administrator.
            </Text>

            <View style={styles.cardAction}>
              <Text style={styles.reviewActionText}>View Submissions</Text>
              <Text style={styles.actionArrow}>→</Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.featureCard,
              pressed && styles.cardPressed,
            ]}
            onPress={openProductCatalog}
          >
            <View style={styles.featureTop}>
              <View style={styles.browseIconBox}>
                <Text style={styles.featureIcon}>▦</Text>
              </View>
              <View style={styles.browseTag}>
                <Text style={styles.browseTagText}>CATALOG</Text>
              </View>
            </View>

            <Text style={styles.cardTitle}>Browse Products</Text>
            <Text style={styles.cardDescription}>
              Explore the product catalog and view local products
              available to customers.
            </Text>

            <View style={styles.cardAction}>
              <Text style={styles.browseActionText}>Explore Catalog</Text>
              <Text style={styles.actionArrowBlue}>→</Text>
            </View>
          </Pressable>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Account</Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.profileCard,
              pressed && styles.cardPressed,
            ]}
            onPress={() => openScreen("/profile")}
          >
            <View style={styles.profileIconBox}>
              <Text style={styles.profileIcon}>♙</Text>
            </View>

            <View style={styles.profileInfo}>
              <Text style={styles.profileTitle}>My Profile</Text>
              <Text style={styles.profileDescription}>
                View your account and personal information.
              </Text>
            </View>

            <Text style={styles.profileArrow}>›</Text>
          </Pressable>

          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>
              🔒 Staff Permissions
            </Text>
            <Text style={styles.noticeText}>
              Staff can inspect products. Approval, rejection, user
              management, and other administrative actions remain
              restricted to authorized administrators.
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.logoutButton,
              pressed && styles.cardPressed,
            ]}
            onPress={handleLogout}
          >
            <Text style={styles.logoutButtonText}>Log Out</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>
            Staff access unavailable
          </Text>
          <Text style={styles.errorText}>{message}</Text>

          <Pressable
            style={styles.primaryButton}
            onPress={handleRefresh}
            disabled={refreshing}
          >
            <Text style={styles.primaryButtonText}>
              Try Again
            </Text>
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={() => router.replace("/login")}
          >
            <Text style={styles.secondaryButtonText}>
              Go to Login
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7F5",
  },
  content: {
    padding: 18,
    paddingBottom: 35,
  },
  header: {
    marginTop: 8,
    marginBottom: 22,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 7,
  },
  logo: {
    width: 48,
    height: 48,
  },
  brand: {
    color: "#166534",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  heading: {
    fontSize: 28,
    fontWeight: "800",
    color: "#17251B",
  },
  subtitle: {
    marginTop: 7,
    fontSize: 14,
    lineHeight: 21,
    color: "#647067",
  },
  statusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8E2",
  },
  statusText: {
    marginTop: 12,
    color: "#647067",
    fontSize: 14,
  },
  successCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#E8F4EA",
    borderColor: "#D2E8D6",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 27,
  },
  successIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#166534",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  successIconText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  successInfo: {
    flex: 1,
  },
  successTitle: {
    color: "#166534",
    fontSize: 14,
    fontWeight: "800",
  },
  successText: {
    color: "#41664A",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  role: {
    color: "#166534",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 7,
    textTransform: "uppercase",
  },
  sectionHeader: {
    marginBottom: 13,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#17251B",
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#647067",
    marginTop: 4,
  },
  featureCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E0E7E0",
    borderRadius: 18,
    padding: 17,
    marginBottom: 14,
    shadowColor: "#17251B",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 7,
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.78,
  },
  featureTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  reviewIconBox: {
    width: 49,
    height: 49,
    borderRadius: 14,
    backgroundColor: "#E3F2E6",
    alignItems: "center",
    justifyContent: "center",
  },
  browseIconBox: {
    width: 49,
    height: 49,
    borderRadius: 14,
    backgroundColor: "#E8EEFF",
    alignItems: "center",
    justifyContent: "center",
  },
  featureIcon: {
    fontSize: 28,
    fontWeight: "700",
    color: "#166534",
  },
  featureTag: {
    backgroundColor: "#E8F4EA",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 7,
  },
  featureTagText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#166534",
    letterSpacing: 0.5,
  },
  browseTag: {
    backgroundColor: "#E8EEFF",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 7,
  },
  browseTagText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#3159A5",
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#1F2D22",
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: "#68736A",
    marginTop: 7,
  },
  cardAction: {
    borderTopWidth: 1,
    borderTopColor: "#EDF0ED",
    marginTop: 16,
    paddingTop: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reviewActionText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#166534",
  },
  browseActionText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#3159A5",
  },
  actionArrow: {
    fontSize: 21,
    fontWeight: "700",
    color: "#166534",
  },
  actionArrowBlue: {
    fontSize: 21,
    fontWeight: "700",
    color: "#3159A5",
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E0E7E0",
    padding: 13,
  },
  profileIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F0EAFE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  profileIcon: {
    fontSize: 27,
    color: "#6941A5",
  },
  profileInfo: {
    flex: 1,
  },
  profileTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#26342A",
  },
  profileDescription: {
    fontSize: 12,
    lineHeight: 17,
    color: "#68736A",
    marginTop: 4,
  },
  profileArrow: {
    fontSize: 25,
    color: "#89938A",
    marginLeft: 8,
  },
  noticeCard: {
    marginTop: 22,
    padding: 15,
    backgroundColor: "#FFF8E7",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#F2E5BF",
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#775719",
    marginBottom: 7,
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 19,
    color: "#78683E",
  },
  logoutButton: {
    marginTop: 24,
    marginBottom: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  logoutButtonText: {
    color: "#B91C1C",
    fontSize: 15,
    fontWeight: "800",
  },
  errorCard: {
    padding: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#991B1B",
  },
  errorText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#7F1D1D",
    marginTop: 8,
  },
  primaryButton: {
    marginTop: 16,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: "#166534",
    borderRadius: 10,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    marginTop: 9,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#E8F4EA",
  },
  secondaryButtonText: {
    color: "#166534",
    fontSize: 14,
    fontWeight: "700",
  },
});

