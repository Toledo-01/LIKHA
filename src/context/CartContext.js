import { createContext, useContext, useState } from "react";

const CartContext = createContext(null);

function getCartItemKey(item) {
  return String(
    item.cartKey ?? `${item.id}:${item.variantId ?? "base"}`
  );
}

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState([]);
  const [buyNowItem, setBuyNowItem] = useState(null);

  const addToCart = (product) => {
    if (Number(product.stock) <= 0) {
      return;
    }

    const cartKey = getCartItemKey(product);

    setCartItems((currentItems) => {
      const existingItem = currentItems.find(
        (item) => getCartItemKey(item) === cartKey
      );

      if (existingItem) {
        return currentItems.map((item) =>
          getCartItemKey(item) === cartKey
            ? {
                ...item,
                quantity: Math.min(
                  Number.isFinite(Number(item.stock))
                    ? Number(item.stock)
                    : Number.MAX_SAFE_INTEGER,
                  item.quantity + 1
                ),
              }
            : item
        );
      }

      return [...currentItems, { ...product, cartKey, quantity: 1 }];
    });
  };

  const updateQuantity = (cartKey, quantity) => {
    if (quantity <= 0) {
      removeFromCart(cartKey);
      return;
    }

    setCartItems((currentItems) =>
      currentItems.map((item) =>
        getCartItemKey(item) === String(cartKey)
          ? {
              ...item,
              quantity:
                Number.isFinite(Number(item.stock)) && Number(item.stock) > 0
                  ? Math.min(Number(item.stock), quantity)
                  : item.quantity,
            }
          : item
      )
    );
  };

  const removeFromCart = (cartKey) => {
    setCartItems((currentItems) =>
      currentItems.filter(
        (item) => getCartItemKey(item) !== String(cartKey)
      )
    );
  };

  const clearCart = () => {
    setCartItems([]);
  };

  const clearBuyNowItem = () => {
    setBuyNowItem(null);
  };

  const cartCount = cartItems.reduce(
    (total, item) => total + item.quantity,
    0
  );

  const cartTotal = cartItems.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        buyNowItem,
        setBuyNowItem,
        clearBuyNowItem,
        updateQuantity,
        removeFromCart,
        clearCart,
        cartCount,
        cartTotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside a CartProvider");
  }

  return context;
}