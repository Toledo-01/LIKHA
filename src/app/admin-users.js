
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Redirect, Stack, router } from "expo-router";

import { useAuth } from "../context/AuthContext";
import { getToken } from "../services/auth";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://likhalocal-api.onrender.com";

const ROLE_FILTERS = [
  { label: "All Users", value: "all" },
  { label: "Active Users", value: "active" },
  { label: "Admins", value: "admin" },
  { label: "Staff", value: "staff" },
  { label: "Sellers", value: "seller" },
  { label: "Customers", value: "customer" },
];

const CREATE_USER_ROLES = [
  { label: "Customer", value: "customer" },
  { label: "Seller", value: "seller" },
  { label: "Staff", value: "staff" },
  { label: "Admin", value: "admin" },
];

function showMessage(title, message) {
  if (Platform.OS === "web") {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

function isUserActive(item) {
  return (
    item.is_active === true ||
    item.is_active === 1 ||
    item.is_active === "1"
  );
}

function matchesFilter(item, filterValue) {
  const role = String(item.role || "customer").toLowerCase();

  if (filterValue === "all") {
    return true;
  }

  if (filterValue === "active") {
    return isUserActive(item);
  }

  if (filterValue === "customer") {
    return role === "customer" || role === "user";
  }

  return role === filterValue;
}

function UserStatusBadge({ active }) {
  return (
    <View
      style={[
        styles.statusBadge,
        active ? styles.activeBadge : styles.inactiveBadge,
      ]}
    >
      <Text
        style={[
          styles.statusText,
          active ? styles.activeText : styles.inactiveText,
        ]}
      >
        {active ? "ACTIVE" : "INACTIVE"}
      </Text>
    </View>
  );
}

export default function AdminUsersScreen() {
  const { user, isLoading: authLoading } = useAuth();

  // Existing user-management state
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [error, setError] = useState("");

  // Create User form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);

  const [newUser, setNewUser] = useState({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    address: "",
    role: "customer",
  });

  const updateNewUser = (field, value) => {
    setNewUser((current) => ({
      ...current,
      [field]: value,
    }));
  };

  // Retrieve registered accounts
  const fetchUsers = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const token = await getToken();

      if (!token) {
        setUsers([]);
        setError("Your session has expired. Please log in again.");
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/admin/users`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to load registered users."
        );
      }

      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (err) {
      console.error("Admin users loading error:", err);

      setError(
        err.message || "Unable to connect to the server."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Create a user account
  const createUser = async () => {
    if (creatingUser) {
      return;
    }

    const fullName = newUser.full_name.trim();
    const email = newUser.email.trim().toLowerCase();
    const password = newUser.password;

    if (!fullName || !email || !password) {
      showMessage(
        "Missing information",
        "Enter the full name, email, and password."
      );
      return;
    }

    if (password.length < 8) {
      showMessage(
        "Invalid password",
        "Use at least 8 characters for the password."
      );
      return;
    }

    try {
      setCreatingUser(true);

      const token = await getToken();

      if (!token) {
        throw new Error(
          "Your session has expired. Please log in again."
        );
      }

      const response = await fetch(
        `${API_BASE_URL}/api/admin/users`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...newUser,
            full_name: fullName,
            email,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to create the account."
        );
      }

      setNewUser({
        full_name: "",
        email: "",
        password: "",
        phone: "",
        address: "",
        role: "customer",
      });

      setShowCreateForm(false);

      await fetchUsers(true);

      showMessage(
        "Success",
        "The new account has been created successfully."
      );
    } catch (err) {
      console.error("Create user error:", err);

      showMessage(
        "Creation failed",
        err.message || "Unable to create the account."
      );
    } finally {
      setCreatingUser(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user?.role === "admin") {
      fetchUsers();
    }
  }, [authLoading, user?.role, fetchUsers]);

  // Activate or deactivate an account
  const changeAccountStatus = useCallback(
    async (targetUser, activate) => {
      if (!targetUser || updatingUserId !== null) {
        return;
      }

      if (Number(targetUser.id) === Number(user?.id)) {
        showMessage(
          "Action not allowed",
          "You cannot deactivate your own administrator account."
        );
        return;
      }

      const action = activate ? "activate" : "deactivate";
      const accountName = targetUser.full_name || "this account";

      const confirmationMessage =
        `Are you sure you want to ${action} ${accountName}?`;

      if (Platform.OS === "web") {
        const confirmed = window.confirm(
          `${activate ? "Activate" : "Deactivate"} account?\n\n` +
            confirmationMessage
        );

        if (!confirmed) {
          return;
        }
      }

      const performStatusUpdate = async () => {
        try {
          setUpdatingUserId(targetUser.id);
          setError("");

          const token = await getToken();

          if (!token) {
            throw new Error(
              "Your session has expired. Please log in again."
            );
          }

          const response = await fetch(
            `${API_BASE_URL}/api/admin/users/${targetUser.id}/status`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                is_active: activate,
              }),
            }
          );

          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(
              data.message ||
                `Unable to ${action} this account.`
            );
          }

          setUsers((currentUsers) =>
            currentUsers.map((item) =>
              Number(item.id) === Number(targetUser.id)
                ? {
                    ...item,
                    is_active:
                      data.user?.is_active !== undefined
                        ? Boolean(data.user.is_active)
                        : activate,
                  }
                : item
            )
          );

          await fetchUsers(true);

          showMessage(
            "Success",
            `${accountName} has been ${
              activate ? "activated" : "deactivated"
            }.`
          );
        } catch (err) {
          console.error("Account status update error:", err);

          showMessage(
            "Update failed",
            err.message || "Unable to update account status."
          );
        } finally {
          setUpdatingUserId(null);
        }
      };

      if (Platform.OS === "web") {
        await performStatusUpdate();
      } else {
        Alert.alert(
          `${activate ? "Activate" : "Deactivate"} account?`,
          confirmationMessage,
          [
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: activate ? "Activate" : "Deactivate",
              style: activate ? "default" : "destructive",
              onPress: performStatusUpdate,
            },
          ]
        );
      }
    },
    [fetchUsers, updatingUserId, user?.id]
  );

  // Counts for each filter
  const getFilterCount = useCallback(
    (filterValue) => {
      return users.filter((item) =>
        matchesFilter(item, filterValue)
      ).length;
    },
    [users]
  );

  // Apply the selected category and search term
  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return users.filter((item) => {
      const role = String(
        item.role || "customer"
      ).toLowerCase();

      const matchesSelectedRole = matchesFilter(
        item,
        selectedRole
      );

      const matchesSearch =
        !normalizedSearch ||
        [
          item.full_name,
          item.email,
          item.phone,
          item.address,
          role,
        ].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(normalizedSearch)
        );

      return matchesSelectedRole && matchesSearch;
    });
  }, [users, search, selectedRole]);

  const selectedFilter = ROLE_FILTERS.find(
    (filter) => filter.value === selectedRole
  );

  const selectedFilterCount = getFilterCount(selectedRole);

  const getRoleColor = (role) => {
    switch (String(role || "").toLowerCase()) {
      case "admin":
        return "#7C3AED";
      case "staff":
        return "#0369A1";
      case "seller":
        return "#047857";
      default:
        return "#475569";
    }
  };

  if (authLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#245B43" />
        <Text style={styles.loadingText}>
          Checking your session...
        </Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (user.role !== "admin") {
    return <Redirect href="/" />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen
        options={{
          title: "Manage Users",
          headerShown: true,
          headerBackTitle: "Dashboard",
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchUsers(true)}
            tintColor="#245B43"
          />
        }
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace("/admin")}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Back to Admin Dashboard"
        >
          <Text style={styles.backButtonText}>
            ‹ Back to Admin Dashboard
          </Text>
        </TouchableOpacity>

        {/* Page heading */}
        <View style={styles.header}>
          <Text style={styles.eyebrow}>
            ADMINISTRATION
          </Text>

          <Text style={styles.title}>
            Manage Users
          </Text>

          <Text style={styles.subtitle}>
            Create, search, filter, activate, or deactivate
            LikhaLocal accounts.
          </Text>
        </View>

        {/* Total users summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>
            TOTAL REGISTERED USERS
          </Text>

          <Text style={styles.summaryNumber}>
            {users.length}
          </Text>

          <Text style={styles.summaryHint}>
            Accounts retrieved from your database
          </Text>
        </View>

        {/* Create User form */}
        <View style={styles.createSection}>
          <TouchableOpacity
            onPress={() =>
              setShowCreateForm((current) => !current)
            }
            style={styles.createToggleButton}
            accessibilityRole="button"
          >
            <Text style={styles.createToggleButtonText}>
              {showCreateForm
                ? "− Cancel Create User"
                : "+ Create User Account"}
            </Text>
          </TouchableOpacity>

          {showCreateForm && (
            <View style={styles.createForm}>
              <Text style={styles.sectionTitle}>
                New User Details
              </Text>

              {[
                {
                  key: "full_name",
                  label: "Full Name",
                },
                {
                  key: "email",
                  label: "Email Address",
                },
                {
                  key: "password",
                  label: "Password (minimum 8 characters)",
                },
                {
                  key: "phone",
                  label: "Phone Number",
                },
                {
                  key: "address",
                  label: "Address",
                },
              ].map((field) => (
                <View
                  key={field.key}
                  style={styles.formField}
                >
                  <Text style={styles.formLabel}>
                    {field.label}
                  </Text>

                  <TextInput
                    value={newUser[field.key]}
                    onChangeText={(value) =>
                      updateNewUser(field.key, value)
                    }
                    placeholder={field.label}
                    placeholderTextColor="#94A3B8"
                    autoCapitalize={
                      field.key === "email"
                        ? "none"
                        : "words"
                    }
                    autoCorrect={false}
                    secureTextEntry={
                      field.key === "password"
                    }
                    keyboardType={
                      field.key === "email"
                        ? "email-address"
                        : field.key === "phone"
                          ? "phone-pad"
                          : "default"
                    }
                    style={styles.formInput}
                    editable={!creatingUser}
                    accessibilityLabel={field.label}
                  />
                </View>
              ))}

              <Text style={styles.formLabel}>
                Account Role
              </Text>

              <View style={styles.roleOptions}>
                {CREATE_USER_ROLES.map((item) => {
                  const selected =
                    newUser.role === item.value;

                  return (
                    <TouchableOpacity
                      key={item.value}
                      onPress={() =>
                        updateNewUser("role", item.value)
                      }
                      disabled={creatingUser}
                      style={[
                        styles.roleOption,
                        selected && styles.roleOptionSelected,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={[
                          styles.roleOptionText,
                          selected &&
                            styles.roleOptionTextSelected,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.formHint}>
                The new account will be active immediately.
                Share its password securely with the intended user.
              </Text>

              <TouchableOpacity
                disabled={creatingUser}
                onPress={createUser}
                style={[
                  styles.submitButton,
                  creatingUser && styles.disabledButton,
                ]}
                accessibilityRole="button"
              >
                {creatingUser ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    Create Account
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Search accounts */}
        <View style={styles.searchSection}>
          <Text style={styles.sectionTitle}>
            Search Accounts
          </Text>

          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>⌕</Text>

            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search name, email, phone..."
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search registered accounts"
            />

            {search.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearch("")}
                style={styles.clearButton}
                accessibilityLabel="Clear search"
              >
                <Text style={styles.clearButtonText}>
                  ×
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Role filters */}
        <Text style={styles.sectionTitle}>
          Filter Accounts
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContainer}
        >
          {ROLE_FILTERS.map((filter) => {
            const isSelected =
              selectedRole === filter.value;

            const count = getFilterCount(filter.value);

            return (
              <TouchableOpacity
                key={filter.value}
                style={[
                  styles.filterButton,
                  isSelected && styles.filterButtonSelected,
                ]}
                onPress={() =>
                  setSelectedRole(filter.value)
                }
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`${filter.label}: ${count} accounts`}
                accessibilityState={{ selected: isSelected }}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    isSelected &&
                      styles.filterButtonTextSelected,
                  ]}
                >
                  {filter.label} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* User results */}
        <View style={styles.resultsHeader}>
          <Text style={styles.sectionTitle}>
            {selectedFilter?.label || "Registered Accounts"} (
            {selectedFilterCount})
          </Text>

          <Text style={styles.resultCount}>
            {filteredUsers.length} found
          </Text>
        </View>

        {loading ? (
          <View style={styles.centerCard}>
            <ActivityIndicator
              size="large"
              color="#245B43"
            />

            <Text style={styles.loadingText}>
              Loading registered users...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>
              Unable to load users
            </Text>

            <Text style={styles.errorMessage}>
              {error}
            </Text>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => fetchUsers()}
            >
              <Text style={styles.primaryButtonText}>
                Try Again
              </Text>
            </TouchableOpacity>
          </View>
        ) : filteredUsers.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              No users found
            </Text>

            <Text style={styles.emptyText}>
              No accounts match this filter and search.
              Try another filter or clear your search.
            </Text>

            {(search || selectedRole !== "all") && (
              <TouchableOpacity
                style={styles.resetButton}
                onPress={() => {
                  setSearch("");
                  setSelectedRole("all");
                }}
              >
                <Text style={styles.resetButtonText}>
                  Clear Filters
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.userList}>
            {filteredUsers.map((item) => {
              const active = isUserActive(item);

              const isSelf =
                Number(item.id) === Number(user.id);

              const isUpdating =
                Number(updatingUserId) === Number(item.id);

              return (
                <View
                  key={String(item.id)}
                  style={styles.userRow}
                >
                  <View style={styles.userRowIdentity}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {(item.full_name || "U")
                          .trim()
                          .charAt(0)
                          .toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.userIdentity}>
                      <Text style={styles.userName}>
                        {item.full_name || "Unnamed User"}
                      </Text>

                      <Text style={styles.userEmail}>
                        {item.email || "No email provided"}
                      </Text>

                      <View style={styles.userMeta}>
                        <View
                          style={[
                            styles.roleBadge,
                            {
                              backgroundColor:
                                getRoleColor(item.role),
                            },
                          ]}
                        >
                          <Text style={styles.roleText}>
                            {(
                              item.role || "customer"
                            ).toUpperCase()}
                          </Text>
                        </View>

                        <UserStatusBadge active={active} />
                      </View>

                      {!!item.phone && (
                        <Text style={styles.rowDetail}>
                          Phone: {item.phone}
                        </Text>
                      )}

                      {!!item.address && (
                        <Text style={styles.rowDetail}>
                          Address: {item.address}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.userRowAction}>
                    {isSelf ? (
                      <Text style={styles.selfNotice}>
                        Your account
                      </Text>
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.statusActionButton,
                          active
                            ? styles.deactivateButton
                            : styles.activateButton,
                          isUpdating && styles.disabledButton,
                        ]}
                        disabled={
                          isUpdating ||
                          updatingUserId !== null
                        }
                        onPress={() =>
                          changeAccountStatus(item, !active)
                        }
                        activeOpacity={0.8}
                      >
                        {isUpdating ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <Text style={styles.statusActionText}>
                            {active ? "Deactivate" : "Activate"}
                          </Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7F7F0",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  eyebrow: {
    color: "#245B43",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  title: {
    color: "#172B20",
    fontSize: 28,
    fontWeight: "900",
  },
  subtitle: {
    color: "#6F796D",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
  },
  summaryCard: {
    backgroundColor: "#245B43",
    borderRadius: 18,
    padding: 22,
    marginBottom: 25,
  },
  summaryLabel: {
    color: "#D6E7D5",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  summaryNumber: {
    color: "#FFFFFF",
    fontSize: 42,
    fontWeight: "900",
    marginTop: 8,
  },
  summaryHint: {
    color: "#E4EEE3",
    fontSize: 12,
    marginTop: 4,
  },
  createSection: {
    marginBottom: 24,
  },
  createToggleButton: {
    backgroundColor: "#245B43",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  createToggleButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 14,
  },
  createForm: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DCE3D9",
    marginTop: 12,
    gap: 12,
  },
  formField: {
    gap: 6,
  },
  formLabel: {
    color: "#475569",
    fontWeight: "700",
    fontSize: 12,
  },
  formInput: {
    borderWidth: 1,
    borderColor: "#DCE3D9",
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: "#172B20",
    fontSize: 14,
  },
  roleOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  roleOption: {
    backgroundColor: "#F1F5F0",
    borderWidth: 1,
    borderColor: "#DCE3D9",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  roleOptionSelected: {
    backgroundColor: "#245B43",
    borderColor: "#245B43",
  },
  roleOptionText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
  },
  roleOptionTextSelected: {
    color: "#FFFFFF",
  },
  formHint: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
  },
  submitButton: {
    backgroundColor: "#245B43",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginTop: 4,
    minHeight: 46,
    justifyContent: "center",
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  sectionTitle: {
    color: "#263D2D",
    fontSize: 17,
    fontWeight: "900",
  },
  searchSection: {
    marginBottom: 20,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE3D9",
    borderRadius: 12,
    paddingHorizontal: 13,
    marginTop: 12,
    minHeight: 50,
  },
  searchIcon: {
    color: "#64748B",
    fontSize: 25,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: "#172B20",
    fontSize: 14,
    paddingVertical: 12,
  },
  clearButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearButtonText: {
    color: "#64748B",
    fontSize: 24,
  },
  filterScroll: {
    marginTop: 12,
    marginBottom: 24,
    flexGrow: 0,
  },
  filterContainer: {
    gap: 8,
    paddingRight: 4,
  },
  filterButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE3D9",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterButtonSelected: {
    backgroundColor: "#245B43",
    borderColor: "#245B43",
  },
  filterButtonText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
  },
  filterButtonTextSelected: {
    color: "#FFFFFF",
  },
  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 8,
  },
  userList: {
    gap: 10,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 12,
  },
  userRowIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    minWidth: 0,
  },
  userIdentity: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    color: "#172B20",
    fontSize: 15,
    fontWeight: "900",
    flexShrink: 1,
  },
  userEmail: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 4,
    flexShrink: 1,
  },
  userMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  rowDetail: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 6,
  },
  userRowAction: {
    width: 105,
    alignItems: "stretch",
    justifyContent: "center",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#1D4ED8",
    fontSize: 20,
    fontWeight: "900",
  },
  roleBadge: {
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  roleText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  activeBadge: {
    backgroundColor: "#DCFCE7",
  },
  inactiveBadge: {
    backgroundColor: "#FEE2E2",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "900",
  },
  activeText: {
    color: "#166534",
  },
  inactiveText: {
    color: "#991B1B",
  },
  statusActionButton: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
  },
  deactivateButton: {
    backgroundColor: "#B91C1C",
  },
  activateButton: {
    backgroundColor: "#15803D",
  },
  disabledButton: {
    opacity: 0.6,
  },
  statusActionText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },
  selfNotice: {
    color: "#64748B",
    backgroundColor: "#F1F5F9",
    padding: 8,
    borderRadius: 8,
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
  },
  centerCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 28,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F7F7F0",
  },
  loadingText: {
    color: "#64748B",
    marginTop: 12,
    textAlign: "center",
  },
  errorCard: {
    backgroundColor: "#FFF1F2",
    borderColor: "#FECDD3",
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
  },
  errorTitle: {
    color: "#9F1239",
    fontSize: 16,
    fontWeight: "900",
  },
  errorMessage: {
    color: "#881337",
    marginTop: 8,
    lineHeight: 20,
  },
  primaryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#245B43",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    marginTop: 14,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
  },
  emptyTitle: {
    color: "#172B20",
    fontSize: 17,
    fontWeight: "900",
  },
  emptyText: {
    color: "#64748B",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  resetButton: {
    backgroundColor: "#245B43",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
    marginTop: 16,
  },
  resetButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  resultCount: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
  },
  backButton: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  backButtonText: {
    color: "#245B43",
    fontSize: 15,
    fontWeight: "800",
  },
});
