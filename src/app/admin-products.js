
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";

import { getToken } from "../services/auth";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://likhalocal-api.onrender.com";
  
const FILTERS = [
  { label: "All", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Inactive", value: "inactive" },
];

function getImageUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") {
    return null;
  }

  if (
    imageUrl.startsWith("http://") ||
    imageUrl.startsWith("https://")
  ) {
    return imageUrl;
  }

  return `${API_BASE_URL}${
    imageUrl.startsWith("/") ? "" : "/"
  }${imageUrl}`;
}

function showMessage(title, message) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.alert(`${title}\n\n${message}`);
    }
  } else {
    Alert.alert(title, message);
  }
}

function confirmAction(
  title,
  message,
  onConfirm,
  destructive = false
) {
  if (Platform.OS === "web") {
    if (
      typeof window !== "undefined" &&
      window.confirm(`${title}\n\n${message}`)
    ) {
      onConfirm();
    }

    return;
  }

  Alert.alert(title, message, [
    {
      text: "Cancel",
      style: "cancel",
    },
    {
      text: "Confirm",
      style: destructive ? "destructive" : "default",
      onPress: onConfirm,
    },
  ]);
}

export default function AdminProductsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const requestedStatus = Array.isArray(params.status)
    ? params.status[0]
    : params.status || "";

  const validInitialStatus = FILTERS.some(
    (item) => item.value === requestedStatus
  )
    ? requestedStatus
    : "";

  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState(validInitialStatus);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState(null);

  // Synchronize the filter when navigating from dashboard statistics.
  useEffect(() => {
    const nextStatus = Array.isArray(params.status)
      ? params.status[0]
      : params.status || "";

    setFilter(
      FILTERS.some((item) => item.value === nextStatus)
        ? nextStatus
        : ""
    );
  }, [params.status]);

  const fetchProducts = useCallback(
    async (showLoader = true) => {
      if (showLoader) {
        setLoading(true);
      }

      setError("");

      try {
        const token = await getToken();

        if (!token) {
          throw new Error(
            "Please log in as an administrator."
          );
        }

        // Load all products, then filter them locally.
        const response = await fetch(
          `${API_BASE_URL}/api/admin/products`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.message ||
              `Could not load products (HTTP ${response.status}).`
          );
        }

        const list = Array.isArray(data)
          ? data
          : Array.isArray(data.products)
            ? data.products
            : Array.isArray(data.data?.products)
              ? data.data.products
              : Array.isArray(data.data)
                ? data.data
                : null;

        if (!list) {
          throw new Error(
            "The server response did not contain a valid product list."
          );
        }

        setProducts(list);
      } catch (err) {
        setError(
          err.message || "Could not load products."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      fetchProducts(true);
    }, [fetchProducts])
  );

  // Filter the loaded products by their current status.
  const filteredProducts = useMemo(() => {
    if (!filter) {
      return products;
    }

    return products.filter(
      (product) =>
        String(product.status || "").toLowerCase() ===
        filter.toLowerCase()
    );
  }, [products, filter]);

  const changeFilter = (value) => {
    setFilter(value);
  };

  const updateProductStatus = async (product, status) => {
    const action = status === "approved" ? "Approve" : "Reject";

    setProcessingId(product.id);

    try {
      const token = await getToken();

      if (!token) {
        throw new Error("Please log in again.");
      }

      const response = await fetch(
        `${API_BASE_URL}/api/admin/products/${product.id}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(
          data.message ||
            `Could not ${action.toLowerCase()} the product (HTTP ${response.status}).`
        );
      }

      // Update the visible product status immediately.
      setProducts((currentProducts) =>
        currentProducts.map((item) =>
          String(item.id) === String(product.id)
            ? { ...item, status }
            : item
        )
      );

      showMessage(
        "Success",
        `"${product.name}" has been ${status}.`
      );

      // Reload from the server to verify the saved status.
      await fetchProducts(false);
    } catch (err) {
      showMessage(
        "Action failed",
        err.message || "Please try again."
      );
    } finally {
      setProcessingId(null);
    }
  };

  const deleteProduct = async (product) => {
    setProcessingId(product.id);

    try {
      const token = await getToken();

      if (!token) {
        throw new Error("Please log in again.");
      }

      const response = await fetch(
        `${API_BASE_URL}/api/admin/products/${product.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(
          data.message ||
            `Could not delete the product (HTTP ${response.status}).`
        );
      }

      setProducts((currentProducts) =>
        currentProducts.filter(
          (item) => String(item.id) !== String(product.id)
        )
      );

      showMessage("Product deleted", `"${product.name}" was deleted.`);
      await fetchProducts(false);
    } catch (err) {
      showMessage(
        "Delete failed",
        err.message || "Please try again."
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleStatusAction = (product, status) => {
    const action = status === "approved" ? "Approve" : "Reject";

    confirmAction(
      `${action} product?`,
      `Are you sure you want to ${action.toLowerCase()} "${product.name}"?`,
      () => updateProductStatus(product, status),
      status === "rejected"
    );
  };

  const handleDeleteAction = (product) => {
    confirmAction(
      "Delete product?",
      `Are you sure you want to permanently delete "${product.name}"? Products included in order history cannot be deleted.`,
      () => deleteProduct(product),
      true
    );
  };

  const handleBackToDashboard = () => {
    // Always return to the dashboard, even without navigation history.
    router.replace("/admin");
  };

  const renderProduct = ({ item }) => {
    const imageUri = getImageUrl(item.image_url);
    const status = String(
      item.status || "unknown"
    ).toLowerCase();

    const isPending = status === "pending";
    const isProcessing =
      String(processingId) === String(item.id);
    const isBusy = processingId !== null;

    return (
      <View style={styles.productCard}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.productImage}
            resizeMode="cover"
          />
        ) : (
          <View
            style={[
              styles.productImage,
              styles.imagePlaceholder,
            ]}
          >
            <Text style={styles.placeholderText}>
              No image
            </Text>
          </View>
        )}

        <View style={styles.productInfo}>
          <Text style={styles.productName}>
            {item.name || "Unnamed product"}
          </Text>

          <Text style={styles.price}>
            ₱
            {Number(item.price || 0).toLocaleString("en-PH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>

          <Text style={styles.detail}>
            Shipping fee: ₱
            {Number(item.shipping_fee || 0).toLocaleString("en-PH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>

          <Text style={styles.detail}>
            Seller: {item.seller_name || "Unknown"}
          </Text>

          <Text style={styles.detail}>
            Email: {item.seller_email || "Not available"}
          </Text>

          <Text style={styles.detail}>
            Category: {item.category || "Uncategorized"}
          </Text>

          <Text style={styles.detail}>
            Stock: {item.stock ?? 0}
          </Text>

          <View
            style={[
              styles.statusBadge,
              status === "approved" && styles.approvedBadge,
              status === "rejected" && styles.rejectedBadge,
              status === "pending" && styles.pendingBadge,
              status === "inactive" && styles.inactiveBadge,
            ]}
          >
            <Text style={styles.statusText}>
              {status}
            </Text>
          </View>

          {isPending && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[
                  styles.approveButton,
                  isBusy && styles.disabledButton,
                ]}
                activeOpacity={0.7}
                disabled={isBusy}
                onPress={() =>
                  handleStatusAction(item, "approved")
                }
              >
                <Text style={styles.actionButtonText}>
                  {isProcessing ? "Please wait..." : "Approve"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.rejectButton,
                  isBusy && styles.disabledButton,
                ]}
                activeOpacity={0.7}
                disabled={isBusy}
                onPress={() =>
                  handleStatusAction(item, "rejected")
                }
              >
                <Text style={styles.actionButtonText}>
                  {isProcessing ? "Please wait..." : "Reject"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.deleteButton,
              isBusy && styles.disabledButton,
            ]}
            activeOpacity={0.7}
            disabled={isBusy}
            onPress={() => handleDeleteAction(item)}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${item.name || "product"}`}
          >
            <Text style={styles.actionButtonText}>
              {isProcessing ? "Please wait..." : "Delete Product"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.7}
          onPress={handleBackToDashboard}
        >
          <Text style={styles.backButtonText}>
            ← Back to Dashboard
          </Text>
        </TouchableOpacity>

        <Text style={styles.title}>
          Manage Products
        </Text>

        <Text style={styles.subtitle}>
          Review seller submissions and manage product approvals.
        </Text>
      </View>

      <View style={styles.filterContainer}>
        {FILTERS.map((item) => {
          const selected = filter === item.value;

          return (
            <TouchableOpacity
              key={item.label}
              activeOpacity={0.7}
              style={[
                styles.filterButton,
                selected && styles.activeFilter,
              ]}
              onPress={() => changeFilter(item.value)}
            >
              <Text
                style={[
                  styles.filterText,
                  selected && styles.activeFilterText,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {!loading && !error && (
        <Text style={styles.resultCount}>
          {filteredProducts.length} product
          {filteredProducts.length === 1 ? "" : "s"}
          {filter ? ` · ${filter}` : " · all statuses"}
        </Text>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator
            size="large"
            color="#166534"
          />
          <Text style={styles.message}>
            Loading products...
          </Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>
            {error}
          </Text>

          <TouchableOpacity
            style={styles.retryButton}
            activeOpacity={0.7}
            onPress={() => fetchProducts(true)}
          >
            <Text style={styles.actionButtonText}>
              Try Again
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item, index) =>
            String(item.id ?? index)
          }
          renderItem={renderProduct}
          extraData={{ filter, processingId }}
          contentContainerStyle={
            filteredProducts.length === 0
              ? styles.emptyList
              : styles.productList
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchProducts(false);
              }}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>
                No products found
              </Text>

              <Text style={styles.message}>
                {filter
                  ? `There are no ${filter} products.`
                  : "No products have been submitted yet."}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7F5",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    marginBottom: 8,
  },
  backButtonText: {
    color: "#166534",
    fontSize: 15,
    fontWeight: "600",
  },
  title: {
    fontSize: 25,
    fontWeight: "bold",
    color: "#173B28",
  },
  subtitle: {
    fontSize: 14,
    color: "#647067",
    marginTop: 5,
  },
  filterContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterButton: {
    borderWidth: 1,
    borderColor: "#D5DED6",
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 9,
    backgroundColor: "#FFFFFF",
  },
  activeFilter: {
    backgroundColor: "#166534",
    borderColor: "#166534",
  },
  filterText: {
    color: "#35443A",
    fontSize: 13,
    fontWeight: "600",
  },
  activeFilterText: {
    color: "#FFFFFF",
  },
  resultCount: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    fontSize: 12,
    color: "#647067",
  },
  productList: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  productCard: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    marginBottom: 14,
    padding: 12,
    gap: 12,
    elevation: 2,
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  productImage: {
    width: 100,
    height: 120,
    borderRadius: 10,
    backgroundColor: "#E8EDE8",
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    fontSize: 12,
    color: "#68756B",
  },
  productInfo: {
    flex: 1,
    justifyContent: "center",
  },
  productName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1F3325",
    marginBottom: 4,
  },
  price: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#166534",
    marginBottom: 6,
  },
  detail: {
    fontSize: 12,
    color: "#657067",
    marginBottom: 3,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 5,
    backgroundColor: "#E5E7EB",
  },
  pendingBadge: {
    backgroundColor: "#FEF3C7",
  },
  approvedBadge: {
    backgroundColor: "#DCFCE7",
  },
  rejectedBadge: {
    backgroundColor: "#FEE2E2",
  },
  inactiveBadge: {
    backgroundColor: "#E5E7EB",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#374151",
    textTransform: "capitalize",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  approveButton: {
    flex: 1,
    backgroundColor: "#166534",
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: "center",
  },
  rejectButton: {
    flex: 1,
    backgroundColor: "#B91C1C",
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: "center",
  },
  deleteButton: {
    backgroundColor: "#B91C1C",
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: "center",
    marginTop: 10,
  },
  disabledButton: {
    opacity: 0.55,
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  message: {
    marginTop: 10,
    color: "#657067",
    textAlign: "center",
  },
  errorText: {
    color: "#B91C1C",
    textAlign: "center",
    marginBottom: 14,
  },
  retryButton: {
    backgroundColor: "#166534",
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1F3325",
  },
});