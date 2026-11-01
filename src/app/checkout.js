
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";

import { useCart } from "../context/CartContext";
import { createCustomerOrder } from "../services/api";
import { getEstimatedDeliveryRange } from "../services/deliveryEstimate";

// Replace these sample values with your actual shop payment details.
// Add your QR images to the assets folder when they are ready.
const SHOP_PAYMENT_DETAILS = {
  GCASH: {
    accountName: "Your Shop Name",
    mobileNumber: "09XX XXX XXXX",
    instructions: "Pay through GCash using the account details below.",
    qrImage: null,
  },
  MAYA: {
    accountName: "Your Shop Name",
    mobileNumber: "09XX XXX XXXX",
    instructions: "Pay through Maya using the account details below.",
    qrImage: null,
  },
};

const PAYMENT_OPTIONS = [
  {
    value: "COD",
    label: "Cash on Delivery",
    description: "Pay when your order arrives.",
  },
  {
    value: "GCASH",
    label: "GCash",
    description: "Pay using your GCash account.",
  },
  {
    value: "MAYA",
    label: "Maya",
    description: "Pay using your Maya account.",
  },
];

export default function CheckoutScreen() {
  const { cartItems, clearCart } = useCart();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");

  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderConfirmation, setOrderConfirmation] = useState(null);

  const checkoutItems = cartItems;

  const subtotal = checkoutItems.reduce((sum, item) => {
    return (
      sum +
      Number(item.price || 0) * Number(item.quantity || 0)
    );
  }, 0);

  const deliveryFeeEstimate = [
    ...checkoutItems
      .reduce((fees, item) => {
        const sellerKey = String(
          item.seller_id ?? item.sellerId ?? `product-${item.id}`
        );
        const fee = Number(item.shipping_fee || 0);

        fees.set(
          sellerKey,
          Math.max(fees.get(sellerKey) || 0, fee)
        );
        return fees;
      }, new Map())
      .values(),
  ].reduce((total, fee) => total + fee, 0);

  const checkoutEstimatedDelivery = getEstimatedDeliveryRange(new Date());
  const selectedPaymentDetails =
    paymentMethod === "COD"
      ? null
      : SHOP_PAYMENT_DETAILS[paymentMethod];

  function formatCurrency(amount) {
    return `₱${Number(amount || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function validateForm() {
    if (!fullName.trim()) {
      return "Please enter your full name.";
    }

    if (!phone.trim()) {
      return "Please enter your contact number.";
    }

    if (!address.trim()) {
      return "Please enter your delivery address.";
    }

    if (!city.trim()) {
      return "Please enter your city or municipality.";
    }

    if (checkoutItems.length === 0) {
      return "Your cart is empty.";
    }

    for (const item of checkoutItems) {
      if (!item.id || Number(item.quantity) < 1) {
        return "One or more items in your order are invalid.";
      }
    }

    return "";
  }

  function handlePlaceOrder() {
    setError("");

    const validationMessage = validateForm();

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    submitOrder();
  }

  async function submitOrder() {
    try {
      setIsSubmitting(true);
      setError("");

      const orderPayload = {
        items: checkoutItems.map((item) => ({
          productId: item.id,
          variantId: item.variantId,
          quantity: Number(item.quantity),
        })),
        deliveryAddress: `${address.trim()}, ${city.trim()}${
          notes.trim()
            ? `\nDelivery notes: ${notes.trim()}`
            : ""
        }`,
        contactNumber: phone.trim(),
        paymentMethod,
      };

      const order = await createCustomerOrder(orderPayload);

      setOrderConfirmation({
        ...order,
        paymentMethod,
        customerName: fullName.trim(),
      });

      clearCart();
    } catch (err) {
      setError(
        err.message || "Failed to place your order. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // Order confirmation screen.
  if (orderConfirmation) {
    const confirmedPaymentMethod =
      orderConfirmation.paymentMethod || paymentMethod;
    const estimatedDelivery = getEstimatedDeliveryRange(
      orderConfirmation.createdAt
    );

    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.confirmationContainer}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace("/")}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Back to Home"
        >
          <Text style={styles.backButtonText}>‹ Back to Home</Text>
        </TouchableOpacity>

        <View style={styles.successIcon}>
          <Text style={styles.successIconText}>✓</Text>
        </View>

        <Text style={styles.confirmationTitle}>
          Order Placed!
        </Text>

        <Text style={styles.confirmationMessage}>
          Thank you for shopping with LikhaLocal.
        </Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Order Details
          </Text>

          <SummaryRow
            label="Order Number"
            value={`#${orderConfirmation.id || "Pending"}`}
          />

          <SummaryRow
            label="Customer"
            value={orderConfirmation.customerName || fullName}
          />

          <SummaryRow
            label="Payment Method"
            value={getPaymentLabel(confirmedPaymentMethod)}
          />

          <SummaryRow
            label="Payment Status"
            value={orderConfirmation.paymentStatus || "Unpaid"}
          />

          {estimatedDelivery ? (
            <SummaryRow
              label="Estimated Delivery"
              value={estimatedDelivery}
            />
          ) : null}

          <SummaryRow
            label="Order Status"
            value={orderConfirmation.status || "Pending"}
          />

          <View style={styles.divider} />

          <SummaryRow
            label="Subtotal"
            value={formatCurrency(
              orderConfirmation.subtotal ?? subtotal
            )}
          />

          <SummaryRow
            label="Delivery Fee"
            value={formatCurrency(orderConfirmation.deliveryFee)}
          />

          <SummaryRow
            label="Order Total"
            value={formatCurrency(
              orderConfirmation.totalAmount ??
                orderConfirmation.total_amount ??
                subtotal
            )}
            bold
          />
        </View>

        {confirmedPaymentMethod !== "COD" && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              Payment Instructions
            </Text>

            <Text style={styles.bodyText}>
              Please keep your {getPaymentLabel(confirmedPaymentMethod)}{" "}
              receipt. The shop must verify your payment before it can
              be marked as paid.
            </Text>

            <Text style={styles.warningText}>
              Your payment has not been automatically verified by
              LikhaLocal.
            </Text>
          </View>
        )}

        {/* Continue Shopping button */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.replace("/")}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>
            Continue Shopping
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.replace("/orders")}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryButtonText}>View My Orders</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Regular checkout screen.
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
        disabled={isSubmitting}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Text style={styles.backButtonText}>‹ Go Back</Text>
      </TouchableOpacity>

      <Text style={styles.pageTitle}>Checkout</Text>

      <Text style={styles.pageSubtitle}>
        Confirm your delivery details and choose a payment method.
      </Text>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          Delivery Information
        </Text>

        <Text style={styles.inputLabel}>Full Name *</Text>

        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Enter your full name"
          autoCapitalize="words"
        />

        <Text style={styles.inputLabel}>
          Contact Number *
        </Text>

        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="09XXXXXXXXX"
          keyboardType="phone-pad"
        />

        <Text style={styles.inputLabel}>
          Street / Barangay / Address *
        </Text>

        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={address}
          onChangeText={setAddress}
          placeholder="House number, street, barangay"
          multiline
        />

        <Text style={styles.inputLabel}>
          City / Municipality *
        </Text>

        <TextInput
          style={styles.input}
          value={city}
          onChangeText={setCity}
          placeholder="Enter your city or municipality"
        />

        <Text style={styles.inputLabel}>
          Delivery Notes (Optional)
        </Text>

        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Landmarks or delivery instructions"
          multiline
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          Payment Method
        </Text>

        {PAYMENT_OPTIONS.map((option) => {
          const selected = paymentMethod === option.value;

          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.paymentOption,
                selected && styles.paymentOptionSelected,
              ]}
              onPress={() => {
                setPaymentMethod(option.value);
                setError("");
              }}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.radioOuter,
                  selected && styles.radioOuterSelected,
                ]}
              >
                {selected ? (
                  <View style={styles.radioInner} />
                ) : null}
              </View>

              <View style={styles.paymentOptionText}>
                <Text style={styles.paymentOptionTitle}>
                  {option.label}
                </Text>

                <Text style={styles.paymentOptionDescription}>
                  {option.description}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {paymentMethod !== "COD" && selectedPaymentDetails ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            {getPaymentLabel(paymentMethod)} Payment Instructions
          </Text>

          <Text style={styles.bodyText}>
            {selectedPaymentDetails.instructions}
          </Text>

          <View style={styles.accountDetails}>
            <Text style={styles.accountLabel}>
              Shop / Seller Account Name
            </Text>

            <Text style={styles.accountValue}>
              {selectedPaymentDetails.accountName}
            </Text>

            <Text style={styles.accountLabel}>
              Shop / Seller Mobile Number
            </Text>

            <Text style={styles.accountValue}>
              {selectedPaymentDetails.mobileNumber}
            </Text>
          </View>

          <Text style={styles.inputLabel}>
            {getPaymentLabel(paymentMethod)} QR Code
          </Text>

          {selectedPaymentDetails.qrImage ? (
            <Image
              source={selectedPaymentDetails.qrImage}
              style={styles.qrImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.qrPlaceholder}>
              <Text style={styles.qrPlaceholderIcon}>▦</Text>

              <Text style={styles.qrPlaceholderTitle}>
                QR Code Placeholder
              </Text>

              <Text style={styles.qrPlaceholderText}>
                Add your real {getPaymentLabel(paymentMethod)} QR image
                to display it here.
              </Text>
            </View>
          )}

          <Text style={styles.warningText}>
            Verify the recipient&apos;s account name and number before sending
            money. Never share your payment PIN or OTP.
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          Order Summary
        </Text>

        {checkoutItems.map((item, index) => (
          <View
            key={`${item.id}-${index}`}
            style={styles.productRow}
          >
            <View style={styles.productInfo}>
              <Text style={styles.productName}>
                {item.name || item.product_name || "Product"}
              </Text>

              {item.variantDetails ? (
                <Text style={styles.productQuantity}>{item.variantDetails}</Text>
              ) : null}

              <Text style={styles.productQuantity}>
                Qty: {Number(item.quantity || 0)}
              </Text>
            </View>

            <Text style={styles.productPrice}>
              {formatCurrency(
                Number(item.price || 0) *
                  Number(item.quantity || 0)
              )}
            </Text>
          </View>
        ))}

        <View style={styles.divider} />

        <SummaryRow
          label="Subtotal"
          value={formatCurrency(subtotal)}
        />

        <SummaryRow
          label="Delivery Fee"
          value={formatCurrency(deliveryFeeEstimate)}
        />

        {checkoutEstimatedDelivery ? (
          <SummaryRow
            label="Estimated Delivery"
            value={checkoutEstimatedDelivery}
          />
        ) : null}

        <Text style={styles.helperText}>
          Estimated shipping uses the highest product fee once per seller.
          Sellers set a fixed fee, so it does not vary by delivery location.
          The server confirms the final fee when you place the order.
        </Text>

        <Text style={styles.helperText}>
          Delivery is estimated 5–7 days after your order is placed.
        </Text>
      </View>

      <TouchableOpacity
        style={[
          styles.primaryButton,
          isSubmitting && styles.disabledButton,
        ]}
        onPress={handlePlaceOrder}
        disabled={isSubmitting || checkoutItems.length === 0}
        activeOpacity={0.8}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>
            {paymentMethod === "COD"
              ? "Place COD Order"
              : `Place ${getPaymentLabel(paymentMethod)} Order`}
          </Text>
        )}
      </TouchableOpacity>

    </ScrollView>
  );
}

