import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Redirect, router, useFocusEffect } from "expo-router";
import { useAuth } from "../context/AuthContext";
import {
  confirmOrderDelivery,
  fetchCustomerOrders,
  fetchOrderConversations,
  submitProductReview,
  submitReturnRequest,
} from "../services/api";

const ORDER_FILTERS = [
  "All",
  "To Pay",
  "To Ship",
  "To Receive",
  "To Review",
  "Returns",
  "Messages",
];

const RETURN_REASONS = [
  "Damaged item",
  "Wrong item",
  "Missing parts",
  "Not as described",
  "Other",
];
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://likhalocal-api.onrender.com";

function getImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const imageUrl = value.trim();
  return /^https?:\/\//i.test(imageUrl)
    ? imageUrl
    : `${API_BASE_URL}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
}

function formatCurrency(value) {
  return `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function isDelivered(order) {
  return order.sellers.length > 0 &&
    order.sellers.every(
      (seller) => seller.status === "delivered" || seller.status === "rejected"
    ) &&
    order.sellers.some((seller) => seller.status === "delivered");
}

function isToPay(order) {
  return order.paymentMethod !== "COD" &&
    order.paymentStatus !== "paid" &&
    order.orderStatus !== "cancelled";
}

function hasShippedPackage(order) {
  return order.sellers.some((seller) => seller.status === "shipped");
}

function hasReviewableItem(order) {
  return isDelivered(order) &&
    order.items.some(
      (item) =>
        item.sellerStatus === "delivered" && !item.review
    );
}

function hasReturnActivity(order) {
  return order.items.some((item) => item.returnRequest) ||
    (isDelivered(order) &&
      order.items.some(
        (item) =>
          item.sellerStatus === "delivered" && !item.returnRequest
      ));
}

function matchesFilter(order, filter) {
  switch (filter) {
    case "To Pay":
      return isToPay(order);
    case "To Ship":
      return !isToPay(order) &&
        order.orderStatus !== "cancelled" &&
        !isDelivered(order) &&
        !hasShippedPackage(order);
    case "To Receive":
      return hasShippedPackage(order);
    case "To Review":
      return hasReviewableItem(order);
    case "Returns":
      return hasReturnActivity(order);
    default:
      return true;
  }
}

function StatusPill({ value }) {
  const label = String(value || "pending")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return (
    <View style={styles.statusPill}>
      <Text style={styles.statusPillText}>{label}</Text>
    </View>
  );
}

