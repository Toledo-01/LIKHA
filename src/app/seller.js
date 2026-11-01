
import { useCallback, useEffect, useRef, useState } from "react";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Redirect, router } from "expo-router";
import { useAuth } from "../context/AuthContext";
import AccountMenu from "../components/AccountMenu";

import {
  fetchCategories,
  fetchSellerProducts,
  createSellerProduct,
  fetchSellerOrders,
  fetchSellerReviews,
  decideSellerOrder,
  markSellerOrderShipped,
  respondToReturnRequest,
  fetchSellerDeliveryOrigin,
  saveSellerDeliveryOrigin,
} from "../services/api";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://likhalocal-api.onrender.com";

  
function showMessage(title, message) {
  if (Platform.OS === "web") {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

function getProductImageUrl(imageUrl) {
  if (!imageUrl) return null;

  if (
    imageUrl.startsWith("http://") ||
    imageUrl.startsWith("https://")
  ) {
    return imageUrl;
  }

  return `${API_BASE_URL}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
}

function formatMoney(amount) {
  return `₱${Number(amount || 0).toFixed(2)}`;
}

function formatDate(date) {
  if (!date) return "Date unavailable";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return String(date);
  }

  return parsedDate.toLocaleString();
}

function getStatusStyle(status) {
  if (status === "confirmed" || status === "approved") {
    return styles.approvedStatus;
  }

  if (status === "rejected") {
    return styles.rejectedStatus;
  }

  return styles.pendingStatus;
}

export default function SellerDashboard() {
  const { user, isLoading } = useAuth();

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [reviews, setReviews] = useState([]);

  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [processingOrderId, setProcessingOrderId] = useState(null);
  const [shipmentDetails, setShipmentDetails] = useState({});
  const knownReturnRequestIds = useRef(null);
  const returnPollInProgress = useRef(false);

  const [pageError, setPageError] = useState("");
  const [orderError, setOrderError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [formError, setFormError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [activeSection, setActiveSection] = useState("home");
  const pendingOrderCount = orders.filter(
    (order) => String(order.sellerStatus || "pending").toLowerCase() === "pending"
  ).length;
  const returnRequests = orders.flatMap((order) =>
    (order.items || [])
      .filter((item) => item.returnRequest)
      .map((item) => ({ ...item, order }))
  );
  const pendingReturnCount = returnRequests.filter(
    ({ returnRequest }) => returnRequest.status === "requested"
  ).length;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [shippingFee, setShippingFee] = useState("0");
  const [stock, setStock] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [hasVariations, setHasVariations] = useState(false);
  const [variationRows, setVariationRows] = useState([
    { key: "variation-1", size: "", color: "", price: "", stock: "" },
  ]);

  const [deliveryOriginBarangay, setDeliveryOriginBarangay] = useState("");
  const [deliveryOriginMunicipality, setDeliveryOriginMunicipality] =
    useState("");
  const [loadingDeliveryOrigin, setLoadingDeliveryOrigin] = useState(false);
  const [savingDeliveryOrigin, setSavingDeliveryOrigin] = useState(false);
  const [deliveryOriginError, setDeliveryOriginError] = useState("");
  const [deliveryOriginMessage, setDeliveryOriginMessage] = useState("");

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    if (user.role === "admin") {
      router.replace("/admin");
    } else if (user.role !== "seller") {
      router.replace("/");
    }
  }, [user, isLoading]);

  const loadSellerData = useCallback(async () => {
    setLoadingProducts(true);
    setPageError("");

    try {
      const [categoryData, productData] = await Promise.all([
        fetchCategories(),
        fetchSellerProducts(),
      ]);

      setCategories(categoryData || []);
      setProducts(productData || []);
    } catch (error) {
      setPageError(error.message || "Unable to load seller data.");
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const loadSellerOrders = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoadingOrders(true);
    }
    setOrderError("");

    try {
      const orderData = await fetchSellerOrders();
      setOrders(orderData || []);
      const currentRequests = (orderData || []).flatMap((order) =>
        (order.items || [])
          .filter((item) => item.returnRequest)
          .map((item) => ({
            id: String(item.returnRequest.id),
            status: item.returnRequest.status,
            orderId: order.id,
            productName: item.productName || "Product",
          }))
      );
      const currentIds = new Set(currentRequests.map((request) => request.id));

      if (knownReturnRequestIds.current === null) {
        knownReturnRequestIds.current = currentIds;
      } else {
        const newRequests = currentRequests.filter(
          (request) =>
            request.status === "requested" &&
            !knownReturnRequestIds.current.has(request.id)
        );
        knownReturnRequestIds.current = currentIds;

        if (newRequests.length > 0) {
          const firstRequest = newRequests[0];
          showMessage(
            "New return request",
            newRequests.length === 1
              ? `${firstRequest.productName} · Order #${firstRequest.orderId}`
              : `${newRequests.length} new customer return requests need your review.`
          );
        }
      }
    } catch (error) {
      setOrderError(error.message || "Unable to load your orders.");
    } finally {
      if (!silent) {
        setLoadingOrders(false);
      }
    }
  }, []);

  const loadSellerReviews = useCallback(async () => {
    setLoadingReviews(true);
    setReviewError("");

    try {
      const reviewData = await fetchSellerReviews();
      setReviews(reviewData || []);
    } catch (error) {
      setReviewError(error.message || "Unable to load your reviews.");
    } finally {
      setLoadingReviews(false);
    }
  }, []);

  const refreshSellerDashboard = useCallback(async () => {
    await Promise.all([
      loadSellerData(),
      loadSellerOrders(),
      loadSellerReviews(),
    ]);
  }, [loadSellerData, loadSellerOrders, loadSellerReviews]);

  useEffect(() => {
    if (!isLoading && user?.role === "seller") {
      Promise.resolve().then(refreshSellerDashboard);
    }
  }, [isLoading, user, refreshSellerDashboard]);

  useEffect(() => {
    if (isLoading || user?.role !== "seller") {
      return undefined;
    }

    const intervalId = setInterval(async () => {
      if (returnPollInProgress.current) {
        return;
      }

      returnPollInProgress.current = true;
      try {
        await loadSellerOrders({ silent: true });
      } finally {
        returnPollInProgress.current = false;
      }
    }, 30000);

    return () => clearInterval(intervalId);
  }, [isLoading, user, loadSellerOrders]);

  async function loadDeliveryOrigin() {
    setLoadingDeliveryOrigin(true);
    setDeliveryOriginError("");
    setDeliveryOriginMessage("");

    try {
      const origin = await fetchSellerDeliveryOrigin();

      setDeliveryOriginBarangay(origin.barangay || "");
      setDeliveryOriginMunicipality(origin.municipality || "");
    } catch (error) {
      setDeliveryOriginError(
        error.message || "Unable to load your delivery origin."
      );
    } finally {
      setLoadingDeliveryOrigin(false);
    }
  }

  async function handleSaveDeliveryOrigin() {
    const barangay = deliveryOriginBarangay.trim();
    const municipality = deliveryOriginMunicipality.trim();

    if (!barangay || !municipality) {
      setDeliveryOriginError(
        "Please enter both your barangay and municipality/city."
      );
      setDeliveryOriginMessage("");
      return;
    }

    setSavingDeliveryOrigin(true);
    setDeliveryOriginError("");
    setDeliveryOriginMessage("");

    try {
      const result = await saveSellerDeliveryOrigin({
        barangay,
        municipality,
      });

      setDeliveryOriginBarangay(barangay);
      setDeliveryOriginMunicipality(municipality);

      setDeliveryOriginMessage(
        result.message || "Delivery origin saved successfully."
      );
    } catch (error) {
      setDeliveryOriginError(
        error.message || "Unable to save your delivery origin."
      );
    } finally {
      setSavingDeliveryOrigin(false);
    }
  }

  function openSection(section) {
    setActiveSection(section);

    if (section === "orders") {
      loadSellerOrders();
    }

    if (section === "returns") {
      loadSellerOrders();
    }

    if (section === "reviews") {
      loadSellerReviews();
    }

    if (section === "addProduct") {
      loadSellerData();
    }

    if (section === "deliveryOrigin") {
      loadDeliveryOrigin();
    }
  }

  async function handleChooseImage() {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        showMessage(
          "Permission required",
          "Please allow gallery access to select a product image."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.length > 0) {
        setSelectedImage(result.assets[0]);
        setFormError("");
      }
    } catch {
      showMessage("Image error", "Unable to open your photo gallery.");
    }
  }

  
