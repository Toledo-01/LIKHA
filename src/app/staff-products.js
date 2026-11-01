
import { useCallback, useMemo, useState } from "react";
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
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { getToken } from "../services/auth";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://likhalocal-api.onrender.com";

function statusColor(status) {
  switch (String(status || "").toLowerCase()) {
    case "approved":
      return "#166534";
    case "rejected":
      return "#b91c1c";
    case "inactive":
      return "#57534e";
    case "pending":
      return "#92400e";
    default:
      return "#374151";
  }
}

function formatPrice(price) {
  const amount = Number(price);

  if (!Number.isFinite(amount)) {
    return "Price unavailable";
  }

  return `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getSellerKey(product) {
  if (product.seller_id != null) {
    return `seller-${product.seller_id}`;
  }

  return `name-${product.seller_name || "unknown"}`;
}

export default function StaffProductsScreen() {
  const router = useRouter();

  const [products, setProducts] = useState([]);
  const [selectedSellerKey, setSelectedSellerKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadProducts = useCallback(async () => {
    setErrorMessage("");

    try {
      const token = await getToken();

      if (!token) {
        setProducts([]);
        setErrorMessage("Please log in to view products.");
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/staff/products?status=pending`,
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
        setProducts([]);

        if (response.status === 401) {
          setErrorMessage(
            "Your session is invalid or expired. Please log in again."
          );
        } else if (response.status === 403) {
          setErrorMessage("Access denied. A staff account is required.");
        } else {
          setErrorMessage(data.message || "Unable to load products.");
        }

        return;
      }

      setProducts(Array.isArray(data.products) ? data.products : []);
    } catch (_error) {
      setProducts([]);
      setErrorMessage(
        "Cannot connect to the server. Check that your backend is running and your API address is correct."
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      async function refreshOnFocus() {
        setLoading(true);
        await loadProducts();
        setLoading(false);
      }

      refreshOnFocus();
    }, [loadProducts])
  );

  const sellers = useMemo(() => {
    const grouped = new Map();

    products.forEach((product) => {
      const key = getSellerKey(product);

      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          id: product.seller_id,
          name: product.seller_name || "Unknown seller",
          products: [],
        });
      }

      grouped.get(key).products.push(product);
    });

    return Array.from(grouped.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [products]);

  const selectedSeller = sellers.find(
    (seller) => seller.key === selectedSellerKey
  );

  const refreshProducts = async () => {
    setRefreshing(true);
    await loadProducts();
    setRefreshing(false);
  };

  const openProductDetails = (product) => {
    router.push({
      pathname: "/staff-product-details",
      params: { id: String(product.id) },
    });
  };

  return (
    <>
        <Stack.Screen
          options={{
            title: selectedSeller ? selectedSeller.name : "Product Review",
            headerShown: true,
            headerBackVisible: true,
          }}
        />

          <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refreshProducts}
                colors={["#166534"]}
          />
        }
      >
        {selectedSeller ? (
          <>
           <Pressable
              style={styles.backToSellers}
              onPress={() => setSelectedSellerKey(null)}
            >
              <Text style={styles.backToSellersText}>
                ← Back to sellers
              </Text>
            </Pressable>

            <View style={styles.pageHeader}>
              <Text style={styles.heading}>{selectedSeller.name}</Text>
              <Text style={styles.subtitle}>
                Select a product to inspect its details.
              </Text>
              <Text style={styles.countText}>
                {selectedSeller.products.length} pending{" "}
                {selectedSeller.products.length === 1 ? "product" : "products"}
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.pageHeader}>
            <Text style={styles.heading}>Product Review</Text>
            <Text style={styles.subtitle}>
              Select a seller to review their submitted products.
            </Text>
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                Staff can inspect products. Approval and rejection are
                restricted to administrators.
              </Text>
            </View>
          </View>
        )}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#166534" />
            <Text style={styles.helperText}>Loading pending products...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.messageCard}>
            <Text style={styles.errorTitle}>Unable to load products</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>

            <Pressable
              style={styles.primaryButton}
              onPress={refreshProducts}
            >
              <Text style={styles.primaryButtonText}>Try Again</Text>
            </Pressable>

            {(errorMessage.toLowerCase().includes("log in") ||
              errorMessage.toLowerCase().includes("session")) && (
              <Pressable
                style={styles.secondaryButton}
                onPress={() => router.replace("/login")}
              >
                <Text style={styles.secondaryButtonText}>Go to Login</Text>
              </Pressable>
            )}
          </View>
        ) : selectedSeller ? (
          selectedSeller.products.length === 0 ? (
            <View style={styles.messageCard}>
              <Text style={styles.emptyTitle}>No pending products</Text>
              <Text style={styles.helperText}>
                This seller currently has no products awaiting review.
              </Text>
            </View>
          ) : (
            <View style={styles.productGrid}>
              {selectedSeller.products.map((product) => (
                <Pressable
                  key={String(product.id)}
                  style={({ pressed }) => [
                    styles.productTile,
                    pressed && styles.tilePressed,
                  ]}
                  onPress={() => openProductDetails(product)}
                >
                  {product.image_url ? (
                    <Image
                      source={{ uri: product.image_url }}
                      style={styles.productImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Text style={styles.placeholderIcon}>▧</Text>
                      <Text style={styles.placeholderText}>No image</Text>
                    </View>
                  )}

                  <Text style={styles.productName} numberOfLines={2}>
                    {product.name || "Unnamed product"}
                  </Text>

                  <Text style={styles.productCategory} numberOfLines={1}>
                    {(product.category || "Uncategorized").toUpperCase()}
                  </Text>

                  <Text style={styles.productPrice}>
                    {product.variants?.length ? "From " : ""}
                    {formatPrice(product.price)}
                  </Text>
                  {product.variants?.length ? (
                    <Text style={styles.tapHint}>
                      {product.variants.length} size/color options
                    </Text>
                  ) : null}

                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: statusColor(product.status) },
                    ]}
                  >
                    <Text style={styles.statusText}>Pending</Text>
                  </View>

                  <Text style={styles.tapHint}>View details ›</Text>
                </Pressable>
              ))}
            </View>
          )
        ) : sellers.length === 0 ? (
          <View style={styles.messageCard}>
            <View style={styles.emptyCircle}>
              <Text style={styles.emptyIcon}>✓</Text>
            </View>
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.helperText}>
              There are currently no products awaiting review.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.resultsHeader}>
              <Text style={styles.sectionTitle}>Sellers</Text>
              <Text style={styles.resultCount}>
                {sellers.length} {sellers.length === 1 ? "seller" : "sellers"}
              </Text>
            </View>

            <View style={styles.sellerList}>
              {sellers.map((seller) => (
                <Pressable
                  key={seller.key}
                  style={({ pressed }) => [
                    styles.sellerCard,
                    pressed && styles.sellerCardPressed,
                  ]}
                  onPress={() => setSelectedSellerKey(seller.key)}
                >
                  <View style={styles.sellerAvatar}>
                    <Text style={styles.sellerAvatarText}>
                      {seller.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.sellerInfo}>
                    <Text style={styles.sellerName} numberOfLines={1}>
                      {seller.name}
                    </Text>
                    <Text style={styles.sellerSubtext}>
                      {seller.products.length} pending{" "}
                      {seller.products.length === 1 ? "product" : "products"}
                    </Text>
                  </View>

                  <View style={styles.sellerCount}>
                    <Text style={styles.sellerCountText}>
                      {seller.products.length}
                    </Text>
                  </View>

                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Pull down to refresh the list.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7F5",
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },

  productCategory: {
  fontSize: 10,
  color: "#647067",
  marginTop: 3,
  marginBottom: 3,
},

  pageHeader: {
    marginBottom: 20,
  },
  heading: {
    fontSize: 24,
    fontWeight: "800",
    color: "#17251B",
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: "#647067",
  },
  notice: {
    marginTop: 14,
    padding: 11,
    borderRadius: 10,
    backgroundColor: "#E8F2E9",
    borderWidth: 1,
    borderColor: "#D4E5D5",
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#315B3A",
  },
  backToSellers: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingRight: 12,
    marginBottom: 12,
  },
  backToSellersText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#166534",
  },
  countText: {
    marginTop: 10,
    color: "#166534",
    fontSize: 13,
    fontWeight: "700",
  },
  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#17251B",
  },
  resultCount: {
    fontSize: 12,
    color: "#647067",
  },
  sellerList: {
    gap: 10,
  },
  sellerCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8E2",
  },
  sellerCardPressed: {
    opacity: 0.75,
  },
  sellerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#E3F0E5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  sellerAvatarText: {
    fontSize: 19,
    fontWeight: "800",
    color: "#166534",
  },
  sellerInfo: {
    flex: 1,
    marginRight: 8,
  },
  sellerName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1F2933",
  },
  sellerSubtext: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B756D",
  },
  sellerCount: {
    minWidth: 29,
    height: 29,
    borderRadius: 15,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  sellerCountText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#92400E",
  },
  chevron: {
    fontSize: 25,
    color: "#8A958B",
    marginLeft: 8,
  },
  productGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 10,
  },
  productTile: {
    width: "31.5%",
    padding: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E1E7E1",
    backgroundColor: "#FFFFFF",
    marginBottom: 2,
  },
  tilePressed: {
    opacity: 0.72,
  },
  productImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: "#EDF0ED",
    marginBottom: 7,
  },
  imagePlaceholder: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: "#EDF0ED",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
  },
  placeholderIcon: {
    fontSize: 25,
    color: "#89938A",
  },
  placeholderText: {
    fontSize: 10,
    color: "#89938A",
    marginTop: 3,
  },
  productName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#26342A",
    minHeight: 32,
  },
  productPrice: {
    fontSize: 11,
    fontWeight: "700",
    color: "#166534",
    marginTop: 4,
    marginBottom: 6,
  },
  statusBadge: {
    alignSelf: "flex-start",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  tapHint: {
    fontSize: 10,
    color: "#166534",
    fontWeight: "600",
    marginTop: 7,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 50,
  },
  helperText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: "#6B756D",
    textAlign: "center",
  },
  messageCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8E2",
    padding: 22,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#991B1B",
    textAlign: "center",
  },
  errorText: {
    marginTop: 8,
    color: "#7F1D1D",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  emptyCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  emptyIcon: {
    fontSize: 23,
    fontWeight: "800",
    color: "#166534",
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#26342A",
    textAlign: "center",
  },
  primaryButton: {
    marginTop: 16,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 9,
    backgroundColor: "#166534",
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondaryButton: {
    marginTop: 10,
    padding: 10,
  },
  secondaryButtonText: {
    color: "#166534",
    fontSize: 14,
    fontWeight: "700",
  },
  footer: {
    alignItems: "center",
    marginTop: 22,
  },
  footerText: {
    color: "#89938A",
    fontSize: 11,
  },
});
