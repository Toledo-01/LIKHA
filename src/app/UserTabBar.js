
import { router, usePathname } from "expo-router";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useCart } from "../context/CartContext";

const tabs = [
  { name: "Home", icon: "⌂", route: "/" },
  { name: "Explore", icon: "⌕", route: "/explore" },
  { name: "Cart", icon: "🛍️", route: "/cart" },
  { name: "Favorites", icon: "♡", route: "/favorites" },
  { name: "Profile", icon: "♙", route: "/profile" },
];

export default function UserTabBar() {
  const pathname = usePathname();
  const { cartCount } = useCart();

  return (
    <View style={styles.bottomNav}>
      {tabs.map((tab) => {
        const active =
          tab.route === "/"
            ? pathname === "/"
            : pathname === tab.route;

        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.navItem}
            onPress={() => router.replace(tab.route)}
            accessibilityRole="button"
            accessibilityLabel={tab.name}
            accessibilityState={{ selected: active }}
          >
            <View style={styles.iconContainer}>
              <Text
                style={[
                  styles.navIcon,
                  active && styles.navActive,
                ]}
              >
                {tab.icon}
              </Text>

              {tab.name === "Cart" && cartCount > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>
                    {cartCount > 99 ? "99+" : cartCount}
                  </Text>
                </View>
              )}
            </View>

            <Text
              style={[
                styles.navLabel,
                active && styles.navActive,
              ]}
            >
              {tab.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    minHeight: 64,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#EAEAE2",
    paddingTop: 8,
    paddingBottom: 8,
    zIndex: 100,
    elevation: 10,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  iconContainer: {
    position: "relative",
  },
  navIcon: {
    fontSize: 22,
    color: "#9AA398",
  },
  navLabel: {
    fontSize: 10,
    color: "#9AA398",
    fontWeight: "600",
  },
  navActive: {
    color: "#245B43",
    fontWeight: "900",
  },
  cartBadge: {
    position: "absolute",
    top: -5,
    right: -12,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 3,
    backgroundColor: "#D66A4A",
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
});