async function handleCreateProduct() {
  setFormError("");

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const parsedPrice = Number(price);
  const parsedShippingFee = Number(shippingFee);
  const parsedStock = Number(stock);

  if (!trimmedName) {
    setFormError("Please enter a product name.");
    return;
  }

  if (
    !hasVariations &&
    (!price.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0)
  ) {
    setFormError("Price must be a number greater than zero.");
    return;
  }

  if (
    !shippingFee.trim() ||
    !Number.isFinite(parsedShippingFee) ||
    parsedShippingFee < 0 ||
    parsedShippingFee > 99999999.99
  ) {
    setFormError("Shipping fee must be a valid amount of zero or more.");
    return;
  }

  if (
    !hasVariations &&
    (!stock.trim() || !Number.isInteger(parsedStock) || parsedStock < 0)
  ) {
    setFormError("Stock must be a whole number of zero or more.");
    return;
  }

  const productVariants = hasVariations
    ? variationRows.map((variant) => ({
        size: variant.size.trim(),
        color: variant.color.trim(),
        price: Number(variant.price),
        stock: Number(variant.stock),
      }))
    : [];

  if (hasVariations) {
    const seenOptions = new Set();
    let totalVariantStock = 0;
    const hasSizes = productVariants.some((variant) => variant.size);
    const hasColors = productVariants.some((variant) => variant.color);

    if (productVariants.length === 0) {
      setFormError("Add at least one product variation.");
      return;
    }

    if (
      productVariants.some(
        (variant) =>
          Boolean(variant.size) !== hasSizes ||
          Boolean(variant.color) !== hasColors
      )
    ) {
      setFormError(
        "Use the same variation fields for every option combination."
      );
      return;
    }

    for (const [index, variant] of productVariants.entries()) {
      if (
        (!variant.size && !variant.color) ||
        !variationRows[index].price.trim() ||
        !variationRows[index].stock.trim() ||
        variant.size.length > 100 ||
        variant.color.length > 100 ||
        !Number.isFinite(variant.price) ||
        variant.price <= 0 ||
        variant.price > 99999999.99 ||
        !Number.isInteger(variant.stock) ||
        variant.stock < 0 ||
        variant.stock > 2147483647
      ) {
        setFormError(
          `Variation ${index + 1} needs a size or color, a valid price, and whole-number stock.`
        );
        return;
      }

      const optionKey =
        `${variant.size.toLowerCase()}\u0000${variant.color.toLowerCase()}`;
      if (seenOptions.has(optionKey)) {
        setFormError("Each size and color combination must be unique.");
        return;
      }

      seenOptions.add(optionKey);
      totalVariantStock += variant.stock;
    }

    if (totalVariantStock > 2147483647) {
      setFormError("The combined variation stock is too large.");
      return;
    }
  }

  if (categories.length > 0 && selectedCategory === null) {
    setFormError("Please select a category.");
    return;
  }

  if (!selectedImage?.uri) {
    setFormError("Please select a product image.");
    return;
  }

  // Determine the image format using MIME type first.
  const allowedMimeTypes = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  const allowedExtensions = ["jpg", "jpeg", "png", "webp"];

  const uriPath = selectedImage.uri
    .split("?")[0]
    .split("#")[0];

  const uriExtension = uriPath.includes(".")
    ? uriPath.split(".").pop().toLowerCase()
    : "";

  const fileNameExtension = selectedImage.fileName
    ?.split(".")
    .pop()
    ?.toLowerCase();

  const mimeType = String(selectedImage.mimeType || "").toLowerCase();

  let imageExtension = allowedMimeTypes[mimeType];

  if (!imageExtension && allowedExtensions.includes(uriExtension)) {
    imageExtension = uriExtension === "jpeg" ? "jpg" : uriExtension;
  }

  if (
    !imageExtension &&
    allowedExtensions.includes(fileNameExtension)
  ) {
    imageExtension =
      fileNameExtension === "jpeg" ? "jpg" : fileNameExtension;
  }

  if (!imageExtension) {
    setFormError(
      "Unsupported image format. Please choose a JPEG, PNG, or WebP image."
    );
    return;
  }

  if (
    selectedImage.fileSize != null &&
    selectedImage.fileSize > 5 * 1024 * 1024
  ) {
    setFormError("The product image must be 5 MB or smaller.");
    return;
  }

  const imageMimeType =
    imageExtension === "jpg"
      ? "image/jpeg"
      : `image/${imageExtension}`;

  const imageFileName =
    selectedImage.fileName ||
    `product-${Date.now()}.${imageExtension}`;

  setSavingProduct(true);

  try {
    const formData = new FormData();

    formData.append("name", trimmedName);
    formData.append("description", trimmedDescription);
    const variantPrices = productVariants.map((variant) => variant.price);
    const productPrice = hasVariations
      ? Math.min(...variantPrices)
      : parsedPrice;
    const productStock = hasVariations
      ? productVariants.reduce((total, variant) => total + variant.stock, 0)
      : parsedStock;

    formData.append("price", String(productPrice));
    formData.append("shipping_fee", String(parsedShippingFee));
    formData.append("stock", String(productStock));
    if (hasVariations) {
      formData.append("variants", JSON.stringify(productVariants));
    }

    if (selectedCategory !== null) {
      formData.append("category_id", String(selectedCategory));
    }

    if (Platform.OS === "web") {
      let imageFile = selectedImage.file;

      if (!imageFile) {
        const imageResponse = await fetch(selectedImage.uri);

        if (!imageResponse.ok) {
          throw new Error("Could not read the selected product image.");
        }

        const imageBlob = await imageResponse.blob();
        imageFile = new Blob([imageBlob], { type: imageMimeType });
      }

      formData.append("image", imageFile, imageFileName);
    } else {
      formData.append("image", new File(selectedImage.uri));
    }

    await createSellerProduct(formData);

    setName("");
    setDescription("");
    setPrice("");
    setShippingFee("0");
    setStock("");
    setHasVariations(false);
    setVariationRows([
      { key: `variation-${Date.now()}`, size: "", color: "", price: "", stock: "" },
    ]);
    setSelectedCategory(null);
    setSelectedImage(null);
    setFormError("");

    await loadSellerData();

    showMessage(
      "Product submitted successfully!",
      "Your product was submitted for staff review. Staff can inspect it, and an administrator makes the final approval decision."
    );
  } catch (error) {
    setFormError(error.message || "Could not submit the product.");
  } finally {
    setSavingProduct(false);
  }
}

  async function processOrderDecision(order, decision) {
    setProcessingOrderId(order.id);
    setOrderError("");

    try {
      await decideSellerOrder(order.id, decision);
      await loadSellerOrders();

      const message =
        decision === "confirmed"
          ? `Order #${order.id} has been approved.`
          : `Order #${order.id} has been rejected.`;

      showMessage("Success", message);
    } catch (error) {
      showMessage(
        "Unable to update order",
        error.message || "Please try again."
      );
    } finally {
      setProcessingOrderId(null);
    }
  }

  async function handleMarkShipped(order) {
    const shipment = shipmentDetails[order.id] || {};
    setProcessingOrderId(order.id);

    try {
      await markSellerOrderShipped(order.id, {
        carrier: shipment.carrier || "",
        trackingNumber: shipment.trackingNumber || "",
      });
      await loadSellerOrders();
      setShipmentDetails((current) => ({
        ...current,
        [order.id]: { carrier: "", trackingNumber: "" },
      }));
      showMessage("Shipment updated", `Order #${order.id} is marked as shipped.`);
    } catch (error) {
      showMessage(
        "Unable to update shipment",
        error.message || "Please try again."
      );
    } finally {
      setProcessingOrderId(null);
    }
  }

  async function handleReturnDecision(returnRequest, decision) {
    try {
      await respondToReturnRequest(returnRequest.id, decision, "");
      await loadSellerOrders();
      showMessage(
        "Return request updated",
        `The return request was ${decision}.`
      );
    } catch (error) {
      showMessage(
        "Unable to update return",
        error.message || "Please try again."
      );
    }
  }

  function handleOrderDecision(order, decision) {
    if (processingOrderId !== null) return;

    const approving = decision === "confirmed";
    const actionLabel = approving ? "approve" : "reject";
    const message =
      `Are you sure you want to ${actionLabel} order #${order.id}?`;

    if (Platform.OS === "web") {
      if (window.confirm(message)) {
        processOrderDecision(order, decision);
      }
      return;
    }

    Alert.alert(
      approving ? "Approve Order?" : "Reject Order?",
      message,
      [
        { text: "Go Back", style: "cancel" },
        {
          text: approving ? "Approve" : "Reject",
          style: approving ? "default" : "destructive",
          onPress: () => processOrderDecision(order, decision),
        },
      ]
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#245B43" />
        <Text>Loading seller dashboard...</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (user.role !== "seller") {
    return null;
  }

  const selectedCategoryName = categories.find(
    (category) => Number(category.id) === Number(selectedCategory)
  )?.name;
  const filteredCategories = categories.filter((category) =>
    String(category.name || "")
      .toLowerCase()
      .includes(categorySearch.trim().toLowerCase())
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.dashboardHeader}>
          <View style={styles.brandRow}>
            <Image
              source={require("../../assets/likhalocal-logo.png")}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="LikhaLocal logo"
            />
            <Text style={styles.brand}>LikhaLocal</Text>
          </View>
          <AccountMenu />
        </View>
        <Text style={styles.heading}>Seller Dashboard</Text>
        <Text style={styles.subtitle}>
          Welcome, {user.full_name}!
        </Text>

        {activeSection === "home" && (
          <>
            <Text style={styles.welcomeText}>Manage your shop</Text>

            <Text style={styles.description}>
              Choose an action below to manage your products, review
              customer orders, or set your delivery location.
            </Text>

            <View style={styles.dashboardCards}>
              <TouchableOpacity
                style={[styles.navigationCard, styles.addProductCard]}
                onPress={() => openSection("addProduct")}
                activeOpacity={0.8}
              >
                <View style={styles.iconCircle}>
                  <Text style={styles.navigationIcon}>＋</Text>
                </View>
                <Text style={styles.navigationTitle}>Add Product</Text>
                <Text
                  style={styles.navigationDescription}
                  numberOfLines={3}
                >
                  Add and manage your product listings.
                </Text>
                <Text style={styles.navigationLink}>Open →</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.navigationCard, styles.myOrdersCard]}
                onPress={() => openSection("orders")}
                activeOpacity={0.8}
              >
                {pendingOrderCount > 0 ? (
                  <View style={styles.navigationBadge}>
                    <Text style={styles.navigationBadgeText}>
                      {pendingOrderCount > 99 ? "99+" : pendingOrderCount}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.iconCircle}>
                  <Text style={styles.navigationIcon}>▤</Text>
                </View>
                <Text style={styles.navigationTitle}>My Orders</Text>
                <Text
                  style={styles.navigationDescription}
                  numberOfLines={3}
                >
                  {pendingOrderCount} pending{" "}
                  {pendingOrderCount === 1 ? "order" : "orders"} to review.
                </Text>
                <Text style={styles.navigationLink}>View →</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.navigationCard, styles.reviewsCard]}
                onPress={() => openSection("reviews")}
                activeOpacity={0.8}
              >
                {reviews.length > 0 ? (
                  <View style={styles.navigationBadge}>
                    <Text style={styles.navigationBadgeText}>
                      {reviews.length > 99 ? "99+" : reviews.length}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.iconCircle}>
                  <Text style={styles.navigationIcon}>★</Text>
                </View>
                <Text style={styles.navigationTitle}>Customer Reviews</Text>
                <Text
                  style={styles.navigationDescription}
                  numberOfLines={3}
                >
                  Read feedback customers leave for your products.
                </Text>
                <Text style={styles.navigationLink}>View reviews →</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.navigationCard, styles.returnsCard]}
                onPress={() => openSection("returns")}
                activeOpacity={0.8}
              >
                {pendingReturnCount > 0 ? (
                  <View style={styles.navigationBadge}>
                    <Text style={styles.navigationBadgeText}>
                      {pendingReturnCount > 99 ? "99+" : pendingReturnCount}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.iconCircle}>
                  <Text style={styles.navigationIcon}>↩</Text>
                </View>
                <Text style={styles.navigationTitle}>Returned Products</Text>
                <Text
                  style={styles.navigationDescription}
                  numberOfLines={3}
                >
                  {pendingReturnCount} return{" "}
                  {pendingReturnCount === 1 ? "request" : "requests"} to review.
                </Text>
                <Text style={styles.navigationLink}>View returns →</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.navigationCard, styles.deliveryOriginCard]}
                onPress={() => openSection("deliveryOrigin")}
                activeOpacity={0.8}
              >
                <View style={styles.iconCircle}>
                  <Text style={styles.navigationIcon}>⌖</Text>
                </View>
                <Text style={styles.navigationTitle}>Delivery Origin</Text>
                <Text
                  style={styles.navigationDescription}
                  numberOfLines={3}
                >
                  Set your shop&apos;s delivery location.
                </Text>
                <Text style={styles.navigationLink}>Set location →</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dashboardNote}>
              <Text style={styles.dashboardNoteTitle}>Seller reminder</Text>
              <Text style={styles.description}>
                New products may need admin approval before they become
                available to customers. Check your product status regularly.
              </Text>
            </View>
          </>
        )}

        {activeSection !== "home" && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setActiveSection("home")}
            activeOpacity={0.8}
          >
            <Text style={styles.backButtonText}>← Back to Dashboard</Text>
          </TouchableOpacity>
        )}

        {activeSection === "deliveryOrigin" && (
          <>
            <View style={styles.sectionIntro}>
              <Text style={styles.sectionHeading}>Delivery Origin</Text>
              <Text style={styles.description}>
                Enter the location from which you ship your products.
                This helps determine the delivery zone for customer orders.
              </Text>
            </View>

            <View style={styles.card}>
              {loadingDeliveryOrigin ? (
                <ActivityIndicator size="large" color="#245B43" />
              ) : (
                <>
                  <Text style={styles.label}>Seller&apos;s Barangay *</Text>
                  <TextInput
                    style={styles.input}
                    value={deliveryOriginBarangay}
                    onChangeText={setDeliveryOriginBarangay}
                    placeholder="Enter your barangay"
                    autoCapitalize="words"
                    maxLength={120}
                    editable={!savingDeliveryOrigin}
                  />

                  <Text style={styles.label}>Municipality / City *</Text>
                  <TextInput
                    style={styles.input}
                    value={deliveryOriginMunicipality}
                    onChangeText={setDeliveryOriginMunicipality}
                    placeholder="Enter your municipality or city"
                    autoCapitalize="words"
                    maxLength={120}
                    editable={!savingDeliveryOrigin}
                  />

                  {!!deliveryOriginError && (
                    <Text style={styles.errorText}>
                      {deliveryOriginError}
                    </Text>
                  )}

                  {!!deliveryOriginMessage && (
                    <Text style={styles.approvedStatus}>
                      {deliveryOriginMessage}
                    </Text>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.primaryButton,
                      savingDeliveryOrigin && styles.disabledButton,
                    ]}
                    onPress={handleSaveDeliveryOrigin}
                    disabled={savingDeliveryOrigin}
                    activeOpacity={0.8}
                  >
                    {savingDeliveryOrigin ? (
                      <View style={styles.loadingButtonContent}>
                        <ActivityIndicator color="#FFFFFF" />
                        <Text style={styles.buttonText}>
                          Saving Delivery Origin...
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.buttonText}>
                        Save Delivery Origin
                      </Text>
                    )}
                  </TouchableOpacity>

                  <Text style={styles.note}>
                    Enter your actual shipping origin. The planned delivery
                    rules are ₱20 for the same barangay, ₱40 for another
                    barangay in the same municipality, and manual review for
                    other or unclassified zones.
                  </Text>
                </>
              )}
            </View>
          </>
        )}

        {activeSection === "addProduct" && (
          <>
            <View style={styles.sectionIntro}>
              <Text style={styles.sectionHeading}>Add a Product</Text>
              <Text style={styles.description}>
                Fill in your product details and submit them for review.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Product Information</Text>

              <Text style={styles.label}>Product name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Homemade Mango Jam"
                value={name}
                onChangeText={setName}
                maxLength={180}
                editable={!savingProduct}
              />

              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                placeholder="Describe your product"
                value={description}
                onChangeText={setDescription}
                multiline
                textAlignVertical="top"
                editable={!savingProduct}
              />

              <Text style={styles.label}>Product image</Text>
              <TouchableOpacity
                style={[
                  styles.imagePickerButton,
                  savingProduct && styles.disabledButton,
                ]}
                onPress={handleChooseImage}
                disabled={savingProduct}
              >
                <Text style={styles.imagePickerText}>
                  {selectedImage
                    ? "Change Product Image"
                    : "Choose Product Image"}
                </Text>
              </TouchableOpacity>

              {selectedImage ? (
                <View style={styles.imagePreviewContainer}>
                  <Image
                    source={{ uri: selectedImage.uri }}
                    style={styles.imagePreview}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    onPress={() => setSelectedImage(null)}
                    disabled={savingProduct}
                  >
                    <Text style={styles.removeImageText}>Remove image</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.note}>
                  Choose a JPEG, PNG, or WebP image up to 5 MB.
                </Text>
              )}

              <TouchableOpacity
                style={styles.variationToggle}
                onPress={() => setHasVariations((enabled) => !enabled)}
                disabled={savingProduct}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: hasVariations }}
              >
                <Text style={styles.variationToggleText}>
                  {hasVariations
                    ? "✓ This product has size/color variations"
                    : "＋ Add size/color variations"}
                </Text>
              </TouchableOpacity>

              {hasVariations ? (
                <View style={styles.variationEditor}>
                  <Text style={styles.note}>
                    Add each available size and/or color combination with its
                    own price and stock.
                  </Text>

                  {variationRows.map((variant, index) => (
                    <View key={variant.key} style={styles.variationRow}>
                      <Text style={styles.variationHeading}>
                        Variation {index + 1}
                      </Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Size (e.g. Small)"
                        value={variant.size}
                        onChangeText={(value) =>
                          setVariationRows((rows) =>
                            rows.map((row) =>
                              row.key === variant.key
                                ? { ...row, size: value }
                                : row
                            )
                          )
                        }
                        maxLength={100}
                        editable={!savingProduct}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="Color (e.g. Red)"
                        value={variant.color}
                        onChangeText={(value) =>
                          setVariationRows((rows) =>
                            rows.map((row) =>
                              row.key === variant.key
                                ? { ...row, color: value }
                                : row
                            )
                          )
                        }
                        maxLength={100}
                        editable={!savingProduct}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="Price (₱)"
                        value={variant.price}
                        onChangeText={(value) =>
                          setVariationRows((rows) =>
                            rows.map((row) =>
                              row.key === variant.key
                                ? { ...row, price: value }
                                : row
                            )
                          )
                        }
                        keyboardType="decimal-pad"
                        editable={!savingProduct}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="Stock quantity"
                        value={variant.stock}
                        onChangeText={(value) =>
                          setVariationRows((rows) =>
                            rows.map((row) =>
                              row.key === variant.key
                                ? { ...row, stock: value }
                                : row
                            )
                          )
                        }
                        keyboardType="number-pad"
                        editable={!savingProduct}
                      />
                      {variationRows.length > 1 ? (
                        <TouchableOpacity
                          onPress={() =>
                            setVariationRows((rows) =>
                              rows.filter((row) => row.key !== variant.key)
                            )
                          }
                          disabled={savingProduct}
                        >
                          <Text style={styles.removeImageText}>
                            Remove variation
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}

                  <TouchableOpacity
                    style={styles.addVariationButton}
                    onPress={() =>
                      setVariationRows((rows) => [
                        ...rows,
                        {
                          key: `variation-${Date.now()}-${rows.length}`,
                          size: "",
                          color: "",
                          price: "",
                          stock: "",
                        },
                      ])
                    }
                    disabled={savingProduct || variationRows.length >= 100}
                  >
                    <Text style={styles.addVariationText}>
                      + Add another variation
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={styles.label}>Price (₱) *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 150.00"
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="decimal-pad"
                    editable={!savingProduct}
                  />
                </>
              )}

              <Text style={styles.label}>Shipping fee (₱) *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 50.00"
                value={shippingFee}
                onChangeText={setShippingFee}
                keyboardType="decimal-pad"
                editable={!savingProduct}
              />
              <Text style={styles.note}>
                This is a fixed fee for this product and does not change by
                customer location. If an order has multiple products from you,
                checkout charges only the highest product shipping fee once.
              </Text>

              {!hasVariations ? (
                <>
                  <Text style={styles.label}>Stock quantity *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 20"
                    value={stock}
                    onChangeText={setStock}
                    keyboardType="number-pad"
                    editable={!savingProduct}
                  />
                </>
              ) : null}

              <Text style={styles.label}>Category *</Text>

              {loadingProducts ? (
                <ActivityIndicator size="small" color="#245B43" />
              ) : categories.length === 0 ? (
                <Text style={styles.note}>
                  No categories available. Check that categories loaded
                  successfully.
                </Text>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.categoryPickerButton,
                    savingProduct && styles.disabledButton,
                  ]}
                  onPress={() => setCategoryPickerVisible(true)}
                  disabled={savingProduct}
                  accessibilityRole="button"
                  accessibilityLabel={
                    selectedCategoryName
                      ? `Category: ${selectedCategoryName}. Change category`
                      : "Choose a product category"
                  }
                >
                  <Text
                    style={[
                      styles.categoryPickerText,
                      !selectedCategoryName && styles.categoryPlaceholder,
                    ]}
                  >
                    {selectedCategoryName || "Select a category"}
                  </Text>
                  <Text style={styles.categoryPickerChevron}>⌄</Text>
                </TouchableOpacity>
              )}

              {formError ? (
                <Text style={styles.errorText}>{formError}</Text>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  savingProduct && styles.disabledButton,
                ]}
                onPress={handleCreateProduct}
                disabled={savingProduct}
                activeOpacity={0.8}
              >
                {savingProduct ? (
                  <View style={styles.loadingButtonContent}>
                    <ActivityIndicator color="#FFFFFF" />
                    <Text style={styles.buttonText}>
                      Submitting Product...
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.buttonText}>Submit Product</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.note}>
                New products are submitted for admin review. Their approval
                status appears below.
              </Text>
            </View>

            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.cardTitle}>My Products</Text>
                <TouchableOpacity
                  onPress={loadSellerData}
                  disabled={loadingProducts}
                >
                  <Text style={styles.refreshText}>
                    {loadingProducts ? "Loading..." : "Refresh"}
                  </Text>
                </TouchableOpacity>
              </View>

              {loadingProducts ? (
                <ActivityIndicator size="small" color="#245B43" />
              ) : pageError ? (
                <View>
                  <Text style={styles.errorText}>{pageError}</Text>
                  <TouchableOpacity
                    style={styles.retryButton}
                    onPress={loadSellerData}
                  >
                    <Text style={styles.refreshText}>Try Again</Text>
                  </TouchableOpacity>
                </View>
              ) : products.length === 0 ? (
                <Text style={styles.description}>
                  You have not added any products yet.
                </Text>
              ) : (
                products.map((product) => {
                  const imageUrl = getProductImageUrl(product.image_url);

                  return (
                    <View key={product.id} style={styles.productItem}>
                      {imageUrl ? (
                        <Image
                          source={{ uri: imageUrl }}
                          style={styles.productImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.noImagePlaceholder}>
                          <Text style={styles.noImageText}>
                            No product image
                          </Text>
                        </View>
                      )}

                      <Text style={styles.productName}>{product.name}</Text>
                      <Text style={styles.productDetail}>
                        Category: {product.category || "Uncategorized"}
                      </Text>
                      <Text style={styles.productDetail}>
                        Price: {formatMoney(product.price)}
                      </Text>
                      <Text style={styles.productDetail}>
                        Shipping fee: {formatMoney(product.shipping_fee)}
                      </Text>
                      <Text style={styles.productDetail}>
                        Stock: {product.stock}
                      </Text>
                      {product.variants?.length ? (
                        <Text style={styles.productDetail}>
                          Variations:{" "}
                          {product.variants
                            .map((variant) => {
                              const options = [
                                variant.size,
                                variant.color,
                              ].filter(Boolean);
                              return `${options.join(" / ")} — ${formatMoney(variant.price)} (${variant.stock} in stock)`;
                            })
                            .join(", ")}
                        </Text>
                      ) : null}

                      <View style={styles.statusContainer}>
                        <Text style={styles.productDetail}>Status: </Text>
                        <Text
                          style={[
                            styles.statusText,
                            getStatusStyle(product.status),
                          ]}
                        >
                          {product.status || "unknown"}
                        </Text>
                      </View>

                      {product.description ? (
                        <Text style={styles.productDetail}>
                          {product.description}
                        </Text>
                      ) : null}
                    </View>
                  );
                })
              )}
            </View>
          </>
        )}

        {activeSection === "orders" && (
          <>
            <View style={styles.sectionIntro}>
              <Text style={styles.sectionHeading}>My Orders</Text>
              <Text style={styles.description}>
                Review orders containing your products. Approve or reject
                pending requests below.
              </Text>
            </View>

            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.cardTitle}>Order Management</Text>
                <TouchableOpacity
                  onPress={loadSellerOrders}
                  disabled={loadingOrders || processingOrderId !== null}
                >
                  <Text style={styles.refreshText}>
                    {loadingOrders ? "Loading..." : "Refresh"}
                  </Text>
                </TouchableOpacity>
              </View>

              {loadingOrders ? (
                <View style={styles.emptyState}>
                  <ActivityIndicator size="large" color="#245B43" />
                  <Text style={styles.description}>
                    Loading your orders...
                  </Text>
                </View>
              ) : orderError ? (
                <View style={styles.emptyState}>
                  <Text style={styles.errorText}>{orderError}</Text>
                  <TouchableOpacity
                    style={styles.retryButton}
                    onPress={loadSellerOrders}
                  >
                    <Text style={styles.refreshText}>Try Again</Text>
                  </TouchableOpacity>
                </View>
              ) : orders.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>▤</Text>
                  <Text style={styles.emptyTitle}>No orders yet</Text>
                  <Text style={styles.description}>
                    Orders containing your products will appear here.
                  </Text>
                </View>
              ) : (
                orders.map((order) => {
                  const status = String(
                    order.sellerStatus || "pending"
                  ).toLowerCase();

                  const isPending = status === "pending";
                  const isProcessing =
                    String(processingOrderId) === String(order.id);

                  return (
                    <View key={order.id} style={styles.orderCard}>
                      <View style={styles.orderCardHeader}>
                        <View style={styles.orderHeadingInfo}>
                          <Text style={styles.orderNumber}>
                            Order #{order.id}
                          </Text>
                          <Text style={styles.orderDate}>
                            {formatDate(order.createdAt)}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.orderStatusBadge,
                            status === "confirmed"
                              ? styles.orderStatusConfirmed
                              : status === "rejected"
                                ? styles.orderStatusRejected
                                : styles.orderStatusPending,
                          ]}
                        >
                          <Text
                            style={[
                              styles.orderStatusText,
                              status === "confirmed"
                                ? styles.orderStatusTextConfirmed
                                : status === "rejected"
                                  ? styles.orderStatusTextRejected
                                  : styles.orderStatusTextPending,
                            ]}
                          >
                            {status}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.orderDivider} />

                      <Text style={styles.orderSectionLabel}>
                        CUSTOMER DETAILS
                      </Text>
                      <Text style={styles.orderDetail}>
                        Customer ID: {order.customerId ?? "—"}
                      </Text>
                      <Text style={styles.orderDetail}>
                        Contact: {order.contactNumber || "Not provided"}
                      </Text>
                      <Text style={styles.orderDetail}>
                        Delivery address:{" "}
                        {order.deliveryAddress || "Not provided"}
                      </Text>

                      <View style={styles.orderDivider} />

                      <Text style={styles.orderSectionLabel}>
                        ORDERED PRODUCTS
                      </Text>

                      {(order.items || []).length === 0 ? (
                        <Text style={styles.orderDetail}>
                          Product details unavailable.
                        </Text>
                      ) : (
                        (order.items || []).map((item, index) => (
                          <View
                            key={`${order.id}-${item.productId ?? index}-${index}`}
                            style={styles.orderProductCard}
                          >
                            <Text style={styles.orderProductName}>
                              {item.productName || "Product"}
                            </Text>
                            {item.variantDetails ? (
                              <Text style={styles.orderDetail}>
                                {item.variantDetails}
                              </Text>
                            ) : null}

                            <View style={styles.orderProductRow}>
                              <Text style={styles.orderDetail}>
                                Quantity: {item.quantity ?? 0}
                              </Text>
                              <Text style={styles.orderProductPrice}>
                                {formatMoney(
                                  item.subtotal ??
                                    Number(item.unitPrice) *
                                      Number(item.quantity)
                                )}
                              </Text>
                            </View>

                            <Text style={styles.orderDetail}>
                              Unit price: {formatMoney(item.unitPrice)}
                            </Text>

                            {item.returnRequest ? (
                              <View style={styles.returnRequestBox}>
                                <Text style={styles.orderSectionLabel}>
                                  RETURN REQUEST · {item.returnRequest.status}
                                </Text>
                                <Text style={styles.orderDetail}>
                                  {item.returnRequest.reason}
                                  {item.returnRequest.details
                                    ? ` — ${item.returnRequest.details}`
                                    : ""}
                                </Text>
                                {item.returnRequest.status === "requested" ? (
                                  <View style={styles.orderActionRow}>
                                    <TouchableOpacity
                                      style={styles.orderApproveButton}
                                      onPress={() =>
                                        handleReturnDecision(
                                          item.returnRequest,
                                          "approved"
                                        )
                                      }
                                    >
                                      <Text style={styles.buttonText}>
                                        Approve Return
                                      </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={styles.orderRejectButton}
                                      onPress={() =>
                                        handleReturnDecision(
                                          item.returnRequest,
                                          "rejected"
                                        )
                                      }
                                    >
                                      <Text style={styles.buttonText}>
                                        Reject Return
                                      </Text>
                                    </TouchableOpacity>
                                  </View>
                                ) : null}
                              </View>
                            ) : null}
                          </View>
                        ))
                      )}

                      <View style={styles.orderDivider} />

                      <View style={styles.orderTotalRow}>
                        <View style={styles.orderTotalInfo}>
                          <Text style={styles.orderTotalLabel}>
                            Checkout total
                          </Text>
                          <Text style={styles.orderDetail}>
                            Payment: {order.paymentMethod || "COD"}
                          </Text>
                          <Text style={styles.orderDetail}>
                            Payment status: {order.paymentStatus || "unpaid"}
                          </Text>
                        </View>

                        <Text style={styles.orderTotal}>
                          {formatMoney(order.totalAmount)}
                        </Text>
                      </View>

                      <Text style={styles.orderOverallStatus}>
                        Overall order status: {order.orderStatus || "pending"}
                      </Text>

                      <TouchableOpacity
                        style={styles.messageCustomerButton}
                        onPress={() =>
                          router.push({
                            pathname: "/order-chat",
                            params: {
                              orderId: String(order.id),
                              sellerId: String(user.id),
                              otherName: order.customerName || "Customer",
                            },
                          })
                        }
                      >
                        <Text style={styles.messageCustomerText}>
                          Message {order.customerName || "customer"}
                        </Text>
                      </TouchableOpacity>

                      {(status === "confirmed" || status === "processing") && (
                        <View style={styles.shipmentForm}>
                          <Text style={styles.orderSectionLabel}>
                            SHIPMENT TRACKING
                          </Text>
                          {order.trackingNumber ? (
                            <Text style={styles.orderDetail}>
                              Current: {order.trackingCarrier} ·{" "}
                              {order.trackingNumber}
                            </Text>
                          ) : null}
                          <TextInput
                            style={styles.input}
                            placeholder="Carrier (e.g. LBC)"
                            value={shipmentDetails[order.id]?.carrier || ""}
                            onChangeText={(value) =>
                              setShipmentDetails((current) => ({
                                ...current,
                                [order.id]: {
                                  ...current[order.id],
                                  carrier: value,
                                },
                              }))
                            }
                            editable={!isProcessing}
                          />
                          <TextInput
                            style={styles.input}
                            placeholder="Tracking number"
                            value={
                              shipmentDetails[order.id]?.trackingNumber || ""
                            }
                            onChangeText={(value) =>
                              setShipmentDetails((current) => ({
                                ...current,
                                [order.id]: {
                                  ...current[order.id],
                                  trackingNumber: value,
                                },
                              }))
                            }
                            editable={!isProcessing}
                          />
                          <TouchableOpacity
                            style={[
                              styles.orderApproveButton,
                              isProcessing && styles.disabledButton,
                            ]}
                            onPress={() => handleMarkShipped(order)}
                            disabled={isProcessing || loadingOrders}
                          >
                            {isProcessing ? (
                              <ActivityIndicator color="#FFFFFF" />
                            ) : (
                              <Text style={styles.buttonText}>
                                Mark as Shipped
                              </Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      )}

                      {status === "shipped" || status === "delivered" ? (
                        <Text style={styles.orderDetail}>
                          Tracking: {order.trackingCarrier || "Carrier"} ·{" "}
                          {order.trackingNumber || "Not provided"}
                        </Text>
                      ) : null}

                      {isPending ? (
                        <View style={styles.orderActionRow}>
                          <TouchableOpacity
                            style={[
                              styles.orderApproveButton,
                              (processingOrderId !== null || loadingOrders) &&
                                styles.disabledButton,
                            ]}
                            onPress={() =>
                              handleOrderDecision(order, "confirmed")
                            }
                            disabled={
                              processingOrderId !== null || loadingOrders
                            }
                            activeOpacity={0.8}
                          >
                            {isProcessing ? (
                              <ActivityIndicator
                                color="#FFFFFF"
                                size="small"
                              />
                            ) : (
                              <Text style={styles.buttonText}>
                                Approve Order
                              </Text>
                            )}
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.orderRejectButton,
                              (processingOrderId !== null || loadingOrders) &&
                                styles.disabledButton,
                            ]}
                            onPress={() =>
                              handleOrderDecision(order, "rejected")
                            }
                            disabled={
                              processingOrderId !== null || loadingOrders
                            }
                            activeOpacity={0.8}
                          >
                            <Text style={styles.buttonText}>Reject</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.orderCompletedNotice}>
                          <Text style={styles.orderCompletedText}>
                            ✓ Your decision has been saved.
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}

              <Text style={styles.note}>
                The checkout total may include products from other sellers.
                The status displayed at the top represents your decision
                for this seller&apos;s order.
              </Text>
            </View>
          </>
        )}

        {activeSection === "returns" && (
          <>
            <View style={styles.sectionIntro}>
              <Text style={styles.sectionHeading}>Returned Products</Text>
              <Text style={styles.description}>
                Review customer return requests and approve or reject pending
                requests.
              </Text>
            </View>

            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.cardTitle}>Return Requests</Text>
                <TouchableOpacity
                  onPress={loadSellerOrders}
                  disabled={loadingOrders || processingOrderId !== null}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh return requests"
                >
                  <Text style={styles.refreshText}>
                    {loadingOrders ? "Loading..." : "Refresh"}
                  </Text>
                </TouchableOpacity>
              </View>

              {loadingOrders ? (
                <View style={styles.emptyState}>
                  <ActivityIndicator size="large" color="#245B43" />
                  <Text style={styles.description}>
                    Loading return requests...
                  </Text>
                </View>
              ) : orderError ? (
                <View style={styles.emptyState}>
                  <Text style={styles.errorText}>{orderError}</Text>
                  <TouchableOpacity
                    style={styles.retryButton}
                    onPress={loadSellerOrders}
                  >
                    <Text style={styles.refreshText}>Try Again</Text>
                  </TouchableOpacity>
                </View>
              ) : returnRequests.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>↩</Text>
                  <Text style={styles.emptyTitle}>No return requests</Text>
                  <Text style={styles.description}>
                    Customer return requests will appear here.
                  </Text>
                </View>
              ) : (
                returnRequests.map(({ order, ...item }) => (
                  <View
                    key={item.returnRequest.id}
                    style={styles.returnRequestCard}
                  >
                    <View style={styles.orderCardHeader}>
                      <View style={styles.orderHeadingInfo}>
                        <Text style={styles.orderProductName}>
                          {item.productName || "Product"}
                        </Text>
                        <Text style={styles.orderDate}>
                          Order #{order.id} · {order.customerName || "Customer"}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.returnStatus,
                          item.returnRequest.status === "requested"
                            ? styles.returnStatusPending
                            : styles.returnStatusResolved,
                        ]}
                      >
                        {item.returnRequest.status}
                      </Text>
                    </View>
                    {item.variantDetails ? (
                      <Text style={styles.orderDetail}>
                        {item.variantDetails}
                      </Text>
                    ) : null}
                    <Text style={styles.orderDetail}>
                      Quantity: {item.quantity ?? 0}
                    </Text>
                    <Text style={styles.orderDetail}>
                      Reason: {item.returnRequest.reason}
                      {item.returnRequest.details
                        ? ` — ${item.returnRequest.details}`
                        : ""}
                    </Text>
                    {item.returnRequest.status === "requested" ? (
                      <View style={styles.orderActionRow}>
                        <TouchableOpacity
                          style={styles.orderApproveButton}
                          onPress={() =>
                            handleReturnDecision(
                              item.returnRequest,
                              "approved"
                            )
                          }
                        >
                          <Text style={styles.buttonText}>Approve Return</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.orderRejectButton}
                          onPress={() =>
                            handleReturnDecision(
                              item.returnRequest,
                              "rejected"
                            )
                          }
                        >
                          <Text style={styles.buttonText}>Reject Return</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          </>
        )}

        {activeSection === "reviews" && (
          <>
            <View style={styles.sectionIntro}>
              <Text style={styles.sectionHeading}>Customer Reviews</Text>
              <Text style={styles.description}>
                Feedback customers have left for your products.
              </Text>
            </View>

            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.cardTitle}>Product Feedback</Text>
                <TouchableOpacity
                  onPress={loadSellerReviews}
                  disabled={loadingReviews}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh customer reviews"
                >
                  <Text style={styles.refreshText}>
                    {loadingReviews ? "Loading..." : "Refresh"}
                  </Text>
                </TouchableOpacity>
              </View>

              {loadingReviews ? (
                <View style={styles.emptyState}>
                  <ActivityIndicator size="large" color="#245B43" />
                  <Text style={styles.description}>
                    Loading customer reviews...
                  </Text>
                </View>
              ) : reviewError ? (
                <View style={styles.emptyState}>
                  <Text style={styles.errorText}>{reviewError}</Text>
                  <TouchableOpacity
                    style={styles.retryButton}
                    onPress={loadSellerReviews}
                    accessibilityRole="button"
                  >
                    <Text style={styles.refreshText}>Try Again</Text>
                  </TouchableOpacity>
                </View>
              ) : reviews.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>★</Text>
                  <Text style={styles.emptyTitle}>No reviews yet</Text>
                  <Text style={styles.description}>
                    Reviews for your products will appear here after customers
                    confirm delivery and submit feedback.
                  </Text>
                </View>
              ) : (
                reviews.map((review) => (
                  <View key={review.id} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <View style={styles.orderHeadingInfo}>
                        <Text style={styles.reviewProductName}>
                          {review.productName || "Product"}
                        </Text>
                        <Text style={styles.orderDate}>
                          Order #{review.orderId} · {formatDate(review.createdAt)}
                        </Text>
                      </View>
                      <Text
                        style={styles.reviewRating}
                        accessibilityLabel={`${review.rating} out of 5 stars`}
                      >
                        {"★".repeat(
                          Math.max(0, Math.min(5, Number(review.rating) || 0))
                        )}
                        <Text style={styles.reviewRatingMuted}>
                          {"★".repeat(
                            5 -
                              Math.max(
                                0,
                                Math.min(5, Number(review.rating) || 0)
                              )
                          )}
                        </Text>
                      </Text>
                    </View>
                    <Text style={styles.reviewCustomer}>
                      Reviewed by {review.customerName || "Customer"}
                    </Text>
                    {review.comment ? (
                      <Text style={styles.reviewComment}>{review.comment}</Text>
                    ) : (
                      <Text style={styles.note}>No written comment.</Text>
                    )}
                  </View>
                ))
              )}
            </View>
          </>
        )}

      </ScrollView>

      <Modal
        visible={categoryPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setCategoryPickerVisible(false);
          setCategorySearch("");
        }}
      >
        <Pressable
          style={styles.categoryModalBackdrop}
          onPress={() => {
            setCategoryPickerVisible(false);
            setCategorySearch("");
          }}
        >
          <Pressable
            style={styles.categoryModal}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.categoryModalHeader}>
              <View>
                <Text style={styles.categoryModalTitle}>Choose category</Text>
                <Text style={styles.categoryModalSubtitle}>
                  Search or select a product category.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setCategoryPickerVisible(false);
                  setCategorySearch("");
                }}
                accessibilityRole="button"
                accessibilityLabel="Close category picker"
                hitSlop={10}
              >
                <Text style={styles.categoryModalClose}>×</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.categorySearchInput}
              placeholder="Search categories"
              placeholderTextColor="#899389"
              value={categorySearch}
              onChangeText={setCategorySearch}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Search categories"
            />

            <ScrollView
              style={styles.categoryOptions}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              {filteredCategories.length === 0 ? (
                <Text style={styles.categoryEmptyText}>
                  No matching categories.
                </Text>
              ) : (
                filteredCategories.map((category) => {
                  const isSelected =
                    Number(selectedCategory) === Number(category.id);

                  return (
                    <TouchableOpacity
                      key={category.id}
                      style={[
                        styles.categoryOption,
                        isSelected && styles.categoryOptionSelected,
                      ]}
                      onPress={() => {
                        setSelectedCategory(category.id);
                        setCategoryPickerVisible(false);
                        setCategorySearch("");
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Text
                        style={[
                          styles.categoryOptionText,
                          isSelected && styles.categoryOptionTextSelected,
                        ]}
                      >
                        {category.name}
                      </Text>
                      {isSelected ? (
                        <Text style={styles.categoryCheck}>✓</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F5F7F2",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  content: {
    padding: 20,
    paddingBottom: 36,
    gap: 16,
  },
  dashboardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logo: {
    width: 48,
    height: 48,
  },
  brand: {
    color: "#245B43",
    fontSize: 18,
    fontWeight: "700",
  },
  heading: {
    color: "#183D2D",
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    color: "#52645A",
    fontSize: 16,
  },
  welcomeText: {
    color: "#183D2D",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 8,
  },
  description: {
    color: "#52645A",
    fontSize: 14,
    lineHeight: 21,
  },

  // Equal-sized square dashboard cards
  dashboardCards: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
    marginTop: 4,
  },
  navigationCard: {
    width: "48%",
    aspectRatio: 1,
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: 16,
    padding: 12,
    gap: 7,
    borderWidth: 1,
    overflow: "hidden",
  },
  addProductCard: {
    backgroundColor: "#E8F0E9",
    borderColor: "#C7D9CB",
  },
  myOrdersCard: {
    backgroundColor: "#FBEEDC",
    borderColor: "#EBD4B1",
  },
  reviewsCard: {
    backgroundColor: "#F7EEF8",
    borderColor: "#E4D2E8",
  },
  returnsCard: {
    backgroundColor: "#FFF1E9",
    borderColor: "#F0D2C1",
  },
  deliveryOriginCard: {
    backgroundColor: "#E9EEF9",
    borderColor: "#CCD8EF",
  },
  navigationBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: "#B42318",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  navigationBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  navigationIcon: {
    fontSize: 23,
    color: "#245B43",
    fontWeight: "700",
  },
  navigationTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#183D2D",
  },
  navigationDescription: {
    fontSize: 11,
    lineHeight: 15,
    color: "#52645A",
  },
  navigationLink: {
    fontSize: 11,
    fontWeight: "800",
    color: "#245B43",
    marginTop: "auto",
  },
  dashboardNote: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E0E8E0",
    borderRadius: 12,
    padding: 16,
    gap: 7,
  },
  dashboardNoteTitle: {
    color: "#183D2D",
    fontSize: 15,
    fontWeight: "800",
  },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 9,
    backgroundColor: "#E8F0E9",
    marginTop: 4,
  },
  backButtonText: {
    color: "#245B43",
    fontWeight: "800",
    fontSize: 14,
  },
  sectionIntro: {
    gap: 7,
    marginTop: 4,
  },
  sectionHeading: {
    color: "#183D2D",
    fontSize: 23,
    fontWeight: "800",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#E0E8E0",
  },
  cardTitle: {
    color: "#183D2D",
    fontSize: 19,
    fontWeight: "800",
    flexShrink: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  label: {
    color: "#183D2D",
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D4DED5",
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: "#183D2D",
  },
  multilineInput: {
    minHeight: 90,
  },
  imagePickerButton: {
    backgroundColor: "#E8F0E9",
    borderWidth: 1,
    borderColor: "#B8C9BC",
    borderRadius: 9,
    padding: 13,
    alignItems: "center",
  },
  imagePickerText: {
    color: "#245B43",
    fontWeight: "700",
  },
  imagePreviewContainer: {
    alignItems: "flex-start",
    gap: 8,
  },
  imagePreview: {
    width: "100%",
    height: 190,
    borderRadius: 10,
    backgroundColor: "#E8EDE8",
  },
  removeImageText: {
    color: "#B42318",
    fontWeight: "600",
  },
  variationToggle: {
    borderWidth: 1,
    borderColor: "#B8C9BC",
    borderRadius: 10,
    backgroundColor: "#F5F8F3",
    padding: 13,
  },
  variationToggleText: {
    color: "#245B43",
    fontSize: 14,
    fontWeight: "700",
  },
  variationEditor: {
    gap: 12,
  },
  variationRow: {
    borderWidth: 1,
    borderColor: "#D4DED5",
    borderRadius: 12,
    padding: 12,
    gap: 10,
    backgroundColor: "#F8FAF7",
  },
  variationHeading: {
    color: "#183D2D",
    fontSize: 14,
    fontWeight: "800",
  },
  addVariationButton: {
    alignItems: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#86A08C",
    borderRadius: 10,
    padding: 12,
  },
  addVariationText: {
    color: "#245B43",
    fontWeight: "700",
  },
  categoryPickerButton: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#B8C9BC",
    backgroundColor: "#FFFFFF",
  },
  categoryPickerText: {
    color: "#183D2D",
    fontSize: 15,
    fontWeight: "600",
  },
  categoryPlaceholder: {
    color: "#899389",
    fontWeight: "400",
  },
  categoryPickerChevron: {
    color: "#245B43",
    fontSize: 22,
    lineHeight: 22,
  },
  categoryModalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(0, 0, 0, 0.42)",
  },
  categoryModal: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "80%",
    alignSelf: "center",
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
  },
  categoryModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  categoryModalTitle: {
    color: "#214D39",
    fontSize: 19,
    fontWeight: "800",
  },
  categoryModalSubtitle: {
    color: "#758173",
    fontSize: 12,
    marginTop: 4,
  },
  categoryModalClose: {
    color: "#54745B",
    fontSize: 28,
    lineHeight: 30,
    paddingHorizontal: 4,
  },
  categorySearchInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#D9E0DA",
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    color: "#183D2D",
    fontSize: 14,
  },
  categoryOptions: {
    flexShrink: 1,
  },
  categoryOption: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF1EC",
  },
  categoryOptionSelected: {
    backgroundColor: "#F0F6F1",
  },
  categoryOptionText: {
    color: "#344A39",
    fontSize: 14,
  },
  categoryOptionTextSelected: {
    color: "#245B43",
    fontWeight: "700",
  },
  categoryCheck: {
    color: "#245B43",
    fontSize: 17,
    fontWeight: "800",
  },
  categoryEmptyText: {
    color: "#758173",
    textAlign: "center",
    paddingVertical: 22,
  },
  primaryButton: {
    backgroundColor: "#245B43",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  disabledButton: {
    opacity: 0.6,
  },
  loadingButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  productItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E8E0",
    gap: 6,
  },
  productImage: {
    width: "100%",
    height: 180,
    borderRadius: 10,
    backgroundColor: "#E8EDE8",
    marginBottom: 6,
  },
  noImagePlaceholder: {
    width: "100%",
    height: 100,
    borderRadius: 10,
    backgroundColor: "#F0F3EF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  noImageText: {
    color: "#7A887F",
    fontSize: 13,
  },
  productName: {
    color: "#183D2D",
    fontSize: 16,
    fontWeight: "700",
  },
  productDetail: {
    color: "#52645A",
    fontSize: 14,
    lineHeight: 20,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusText: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  approvedStatus: {
    color: "#16803C",
  },
  pendingStatus: {
    color: "#A15C00",
  },
  rejectedStatus: {
    color: "#B42318",
  },
  refreshText: {
    color: "#245B43",
    fontWeight: "800",
  },
  retryButton: {
    alignSelf: "flex-start",
    paddingVertical: 8,
  },
  errorText: {
    color: "#B42318",
    fontSize: 14,
    lineHeight: 20,
  },
  note: {
    color: "#7A887F",
    fontSize: 12,
    lineHeight: 18,
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyIcon: {
    color: "#245B43",
    fontSize: 34,
  },
  emptyTitle: {
    color: "#183D2D",
    fontSize: 17,
    fontWeight: "800",
  },
  reviewCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE6DE",
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    gap: 8,
  },
  reviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  reviewProductName: {
    color: "#183D2D",
    fontSize: 16,
    fontWeight: "800",
  },
  reviewRating: {
    color: "#D6951E",
    fontSize: 18,
    letterSpacing: 1,
  },
  reviewRatingMuted: {
    color: "#D8DED8",
  },
  reviewCustomer: {
    color: "#52645A",
    fontSize: 13,
    fontWeight: "700",
  },
  reviewComment: {
    color: "#30463A",
    fontSize: 14,
    lineHeight: 21,
  },

  // My Orders cards
  orderCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE6DE",
    borderRadius: 16,
    padding: 15,
    marginTop: 14,
    gap: 10,
    shadowColor: "#183D2D",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  orderCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  orderHeadingInfo: {
    flex: 1,
    gap: 5,
  },
  orderNumber: {
    color: "#183D2D",
    fontSize: 19,
    fontWeight: "800",
  },
  orderDate: {
    color: "#7A887F",
    fontSize: 12,
  },
  orderStatusBadge: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
    alignItems: "center",
  },
  orderStatusPending: {
    backgroundColor: "#FFF1D6",
  },
  orderStatusConfirmed: {
    backgroundColor: "#DDF4E4",
  },
  orderStatusRejected: {
    backgroundColor: "#FCE5E5",
  },
  orderStatusText: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  orderStatusTextPending: {
    color: "#A15C00",
  },
  orderStatusTextConfirmed: {
    color: "#16803C",
  },
  orderStatusTextRejected: {
    color: "#B42318",
  },
  orderDivider: {
    height: 1,
    backgroundColor: "#E8EDE8",
    marginVertical: 3,
  },
  orderSectionLabel: {
    color: "#7A887F",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  orderDetail: {
    color: "#52645A",
    fontSize: 13,
    lineHeight: 19,
  },
  orderProductCard: {
    backgroundColor: "#F5F7F2",
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  orderProductName: {
    color: "#183D2D",
    fontSize: 14,
    fontWeight: "800",
  },
  orderProductRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  orderProductPrice: {
    color: "#245B43",
    fontSize: 14,
    fontWeight: "800",
  },
  orderTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  orderTotalInfo: {
    flex: 1,
    gap: 3,
  },
  orderTotalLabel: {
    color: "#183D2D",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 5,
  },
  orderTotal: {
    color: "#245B43",
    fontSize: 20,
    fontWeight: "800",
    flexShrink: 0,
  },
  orderOverallStatus: {
    color: "#7A887F",
    fontSize: 12,
    marginTop: 2,
  },
  messageCustomerButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#245B43",
    borderRadius: 9,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  messageCustomerText: {
    color: "#245B43",
    fontSize: 12,
    fontWeight: "800",
  },
  shipmentForm: {
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: "#E8EDE8",
    paddingTop: 12,
  },
  returnRequestBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 9,
    backgroundColor: "#FFF8E8",
    gap: 8,
  },
  returnRequestCard: {
    backgroundColor: "#FFF8E8",
    borderWidth: 1,
    borderColor: "#F1DFC0",
    borderRadius: 12,
    padding: 13,
    marginTop: 12,
    gap: 8,
  },
  returnStatus: {
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  returnStatusPending: {
    backgroundColor: "#FCE8C7",
    color: "#8A4B08",
  },
  returnStatusResolved: {
    backgroundColor: "#DDF4E4",
    color: "#16803C",
  },
  orderActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 5,
  },
  orderApproveButton: {
    flex: 1,
    minHeight: 45,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 9,
    backgroundColor: "#245B43",
    alignItems: "center",
    justifyContent: "center",
  },
  orderRejectButton: {
    minWidth: 85,
    minHeight: 45,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 9,
    backgroundColor: "#A83232",
    alignItems: "center",
    justifyContent: "center",
  },
  orderCompletedNotice: {
    padding: 12,
    borderRadius: 9,
    backgroundColor: "#E8F0E9",
    marginTop: 4,
  },
  orderCompletedText: {
    color: "#245B43",
    fontSize: 13,
    fontWeight: "700",
  },
});
