import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "../context/AuthContext";

export default function AccountMenu() {
  const { user, logout } = useAuth();
  const [visible, setVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  function closeMenu() {
    setVisible(false);
  }

  function navigateTo(path) {
    closeMenu();
    router.push(path);
  }

  async function performLogout() {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await logout();
      closeMenu();
      router.replace("/login");
    } catch (error) {
      console.error("Logout failed:", error);
      const message = error.message || "Unable to log out. Please try again.";
      if (Platform.OS === "web") {
        window.alert(`Logout failed\n\n${message}`);
      } else {
        Alert.alert("Logout failed", message);
      }
    } finally {
      setLoggingOut(false);
    }
  }

  function confirmLogout() {
    if (loggingOut) return;

    if (Platform.OS === "web") {
      if (window.confirm("Are you sure you want to log out of LikhaLocal?")) {
        performLogout();
      }
      return;
    }

    Alert.alert("Log out", "Are you sure you want to log out of LikhaLocal?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: performLogout,
      },
    ]);
  }

  if (!user) return null;

  return (
    <>
      <TouchableOpacity
        style={styles.menuButton}
        onPress={() => setVisible(true)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Open account menu"
        accessibilityHint="Profile, activity log, and log out"
      >
        <Text style={styles.menuIcon}>☰</Text>
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <Pressable style={styles.backdrop} onPress={closeMenu}>
          <Pressable
            style={styles.drawer}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.drawerHeader}>
              <View style={styles.userInfo}>
                <Text style={styles.userName} numberOfLines={1}>
                  {user.full_name || user.name || "Your account"}
                </Text>
                <Text style={styles.userRole}>
                  {String(user.role || "customer").toUpperCase()}
                </Text>
              </View>
              <TouchableOpacity
                onPress={closeMenu}
                accessibilityRole="button"
                accessibilityLabel="Close account menu"
                hitSlop={10}
              >
                <Text style={styles.closeIcon}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigateTo("/profile")}
              accessibilityRole="button"
            >
              <Text style={styles.menuItemIcon}>♙</Text>
              <Text style={styles.menuItemLabel}>Profile</Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigateTo("/activity-log")}
              accessibilityRole="button"
            >
              <Text style={styles.menuItemIcon}>◷</Text>
              <Text style={styles.menuItemLabel}>Activity Log</Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={[styles.menuItem, styles.logoutItem]}
              onPress={confirmLogout}
              disabled={loggingOut}
              accessibilityRole="button"
            >
              {loggingOut ? (
                <ActivityIndicator color="#A33C2D" />
              ) : (
                <>
                  <Text style={[styles.menuItemIcon, styles.logoutText]}>
                    ↪
                  </Text>
                  <Text style={[styles.menuItemLabel, styles.logoutText]}>
                    Log Out
                  </Text>
                  <Text style={styles.chevron}>›</Text>
                </>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#F0F0E8",
    alignItems: "center",
    justifyContent: "center",
  },
  menuIcon: {
    color: "#245B43",
    fontSize: 22,
    fontWeight: "700",
  },
  backdrop: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  drawer: {
    width: "82%",
    maxWidth: 360,
    height: "100%",
    paddingTop: 56,
    paddingHorizontal: 20,
    backgroundColor: "#FAF9F5",
    elevation: 18,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 52,
  },
  userInfo: {
    flex: 1,
    paddingRight: 12,
  },
  userName: {
    color: "#214D39",
    fontSize: 17,
    fontWeight: "800",
  },
  userRole: {
    color: "#78907B",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 4,
  },
  closeIcon: {
    color: "#54745B",
    fontSize: 30,
    lineHeight: 34,
    paddingHorizontal: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "#E6E9E0",
    marginVertical: 14,
  },
  menuItem: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  menuItemIcon: {
    width: 34,
    color: "#426B50",
    fontSize: 21,
  },
  menuItemLabel: {
    flex: 1,
    color: "#2C4031",
    fontSize: 15,
    fontWeight: "600",
  },
  chevron: {
    color: "#899389",
    fontSize: 26,
  },
  logoutItem: {
    backgroundColor: "#FFF0ED",
  },
  logoutText: {
    color: "#A33C2D",
  },
});
