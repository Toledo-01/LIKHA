
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";

import { CartProvider } from "../context/CartContext";
import { AuthProvider } from "../context/AuthContext";
import UserTabBar from "./UserTabBar";

const tabRoutes = [
  "/",
  "/explore",
  "/cart",
  "/favorites",
  "/profile",
];

export default function RootLayout() {
  const pathname = usePathname();
  const showTabBar = tabRoutes.includes(pathname);

  return (
    <AuthProvider>
      <CartProvider>
        <View style={{ flex: 1 }}>
          <StatusBar style="dark" />

          <Stack
            screenOptions={{
              headerShown: false,
            }}
          />

          {showTabBar && <UserTabBar />}
        </View>
      </CartProvider>
    </AuthProvider>
  );
}
