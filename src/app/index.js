import { Redirect, router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { fetchProducts } from "../services/api";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import AccountMenu from "../components/AccountMenu";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const FAVORITES_KEY = "likhaLocalFavorites";

function formatProducts(data) {
  return data.map((product) => {
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
  });
}

export default function HomeScreen() {
  const { user, isLoading: authLoading } = useAuth();
  const { cartCount } = useCart();

  const [products, setProducts] = useState([]);
  const [imageErrors, setImageErrors] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);

  const categories = useMemo(() => {
    const categoryNames = [
      ...new Set(
        products
          .map((product) => product.category)
          .filter(Boolean)
      ),
    ];

    return [
      { name: "All", icon: "✨" },
      ...categoryNames.map((name) => ({
        name,
        icon: "🛍️",
      })),
    ];
  }, [products]);

  async function loadProducts() {
    try {
      setIsLoading(true);
      setApiError("");

      const data = await fetchProducts();
      setProducts(formatProducts(data));
    } catch (error) {
      console.error("Failed to load products:", error);
      setApiError(
        "Unable to load products. Please check your connection and try again."
      );
    } finally {
      setIsLoading(false);
    }
  }

  // Load products and saved favorites.
  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        setIsLoading(true);
        setApiError("");

        const [data, savedFavorites] = await Promise.all([
          fetchProducts(),
          AsyncStorage.getItem(FAVORITES_KEY),
        ]);

        if (isMounted) {
          setProducts(formatProducts(data));

          if (savedFavorites) {
            const parsed = JSON.parse(savedFavorites);
            if (Array.isArray(parsed)) {
              setFavoriteIds(parsed.map(String));
            }
          }
        }
      } catch (error) {
        console.error("Failed to load home data:", error);

        if (isMounted) {
          setApiError(
            "Unable to load products. Please check your connection and try again."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setFavoritesLoaded(true);
        }
      }
    }

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Add or remove a product from favorites.
  async function toggleFavorite(product) {
    if (!favoritesLoaded) {
      return;
    }

    const productId = String(product.id);
    const wasFavorite = favoriteIds.includes(productId);

    const updatedFavorites = wasFavorite
      ? favoriteIds.filter((id) => id !== productId)
      : [...favoriteIds, productId];

    try {
      await AsyncStorage.setItem(
        FAVORITES_KEY,
        JSON.stringify(updatedFavorites)
      );

      setFavoriteIds(updatedFavorites);

      Alert.alert(
        wasFavorite ? "Removed from Favorites" : "Added to Favorites",
        wasFavorite
          ? `${product.name} was removed from your favorites.`
          : `${product.name} was saved to your favorites.`
      );
    } catch (error) {
      console.error("Failed to save favorite:", error);
      Alert.alert("Error", "Unable to update favorites. Please try again.");
    }
  }

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === "All" ||
        product.category === selectedCategory;

      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.seller.toLowerCase().includes(query) ||
        (product.category || "").toLowerCase().includes(query);

      return matchesCategory && matchesSearch;
    });
  }, [products, search, selectedCategory]);

  if (authLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.authLoading}>
          <ActivityIndicator size="large" color="#245B43" />
          <Text style={styles.authLoadingText}>Loading LikhaLocal...</Text>
        </View>
      </SafeAreaView>
    );
  }

 if (!user) {
  return <Redirect href="/login" />;
}

if (user.role === "admin") {
  return <Redirect href="/admin" />;
}

if (user.role === "staff") {
  return <Redirect href="/staff" />;
}

