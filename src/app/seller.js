
import { useCallback, useEffect, useState } from "react";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
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

import {
  fetchCategories,
  fetchSellerProducts,
  createSellerProduct,
  fetchSellerOrders,
  decideSellerOrder,
  fetchSellerDeliveryOrigin,
  saveSellerDeliveryOrigin,
} from "../services/api";

const API_BASE_URL = "http://192.168.100.93:3000";

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
  const { user, isLoading, logout } = useAuth();

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);

  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [savingProduct, setSavingProduct] = useState(false);
  const [processingOrderId, setProcessingOrderId] = useState(null);

  const [pageError, setPageError] = useState("");
  const [orderError, setOrderError] = useState("");
  const [formError, setFormError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [activeSection, setActiveSection] = useState("home");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);

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

  const loadSellerOrders = useCallback(async () => {
    setLoadingOrders(true);
    setOrderError("");

    try {
      const orderData = await fetchSellerOrders();
      setOrders(orderData || []);
    } catch (error) {
      setOrderError(error.message || "Unable to load your orders.");
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  const refreshSellerDashboard = useCallback(async () => {
    await Promise.all([loadSellerData(), loadSellerOrders()]);
  }, [loadSellerData, loadSellerOrders]);

  useEffect(() => {
    if (!isLoading && user?.role === "seller") {
      refreshSellerDashboard();
    }
  }, [isLoading, user, refreshSellerDashboard]);

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
    const parsedStock = Number(stock);

    if (!trimmedName) {
      setFormError("Please enter a product name.");
      return;
    }

    if (!price.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setFormError("Price must be a number greater than zero.");
      return;
    }

    if (
      !stock.trim() ||
      !Number.isInteger(parsedStock) ||
      parsedStock < 0
    ) {
      setFormError("Stock must be a whole number of zero or more.");
      return;
    }

    if (categories.length > 0 && selectedCategory === null) {
      setFormError("Please select a category.");
      return;
    }

    let imageExtension = null;

    if (selectedImage?.uri) {
      const uriPath = selectedImage.uri.split("?")[0].split("#")[0];
      const extension = uriPath.split(".").pop()?.toLowerCase();
      const allowedExtensions = ["jpg", "jpeg", "png", "webp"];

      if (!allowedExtensions.includes(extension)) {
        setFormError("Please select a JPEG, PNG, or WebP image.");
        return;
      }

      if (
        selectedImage.fileSize &&
        selectedImage.fileSize > 5 * 1024 * 1024
      ) {
        setFormError("The product image must be 5 MB or smaller.");
        return;
      }

      imageExtension = extension;
    }

    setSavingProduct(true);

    try {
      const formData = new FormData();

      formData.append("name", trimmedName);
      formData.append("description", trimmedDescription);
      formData.append("price", String(parsedPrice));
      formData.append("stock", String(parsedStock));

      if (selectedCategory !== null) {
        formData.append("category_id", String(selectedCategory));
      }

      if (selectedImage?.uri && imageExtension) {
        const imageFile = new File(selectedImage.uri);
        formData.append("image", imageFile);
      }

      await createSellerProduct(formData);

      setName("");
      setDescription("");
      setPrice("");
      setStock("");
      setSelectedCategory(null);
      setSelectedImage(null);
      setFormError("");

      await loadSellerData();

      showMessage(
        "Product submitted successfully!",
        "Your product has been saved and submitted for admin approval. You can view it in My Products."
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

  async function handleLogout() {
    await logout();
    router.replace("/login");
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>LikhaLocal</Text>
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
                <View style={styles.iconCircle}>
                  <Text style={styles.navigationIcon}>▤</Text>
                </View>
                <Text style={styles.navigationTitle}>My Orders</Text>
                <Text
                  style={styles.navigationDescription}
                  numberOfLines={3}
                >
                  Review orders and manage customer requests.
                </Text>
                <Text style={styles.navigationLink}>View →</Text>
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
                  Set your shop's delivery location.
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
                  <Text style={styles.label}>Seller's Barangay *</Text>
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

              <Text style={styles.label}>Price (₱) *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 150.00"
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                editable={!savingProduct}
              />

              <Text style={styles.label}>Stock quantity *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 20"
                value={stock}
                onChangeText={setStock}
                keyboardType="number-pad"
                editable={!savingProduct}
              />

              <Text style={styles.label}>Category *</Text>

              {loadingProducts ? (
                <ActivityIndicator size="small" color="#245B43" />
              ) : categories.length === 0 ? (
                <Text style={styles.note}>
                  No categories available. Check that categories loaded
                  successfully.
                </Text>
              ) : (
                <View style={styles.categoryContainer}>
                  {categories.map((category) => (
                    <TouchableOpacity
                      key={category.id}
                      style={[
                        styles.categoryButton,
                        Number(selectedCategory) === Number(category.id) &&
                          styles.selectedCategoryButton,
                      ]}
                      onPress={() => setSelectedCategory(category.id)}
                      disabled={savingProduct}
                    >
                      <Text
                        style={[
                          styles.categoryText,
                          Number(selectedCategory) === Number(category.id) &&
                            styles.selectedCategoryText,
                        ]}
                      >
                        {category.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
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
                        Stock: {product.stock}
                      </Text>

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
                for this seller's order.
              </Text>
            </View>
          </>
        )}

        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => router.push("/profile")}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>My Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
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
  deliveryOriginCard: {
    backgroundColor: "#E9EEF9",
    borderColor: "#CCD8EF",
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
  categoryContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryButton: {
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#B8C9BC",
    backgroundColor: "#FFFFFF",
  },
  selectedCategoryButton: {
    backgroundColor: "#245B43",
    borderColor: "#245B43",
  },
  categoryText: {
    color: "#245B43",
    fontWeight: "600",
  },
  selectedCategoryText: {
    color: "#FFFFFF",
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
  profileButton: {
    backgroundColor: "#245B43",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 4,
  },
  logoutButton: {
    backgroundColor: "#8B3A3A",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
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