export default function CustomerOrdersScreen() {
  const { user, isLoading: authLoading } = useAuth();
  const [orders, setOrders] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionItem, setActionItem] = useState(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [returnReason, setReturnReason] = useState(RETURN_REASONS[0]);
  const [returnDetails, setReturnDetails] = useState("");
  const [savingAction, setSavingAction] = useState(false);
  const [actionError, setActionError] = useState("");

  const loadOrders = useCallback(async () => {
    setError("");
    try {
      const [orderData, conversationData] = await Promise.all([
        fetchCustomerOrders(),
        fetchOrderConversations(),
      ]);
      setOrders(orderData);
      setConversations(conversationData);
    } catch (loadError) {
      setError(loadError.message || "Unable to load your orders.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function load() {
        setLoading(true);
        await loadOrders();
        if (active) setLoading(false);
      }
      load();
      return () => {
        active = false;
      };
    }, [loadOrders])
  );

  const visibleOrders = useMemo(() => {
    if (selectedFilter === "Messages") return [];
    return orders.filter((order) => matchesFilter(order, selectedFilter));
  }, [orders, selectedFilter]);

  async function refreshOrders() {
    setRefreshing(true);
    try {
      await loadOrders();
    } finally {
      setRefreshing(false);
    }
  }

  function openConversation(conversation) {
    router.push({
      pathname: "/order-chat",
      params: {
        orderId: String(conversation.orderId),
        sellerId: String(conversation.sellerId),
        otherName: conversation.otherName || "Seller",
      },
    });
  }

  function openItemAction(kind, order, item) {
    setActionItem({ kind, order, item });
    setRating(5);
    setComment("");
    setReturnReason(RETURN_REASONS[0]);
    setReturnDetails("");
    setActionError("");
  }

  async function submitItemAction() {
    if (!actionItem) return;
    setSavingAction(true);
    setActionError("");
    try {
      if (actionItem.kind === "review") {
        await submitProductReview(
          actionItem.item.id,
          rating,
          comment.trim()
        );
      } else {
        await submitReturnRequest(
          actionItem.item.id,
          returnReason,
          returnDetails.trim()
        );
      }
      setActionItem(null);
      await loadOrders();
    } catch (submitError) {
      setActionError(
        submitError.message || "Unable to submit your request."
      );
    } finally {
      setSavingAction(false);
    }
  }

  async function handleConfirmDelivery(order, seller) {
    try {
      await confirmOrderDelivery(order.id, seller.sellerId);
      await loadOrders();
    } catch (deliveryError) {
      setError(deliveryError.message || "Unable to confirm delivery.");
    }
  }

  if (authLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#245B43" />
      </SafeAreaView>
    );
  }

  if (!user || user.role !== "customer") {
    return <Redirect href="/login" />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshOrders} />
        }
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace("/")}
          accessibilityRole="button"
          accessibilityLabel="Back to Home"
        >
          <Text style={styles.backButtonText}>‹ Back to Home</Text>
        </TouchableOpacity>

        <Text style={styles.eyebrow}>YOUR SHOPPING</Text>
        <Text style={styles.title}>My Orders</Text>
        <Text style={styles.subtitle}>
          Follow orders, talk with sellers, and manage your purchases.
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
        >
          {ORDER_FILTERS.map((filter) => {
            const active = selectedFilter === filter;
            const messageCount = conversations.reduce(
              (sum, conversation) => sum + conversation.unreadCount,
              0
            );
            return (
              <TouchableOpacity
                key={filter}
                onPress={() => setSelectedFilter(filter)}
                style={[styles.filterButton, active && styles.filterActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.filterText,
                    active && styles.filterTextActive,
                  ]}
                >
                  {filter}
                  {filter === "Messages" && messageCount > 0
                    ? ` (${messageCount})`
                    : ""}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#245B43" />
            <Text style={styles.subtitle}>Loading your orders...</Text>
          </View>
        ) : error ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Couldn’t load orders</Text>
            <Text style={styles.emptyText}>{error}</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={loadOrders}>
              <Text style={styles.primaryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : selectedFilter === "Messages" ? (
          conversations.length === 0 ? (
            <EmptyState
              title="No seller conversations yet"
              message="Message a seller from one of your orders to start a conversation."
            />
          ) : (
            conversations.map((conversation) => (
              <TouchableOpacity
                key={`${conversation.orderId}-${conversation.sellerId}`}
                style={styles.conversationCard}
                onPress={() => openConversation(conversation)}
              >
                <View style={styles.conversationHeader}>
                  <Text style={styles.cardTitle}>{conversation.otherName}</Text>
                  <Text style={styles.conversationOrder}>
                    Order #{conversation.orderId}
                  </Text>
                </View>
                <Text style={styles.conversationPreview} numberOfLines={2}>
                  {conversation.lastMessage || "Start a conversation with this seller"}
                </Text>
                <Text style={styles.conversationDate}>
                  {formatDate(conversation.lastMessageAt || conversation.orderCreatedAt)}
                </Text>
              </TouchableOpacity>
            ))
          )
        ) : visibleOrders.length === 0 ? (
          <EmptyState
            title={selectedFilter === "All" ? "No orders yet" : `Nothing ${selectedFilter.toLowerCase()}`}
            message={
              selectedFilter === "All"
                ? "Your purchases will appear here after you place an order."
                : "Orders that match this section will appear here."
            }
            actionLabel={selectedFilter === "All" ? "Explore products" : null}
            onAction={() => router.replace("/explore")}
          />
        ) : (
          visibleOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onMessage={(seller) =>
                openConversation({
                  orderId: order.id,
                  sellerId: seller.sellerId,
                  otherName: seller.sellerName,
                })
              }
              onConfirmDelivery={handleConfirmDelivery}
              onReview={(item) => openItemAction("review", order, item)}
              onReturn={(item) => openItemAction("return", order, item)}
            />
          ))
        )}

        <Text style={styles.paymentNotice}>
          Online payment verification is not automated yet. For GCash or Maya
          payment questions, message the seller from the Messages section.
        </Text>
      </ScrollView>

      <Modal
        visible={Boolean(actionItem)}
        transparent
        animationType="slide"
        onRequestClose={() => setActionItem(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {actionItem?.kind === "review"
                ? `Review ${actionItem?.item.productName || "product"}`
                : "Request a return"}
            </Text>

            {actionItem?.kind === "review" ? (
              <>
                <Text style={styles.fieldLabel}>Your rating</Text>
                <View style={styles.ratingRow}>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <Pressable key={value} onPress={() => setRating(value)}>
                      <Text
                        style={[
                          styles.ratingStar,
                          value <= rating && styles.ratingStarActive,
                        ]}
                      >
                        ★
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  placeholder="Share your experience (optional)"
                  multiline
                  maxLength={2000}
                  style={styles.modalInput}
                />
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>Reason</Text>
                <View style={styles.reasonList}>
                  {RETURN_REASONS.map((reason) => (
                    <TouchableOpacity
                      key={reason}
                      style={[
                        styles.reasonButton,
                        returnReason === reason && styles.reasonActive,
                      ]}
                      onPress={() => setReturnReason(reason)}
                    >
                      <Text
                        style={[
                          styles.reasonText,
                          returnReason === reason && styles.reasonTextActive,
                        ]}
                      >
                        {reason}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  value={returnDetails}
                  onChangeText={setReturnDetails}
                  placeholder="Add details (optional)"
                  multiline
                  maxLength={2000}
                  style={styles.modalInput}
                />
              </>
            )}

            {actionError ? (
              <Text style={styles.errorText}>{actionError}</Text>
            ) : null}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setActionItem(null)}
                disabled={savingAction}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={submitItemAction}
                disabled={savingAction}
              >
                {savingAction ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {actionItem?.kind === "review"
                      ? "Submit review"
                      : "Send request"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function EmptyState({ title, message, actionLabel, onAction }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{message}</Text>
      {actionLabel ? (
        <TouchableOpacity style={styles.primaryButton} onPress={onAction}>
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function OrderCard({ order, onMessage, onConfirmDelivery, onReview, onReturn }) {
  return (
    <View style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <View>
          <Text style={styles.cardTitle}>Order #{order.id}</Text>
          <Text style={styles.orderDate}>{formatDate(order.createdAt)}</Text>
        </View>
        <StatusPill value={order.orderStatus} />
      </View>

      {order.items.map((item) => (
        <View key={item.id} style={styles.itemRow}>
          <OrderItemImage imageUrl={getImageUrl(item.imageUrl)} />
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{item.productName}</Text>
            <Text style={styles.itemMeta}>
              {item.sellerName} · Qty {item.quantity}
            </Text>
            <Text style={styles.itemPrice}>
              {formatCurrency(item.subtotal)}
            </Text>
          </View>
          {item.sellerStatus === "delivered" && !item.review ? (
            <TouchableOpacity
              style={styles.smallAction}
              onPress={() => onReview(item)}
            >
              <Text style={styles.smallActionText}>Review</Text>
            </TouchableOpacity>
          ) : item.review ? (
            <Text style={styles.reviewedText}>★ {item.review.rating}/5</Text>
          ) : null}
        </View>
      ))}

      <View style={styles.orderSummary}>
        <Text style={styles.itemMeta}>
          {order.paymentMethod} · {order.paymentStatus}
          {order.paymentMethod !== "COD" && order.paymentStatus !== "paid"
            ? " · Contact seller to confirm payment"
            : ""}
        </Text>
        <Text style={styles.totalText}>
          Total {formatCurrency(order.totalAmount)}
        </Text>
      </View>

      {order.sellers.map((seller) => (
        <View
          key={`${order.id}-${seller.sellerId}`}
          style={styles.sellerPackage}
        >
          <View style={styles.packageHeader}>
            <Text style={styles.packageTitle}>{seller.sellerName}</Text>
            <StatusPill value={seller.status} />
          </View>
          {seller.trackingNumber ? (
            <Text style={styles.trackingText}>
              {seller.trackingCarrier || "Carrier"} · Tracking{" "}
              {seller.trackingNumber}
            </Text>
          ) : null}
          <View style={styles.packageActions}>
            <TouchableOpacity
              style={styles.outlineAction}
              onPress={() => onMessage(seller)}
            >
              <Text style={styles.outlineActionText}>Message seller</Text>
            </TouchableOpacity>
            {seller.status === "shipped" ? (
              <TouchableOpacity
                style={styles.smallAction}
                onPress={() => onConfirmDelivery(order, seller)}
              >
                <Text style={styles.smallActionText}>Order received</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ))}

      {order.items.map((item) =>
        item.sellerStatus === "delivered" ? (
          <View key={`return-${item.id}`} style={styles.returnRow}>
            {item.returnRequest ? (
              <Text style={styles.returnText}>
                Return: {item.returnRequest.status} · {item.returnRequest.reason}
                {item.returnRequest.sellerResponse
                  ? `\nSeller: ${item.returnRequest.sellerResponse}`
                  : ""}
              </Text>
            ) : (
              <TouchableOpacity
                style={styles.outlineAction}
                onPress={() => onReturn(item)}
              >
                <Text style={styles.outlineActionText}>Request return</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null
      )}
    </View>
  );
}

function OrderItemImage({ imageUrl }) {
  const [failed, setFailed] = useState(false);

  return imageUrl && !failed ? (
    <Image
      source={{ uri: imageUrl }}
      style={styles.orderItemImage}
      resizeMode="cover"
      onError={() => setFailed(true)}
      accessibilityLabel="Ordered product"
    />
  ) : (
    <View style={styles.orderItemPlaceholder}>
      <Text style={styles.orderItemPlaceholderText}>▧</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FAF9F5" },
  container: { padding: 18, paddingBottom: 30 },
  backButton: { alignSelf: "flex-start", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#245B43", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 13, marginBottom: 15 },
  backButtonText: { color: "#245B43", fontSize: 13, fontWeight: "700" },
  center: { flex: 1, minHeight: 180, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: "#78907B", fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: "#214D39", fontSize: 29, fontWeight: "900", marginTop: 4 },
  subtitle: { color: "#758173", fontSize: 13, lineHeight: 20, marginTop: 6 },
  filterList: { gap: 8, paddingVertical: 18 },
  filterButton: { paddingVertical: 10, paddingHorizontal: 13, borderRadius: 18, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#EAEAE2" },
  filterActive: { backgroundColor: "#245B43", borderColor: "#245B43" },
  filterText: { color: "#54745B", fontSize: 12, fontWeight: "700" },
  filterTextActive: { color: "#FFFFFF" },
  orderCard: { backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#EEEEE7", padding: 15, marginBottom: 13 },
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  cardTitle: { color: "#243E2D", fontSize: 15, fontWeight: "800" },
  orderDate: { color: "#899389", fontSize: 11, marginTop: 4 },
  statusPill: { backgroundColor: "#F1F4EC", borderRadius: 12, paddingVertical: 6, paddingHorizontal: 9 },
  statusPillText: { color: "#426B50", fontSize: 10, fontWeight: "800" },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: "#F0F0EA", paddingVertical: 11, gap: 8 },
  orderItemImage: { width: 52, height: 52, borderRadius: 9, backgroundColor: "#F1F4EC" },
  orderItemPlaceholder: { width: 52, height: 52, borderRadius: 9, backgroundColor: "#F1F4EC", alignItems: "center", justifyContent: "center" },
  orderItemPlaceholderText: { color: "#78907B", fontSize: 22 },
  itemInfo: { flex: 1 },
  itemName: { color: "#2C4031", fontSize: 13, fontWeight: "700" },
  itemMeta: { color: "#758173", fontSize: 11, marginTop: 3 },
  itemPrice: { color: "#245B43", fontSize: 12, fontWeight: "700", marginTop: 4 },
  orderSummary: { borderTopWidth: 1, borderTopColor: "#F0F0EA", paddingTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalText: { color: "#214D39", fontWeight: "900", fontSize: 13 },
  sellerPackage: { marginTop: 12, padding: 11, borderRadius: 12, backgroundColor: "#F8F9F4" },
  packageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  packageTitle: { color: "#344A39", fontSize: 12, fontWeight: "800" },
  trackingText: { color: "#758173", fontSize: 11, marginTop: 7 },
  packageActions: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 9 },
  smallAction: { paddingVertical: 8, paddingHorizontal: 10, backgroundColor: "#245B43", borderRadius: 9, alignSelf: "flex-start" },
  smallActionText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  outlineAction: { paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: "#245B43", borderRadius: 9, alignSelf: "flex-start" },
  outlineActionText: { color: "#245B43", fontSize: 11, fontWeight: "800" },
  returnRow: { borderTopWidth: 1, borderTopColor: "#F0F0EA", marginTop: 10, paddingTop: 10 },
  returnText: { color: "#758173", fontSize: 11, lineHeight: 17 },
  reviewedText: { color: "#A86B11", fontSize: 12, fontWeight: "800" },
  emptyCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#EEEEE7", borderRadius: 16, padding: 24, alignItems: "center", marginTop: 4 },
  emptyTitle: { color: "#214D39", fontSize: 17, fontWeight: "900", textAlign: "center" },
  emptyText: { color: "#758173", fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 8 },
  primaryButton: { backgroundColor: "#245B43", borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16, marginTop: 14, alignItems: "center", justifyContent: "center", minHeight: 42 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  paymentNotice: { color: "#899389", fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 18 },
  conversationCard: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 15, borderWidth: 1, borderColor: "#EEEEE7", marginBottom: 10 },
  conversationHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  conversationOrder: { color: "#899389", fontSize: 10 },
  conversationPreview: { color: "#667366", fontSize: 12, marginTop: 9 },
  conversationDate: { color: "#9AA398", fontSize: 10, marginTop: 7 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.42)" },
  modalCard: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, maxHeight: "90%" },
  modalTitle: { color: "#214D39", fontSize: 18, fontWeight: "900", marginBottom: 14 },
  fieldLabel: { color: "#344A39", fontSize: 12, fontWeight: "800", marginBottom: 8 },
  ratingRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  ratingStar: { color: "#D8D8CF", fontSize: 32 },
  ratingStarActive: { color: "#E5A526" },
  modalInput: { minHeight: 88, maxHeight: 150, borderWidth: 1, borderColor: "#E4E5DC", borderRadius: 10, padding: 11, textAlignVertical: "top", color: "#243E2D" },
  reasonList: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 13 },
  reasonButton: { borderWidth: 1, borderColor: "#E4E5DC", borderRadius: 16, paddingVertical: 7, paddingHorizontal: 10 },
  reasonActive: { backgroundColor: "#245B43", borderColor: "#245B43" },
  reasonText: { color: "#54745B", fontSize: 11, fontWeight: "700" },
  reasonTextActive: { color: "#FFFFFF" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 12 },
  cancelButton: { paddingVertical: 11, paddingHorizontal: 14 },
  cancelText: { color: "#54745B", fontWeight: "700" },
  errorText: { color: "#A33C2D", fontSize: 12, marginTop: 8 },
});