if (user.role === "seller") {
  return <Redirect href="/seller" />;
}

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.page}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
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
                <Text style={styles.brandName}>LikhaLocal</Text>
                <Text style={styles.brandTagline}>
                  MADE WITH LOCAL LOVE
                </Text>
              </View>
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.bagButton}
                onPress={() => router.push("/cart")}
                accessibilityLabel="Open cart"
              >
                <Text style={styles.bagIcon}>🛍️</Text>
                {cartCount > 0 && (
                  <View style={styles.cartBadge}>
                    <Text style={styles.cartBadgeText}>{cartCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <AccountMenu />
            </View>
          </View>

          <View style={styles.hero}>
            <Text style={styles.eyebrow}>DISCOVER SOMETHING LOCAL</Text>
            <Text style={styles.heroTitle}>
              Good finds.{"\n"}Local stories.
            </Text>
            <Text style={styles.heroDescription}>
              Discover unique products made by Filipino hands and support
              the people behind them.
            </Text>
            <View style={styles.heroDecoration}>
              <Text style={styles.heroEmoji}>🌿</Text>
              <Text style={styles.heroEmoji}>🧺</Text>
              <Text style={styles.heroEmoji}>🧡</Text>
            </View>
          </View>

          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search products or local sellers"
              placeholderTextColor="#8A9388"
              style={styles.searchInput}
              returnKeyType="search"
              accessibilityLabel="Search products or local sellers"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Text style={styles.clearSearch}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Explore categories</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryList}
          >
            {categories.map((category) => {
              const selected = selectedCategory === category.name;

              return (
                <TouchableOpacity
                  key={category.name}
                  onPress={() => setSelectedCategory(category.name)}
                  style={[
                    styles.categoryItem,
                    selected && styles.categorySelected,
                  ]}
                >
                  <Text style={styles.categoryIcon}>{category.icon}</Text>
                  <Text
                    style={[
                      styles.categoryName,
                      selected && styles.categoryNameSelected,
                    ]}
                  >
                    {category.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.featuredHeading}>
            <View>
              <Text style={styles.sectionTitle}>Featured finds</Text>
              <Text style={styles.sectionSubtitle}>
                Little treasures from local makers
              </Text>
            </View>
            <Text style={styles.productCount}>
              {isLoading ? "Loading..." : `${filteredProducts.length} items`}
            </Text>
          </View>

          {isLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🌿</Text>
              <Text style={styles.emptyTitle}>Loading local products...</Text>
              <Text style={styles.emptyDescription}>
                Please wait while we discover local finds for you.
              </Text>
            </View>
          ) : apiError ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>⚠️</Text>
              <Text style={styles.emptyTitle}>Couldn&apos;t load products</Text>
              <Text style={styles.emptyDescription}>{apiError}</Text>
              <TouchableOpacity
                style={styles.resetButton}
                onPress={loadProducts}
              >
                <Text style={styles.resetButtonText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : filteredProducts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🔎</Text>
              <Text style={styles.emptyTitle}>No products found</Text>
              <Text style={styles.emptyDescription}>
                Try another search or choose a different category.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setSearch("");
                  setSelectedCategory("All");
                }}
                style={styles.resetButton}
              >
                <Text style={styles.resetButtonText}>Show all products</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.productGrid}>
              {filteredProducts.map((product) => {
                const isFavorite = favoriteIds.includes(String(product.id));

                return (
                  <View key={product.id} style={styles.productCard}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => router.push(`/product/${product.id}`)}
                      accessibilityLabel={`View ${product.name}`}
                    >
                      <View
                        style={[
                          styles.productImage,
                          { backgroundColor: product.color },
                        ]}
                      >
                        {product.image_url && !imageErrors[product.id] ? (
                          <Image
                            source={{ uri: product.image_url.trim() }}
                            style={styles.productImagePhoto}
                            resizeMode="cover"
                            onError={(error) => {
                              console.log(
                                `Product image failed to load: ${product.name}`,
                                error.nativeEvent?.error
                              );

                              setImageErrors((previous) => ({
                                ...previous,
                                [product.id]: true,
                              }));
                            }}
                          />
                        ) : (
                          <View style={styles.imageFallback}>
                            <Text style={styles.productEmoji}>
                              {product.emoji}
                            </Text>
                            <Text style={styles.imageFallbackText}>
                              Image unavailable
                            </Text>
                          </View>
                        )}

                        <View style={styles.localBadge}>
                          <Text style={styles.localBadgeText}>LOCAL</Text>
                        </View>
                      </View>

                      <View style={styles.productInfo}>
                        <Text style={styles.productCategory}>
                          {(product.category || "Uncategorized").toUpperCase()}
                        </Text>
                        <Text style={styles.productName} numberOfLines={1}>
                          {product.name}
                        </Text>
                        <Text style={styles.sellerName} numberOfLines={1}>
                          {product.seller}
                        </Text>
                        <Text style={styles.productPrice}>
                          {product.variants?.length ? "From " : ""}
                          ₱{product.price.toLocaleString("en-PH")}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {/* Favorite heart button */}
                    <TouchableOpacity
                      style={styles.favoriteButton}
                      onPress={() => toggleFavorite(product)}
                      disabled={!favoritesLoaded}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={
                        isFavorite
                          ? `Remove ${product.name} from favorites`
                          : `Add ${product.name} to favorites`
                      }
                    >
                      <Text
                        style={[
                          styles.favoriteHeart,
                          isFavorite && styles.favoriteHeartActive,
                        ]}
                      >
                        {isFavorite ? "♥" : "♡"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.localMessage}>
            <Text style={styles.localMessageEmoji}>💚</Text>
            <View style={styles.localMessageCopy}>
              <Text style={styles.localMessageTitle}>
                Every purchase tells a story
              </Text>
              <Text style={styles.localMessageDescription}>
                Shop local. Celebrate Filipino creativity. Help small
                businesses grow.
              </Text>
            </View>
          </View>

          <Text style={styles.disclaimer}>
            Products shown are retrieved from the LikhaLocal database.
          </Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FAF9F5" },
  page: { flex: 1, backgroundColor: "#FAF9F5" },
  authLoading: { flex: 1, alignItems: "center", justifyContent: "center" },
  authLoadingText: { marginTop: 12, fontSize: 14, color: "#54745B" },
  scrollContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 22,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 48, height: 48 },
  imageFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  imageFallbackText: { fontSize: 9, color: "#78907B", marginTop: 4 },
  brandName: {
    fontSize: 21,
    fontWeight: "800",
    color: "#214D39",
    letterSpacing: -0.6,
  },
  brandTagline: {
    color: "#7A887C",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginTop: 2,
  },
  productImagePhoto: { width: "100%", height: "100%" },
  bagButton: {
    width: 43,
    height: 43,
    borderRadius: 15,
    backgroundColor: "#F0F0E8",
    alignItems: "center",
    justifyContent: "center",
  },
  bagIcon: { fontSize: 20 },
  hero: {
    backgroundColor: "#E6EBDD",
    borderRadius: 25,
    padding: 23,
    overflow: "hidden",
    marginBottom: 19,
  },
  eyebrow: {
    color: "#54745B",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  heroTitle: {
    fontSize: 35,
    lineHeight: 39,
    fontWeight: "900",
    color: "#214D39",
    letterSpacing: -1.1,
    marginTop: 12,
  },
  heroDescription: {
    color: "#536A58",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
    maxWidth: 265,
  },
  heroDecoration: {
    flexDirection: "row",
    alignSelf: "flex-end",
    gap: 7,
    marginTop: 8,
  },
  heroEmoji: { fontSize: 24 },
  searchBox: {
    minHeight: 53,
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8DF",
    borderWidth: 1,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    marginBottom: 26,
  },
  searchIcon: { fontSize: 28, color: "#53745A", marginRight: 10 },
  searchInput: { flex: 1, fontSize: 13, color: "#263D2E", paddingVertical: 12 },
  clearSearch: { color: "#53745A", fontSize: 16, padding: 5 },
  sectionHeading: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#243E2D",
    letterSpacing: -0.4,
  },
  categoryList: { gap: 10, paddingBottom: 25 },
  categoryItem: {
    minWidth: 76,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 17,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EAEAE2",
  },
  categorySelected: { backgroundColor: "#245B43", borderColor: "#245B43" },
  categoryIcon: { fontSize: 23, marginBottom: 6 },
  categoryName: { color: "#57675B", fontSize: 11, fontWeight: "700" },
  categoryNameSelected: { color: "#FFFFFF" },
  featuredHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  sectionSubtitle: { fontSize: 11, color: "#829083", marginTop: 5 },
  productCount: { fontSize: 11, fontWeight: "700", color: "#54745B" },
  productGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 15,
  },
  productCard: {
    width: "48%",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#EEEEE7",
    position: "relative",
  },
  productImage: {
    height: 135,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  productEmoji: { fontSize: 63 },
  localBadge: {
    position: "absolute",
    top: 10,
    left: 9,
    backgroundColor: "#FFFFFF",
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  localBadgeText: {
    fontSize: 8,
    color: "#245B43",
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  favoriteButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    elevation: 4,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  favoriteHeart: { fontSize: 25, color: "#7A887C", lineHeight: 30 },
  favoriteHeartActive: { color: "#E63946" },
  productInfo: { padding: 12 },
  productCategory: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#78907B",
    marginBottom: 5,
  },
  productName: { fontSize: 13, fontWeight: "800", color: "#2C4031" },
  sellerName: { fontSize: 10, color: "#899389", marginTop: 4 },
  productPrice: {
    fontSize: 16,
    fontWeight: "900",
    color: "#245B43",
    marginTop: 10,
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 25,
    marginBottom: 20,
  },
  emptyEmoji: { fontSize: 36 },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#243E2D",
    marginTop: 10,
  },
  emptyDescription: {
    fontSize: 12,
    color: "#829083",
    textAlign: "center",
    marginTop: 6,
  },
  resetButton: {
    marginTop: 15,
    backgroundColor: "#245B43",
    paddingHorizontal: 17,
    paddingVertical: 10,
    borderRadius: 12,
  },
  resetButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
  localMessage: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0EFE6",
    borderRadius: 17,
    padding: 16,
    marginTop: 24,
  },
  localMessageEmoji: { fontSize: 27, marginRight: 12 },
  localMessageCopy: { flex: 1 },
  localMessageTitle: { fontSize: 13, fontWeight: "800", color: "#31513B" },
  localMessageDescription: {
    fontSize: 11,
    lineHeight: 17,
    color: "#758173",
    marginTop: 4,
  },
  disclaimer: {
    color: "#9AA096",
    fontSize: 9,
    textAlign: "center",
    marginTop: 18,
  },
  cartBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: "#D66A4A",
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
});