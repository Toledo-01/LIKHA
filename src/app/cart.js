
import { router } from "expo-router";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  Platform,
} from "react-native";
import { useCart } from "../context/CartContext";

export default function CartScreen() {
  const {
    cartItems,
    updateQuantity,
    removeFromCart,
    clearCart,
    cartTotal,
    cartCount,
  } = useCart();

  const formatPrice = (price) =>
    `₱${Number(price || 0).toLocaleString("en-PH")}`;

  function confirmRemove(item) {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        `Remove "${item.name}" from your cart?`
      );
      if (confirmed) removeFromCart(item.cartKey);
      return;
    }

    Alert.alert("Remove item?", `Remove "${item.name}" from your cart?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => removeFromCart(item.cartKey),
      },
    ]);
  }

  function confirmClearCart() {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        "Are you sure you want to clear your cart?"
      );
      if (confirmed) clearCart();
      return;
    }

    Alert.alert(
      "Clear cart?",
      "Are you sure you want to remove all items from your cart?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear cart",
          style: "destructive",
          onPress: clearCart,
        },
      ]
    );
  }

  function handleCheckout() {
    router.push("/checkout");
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity
          onPress={() => router.replace("/")}
          style={styles.backLink}
        >
          <Text style={styles.backLinkText}>
            {"<"} Continue shopping
          </Text>
        </TouchableOpacity>

        <Text style={styles.eyebrow}>YOUR SELECTION</Text>
        <Text style={styles.title}>Shopping Cart</Text>
        <Text style={styles.subtitle}>
          {cartCount} {cartCount === 1 ? "item" : "items"} in your cart
        </Text>

        {cartItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🛒</Text>
            <Text style={styles.emptyTitle}>Your cart is empty</Text>
            <Text style={styles.emptyText}>
              Discover something special from our local makers.
            </Text>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.replace("/")}
            >
              <Text style={styles.primaryButtonText}>
                Explore products
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {cartItems.map((item) => (
              <View key={item.cartKey} style={styles.itemCard}>
                <View
                  style={[
                    styles.productImage,
                    { backgroundColor: item.color || "#E7EBDD" },
                  ]}
                >
                  <Text style={styles.productEmoji}>
                    {item.emoji || "🎁"}
                  </Text>
                </View>

                <View style={styles.itemDetails}>
                  <Text style={styles.category}>
                    {item.category?.toUpperCase() || "LOCAL PRODUCT"}
                  </Text>

                  <Text style={styles.productName}>{item.name}</Text>
                  {item.variantDetails ? (
                    <Text style={styles.seller}>{item.variantDetails}</Text>
                  ) : null}
                  <Text style={styles.seller}>
                    {item.seller || "Local Seller"}
                  </Text>
                  <Text style={styles.price}>
                    {formatPrice(item.price)}
                  </Text>

                  <View style={styles.itemActions}>
                    <View style={styles.quantityControl}>
                      <TouchableOpacity
                        style={styles.quantityButton}
                        disabled={item.quantity <= 1}
                        onPress={() =>
                          updateQuantity(item.cartKey, item.quantity - 1)
                        }
                      >
                        <Text
                          style={[
                            styles.quantityButtonText,
                            item.quantity <= 1 && styles.disabledText,
                          ]}
                        >
                          −
                        </Text>
                      </TouchableOpacity>

                      <Text style={styles.quantity}>
                        {item.quantity}
                      </Text>

                      <TouchableOpacity
                        style={styles.quantityButton}
                        disabled={
                          Number(item.stock) > 0 &&
                          item.quantity >= Number(item.stock)
                        }
                        onPress={() =>
                          updateQuantity(item.cartKey, item.quantity + 1)
                        }
                      >
                        <Text style={styles.quantityButtonText}>+</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity onPress={() => confirmRemove(item)}>
                      <Text style={styles.removeText}>Remove</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.subtotal}>
                    Subtotal:{" "}
                    {formatPrice(Number(item.price) * item.quantity)}
                  </Text>
                </View>
              </View>
            ))}

            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  Items ({cartCount})
                </Text>
                <Text style={styles.summaryValue}>
                  {formatPrice(cartTotal)}
                </Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.summaryRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>
                  {formatPrice(cartTotal)}
                </Text>
              </View>

              <Text style={styles.note}>
                Delivery fees, if applicable, are not included.
              </Text>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleCheckout}
              >
                <Text style={styles.primaryButtonText}>
                  Proceed to Checkout
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.clearButton}
                onPress={confirmClearCart}
              >
                <Text style={styles.clearButtonText}>Clear cart</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <Text style={styles.footer}>
          Every purchase helps support local makers.
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
  backLink: {
    alignSelf: "flex-start",
    paddingVertical: 12,
    marginBottom: 18,
  },
  backLinkText: {
    color: "#245B43",
    fontSize: 14,
    fontWeight: "700",
  },
  eyebrow: {
    color: "#78907B",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  title: {
    color: "#214D39",
    fontSize: 30,
    fontWeight: "900",
    marginTop: 8,
  },
  subtitle: {
    color: "#758173",
    fontSize: 14,
    marginTop: 8,
    marginBottom: 24,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EEEEE7",
    marginTop: 10,
  },
  emptyEmoji: {
    fontSize: 54,
    marginBottom: 16,
  },
  emptyTitle: {
    color: "#214D39",
    fontSize: 20,
    fontWeight: "800",
  },
  emptyText: {
    color: "#758173",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    marginTop: 10,
  },
  itemCard: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#EEEEE7",
    gap: 14,
  },
  productImage: {
    width: 94,
    minHeight: 110,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  productEmoji: {
    fontSize: 38,
  },
  itemDetails: {
    flex: 1,
    paddingVertical: 3,
  },
  category: {
    color: "#78907B",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  productName: {
    color: "#214D39",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 5,
  },
  seller: {
    color: "#758173",
    fontSize: 12,
    marginTop: 4,
  },
  price: {
    color: "#245B43",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 8,
  },
  itemActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  quantityControl: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#DCE4D8",
    borderRadius: 9,
  },
  quantityButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityButtonText: {
    color: "#245B43",
    fontSize: 18,
    fontWeight: "700",
  },
  disabledText: {
    color: "#B5BDB3",
  },
  quantity: {
    color: "#214D39",
    minWidth: 25,
    textAlign: "center",
    fontWeight: "800",
  },
  removeText: {
    color: "#A14F43",
    fontSize: 12,
    fontWeight: "700",
  },
  subtotal: {
    color: "#657366",
    fontSize: 12,
    marginTop: 10,
  },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#EEEEE7",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    color: "#657366",
    fontSize: 14,
  },
  summaryValue: {
    color: "#214D39",
    fontSize: 14,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: "#E8E8DF",
    marginVertical: 16,
  },
  totalLabel: {
    color: "#214D39",
    fontSize: 17,
    fontWeight: "800",
  },
  totalValue: {
    color: "#245B43",
    fontSize: 23,
    fontWeight: "900",
  },
  note: {
    color: "#899287",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 12,
  },
  primaryButton: {
    backgroundColor: "#245B43",
    borderRadius: 13,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 20,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  clearButton: {
    alignItems: "center",
    paddingVertical: 13,
  },
  clearButtonText: {
    color: "#A14F43",
    fontSize: 13,
    fontWeight: "700",
  },
  footer: {
    textAlign: "center",
    color: "#899287",
    fontSize: 11,
    marginTop: 24,
  },
});
