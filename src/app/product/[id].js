
import { useEffect, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { fetchProducts } from "../../services/api";
import { useCart } from "../../context/CartContext";
import { useAuth } from "../../context/AuthContext";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Image,
} from "react-native";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://likhalocal-api.onrender.com";

function getProductImageUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") {
    return null;
  }

  const trimmedUrl = imageUrl.trim();

  if (!trimmedUrl) {
    return null;
  }

  if (
    trimmedUrl.startsWith("http://") ||
    trimmedUrl.startsWith("https://")
  ) {
    return trimmedUrl;
  }

  return `${API_BASE_URL}${
    trimmedUrl.startsWith("/") ? "" : "/"
  }${trimmedUrl}`;
}

function formatProduct(product) {
  let emoji = "🏡";
  let color = "#F2E2DE";

  if (product.category === "Food") {
    emoji = "🥭";
    color = "#FFF0CE";
  } else if (product.category === "Crafts") {
    emoji = "🧺";
    color = "#F4E5D3";
  } else if (product.category === "Fashion") {
    emoji = "👜";
    color = "#E7EBD9";
  }

  return {
    ...product,
    id: String(product.id),
    seller: product.seller_name || "Local Seller",
    price: Number(product.price),
    emoji,
    color,
  };
}

export default function ProductDetailsScreen() {
  const { id } = useLocalSearchParams();
  const { addToCart } = useCart();
  const { user, isLoading: authLoading } = useAuth();
  const isStaffBrowsing = authLoading || user?.role === "staff";

  const [product, setProduct] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadProduct() {
      try {
        setIsLoading(true);
        setApiError("");

        const products = await fetchProducts();
        const foundProduct = products.find(
          (item) => String(item.id) === String(id)
        );

        if (isMounted) {
          setProduct(foundProduct ? formatProduct(foundProduct) : null);
          setImageError(false);
        }
      } catch (error) {
        console.error("Failed to load product details:", error);

        if (isMounted) {
          setApiError(
            "Unable to load this product. Please check your connection and try again."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadProduct();

    return () => {
      isMounted = false;
    };
  }, [id]);

  async function retryLoadProduct() {
    try {
      setIsLoading(true);
      setApiError("");

      const products = await fetchProducts();
      const foundProduct = products.find(
        (item) => String(item.id) === String(id)
      );

      setProduct(foundProduct ? formatProduct(foundProduct) : null);
      setImageError(false);
    } catch (error) {
      console.error("Retry failed:", error);
      setApiError("Unable to load this product. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#245B43" />
          <Text style={styles.stateText}>
            Loading product details...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (apiError || !product) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <Text style={styles.title}>
            {apiError ? "Couldn't load product" : "Product not found"}
          </Text>

          {apiError ? (
            <>
              <Text style={styles.description}>{apiError}</Text>

              <TouchableOpacity
                onPress={retryLoadProduct}
                style={styles.cartButton}
              >
                <Text style={styles.cartButtonText}>Try again</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.description}>
              This product may no longer be available.
            </Text>
          )}

          <TouchableOpacity
            onPress={() =>
              router.replace(
                isStaffBrowsing
                  ? { pathname: "/explore", params: { fromStaff: "true" } }
                  : "/"
              )
            }
            style={styles.backLink}
          >
            <Text style={styles.backLinkText}>
              {isStaffBrowsing ? "‹ Back to Explore" : "< Back to shopping"}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  function handleAddToCart() {
    addToCart(product);

    setSuccessMessage(
      `${product.name} has been successfully added to your cart.`
    );

    setShowSuccess(true);
  }

  function handleBuyNow() {
    if (Number(product.stock) <= 0) {
      return;
    }

    router.push({
      pathname: "/checkout",
      params: {
        buyNowProductId: product.id,
      },
    });
  }

  const productImageUrl = getProductImageUrl(product.image_url);
  const isOutOfStock = Number(product.stock) <= 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {!isStaffBrowsing && showSuccess && (
          <View
            style={styles.successNotification}
            accessibilityRole="alert"
          >
            <View style={styles.successIconContainer}>
              <Text style={styles.successIcon}>✓</Text>
            </View>

            <View style={styles.successTextContainer}>
              <Text style={styles.successTitle}>Added to Cart!</Text>

              <Text style={styles.successMessage}>
                {successMessage}
              </Text>

              <TouchableOpacity
                onPress={() => router.push("/cart")}
                style={styles.viewCartButton}
              >
                <Text style={styles.viewCartText}>
                  View Cart →
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => setShowSuccess(false)}
              style={styles.closeButton}
              accessibilityLabel="Dismiss notification"
            >
              <Text style={styles.closeNotification}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          onPress={() =>
            router.replace(
              isStaffBrowsing
                ? { pathname: "/explore", params: { fromStaff: "true" } }
                : "/"
            )
          }
          style={styles.backLink}
        >
          <Text style={styles.backLinkText}>
            {isStaffBrowsing ? "‹ Back to Explore" : "< Back to shopping"}
          </Text>
        </TouchableOpacity>

        <View
          style={[
            styles.productImage,
            { backgroundColor: product.color },
          ]}
        >
          {productImageUrl && !imageError ? (
            <Image
              key={productImageUrl}
              source={{ uri: productImageUrl }}
              style={styles.productPhoto}
              resizeMode="contain"
              onError={(error) => {
                console.warn(
                  "Failed to load product image:",
                  productImageUrl,
                  error.nativeEvent?.error
                );
                setImageError(true);
              }}
              accessibilityLabel={product.name}
            />
          ) : (
            <Text style={styles.productEmoji}>{product.emoji}</Text>
          )}

          <View style={styles.localBadge}>
            <Text style={styles.localBadgeText}>
              LOCAL PRODUCT
            </Text>
          </View>
        </View>

        <Text style={styles.category}>
          {(product.category || "Local").toUpperCase()}
        </Text>

        <Text style={styles.title}>{product.name}</Text>

        <Text style={styles.seller}>
          Sold by {product.seller}
        </Text>

        <Text style={styles.price}>
          {"₱"}
          {product.price.toLocaleString("en-PH")}
        </Text>

        <Text style={styles.shippingFee}>
          Shipping: ₱{Number(product.shipping_fee || 0).toLocaleString(
            "en-PH",
            { minimumFractionDigits: 2, maximumFractionDigits: 2 }
          )}{" "}
          (fixed fee; may be shared across this seller&apos;s items)
        </Text>

        <Text
          style={[
            styles.stock,
            isOutOfStock && styles.outOfStockText,
          ]}
        >
          {isOutOfStock
            ? "Currently out of stock"
            : `${product.stock} available`}
        </Text>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>About this product</Text>

        <Text style={styles.description}>
          {product.description ||
            "No product description is available yet."}
        </Text>

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>
            {isStaffBrowsing ? "Staff monitoring view" : "Support local makers"}
          </Text>

          <Text style={styles.noticeText}>
            {isStaffBrowsing
              ? "Product details are shown for monitoring. Purchase actions are disabled for staff."
              : "Discover products and stories from Filipino makers and small businesses."}
          </Text>
        </View>

        {/* Add to Cart and Buy Now buttons */}
        {!isStaffBrowsing && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[
                styles.cartButton,
                styles.actionButton,
                isOutOfStock && styles.disabledButton,
              ]}
              disabled={isOutOfStock}
              onPress={handleAddToCart}
              accessibilityRole="button"
            >
              <Text style={styles.cartButtonText}>
                {isOutOfStock ? "Out of Stock" : "Add to Cart"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.buyNowButton,
                styles.actionButton,
                isOutOfStock && styles.disabledButton,
              ]}
              disabled={isOutOfStock}
              onPress={handleBuyNow}
              accessibilityRole="button"
            >
              <Text style={styles.cartButtonText}>Buy Now</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.disclaimer}>
          Product information is retrieved from the LikhaLocal database.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FAF9F5",
  },
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 25,
  },
  stateText: {
    color: "#657366",
    fontSize: 14,
    marginTop: 14,
  },
  backLink: {
    alignSelf: "flex-start",
    paddingVertical: 12,
    marginBottom: 12,
  },
  backLinkText: {
    color: "#245B43",
    fontSize: 15,
    fontWeight: "700",
  },
  productImage: {
    height: 270,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    marginBottom: 24,
  },
  productPhoto: {
    width: "100%",
    height: "100%",
  },
  productEmoji: {
    fontSize: 105,
  },
  localBadge: {
    position: "absolute",
    top: 14,
    left: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  localBadgeText: {
    fontSize: 10,
    color: "#245B43",
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  category: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: "#78907B",
    marginBottom: 8,
  },
  title: {
    fontSize: 29,
    lineHeight: 36,
    fontWeight: "900",
    color: "#214D39",
  },
  seller: {
    fontSize: 14,
    color: "#758173",
    marginTop: 8,
  },
  price: {
    fontSize: 27,
    fontWeight: "900",
    color: "#245B43",
    marginTop: 18,
  },
  shippingFee: {
    fontSize: 13,
    lineHeight: 19,
    color: "#657366",
    marginTop: 5,
  },
  stock: {
    fontSize: 12,
    color: "#758173",
    marginTop: 8,
  },
  outOfStockText: {
    color: "#B42318",
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: "#E8E8DF",
    marginVertical: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#243E2D",
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    lineHeight: 23,
    color: "#657366",
    textAlign: "center",
    marginTop: 10,
  },
  notice: {
    backgroundColor: "#E6EBDD",
    borderRadius: 16,
    padding: 16,
    marginTop: 24,
  },
  noticeTitle: {
    color: "#245B43",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 6,
  },
  noticeText: {
    color: "#536A58",
    fontSize: 13,
    lineHeight: 20,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 24,
  },
  actionButton: {
    flex: 1,
    marginTop: 0,
    paddingHorizontal: 8,
  },
  cartButton: {
    backgroundColor: "#245B43",
    borderRadius: 15,
    paddingVertical: 17,
    paddingHorizontal: 20,
    alignItems: "center",
    marginTop: 24,
  },
  buyNowButton: {
    backgroundColor: "#D98B35",
    borderRadius: 15,
    paddingVertical: 17,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  disabledButton: {
    backgroundColor: "#9AA096",
  },
  cartButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  disclaimer: {
    textAlign: "center",
    color: "#9AA096",
    fontSize: 10,
    marginTop: 18,
  },
  successNotification: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#E6F4EA",
    borderColor: "#9AC7A5",
    borderWidth: 1,
    borderRadius: 14,
    padding: 15,
    marginBottom: 18,
    gap: 12,
  },
  successIconContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#245B43",
    alignItems: "center",
    justifyContent: "center",
  },
  successIcon: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  successTextContainer: {
    flex: 1,
  },
  successTitle: {
    color: "#245B43",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 4,
  },
  successMessage: {
    color: "#536A58",
    fontSize: 13,
    lineHeight: 19,
  },
  viewCartButton: {
    alignSelf: "flex-start",
    marginTop: 10,
  },
  viewCartText: {
    color: "#245B43",
    fontSize: 13,
    fontWeight: "800",
  },
  closeButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  closeNotification: {
    color: "#536A58",
    fontSize: 16,
    fontWeight: "700",
  },
});