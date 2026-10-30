
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
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { getToken } from "../services/auth";

const API_BASE_URL = "http://192.168.100.93:3000";

function formatPrice(value) {
  const price = Number(value);

  if (!Number.isFinite(price)) return "Unavailable";

  return `₱${price.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return "Unavailable";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

export default function StaffProductDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const productId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadProduct = useCallback(async () => {
    setErrorMessage("");
    setProduct(null);

    if (!productId || !/^\d+$/.test(String(productId))) {
      setErrorMessage("The product ID is missing or invalid.");
      return;
    }

    try {
      const token = await getToken();

      if (!token) {
        setErrorMessage("Please log in to inspect this product.");
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/staff/products/${encodeURIComponent(productId)}`,
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
        if (response.status === 401) {
          setErrorMessage("Your session has expired. Please log in again.");
        } else if (response.status === 403) {
          setErrorMessage("Access denied. A staff account is required.");
        } else {
          setErrorMessage(data.message || "Unable to load product details.");
        }
        return;
      }

      if (!data.product) {
        setErrorMessage("The server did not return product details.");
        return;
      }

      setProduct(data.product);
    } catch (error) {
      setErrorMessage(
        "Cannot connect to the server. Check that your backend is running."
      );
    }
  }, [productId]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      await loadProduct();

      if (active) setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, [loadProduct]);

  const refreshProduct = async () => {
    setRefreshing(true);
    await loadProduct();
    setRefreshing(false);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Product Details",
          headerShown: true,
        }}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshProduct}
          />
        }
      >
        <Text style={styles.heading}>Product Inspection</Text>
        <Text style={styles.subtitle}>
          View product information submitted by the seller.
        </Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#166534" />
            <Text style={styles.helper}>Loading product details...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.card}>
            <Text style={styles.error}>{errorMessage}</Text>

            <Pressable style={styles.button} onPress={refreshProduct}>
              <Text style={styles.buttonText}>Try Again</Text>
            </Pressable>

            {errorMessage.toLowerCase().includes("log in") ||
            errorMessage.toLowerCase().includes("session has expired") ? (
              <Pressable
                style={styles.outlineButton}
                onPress={() => router.replace("/login")}
              >
                <Text style={styles.outlineButtonText}>Go to Login</Text>
              </Pressable>
            ) : null}
          </View>
        ) : product ? (
          <View style={styles.card}>
            {product.image_url ? (
              <Image
                source={{ uri: product.image_url }}
                style={styles.image}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.noImage}>
                <Text style={styles.helper}>No product image available</Text>
              </View>
            )}

            <Text style={styles.name}>
              {product.name || "Unnamed product"}
            </Text>

            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>
                Status: {product.status || "Unknown"}
              </Text>
            </View>

            <Text style={styles.price}>{formatPrice(product.price)}</Text>

            <View style={styles.divider} />

            <Text style={styles.label}>Product ID</Text>
            <Text style={styles.value}>{product.id}</Text>

            <Text style={styles.label}>Category</Text>
            <Text style={styles.value}>
              {product.category || "Uncategorized"}
            </Text>

            <Text style={styles.label}>Description</Text>
            <Text style={styles.value}>
              {product.description || "No description provided."}
            </Text>

            <Text style={styles.label}>Stock</Text>
            <Text style={styles.value}>
              {product.stock ?? "Not specified"}
            </Text>

            <Text style={styles.label}>Seller</Text>
            <Text style={styles.value}>
              {product.seller_name || "Unknown seller"}
            </Text>

            <Text style={styles.label}>Seller email</Text>
            <Text style={styles.value}>
              {product.seller_email || "Unavailable"}
            </Text>

            <Text style={styles.label}>Seller ID</Text>
            <Text style={styles.value}>
              {product.seller_id ?? "Unavailable"}
            </Text>

            <Text style={styles.label}>Submitted on</Text>
            <Text style={styles.value}>{formatDate(product.created_at)}</Text>

            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                Staff can inspect product information only. Approval and
                rejection are available to authorized administrators.
              </Text>
            </View>
          </View>
        ) : null}

        <Pressable
          style={styles.backButton}
          onPress={() => router.replace("/staff-products")}
        >
          <Text style={styles.backButtonText}>Back to Product Review</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7f5",
  },
  content: {
    padding: 18,
    paddingBottom: 36,
  },
  heading: {
    fontSize: 25,
    fontWeight: "800",
    color: "#14532d",
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 18,
    color: "#6b7280",
    lineHeight: 21,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  center: {
    alignItems: "center",
    padding: 30,
  },
  helper: {
    color: "#6b7280",
    marginTop: 8,
  },
  image: {
    width: "100%",
    height: 230,
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    marginBottom: 16,
  },
  noImage: {
    height: 120,
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  name: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  statusBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#dcfce7",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
  },
  statusText: {
    color: "#166534",
    fontWeight: "700",
    textTransform: "capitalize",
  },
  price: {
    fontSize: 23,
    fontWeight: "800",
    color: "#166534",
    marginTop: 12,
  },
  divider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 16,
  },
  label: {
    marginTop: 13,
    marginBottom: 4,
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  value: {
    color: "#1f2937",
    fontSize: 15,
    lineHeight: 22,
  },
  notice: {
    marginTop: 20,
    padding: 12,
    borderRadius: 9,
    backgroundColor: "#fef3c7",
  },
  noticeText: {
    color: "#92400e",
    fontSize: 13,
    lineHeight: 20,
  },
  error: {
    color: "#b91c1c",
    textAlign: "center",
    lineHeight: 21,
  },
  button: {
    backgroundColor: "#166534",
    padding: 12,
    borderRadius: 9,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  outlineButton: {
    marginTop: 10,
    padding: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#166534",
    alignItems: "center",
  },
  outlineButtonText: {
    color: "#166534",
    fontWeight: "700",
  },
  backButton: {
    marginTop: 18,
    padding: 14,
    alignItems: "center",
  },
  backButtonText: {
    color: "#166534",
    fontWeight: "700",
  },
});
