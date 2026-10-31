
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
