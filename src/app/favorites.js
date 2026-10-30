import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect } from "expo-router";
import { fetchProducts } from "../services/api";

const FAVORITES_KEY = "likhaLocalFavorites";

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

export default function FavoritesScreen() {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadFavorites = useCallback(async () => {
    setLoading(true);

    try {
      const [savedIds, products] = await Promise.all([
        AsyncStorage.getItem(FAVORITES_KEY),
        fetchProducts(),
      ]);

      const ids = savedIds ? JSON.parse(savedIds) : [];
      const favoriteIds = Array.isArray(ids) ? ids.map(String) : [];

      const formattedProducts = products.map(formatProduct);

      setFavorites(
        formattedProducts.filter((product) =>
          favoriteIds.includes(product.id)
        )
      );
    } catch (error) {
      console.error("Failed to load favorites:", error);
      Alert.alert(
        "Unable to load Favorites",
        "Please check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload whenever the user opens or returns to this screen.
  useFocusEffect(
    useCallback(() => {
      loadFavorites();
    }, [loadFavorites])
  );

  async function removeFavorite(productId) {
    try {
      const savedIds = await AsyncStorage.getItem(FAVORITES_KEY);
      const ids = savedIds ? JSON.parse(savedIds) : [];

      const updatedIds = ids
        .map(String)
        .filter((id) => id !== String(productId));

      await AsyncStorage.setItem(
        FAVORITES_KEY,
        JSON.stringify(updatedIds)
      );

      setFavorites((current) =>
        current.filter((product) => product.id !== String(productId))
      );
    } catch (error) {
      console.error("Failed to remove favorite:", error);
      Alert.alert("Error", "Could not remove this favorite.");
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.title}>My Favorites ♥</Text>
          <Text style={styles.subtitle}>
            Your favorite finds from local makers
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#245B43" />
          <Text style={styles.message}>Loading your favorites...</Text>
        </View>
      ) : favorites.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyHeart}>♡</Text>
          <Text style={styles.emptyTitle}>No favorites yet</Text>
          <Text style={styles.message}>
            Tap the heart on any product to save it here.
          </Text>

          <TouchableOpacity
            style={styles.shopButton}
            onPress={() => router.replace("/")}
          >
            <Text style={styles.shopButtonText}>Explore Products</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        >
          <Text style={styles.count}>
            {favorites.length} saved{" "}
            {favorites.length === 1 ? "product" : "products"}
          </Text>

          <View style={styles.grid}>
            {favorites.map((product) => (
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

                    <View style={styles.localBadge}>
                      <Text style={styles.localBadgeText}>LOCAL</Text>
                    </View>
                  </View>

                  <View style={styles.productInfo}>
                    <Text style={styles.category}>
                      {product.category?.toUpperCase()}
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
                  onPress={() => removeFavorite(product.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${product.name} from favorites`}
                >
                  <Text style={styles.heart}>♥</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FAF9F5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EAEAE2",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#E6EBDD",
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    color: "#245B43",
    fontSize: 34,
    lineHeight: 38,
  },
  headerTitleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#214D39",
  },
  subtitle: {
    fontSize: 11,
    color: "#829083",
    marginTop: 4,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyHeart: {
    fontSize: 70,
    color: "#D66A4A",
  },
  emptyTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: "#243E2D",
    marginTop: 12,
  },
  message: {
    fontSize: 13,
    color: "#829083",
    textAlign: "center",
    marginTop: 10,
    lineHeight: 20,
  },
  shopButton: {
    marginTop: 22,
    paddingVertical: 13,
    paddingHorizontal: 22,
    backgroundColor: "#245B43",
    borderRadius: 13,
  },
  shopButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  list: {
    padding: 16,
    paddingBottom: 30,
  },
  count: {
    fontSize: 13,
    fontWeight: "700",
    color: "#54745B",
    marginBottom: 14,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 15,
  },
  card: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#EEEEE7",
    position: "relative",
  },
  productImage: {
    height: 135,
    alignItems: "center",
    justifyContent: "center",
  },
  productEmoji: {
    fontSize: 63,
  },
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
  },
  productInfo: {
    padding: 12,
  },
  category: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#78907B",
    marginBottom: 5,
  },
  productName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#2C4031",
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
    marginTop: 10,
  },
  heartButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  heart: {
    fontSize: 24,
    color: "#E63946",
  },
});
