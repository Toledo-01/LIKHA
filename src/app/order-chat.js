import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Redirect, useFocusEffect, useLocalSearchParams, router } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { fetchOrderMessages, sendOrderMessage } from "../services/api";

function formatMessageTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("en-PH", {
        dateStyle: "short",
        timeStyle: "short",
      });
}

export default function OrderChatScreen() {
  const params = useLocalSearchParams();
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  const sellerId = Array.isArray(params.sellerId) ? params.sellerId[0] : params.sellerId;
  const otherName = Array.isArray(params.otherName) ? params.otherName[0] : params.otherName;
  const { user, isLoading: authLoading } = useAuth();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const loadMessages = useCallback(async () => {
    if (!orderId || !sellerId) {
      setError("Order or seller information is missing.");
      setLoading(false);
      return;
    }

    try {
      setError("");
      const data = await fetchOrderMessages(orderId, sellerId);
      setMessages(data);
    } catch (loadError) {
      setError(loadError.message || "Unable to load this conversation.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId, sellerId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      loadMessages();

      const interval = setInterval(() => {
        if (active) loadMessages();
      }, 5000);

      return () => {
        active = false;
        clearInterval(interval);
      };
    }, [loadMessages])
  );

  async function handleSend() {
    const message = draft.trim();
    if (!message || sending) return;

    setSending(true);
    setError("");
    try {
      await sendOrderMessage(orderId, sellerId, message);
      setDraft("");
      await loadMessages();
    } catch (sendError) {
      setError(sendError.message || "Unable to send your message.");
    } finally {
      setSending(false);
    }
  }

  if (authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#245B43" />
      </View>
    );
  }

  if (!user || !["customer", "seller"].includes(user.role)) {
    return <Redirect href="/login" />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {otherName || (user.role === "seller" ? "Customer" : "Seller")}
        </Text>
        <Text style={styles.orderLabel}>Order #{orderId}</Text>
      </View>

      <ScrollView
        style={styles.messageList}
        contentContainerStyle={styles.messageContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadMessages();
            }}
          />
        }
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#245B43" />
            <Text style={styles.helper}>Loading messages...</Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Start your conversation</Text>
            <Text style={styles.helper}>
              Keep messages about this order here so both sides can follow up.
            </Text>
          </View>
        ) : (
          messages.map((message) => {
            const ownMessage = Number(message.senderId) === Number(user.id);
            return (
              <View
                key={message.id}
                style={[
                  styles.messageBubble,
                  ownMessage ? styles.ownMessage : styles.otherMessage,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    ownMessage && styles.ownMessageText,
                  ]}
                >
                  {message.message}
                </Text>
                <Text
                  style={[
                    styles.messageTime,
                    ownMessage && styles.ownMessageTime,
                  ]}
                >
                  {formatMessageTime(message.createdAt)}
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a message..."
          maxLength={2000}
          multiline
          style={styles.input}
          editable={!sending}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!draft.trim() || sending) && styles.sendDisabled]}
          onPress={handleSend}
          disabled={!draft.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          {sending ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.sendText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FAF9F5" },
  header: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 13, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#EAEAE2" },
  backButton: { alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 2 },
  backText: { color: "#245B43", fontSize: 13, fontWeight: "800" },
  title: { color: "#214D39", fontSize: 19, fontWeight: "900", marginTop: 6 },
  orderLabel: { color: "#899389", fontSize: 11, marginTop: 3 },
  messageList: { flex: 1 },
  messageContent: { padding: 16, gap: 10, flexGrow: 1, justifyContent: "flex-end" },
  messageBubble: { maxWidth: "86%", borderRadius: 16, paddingHorizontal: 13, paddingVertical: 10 },
  ownMessage: { alignSelf: "flex-end", backgroundColor: "#245B43", borderBottomRightRadius: 4 },
  otherMessage: { alignSelf: "flex-start", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#EAEAE2", borderBottomLeftRadius: 4 },
  messageText: { color: "#2C4031", fontSize: 14, lineHeight: 20 },
  ownMessageText: { color: "#FFFFFF" },
  messageTime: { color: "#899389", fontSize: 9, marginTop: 5, alignSelf: "flex-end" },
  ownMessageTime: { color: "#D7E5D9" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  helper: { color: "#758173", fontSize: 12, textAlign: "center", lineHeight: 18, marginTop: 6 },
  empty: { alignItems: "center", justifyContent: "center", flex: 1, padding: 25 },
  emptyTitle: { color: "#214D39", fontSize: 16, fontWeight: "800" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 9, padding: 12, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#EAEAE2" },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: "#E3E5DC", borderRadius: 16, paddingHorizontal: 13, paddingVertical: 10, color: "#243E2D", textAlignVertical: "top" },
  sendButton: { height: 44, minWidth: 62, paddingHorizontal: 12, borderRadius: 14, backgroundColor: "#245B43", alignItems: "center", justifyContent: "center" },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
  error: { color: "#A33C2D", paddingHorizontal: 14, paddingTop: 6, fontSize: 12 },
});
