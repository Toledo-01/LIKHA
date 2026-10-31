import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { getToken } from "../services/auth";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://likhalocal-api.onrender.com";

function StatCard({ title, value, description, onPress }) {
  return (
    <TouchableOpacity
      style={styles.statCard}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${value ?? 0}. ${description}`}
    >
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={styles.statValue}>{value ?? 0}</Text>
      <Text style={styles.statDescription}>{description}</Text>
      <Text style={styles.tapHint}>Tap to view {"\u2192"}</Text>
    </TouchableOpacity>
  );
}

export default function AdminDashboardScreen() {
  const { user, logout } = useAuth();

  const [statistics, setStatistics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async (refresh = false) => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setError("");

    try {
      const token = await getToken();

      if (!token) {
        setError("Your session has expired. Please log in again.");
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/admin/dashboard`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to load the admin dashboard."
        );
      }

      setStatistics(data.statistics);
    } catch (err) {
      setError(err.message || "Could not connect to the server.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleLogout = async () => {
    try {
      await logout();
      router.replace("/login");
    } catch (err) {
      setError("Unable to log out. Please try again.");
    }
  };

  const openUsers = () => {
    router.push("/admin-users");
  };

  const openProducts = (status) => {
    router.push({
      pathname: "/admin-products",
      params: status ? { status } : {},
    });
  };

  if (user && user.role !== "admin") {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorTitle}>Access denied</Text>

        <Text style={styles.errorMessage}>
          This page is only available to administrators.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.replace("/")}
        >
          <Text style={styles.primaryButtonText}>
            Return to Home
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadDashboard(true)}
            tintColor="#245B43"
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
            <View>
              <Text style={styles.brand}>LikhaLocal</Text>
              <Text style={styles.subtitle}>ADMINISTRATION</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeLabel}>
            ADMIN DASHBOARD
          </Text>

          <Text style={styles.welcomeTitle}>
            Welcome{user?.full_name ? `, ${user.full_name}` : " back"}!
          </Text>

          <Text style={styles.welcomeDescription}>
            Here is an overview of your LikhaLocal marketplace.
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator
              size="large"
              color="#245B43"
            />

            <Text style={styles.loadingText}>
              Loading dashboard statistics...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>
              Unable to load dashboard
            </Text>

            <Text style={styles.errorMessage}>{error}</Text>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => loadDashboard()}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>
                Try Again
              </Text>
            </TouchableOpacity>
          </View>
        ) : statistics ? (
          <>
            <Text style={styles.sectionTitle}>Users</Text>

            <View style={styles.statsGrid}>
              <StatCard
                title="Total Users"
                value={statistics.users?.total}
                description="All registered accounts"
                onPress={openUsers}
              />

              <StatCard
                title="Active Users"
                value={statistics.users?.active}
                description="Currently active accounts"
                onPress={openUsers}
              />

              <StatCard
                title="Admins"
                value={statistics.users?.admins}
                description="Administrator accounts"
                onPress={openUsers}
              />

              <StatCard
                title="Staff"
                value={statistics.users?.staff}
                description="Staff accounts"
                onPress={openUsers}
              />

              <StatCard
                title="Sellers"
                value={statistics.users?.sellers}
                description="Seller accounts"
                onPress={openUsers}
              />

              <StatCard
                title="Customers"
                value={statistics.users?.customers}
                description="Customer accounts"
                onPress={openUsers}
              />

              <StatCard
                title="Inactive Users"
                value={statistics.users?.inactive}
                description="Inactive accounts"
                onPress={openUsers}
              />
            </View>

            <Text style={styles.sectionTitle}>Products</Text>

            <View style={styles.statsGrid}>
              <StatCard
                title="Total Products"
                value={statistics.products?.total}
                description="All listed products"
                onPress={() => openProducts("")}
              />

              <StatCard
                title="Approved"
                value={statistics.products?.approved}
                description="Approved products"
                onPress={() => openProducts("approved")}
              />

              <StatCard
                title="Pending"
                value={statistics.products?.pending}
                description="Awaiting review"
                onPress={() => openProducts("pending")}
              />

              <StatCard
                title="Rejected"
                value={statistics.products?.rejected}
                description="Rejected products"
                onPress={() => openProducts("rejected")}
              />
            </View>

            <Text style={styles.sectionTitle}>Categories</Text>

            <View style={styles.statsGrid}>
              <StatCard
                title="Total Categories"
                value={statistics.categories?.total}
                description="Marketplace categories"
                onPress={() =>
                  setError(
                    "The category list screen has not been implemented yet."
                  )
                }
              />
            </View>

            <TouchableOpacity
              style={styles.manageUsersButton}
              onPress={openUsers}
              activeOpacity={0.8}
            >
              <Text style={styles.manageUsersButtonText}>
                Manage Users
              </Text>

              <Text style={styles.manageUsersButtonDescription}>
                View registered accounts and activate or deactivate accounts
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.manageProductsButton}
              onPress={() => openProducts("pending")}
              activeOpacity={0.8}
            >
              <Text style={styles.manageUsersButtonText}>
                Review Pending Products
              </Text>

              <Text style={styles.manageUsersButtonDescription}>
                Review seller submissions and approve or reject products
              </Text>
            </TouchableOpacity>

            <Text style={styles.footerText}>
              Pull down to refresh the latest statistics.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7F7F0",
  },
  content: {
    padding: 20,
    paddingBottom: 36,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logo: {
    width: 48,
    height: 48,
  },
  brand: {
    color: "#245B43",
    fontSize: 25,
    fontWeight: "900",
  },
  subtitle: {
    color: "#7A8477",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: 3,
  },
  logoutButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E6DD",
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 12,
  },
  logoutText: {
    color: "#245B43",
    fontWeight: "800",
  },
  welcomeSection: {
    backgroundColor: "#245B43",
    padding: 22,
    borderRadius: 20,
    marginBottom: 28,
  },
  welcomeLabel: {
    color: "#D6E7D5",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  welcomeTitle: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "900",
    marginTop: 10,
  },
  welcomeDescription: {
    color: "#E4EEE3",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
  sectionTitle: {
    color: "#263D2D",
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 13,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  statCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EBE3",
    padding: 16,
    marginBottom: 12,
    minHeight: 140,
  },
  statTitle: {
    color: "#6F796D",
    fontSize: 12,
    fontWeight: "700",
  },
  statValue: {
    color: "#245B43",
    fontSize: 30,
    fontWeight: "900",
    marginTop: 8,
  },
  statDescription: {
    color: "#8A9388",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  tapHint: {
    color: "#245B43",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 8,
  },
  manageUsersButton: {
    backgroundColor: "#245B43",
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 14,
    marginBottom: 12,
  },
  manageProductsButton: {
    backgroundColor: "#344C3D",
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 14,
    marginBottom: 24,
  },
  manageUsersButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  manageUsersButtonDescription: {
    color: "#E4EEE3",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 50,
  },
  loadingText: {
    color: "#6F796D",
    marginTop: 12,
  },
  errorCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#F0D7D0",
  },
  errorTitle: {
    color: "#9F3D2B",
    fontSize: 18,
    fontWeight: "900",
  },
  errorMessage: {
    color: "#6F514B",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 16,
  },
  primaryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#245B43",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  centered: {
    flex: 1,
    backgroundColor: "#F7F7F0",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  footerText: {
    textAlign: "center",
    color: "#8A9388",
    fontSize: 11,
    marginTop: 4,
  },
});


