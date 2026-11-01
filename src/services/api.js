
import { getToken } from "./auth";
import { fetch as expoFetch } from "expo/fetch";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://likhalocal-api.onrender.com";
  
// =========================
// PUBLIC PRODUCT API
// =========================

// Fetch approved products
export async function fetchProducts() {
  const response = await fetch(`${API_BASE_URL}/api/products`);

  if (!response.ok) {
    throw new Error("Failed to fetch products.");
  }

  const data = await response.json();
  return data.products;
}

// Fetch product categories
export async function fetchCategories() {
  const response = await fetch(`${API_BASE_URL}/api/categories`);

  if (!response.ok) {
    throw new Error("Failed to fetch categories.");
  }

  const data = await response.json();
  return data.categories;
}

export async function createAdminCategory(name) {
  const token = await getToken();

  if (!token) {
    throw new Error("Please log in first.");
  }

  const response = await fetch(`${API_BASE_URL}/api/admin/categories`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `******`,
    },
    body: JSON.stringify({ name }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.success || !data.category) {
    throw new Error(data.message || "Unable to create the category.");
  }

  return data.category;
}

// =========================
// SHARED SELLER REQUEST
// =========================

async function sellerRequest(url, options = {}) {
  const token = await getToken();

  if (!token) {
    throw new Error("Please log in first.");
  }

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message || "Seller request failed."
    );
  }

  return data;
}

// =========================
// SELLER PRODUCT API
// =========================

// Fetch products belonging to the logged-in seller
export async function fetchSellerProducts() {
  const data = await sellerRequest("/api/seller/products");
  return data.products || [];
}

// Create a seller product
export async function createSellerProduct(product) {
  const token = await getToken();

  if (!token) {
    throw new Error("Please log in first.");
  }

  const isFormData =
    typeof FormData !== "undefined" &&
    product instanceof FormData;

  const headers = {
    Authorization: `Bearer ${token}`,
  };

  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  const request = isFormData ? expoFetch : fetch;
  const response = await request(
    `${API_BASE_URL}/api/seller/products`,
    {
      method: "POST",
      headers,
      body: isFormData ? product : JSON.stringify(product),
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message || "Failed to create seller product."
    );
  }

  return data;
}

// =========================
// SELLER ORDER API
// =========================


/* =========================
   SELLER DELIVERY ORIGIN API
========================= */

// Retrieve the logged-in seller's delivery origin.
export async function fetchSellerDeliveryOrigin() {
  const data = await sellerRequest("/api/seller/delivery-origin");
  return data.deliveryOrigin || {
    barangay: "",
    municipality: "",
  };
}

// Save the logged-in seller's delivery origin.
export async function saveSellerDeliveryOrigin(deliveryOrigin) {
  return sellerRequest("/api/seller/delivery-origin", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      barangay: deliveryOrigin.barangay,
      municipality: deliveryOrigin.municipality,
    }),
  });
}


// Fetch orders containing products owned by the logged-in seller
export async function fetchSellerOrders() {
  const data = await sellerRequest("/api/seller/orders");
  return data.orders || [];
}

// Fetch reviews for products owned by the logged-in seller.
export async function fetchSellerReviews() {
  const data = await sellerRequest("/api/seller/reviews");
  return data.reviews || [];
}

// Approve or reject the seller's portion of an order
// decision must be "confirmed" or "rejected"
export async function decideSellerOrder(orderId, decision) {
  if (!["confirmed", "rejected"].includes(decision)) {
    throw new Error(
      "Invalid order decision. Choose confirmed or rejected."
    );
  }

  if (!Number.isInteger(Number(orderId)) || Number(orderId) < 1) {
    throw new Error("Invalid order ID.");
  }

  return sellerRequest(
    `/api/seller/orders/${Number(orderId)}/decision`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ decision }),
    }
  );
}

// =========================
// CUSTOMER CHECKOUT API
// =========================

// Create a customer order and save it through the backend
export async function createCustomerOrder(order) {
  const token = await getToken();

  if (!token) {
    throw new Error(
      "Please log in before placing an order."
    );
  }

  const response = await fetch(`${API_BASE_URL}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(order),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.success) {
    throw new Error(
      data.message ||
        "Failed to place your order. Please try again."
    );
  }

  return data.order;
}

async function authenticatedOrderRequest(path, options = {}) {
  const token = await getToken();

  if (!token) {
    throw new Error("Please log in to view your orders.");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Unable to complete the order request.");
  }

  return data;
}

export async function fetchCustomerOrders() {
  const data = await authenticatedOrderRequest("/api/customer/orders");
  return data.orders || [];
}

export async function fetchOrderConversations() {
  const data = await authenticatedOrderRequest("/api/orders/conversations");
  return data.conversations || [];
}

export async function fetchOrderMessages(orderId, sellerId) {
  const query = new URLSearchParams({ sellerId: String(sellerId) });
  const data = await authenticatedOrderRequest(
    `/api/orders/${encodeURIComponent(orderId)}/messages?${query}`
  );
  return data.messages || [];
}

export async function sendOrderMessage(orderId, sellerId, message) {
  return authenticatedOrderRequest(
    `/api/orders/${encodeURIComponent(orderId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ sellerId, message }),
    }
  );
}

export async function markSellerOrderShipped(orderId, shipment) {
  return authenticatedOrderRequest(
    `/api/seller/orders/${encodeURIComponent(orderId)}/shipment`,
    {
      method: "PATCH",
      body: JSON.stringify(shipment),
    }
  );
}

export async function confirmOrderDelivery(orderId, sellerId) {
  return authenticatedOrderRequest(
    `/api/customer/orders/${encodeURIComponent(orderId)}/delivery`,
    {
      method: "PATCH",
      body: JSON.stringify({ sellerId }),
    }
  );
}

export async function submitProductReview(orderItemId, rating, comment) {
  return authenticatedOrderRequest("/api/customer/reviews", {
    method: "POST",
    body: JSON.stringify({ orderItemId, rating, comment }),
  });
}

export async function submitReturnRequest(orderItemId, reason, details) {
  return authenticatedOrderRequest("/api/customer/returns", {
    method: "POST",
    body: JSON.stringify({ orderItemId, reason, details }),
  });
}

export async function respondToReturnRequest(returnId, decision, response) {
  return authenticatedOrderRequest(
    `/api/seller/returns/${encodeURIComponent(returnId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ decision, response }),
    }
  );
}
