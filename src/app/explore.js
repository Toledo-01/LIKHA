
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  router,
  Redirect,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import { fetchProducts } from "../services/api";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";

const FAVORITES_KEY = "likhaLocalFavorites";

const categories = ["All", "Food", "Crafts", "Fashion", "Home"];

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
    name: product.name || "Local Product",
    category: product.category || "Home",
    price: Number(product.price) || 0,
    stock: Number(product.stock) || 0,
    emoji,
    color,
  };
}

export default function ExploreScreen() {
  const { user, isLoading: authLoading } = useAuth();
  const { addToCart } = useCart();
  const { fromStaff } = useLocalSearchParams();

  const isStaffBrowsing = fromStaff === "true";

  const [products, setProducts] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [productData, savedFavorites] = await Promise.all([
        fetchProducts(),
        AsyncStorage.getItem(FAVORITES_KEY),
      ]);

      const parsedFavorites = savedFavorites
        ? JSON.parse(savedFavorites)
        : [];

      setProducts(productData.map(formatProduct));
      setFavoriteIds(
        Array.isArray(parsedFavorites)
          ? parsedFavorites.map(String)
          : []
      );
    } catch (err) {
      console.error("Failed to load Explore data:", err);
      setError(
        "Unable to load products. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  async function toggleFavorite(product) {
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
    } catch (err) {
      console.error("Failed to update favorites:", err);
      Alert.alert("Error", "Could not update Favorites.");
    }
  }

  function handleAddToCart(product) {
    if (product.stock <= 0) {
      Alert.alert("Out of Stock", "This product is currently unavailable.");
      return;
    }

    addToCart(product);

    Alert.alert(
      "Added to Cart",
      `${product.name} has been added to your cart.`
    );
  }

  const query = search.trim().toLowerCase();

  const filteredProducts = products.filter((product) => {
    const matchesCategory =
      selectedCategory === "All" ||
      product.category.toLowerCase() === selectedCategory.toLowerCase();

    const matchesSearch =
      product.name.toLowerCase().includes(query) ||
      product.seller.toLowerCase().includes(query) ||
      product.category.toLowerCase().includes(query);

    return matchesCategory && matchesSearch;
  });

  if (authLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#245B43" />
        <Text style={styles.message}>Loading LikhaLocal...</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.container}
      >
        {isStaffBrowsing ? (
          <TouchableOpacity
            onPress={() => router.replace("/staff")}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back to Staff Dashboard"
          >
            <Text style={styles.backText}>
              ‹ Back to Staff Dashboard
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => router.replace("/")}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back to Home"
          >
            <Text style={styles.backText}>‹ Back to Home</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.eyebrow}>MADE WITH LOCAL LOVE</Text>
        <Text style={styles.title}>Explore Products</Text>
        <Text style={styles.subtitle}>
          Discover unique finds from Filipino local makers.
        </Text>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search products or local sellers"
            placeholderTextColor="#8A9388"
            style={styles.searchInput}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Text style={styles.clearSearch}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.sectionTitle}>Explore Categories</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
        >
          {categories.map((category) => {
            const selected = selectedCategory === category;

            return (
              <TouchableOpacity
                key={category}
                onPress={() => setSelectedCategory(category)}
                style={[
                  styles.categoryButton,
                  selected && styles.categorySelected,
                ]}
              >
                <Text
                  style={[
                    styles.categoryText,
                    selected && styles.categoryTextSelected,
                  ]}
                >
                  {category}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.resultsHeader}>
          <Text style={styles.sectionTitle}>Local Finds</Text>
          {!loading && (
            <Text style={styles.count}>
              {filteredProducts.length} products
            </Text>
          )}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#245B43" />
            <Text style={styles.message}>Finding local products...</Text>
          </View>
        ) : error ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Couldn't load products</Text>
            <Text style={styles.message}>{error}</Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={loadData}
            >
              <Text style={styles.primaryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : filteredProducts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>⌕</Text>
            <Text style={styles.emptyTitle}>No products found</Text>
            <Text style={styles.message}>
              Try another search or choose a different category.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                setSearch("");
                setSelectedCategory("All");
              }}
            >
              <Text style={styles.primaryButtonText}>Show All Products</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.productGrid}>
            {filteredProducts.map((product) => {
              const isFavorite = favoriteIds.includes(product.id);

              return (
                <View key={product.id} style={styles.card}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => router.push(`/product/${product.id}`)}
                  >
                    <View
                      style={[
                        styles.productImage,
                        { backgroundColor: product.color },
                      ]}
                    >
                      <Text style={styles.productEmoji}>
                        {product.emoji}
                      </Text>
                      <Text style={styles.localBadge}>LOCAL</Text>
                    </View>

                    <View style={styles.productInfo}>
                      <Text style={styles.productCategory}>
                        {product.category.toUpperCase()}
                      </Text>
                      <Text style={styles.productName} numberOfLines={1}>
                        {product.name}
                      </Text>
                      <Text style={styles.seller} numberOfLines={1}>
                        {product.seller}
                      </Text>
                      <Text style={styles.price}>
                        ₱{product.price.toLocaleString("en-PH")}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.heartButton}
                    onPress={() => toggleFavorite(product)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isFavorite
                        ? "Remove from Favorites"
                        : "Add to Favorites"
                    }
                  >
                    <Text
                      style={[
                        styles.heart,
                        isFavorite && styles.heartActive,
                      ]}
                    >
                      {isFavorite ? "♥" : "♡"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.addButton,
                      product.stock <= 0 && styles.disabledButton,
                    ]}
                    disabled={product.stock <= 0}
                    onPress={() => handleAddToCart(product)}
                  >
                    <Text style={styles.addButtonText}>
                      {product.stock > 0 ? "Add to Cart" : "Out of Stock"}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerTitle}>
            Every purchase tells a story 💚
          </Text>
          <Text style={styles.message}>
            Shop local and help Filipino small businesses grow.
          </Text>
        </View>
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
    padding: 18,
    paddingBottom: 35,
  },
  backButton: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#245B43",
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  backText: {
    color: "#245B43",
    fontWeight: "700",
    fontSize: 13,
  },
  eyebrow: {
    color: "#78907B",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  title: {
    color: "#214D39",
    fontSize: 29,
    fontWeight: "900",
    marginTop: 5,
  },
  subtitle: {
    color: "#758173",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 20,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EAEAE2",
    borderRadius: 14,
    paddingHorizontal: 13,
    marginBottom: 24,
  },
  searchIcon: {
    fontSize: 24,
    color: "#54745B",
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    color: "#243E2D",
    fontSize: 13,
  },
  clearSearch: {
    color: "#54745B",
    padding: 6,
  },
  sectionTitle: {
    color: "#243E2D",
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 12,
  },
  categoryList: {
    gap: 9,
    paddingBottom: 22,
  },
  categoryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EAEAE2",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  categorySelected: {
    backgroundColor: "#245B43",
    borderColor: "#245B43",
  },
  categoryText: {
    color: "#54745B",
    fontSize: 12,
    fontWeight: "700",
  },
  categoryTextSelected: {
    color: "#FFFFFF",
  },
  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  count: {
    color: "#78907B",
    fontSize: 11,
    marginBottom: 12,
  },
  productGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 15,
  },
  card: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EEEEE7",
    borderRadius: 17,
    overflow: "hidden",
  },
  productImage: {
    height: 125,
    alignItems: "center",
    justifyContent: "center",
  },
  productEmoji: {
    fontSize: 55,
  },
  localBadge: {
    position: "absolute",
    top: 9,
    left: 9,
    backgroundColor: "#FFFFFF",
    color: "#245B43",
    fontSize: 8,
    fontWeight: "900",
    overflow: "hidden",
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  productInfo: {
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  productCategory: {
    fontSize: 8,
    color: "#78907B",
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  productName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#2C4031",
    marginTop: 5,
  },
  seller: {
    fontSize: 10,
    color: "#899389",
    marginTop: 4,
  },
  price: {
    fontSize: 16,
    fontWeight: "900",
    color: "#245B43",
    marginTop: 8,
  },
  heartButton: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  heart: {
    fontSize: 23,
    color: "#D66A4A",
  },
  heartActive: {
    color: "#D94343",
  },
  addButton: {
    backgroundColor: "#245B43",
    marginHorizontal: 9,
    marginTop: 10,
    marginBottom: 10,
    borderRadius: 9,
    paddingVertical: 10,
    alignItems: "center",
  },
  disabledButton: {
    backgroundColor: "#9AA096",
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  center: {
    flex: 1,
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  message: {
    color: "#758173",
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 8,
  },
  emptyState: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EEEEE7",
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
  },
  emptyEmoji: {
    fontSize: 35,
    color: "#54745B",
  },
  emptyTitle: {
    color: "#214D39",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 10,
  },
  primaryButton: {
    backgroundColor: "#245B43",
    borderRadius: 11,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginTop: 16,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  footer: {
    marginTop: 25,
    alignItems: "center",
    paddingVertical: 15,
  },
  footerTitle: {
    color: "#31513B",
    fontWeight: "900",
    fontSize: 13,
  },
});