function getPaymentLabel(method) {
  switch (method) {
    case "GCASH":
      return "GCash";
    case "MAYA":
      return "Maya";
    case "COD":
    default:
      return "Cash on Delivery";
  }
}

function SummaryRow({ label, value, bold = false }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, bold && styles.boldText]}>
        {label}
      </Text>

      <Text style={[styles.summaryValue, bold && styles.boldText]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F5F7F5",
  },
  container: {
    padding: 18,
    paddingBottom: 36,
  },
  confirmationContainer: {
    padding: 18,
    paddingBottom: 36,
    alignItems: "stretch",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F7F5",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#555555",
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#204E35",
    marginBottom: 6,
  },
  pageSubtitle: {
    fontSize: 14,
    color: "#666666",
    lineHeight: 21,
    marginBottom: 18,
  },
  backButton: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  backButtonText: {
    color: "#246B45",
    fontSize: 15,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E6EAE6",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#204E35",
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#333333",
    marginBottom: 7,
    marginTop: 12,
  },
  input: {
    backgroundColor: "#FAFBFA",
    borderWidth: 1,
    borderColor: "#D9E0DA",
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: "#222222",
  },
  multilineInput: {
    minHeight: 76,
    textAlignVertical: "top",
  },
  paymentOption: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#DDE3DD",
    borderRadius: 10,
    padding: 13,
    marginBottom: 10,
  },
  paymentOptionSelected: {
    borderColor: "#246B45",
    backgroundColor: "#F0F7F1",
  },
  radioOuter: {
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#AAB4AB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  radioOuterSelected: {
    borderColor: "#246B45",
  },
  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: "#246B45",
  },
  paymentOptionText: {
    flex: 1,
  },
  paymentOptionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#222222",
  },
  paymentOptionDescription: {
    fontSize: 12,
    color: "#666666",
    marginTop: 4,
  },
  accountDetails: {
    backgroundColor: "#F3F8F3",
    borderRadius: 10,
    padding: 13,
    marginTop: 14,
  },
  accountLabel: {
    fontSize: 12,
    color: "#667366",
    marginBottom: 4,
  },
  accountValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#204E35",
    marginBottom: 12,
  },
  qrImage: {
    width: "100%",
    height: 230,
    marginTop: 6,
    alignSelf: "center",
  },
  qrPlaceholder: {
    minHeight: 190,
    borderWidth: 1,
    borderColor: "#CBD5CB",
    borderStyle: "dashed",
    borderRadius: 12,
    backgroundColor: "#FAFCFA",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    marginTop: 4,
  },
  qrPlaceholderIcon: {
    fontSize: 55,
    color: "#8A9A8C",
    marginBottom: 8,
  },
  qrPlaceholderTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#355640",
    textAlign: "center",
  },
  qrPlaceholderText: {
    fontSize: 12,
    color: "#777777",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  bodyText: {
    fontSize: 13,
    color: "#555555",
    lineHeight: 20,
  },
  warningText: {
    fontSize: 12,
    color: "#805A16",
    lineHeight: 18,
    marginTop: 13,
  },
  helperText: {
    fontSize: 12,
    color: "#777777",
    lineHeight: 18,
    marginTop: 10,
  },
  productRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 13,
  },
  productInfo: {
    flex: 1,
    paddingRight: 12,
  },
  productName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#292929",
  },
  productQuantity: {
    fontSize: 12,
    color: "#777777",
    marginTop: 4,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: "#204E35",
  },
  divider: {
    height: 1,
    backgroundColor: "#E7EBE7",
    marginVertical: 12,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  summaryLabel: {
    flex: 1,
    paddingRight: 12,
    fontSize: 14,
    color: "#555555",
  },
  summaryValue: {
    flexShrink: 1,
    fontSize: 14,
    color: "#222222",
    textAlign: "right",
  },
  boldText: {
    fontWeight: "800",
    color: "#204E35",
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 10,
    backgroundColor: "#246B45",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: 2,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  disabledButton: {
    opacity: 0.65,
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#246B45",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: 8,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#246B45",
  },
  errorBox: {
    backgroundColor: "#FFF0F0",
    borderWidth: 1,
    borderColor: "#E8B8B8",
    borderRadius: 9,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    color: "#A32626",
    fontSize: 13,
    lineHeight: 19,
  },
  successIcon: {
    alignSelf: "center",
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: "#E0F2E5",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    marginBottom: 14,
  },
  successIconText: {
    color: "#246B45",
    fontSize: 38,
    fontWeight: "800",
  },
  confirmationTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#204E35",
    textAlign: "center",
  },
  confirmationMessage: {
    fontSize: 14,
    color: "#666666",
    textAlign: "center",
    marginTop: 7,
    marginBottom: 22,
  },
});
