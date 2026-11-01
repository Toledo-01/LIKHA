import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { getToken } from "../services/auth";
import { createAdminCategory, fetchCategories } from "../services/api";
import AccountMenu from "../components/AccountMenu";

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
  const { user } = useAuth();

  const [statistics, setStatistics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryMessage, setCategoryMessage] = useState("");

  const selectedCategory = categories.find(
    (category) => Number(category.id) === Number(selectedCategoryId)
  );
  const filteredCategories = categories.filter((category) =>
    String(category.name || "")
      .toLowerCase()
      .includes(categorySearch.trim().toLowerCase())
  );

  const loadDashboard = useCallback(async (refresh = false) => {
    try {
      const token = await getToken();

      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setError("");

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
    Promise.resolve().then(loadDashboard);
  }, [loadDashboard]);

  const loadCategories = useCallback(async (isActive = () => true) => {
    setCategoriesError("");

    try {
      const categoryData = await fetchCategories();

      if (!Array.isArray(categoryData)) {
        throw new Error("The server returned an invalid category list.");
      }

      if (isActive()) {
        setCategories(categoryData);
      }
    } catch (loadError) {
      console.error("Could not load categories:", loadError);
      if (isActive()) {
        setCategoriesError(
          loadError.message || "Unable to load marketplace categories."
        );
      }
    } finally {
      if (isActive()) {
        setCategoriesLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setCategoriesLoading(true);
      loadCategories(() => active);

      return () => {
        active = false;
      };
    }, [loadCategories])
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);

    try {
      await Promise.all([loadDashboard(true), loadCategories()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadCategories, loadDashboard]);

  async function handleCreateCategory() {
    const cleanName = categoryName.trim();
    setCategoryMessage("");
    setCategoriesError("");

    if (!cleanName) {
      setCategoriesError("Enter a category name.");
      return;
    }

    setSavingCategory(true);

    try {
      const category = await createAdminCategory(cleanName);
      setCategories((current) =>
        [...current, category].sort((first, second) =>
          first.name.localeCompare(second.name)
        )
      );
      setSelectedCategoryId(category.id);
      setCategoryName("");
      setCategoryMessage(`${category.name} was added successfully.`);
      await loadDashboard(true);
    } catch (createError) {
      setCategoriesError(
        createError.message || "Unable to create the category."
      );
    } finally {
      setSavingCategory(false);
    }
  }

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
            onRefresh={handleRefresh}
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
          <AccountMenu />
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

            <View style={styles.categoryCard}>
              <Text style={styles.categoryCardTitle}>
                Marketplace categories
              </Text>

              {categoriesLoading ? (
                <View style={styles.categoryLoading}>
                  <ActivityIndicator size="small" color="#245B43" />
                  <Text style={styles.categoryHelper}>
                    Loading categories...
                  </Text>
                </View>
              ) : categoriesError && categories.length === 0 ? (
                <View>
                  <Text style={styles.categoryError}>{categoriesError}</Text>
                  <TouchableOpacity
                    style={styles.categoryRetryButton}
                    onPress={() => loadCategories()}
                  >
                    <Text style={styles.categoryRetryText}>Try Again</Text>
                  </TouchableOpacity>
                </View>
              ) : categories.length === 0 ? (
                <Text style={styles.categoryHelper}>
                  No categories yet. Add one below.
                </Text>
              ) : (
                <View style={styles.categorySelector}>
                  <Text style={styles.categoryInputLabel}>
                    Select a marketplace category
                  </Text>
                  <TouchableOpacity
                    style={styles.categoryPickerButton}
                    onPress={() => setCategoryPickerVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      selectedCategory
                        ? `Selected category: ${selectedCategory.name}. Choose another category`
                        : "Choose a marketplace category"
                    }
                  >
                    <Text
                      style={[
                        styles.categoryPickerText,
                        !selectedCategory && styles.categoryPickerPlaceholder,
                      ]}
                    >
                      {selectedCategory?.name || "Select a category"}
                    </Text>
                    <Text style={styles.categoryPickerChevron}>⌄</Text>
                  </TouchableOpacity>
                  {selectedCategory ? (
                    <Text style={styles.categoryHelper}>
                      Selected: {selectedCategory.name}
                    </Text>
                  ) : (
                    <Text style={styles.categoryHelper}>
                      Search the list and choose a category to view it.
                    </Text>
                  )}
                </View>
              )}

              {!!categoriesError && categories.length > 0 ? (
                <Text style={styles.categoryError}>{categoriesError}</Text>
              ) : null}

              {!!categoryMessage ? (
                <Text style={styles.categorySuccess}>{categoryMessage}</Text>
              ) : null}

              <Text style={styles.categoryInputLabel}>Add a category</Text>
              <View style={styles.categoryForm}>
                <TextInput
                  style={styles.categoryInput}
                  value={categoryName}
                  onChangeText={setCategoryName}
                  placeholder="e.g. Jewelry"
                  placeholderTextColor="#899389"
                  maxLength={100}
                  editable={!savingCategory}
                  returnKeyType="done"
                  onSubmitEditing={handleCreateCategory}
                  accessibilityLabel="New category name"
                />
                <TouchableOpacity
                  style={[
                    styles.categoryAddButton,
                    savingCategory && styles.disabledButton,
                  ]}
                  onPress={handleCreateCategory}
                  disabled={savingCategory}
                  accessibilityRole="button"
                >
                  {savingCategory ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.categoryAddButtonText}>Add</Text>
                  )}
                </TouchableOpacity>
              </View>
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

      <Modal
        visible={categoryPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setCategoryPickerVisible(false);
          setCategorySearch("");
        }}
      >
        <Pressable
          style={styles.categoryModalBackdrop}
          onPress={() => {
            setCategoryPickerVisible(false);
            setCategorySearch("");
          }}
        >
          <Pressable
            style={styles.categoryModal}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.categoryModalHeader}>
              <View>
                <Text style={styles.categoryModalTitle}>
                  Choose category
                </Text>
                <Text style={styles.categoryModalSubtitle}>
                  Search or select a marketplace category.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setCategoryPickerVisible(false);
                  setCategorySearch("");
                }}
                accessibilityRole="button"
                accessibilityLabel="Close category picker"
                hitSlop={10}
              >
                <Text style={styles.categoryModalClose}>×</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.categorySearchInput}
              placeholder="Search categories"
              placeholderTextColor="#899389"
              value={categorySearch}
              onChangeText={setCategorySearch}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Search categories"
            />

            <ScrollView
              style={styles.categoryOptions}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              {filteredCategories.length === 0 ? (
                <Text style={styles.categoryEmptyText}>
                  No matching categories.
                </Text>
              ) : (
                filteredCategories.map((category) => {
                  const isSelected =
                    Number(selectedCategoryId) === Number(category.id);

                  return (
                    <TouchableOpacity
                      key={category.id}
                      style={[
                        styles.categoryOption,
                        isSelected && styles.categoryOptionSelected,
                      ]}
                      onPress={() => {
                        setSelectedCategoryId(category.id);
                        setCategoryPickerVisible(false);
                        setCategorySearch("");
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Text
                        style={[
                          styles.categoryOptionText,
                          isSelected && styles.categoryOptionTextSelected,
                        ]}
                      >
                        {category.name}
                      </Text>
                      {isSelected ? (
                        <Text style={styles.categoryCheck}>✓</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  categoryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EBE3",
    padding: 16,
    marginBottom: 24,
  },
  categoryCardTitle: {
    color: "#263D2D",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 12,
  },
  categoryLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 8,
  },
  categoryHelper: {
    color: "#758173",
    fontSize: 12,
    lineHeight: 18,
  },
  categorySelector: {
    gap: 8,
  },
  categoryPickerButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#D9E0DA",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 13,
  },
  categoryPickerText: {
    color: "#263D2D",
    fontSize: 14,
    fontWeight: "700",
  },
  categoryPickerPlaceholder: {
    color: "#899389",
    fontWeight: "400",
  },
  categoryPickerChevron: {
    color: "#245B43",
    fontSize: 22,
    lineHeight: 24,
  },
  categoryModalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
    backgroundColor: "rgba(0, 0, 0, 0.42)",
  },
  categoryModal: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "82%",
    alignSelf: "center",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    padding: 18,
    gap: 12,
  },
  categoryModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  categoryModalTitle: {
    color: "#263D2D",
    fontSize: 18,
    fontWeight: "900",
  },
  categoryModalSubtitle: {
    color: "#758173",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  categoryModalClose: {
    color: "#52645A",
    fontSize: 27,
    lineHeight: 28,
    paddingHorizontal: 4,
  },
  categorySearchInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#D9E0DA",
    borderRadius: 10,
    paddingHorizontal: 12,
    color: "#263D2D",
    fontSize: 14,
  },
  categoryOptions: {
    flexGrow: 0,
    flexShrink: 1,
  },
  categoryOption: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#EDF0EB",
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  categoryOptionSelected: {
    backgroundColor: "#F0F5EF",
    borderRadius: 8,
  },
  categoryOptionText: {
    color: "#30463A",
    fontSize: 14,
  },
  categoryOptionTextSelected: {
    color: "#245B43",
    fontWeight: "800",
  },
  categoryCheck: {
    color: "#245B43",
    fontSize: 17,
    fontWeight: "900",
  },
  categoryEmptyText: {
    color: "#758173",
    fontSize: 13,
    paddingVertical: 18,
    textAlign: "center",
  },
  categoryError: {
    color: "#A33C2D",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  categorySuccess: {
    color: "#245B43",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 9,
  },
  categoryRetryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#245B43",
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
  },
  categoryRetryText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  categoryInputLabel: {
    color: "#263D2D",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 18,
    marginBottom: 8,
  },
  categoryForm: {
    flexDirection: "row",
    gap: 9,
  },
  categoryInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#D9E0DA",
    borderRadius: 10,
    paddingHorizontal: 12,
    color: "#263D2D",
    fontSize: 14,
  },
  categoryAddButton: {
    minWidth: 74,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#245B43",
    borderRadius: 10,
    paddingHorizontal: 16,
  },
  categoryAddButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.6,
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
