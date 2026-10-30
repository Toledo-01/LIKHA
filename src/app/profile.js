
import { useEffect, useState } from "react";
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
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useAuth } from "../context/AuthContext";

export default function ProfileScreen() {
  const {
    user,
    logout,
    updateProfile,
    updateProfilePicture,
    isLoading,
  } = useAuth();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  // Load the current user's information into the form.
  useEffect(() => {
    setFullName(user?.full_name || user?.fullName || user?.name || "");
    setPhone(user?.phone || "");
    setAddress(user?.address || "");
  }, [user]);

  // Support common user field names returned by the backend.
  const firstName = user?.first_name || user?.firstName || "";
  const lastName = user?.last_name || user?.lastName || "";

  const displayName =
    user?.name ||
    user?.full_name ||
    user?.fullName ||
    `${firstName} ${lastName}`.trim() ||
    user?.username ||
    "LikhaLocal Customer";

  const email = user?.email || "No email available";

  // Identify the signed-in user's role.
  const role = String(user?.role || "customer")
    .trim()
    .toLowerCase();

  // Role-specific profile content.
  const roleInfo = {
    customer: {
      badge: "💚 LOCAL SHOPPER",
      subtitle: "Shop local, discover local stories",
      messageTitle: "Shop local, share stories",
      messageDescription:
        "Every purchase supports Filipino makers and local businesses. Thank you for being part of LikhaLocal!",
    },
    seller: {
      badge: "🛍️ LOCAL SELLER",
      subtitle: "Manage your seller account",
      messageTitle: "Grow your local business",
      messageDescription:
        "Showcase your products, connect with customers, and share the stories behind your local business.",
    },
    admin: {
      badge: "🛡️ ADMINISTRATOR",
      subtitle: "Manage your LikhaLocal account",
      messageTitle: "Supporting the LikhaLocal community",
      messageDescription:
        "Help maintain a trusted marketplace for local sellers and customers.",
    },
    staff: {
      badge: "👥 STAFF MEMBER",
      subtitle: "Manage your staff account",
      messageTitle: "Supporting local businesses",
      messageDescription:
        "Help keep the LikhaLocal marketplace organized and running smoothly.",
    },
  };

  const currentRoleInfo = roleInfo[role] || roleInfo.customer;

  // Display a message on web or mobile.
  function showMessage(title, message) {
    if (Platform.OS === "web") {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  }

  // Choose and upload a new profile picture.
  async function handleChangePhoto() {
    if (isUploadingPhoto) return;

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        showMessage(
          "Permission required",
          "Please allow photo library access to choose a profile picture."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      setIsUploadingPhoto(true);
      setSaveError("");
      setSaveMessage("");

      await updateProfilePicture(result.assets[0]);

      setSaveMessage(
        "Your profile picture was updated successfully!"
      );
    } catch (error) {
      console.error("Profile picture upload failed:", error);

      setSaveError(
        error.message ||
          "Could not upload your profile picture. Please try again."
      );
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  // Save profile changes to the backend.
  async function handleSaveProfile() {
    if (isSaving) return;

    if (fullName.trim().length < 2) {
      setSaveError("Full name must be at least 2 characters.");
      setSaveMessage("");
      return;
    }

    if (fullName.trim().length > 120) {
      setSaveError("Full name must not exceed 120 characters.");
      setSaveMessage("");
      return;
    }

    if (
      phone.trim() &&
      !/^[0-9+\-\s()]{7,30}$/.test(phone.trim())
    ) {
      setSaveError("Please enter a valid phone number.");
      setSaveMessage("");
      return;
    }

    if (role === "customer" && address.trim().length > 255) {
      setSaveError("Address must not exceed 255 characters.");
      setSaveMessage("");
      return;
    }

    try {
      setIsSaving(true);
      setSaveError("");
      setSaveMessage("");

      const profileData = {
        full_name: fullName.trim(),
        phone: phone.trim(),
      };

      // Only customers need a delivery address.
      if (role === "customer") {
        profileData.address = address.trim();
      }

      await updateProfile(profileData);

      setSaveMessage(
        "Your profile was updated successfully!"
      );
    } catch (error) {
      console.error("Profile update failed:", error);

      setSaveError(
        error.message ||
          "Could not update your profile. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  // Clear the saved session and return to login.
  async function handleLogout() {
    if (isLoggingOut) return;

    try {
      setIsLoggingOut(true);

      await logout();

      router.replace("/login");
    } catch (error) {
      console.error("Logout failed:", error);

      showMessage(
        "Logout failed",
        "We couldn't log you out. Please try again."
      );
    } finally {
      setIsLoggingOut(false);
    }
  }

  // Confirm logout using the appropriate platform dialog.
  function confirmLogout() {
    if (isLoggingOut) return;

    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        "Are you sure you want to log out of LikhaLocal?"
      );

      if (confirmed) {
        handleLogout();
      }

      return;
    }

    Alert.alert(
      "Log out",
      "Are you sure you want to log out of LikhaLocal?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Log out",
          style: "destructive",
          onPress: handleLogout,
        },
      ]
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#245B43" />
          <Text style={styles.loadingText}>
            Loading your profile...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <Text style={styles.sectionTitle}>
            You're not logged in
          </Text>

          <Text style={styles.messageDescription}>
            Please log in to view and manage your profile.
          </Text>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => router.replace("/login")}
            activeOpacity={0.8}
          >
            <Text style={styles.logoutButtonText}>
              Go to Login
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
           onPress={() =>
              router.replace(
                user?.role === "staff"
                  ? "/staff"
                  : user?.role === "seller"
                    ? "/seller"
                    : "/"
              )
            }
            accessibilityRole="button"
            accessibilityLabel={
              user?.role === "staff" || user?.role === "seller"
                ? user?.role === "staff"
                  ? "Back to Staff Dashboard"
                  : "Back to Seller Dashboard"
                : "Go back to home"
            }
            activeOpacity={0.8}
          >
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>

          <Text style={styles.headerTitle}>My Profile</Text>

          <View style={styles.headerSpacer} />
        </View>

        {/* Profile introduction */}
        <View style={styles.profileHero}>
          {/* Profile picture */}
          <TouchableOpacity
            style={styles.avatar}
            onPress={handleChangePhoto}
            disabled={isUploadingPhoto}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Change profile picture"
          >
            {user?.profile_image ? (
              <Image
                source={{ uri: user.profile_image }}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.avatarText}>
                {(fullName || displayName)
                  .trim()
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            )}

            <View style={styles.cameraBadge}>
              <Text style={styles.cameraBadgeText}>📷</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.changePhotoButton}
            onPress={handleChangePhoto}
            disabled={isUploadingPhoto}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Add or change profile photo"
          >
            {isUploadingPhoto ? (
              <ActivityIndicator
                size="small"
                color="#245B43"
              />
            ) : (
              <Text style={styles.changePhotoText}>
                {user?.profile_image
                  ? "Change Photo"
                  : "Add Profile Photo"}
              </Text>
            )}
          </TouchableOpacity>

          <Text style={styles.profileName}>
            {fullName.trim() || displayName}
          </Text>

          <Text style={styles.profileSubtitle}>
            {currentRoleInfo.subtitle}
          </Text>

          <View style={styles.memberBadge}>
            <Text style={styles.memberBadgeText}>
              {currentRoleInfo.badge}
            </Text>
          </View>
        </View>

        {/* Editable account information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Account Information
          </Text>

          <View style={styles.infoCard}>
            {/* Full name */}
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Text style={styles.infoEmoji}>👤</Text>
              </View>

              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Full Name</Text>

                <TextInput
                  style={styles.profileInput}
                  value={fullName}
                  onChangeText={(value) => {
                    setFullName(value);
                    setSaveMessage("");
                    setSaveError("");
                  }}
                  placeholder="Enter your full name"
                  placeholderTextColor="#9AA096"
                  autoCapitalize="words"
                  autoCorrect={false}
                  maxLength={120}
                  editable={!isSaving}
                  accessibilityLabel="Full name"
                />
              </View>
            </View>

            <View style={styles.separator} />

            {/* Email address */}
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Text style={styles.infoEmoji}>✉️</Text>
              </View>

              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>
                  Email Address
                </Text>

                <Text style={styles.infoValue}>{email}</Text>

                <Text style={styles.readOnlyNote}>
                  Email address cannot be changed here.
                </Text>
              </View>
            </View>

            <View style={styles.separator} />

            {/* Phone number */}
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Text style={styles.infoEmoji}>📱</Text>
              </View>

              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>
                  Phone Number
                </Text>

                <TextInput
                  style={styles.profileInput}
                  value={phone}
                  onChangeText={(value) => {
                    setPhone(value);
                    setSaveMessage("");
                    setSaveError("");
                  }}
                  placeholder="Enter your phone number"
                  placeholderTextColor="#9AA096"
                  keyboardType="phone-pad"
                  maxLength={30}
                  editable={!isSaving}
                  accessibilityLabel="Phone number"
                />
              </View>
            </View>

            {/* Delivery address: customers only */}
            {role === "customer" && (
              <>
                <View style={styles.separator} />

                <View style={styles.infoRow}>
                  <View style={styles.infoIcon}>
                    <Text style={styles.infoEmoji}>📍</Text>
                  </View>

                  <View style={styles.infoContent}>
                    <Text style={styles.infoLabel}>
                      Delivery Address
                    </Text>

                    <TextInput
                      style={[
                        styles.profileInput,
                        styles.addressInput,
                      ]}
                      value={address}
                      onChangeText={(value) => {
                        setAddress(value);
                        setSaveMessage("");
                        setSaveError("");
                      }}
                      placeholder="Enter your delivery address"
                      placeholderTextColor="#9AA096"
                      multiline
                      textAlignVertical="top"
                      maxLength={255}
                      editable={!isSaving}
                      accessibilityLabel="Delivery address"
                    />
                  </View>
                </View>
              </>
            )}

            {/* Save status */}
            {!!saveError && (
              <Text style={styles.errorText}>
                {saveError}
              </Text>
            )}

            {!!saveMessage && (
              <Text style={styles.successText}>
                {saveMessage}
              </Text>
            )}

            {/* Save button */}
            <TouchableOpacity
              style={[
                styles.saveButton,
                isSaving && styles.buttonDisabled,
              ]}
              onPress={handleSaveProfile}
              disabled={isSaving}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Save profile changes"
            >
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>
                  Save Changes
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Role-specific About section */}
        <View style={styles.messageCard}>
          <Text style={styles.messageEmoji}>🧺</Text>

          <View style={styles.messageContent}>
            <Text style={styles.messageTitle}>
              {currentRoleInfo.messageTitle}
            </Text>

            <Text style={styles.messageDescription}>
              {currentRoleInfo.messageDescription}
            </Text>
          </View>
        </View>

        {/* Logout button */}
        <TouchableOpacity
          style={[
            styles.logoutButton,
            isLoggingOut && styles.logoutButtonDisabled,
          ]}
          onPress={confirmLogout}
          disabled={isLoggingOut}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Log out of LikhaLocal"
        >
          {isLoggingOut ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.logoutIcon}>↪</Text>
              <Text style={styles.logoutButtonText}>
                Log Out
              </Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.footerText}>
          LikhaLocal · Made with local love 🇵🇭
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FAF9F5",
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingBottom: 35,
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    fontSize: 13,
    color: "#647664",
    marginTop: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    paddingBottom: 25,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#E6EBDD",
    alignItems: "center",
    justifyContent: "center",
  },
  backIcon: {
    fontSize: 32,
    color: "#245B43",
    lineHeight: 36,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#214D39",
  },
  headerSpacer: {
    width: 42,
  },
  profileHero: {
    alignItems: "center",
    backgroundColor: "#E6EBDD",
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 30,
    marginBottom: 28,
  },
  avatar: {
    width: 94,
    height: 94,
    borderRadius: 47,
    backgroundColor: "#245B43",
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    overflow: "visible",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 47,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  cameraBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DCE5D8",
  },
  cameraBadgeText: {
    fontSize: 15,
  },
  changePhotoButton: {
    minHeight: 34,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  changePhotoText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#245B43",
  },
  profileName: {
    fontSize: 23,
    fontWeight: "900",
    color: "#214D39",
    textAlign: "center",
  },
  profileSubtitle: {
    fontSize: 12,
    color: "#647664",
    marginTop: 7,
    textAlign: "center",
  },
  memberBadge: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 8,
    marginTop: 16,
  },
  memberBadgeText: {
    fontSize: 10,
    color: "#245B43",
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  section: {
    marginBottom: 23,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#243E2D",
    marginBottom: 13,
  },
  infoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 19,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#EEEEE7",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 17,
  },
  infoIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: "#F0F0E8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
    marginTop: 2,
  },
  infoEmoji: {
    fontSize: 17,
  },
  infoContent: {
    flex: 1,
    minWidth: 0,
  },
  infoLabel: {
    fontSize: 11,
    color: "#899389",
    marginBottom: 7,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2C4031",
  },
  readOnlyNote: {
    fontSize: 10,
    color: "#9AA096",
    marginTop: 5,
  },
  profileInput: {
    width: "100%",
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#E2E5DA",
    backgroundColor: "#FAF9F5",
    borderRadius: 11,
    paddingHorizontal: 11,
    paddingVertical: 10,
    fontSize: 13,
    color: "#2C4031",
  },
  addressInput: {
    minHeight: 88,
  },
  separator: {
    height: 1,
    backgroundColor: "#EEEEE7",
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#B42318",
    marginTop: 12,
  },
  successText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#245B43",
    marginTop: 12,
  },
  saveButton: {
    minHeight: 50,
    backgroundColor: "#245B43",
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    marginTop: 20,
    marginBottom: 15,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  messageCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F0EFE6",
    borderRadius: 18,
    padding: 16,
    marginBottom: 25,
  },
  messageEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  messageContent: {
    flex: 1,
  },
  messageTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#31513B",
    marginBottom: 5,
  },
  messageDescription: {
    fontSize: 12,
    lineHeight: 19,
    color: "#758173",
  },
  logoutButton: {
    minHeight: 54,
    backgroundColor: "#245B43",
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    gap: 10,
  },
  logoutButtonDisabled: {
    opacity: 0.7,
  },
  logoutIcon: {
    fontSize: 21,
    color: "#FFFFFF",
  },
  logoutButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  footerText: {
    fontSize: 10,
    color: "#9AA096",
    textAlign: "center",
    marginTop: 22,
  },
});
