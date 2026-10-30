
require("dotenv").config();
const crypto = require("crypto");

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

const {
  initializeApp: initializeFirebaseAdminApp,
  cert,
} = require("firebase-admin/app");

const {
  getAuth: getFirebaseAdminAuth,
} = require("firebase-admin/auth");

const app = express();

let firebaseServiceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  // Cloud hosting: read Firebase credentials from an environment variable
  try {
    firebaseServiceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    );
  } catch (error) {
    throw new Error(
      "Invalid FIREBASE_SERVICE_ACCOUNT_JSON environment variable."
    );
  }
} else {
  // Local development: use the existing service-account JSON file
  const firebaseCredentialPath = path.resolve(
    __dirname,
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      "firebase-service-account.json"
  );

  firebaseServiceAccount = require(firebaseCredentialPath);
}

const firebaseAdminApp = initializeFirebaseAdminApp({
  credential: cert(firebaseServiceAccount),
  projectId: firebaseServiceAccount.project_id,
});

const firebaseAdminAuth = getFirebaseAdminAuth(firebaseAdminApp);

const PORT = process.env.PORT || 3000;

// =========================
// CLOUDINARY CONFIGURATION
// =========================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function uploadImageToCloudinary(buffer, folder, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        resolve(result);
      }
    );

    stream.end(buffer);
  });
}


// =========================
// 1. PROFILE PICTURE STORAGE
// =========================

const allowedImageTypes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const uploadProfilePictureMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, callback) => {
    if (!allowedImageTypes[file.mimetype]) {
      return callback(
        new Error("Only JPEG, PNG, and WebP images are allowed.")
      );
    }

    callback(null, true);
  },
});

// =========================
// 2. MIDDLEWARE
// =========================

app.use(cors());
app.use(express.json());

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);

// =========================
// 3. ENVIRONMENT VARIABLES
// =========================

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing from your .env file.");
}


// =========================
// 4. DATABASE CONNECTION
// =========================

function getDatabaseSSLConfig() {
  if (process.env.DB_SSL !== "true") {
    return undefined;
  }

  let caCertificate = process.env.DB_SSL_CA;

  // Render: use the certificate stored in the environment variable.
  if (caCertificate) {
    caCertificate = caCertificate.replace(/\\n/g, "\n").trim();
  } else {
    // Local development: use the local certificate file.
    const certificatePath = path.resolve(
      __dirname,
      process.env.DB_SSL_CA_PATH || "certs/isrgrootx1.pem"
    );

    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "DB_SSL_CA is missing. Add the complete TiDB CA certificate to your Render environment variables."
      );
    }

    if (!fs.existsSync(certificatePath)) {
      throw new Error(
        `Database SSL certificate not found: ${certificatePath}`
      );
    }

    caCertificate = fs.readFileSync(certificatePath, "utf8");
  }

  if (!caCertificate.includes("-----BEGIN CERTIFICATE-----")) {
    throw new Error(
      "DB_SSL_CA does not contain a valid PEM certificate."
    );
  }

  return {
    ca: caCertificate,
    rejectUnauthorized: true,
  };
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "likhalocal",

  ssl: getDatabaseSSLConfig(),

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// =========================
// STAFF NOTIFICATIONS
// =========================

// Get the logged-in staff member's notifications.
app.get(
  "/api/staff/notifications",
  authenticateUser,
  allowRoles("staff"),
  async (req, res) => {
    try {
      const [notifications] = await pool.execute(
        `SELECT
           id,
           product_id,
           title,
           message,
           is_read,
           created_at
         FROM staff_notifications
         WHERE staff_user_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 100`,
        [req.userId]
      );

      const [countRows] = await pool.execute(
        `SELECT COUNT(*) AS unreadCount
         FROM staff_notifications
         WHERE staff_user_id = ?
           AND is_read = 0`,
        [req.userId]
      );

      return res.json({
        success: true,
        notifications: notifications.map((notification) => ({
          ...notification,
          is_read: Boolean(notification.is_read),
        })),
        unreadCount: Number(countRows[0].unreadCount),
      });
    } catch (error) {
      console.error("Get staff notifications error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to retrieve staff notifications.",
      });
    }
  }
);

// Mark one of the logged-in staff member's notifications as read.
app.patch(
  "/api/staff/notifications/:id/read",
  authenticateUser,
  allowRoles("staff"),
  async (req, res) => {
    try {
      const notificationId = Number(req.params.id);

      if (
        !Number.isSafeInteger(notificationId) ||
        notificationId <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid notification ID.",
        });
      }

      const [result] = await pool.execute(
        `UPDATE staff_notifications
         SET is_read = 1
         WHERE id = ?
           AND staff_user_id = ?`,
        [notificationId, req.userId]
      );

      if (result.affectedRows === 0) {
        const [existing] = await pool.execute(
          `SELECT id
           FROM staff_notifications
           WHERE id = ?
             AND staff_user_id = ?
           LIMIT 1`,
          [notificationId, req.userId]
        );

        if (existing.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Notification not found.",
          });
        }
      }

      return res.json({
        success: true,
        message: "Notification marked as read.",
      });
    } catch (error) {
      console.error("Mark staff notification read error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to update the notification.",
      });
    }
  }
);

// Register or update the logged-in staff member's Expo push token.
app.post(
  "/api/staff/push-token",
  authenticateUser,
  allowRoles("staff"),
  async (req, res) => {
    try {
      const token =
        typeof req.body?.expoPushToken === "string"
          ? req.body.expoPushToken.trim()
          : "";

      const allowedPlatforms = [
        "android",
        "ios",
        "web",
        "unknown",
      ];

      const platform =
        typeof req.body?.platform === "string"
          ? req.body.platform.trim().toLowerCase()
          : "unknown";

      const validExpoToken =
        /^(ExpoPushToken|ExponentPushToken)\[[^\]]+\]$/.test(
          token
        );

      if (!validExpoToken) {
        return res.status(400).json({
          success: false,
          message: "A valid Expo push token is required.",
        });
      }

      if (!allowedPlatforms.includes(platform)) {
        return res.status(400).json({
          success: false,
          message: "Invalid device platform.",
        });
      }

      await pool.execute(
        `INSERT INTO staff_push_tokens
          (staff_user_id, expo_push_token, platform)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           staff_user_id = VALUES(staff_user_id),
           platform = VALUES(platform)`,
        [req.userId, token, platform]
      );

      return res.json({
        success: true,
        message: "Push token registered successfully.",
      });
    } catch (error) {
      console.error("Register staff push token error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to register the push token.",
      });
    }
  }
);

// =========================
// 5. HELPER FUNCTIONS
// =========================

function createToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// =========================
// 6. AUTHENTICATION MIDDLEWARE
// =========================

async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is required.",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is required.",
      });
    }

    let decoded;

    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired authentication token.",
      });
    }

    const userId = Number(decoded.sub);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token.",
      });
    }

    const [users] = await pool.execute(
      `SELECT id, role, is_active
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User account was not found.",
      });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "This account is inactive.",
      });
    }

    if (decoded.role !== user.role) {
      return res.status(403).json({
        success: false,
        message: "Your account role has changed. Please log in again.",
      });
    }

    req.userId = user.id;
    req.userRole = user.role;
    req.customerId = user.role === "customer" ? user.id : null;

    next();
  } catch (error) {
    console.error("Authentication error:", error);

    return res.status(500).json({
      success: false,
      message: "An error occurred during authentication.",
    });
  }
}

// =========================
// 7. ROLE AUTHORIZATION
// =========================

function allowRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.userRole || !allowedRoles.includes(req.userRole)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource.",
      });
    }

    next();
  };
}

// =========================
// STAFF PRODUCT NOTIFICATION HELPER
// =========================

async function notifyStaffOfPendingProduct(product) {
  try {
    await pool.execute(
      `INSERT INTO staff_notifications
        (
          staff_user_id,
          product_id,
          title,
          message,
          is_read
        )
       SELECT
          id,
          ?,
          ?,
          ?,
          0
       FROM users
       WHERE role = 'staff'
         AND is_active = 1`,
      [
        product.id,
        "New Product for Review",
        `${product.name} has been submitted by a seller and is awaiting review.`,
      ]
    );
  } catch (error) {
    console.error("Notify staff of pending product error:", error);
  }
}

const authenticateCustomer = [
  authenticateUser,
  allowRoles("customer"),
];

// =========================
// 8. GENERAL ROUTES
// =========================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to the LikhaLocal API.",
  });
});

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    return res.json({
      success: true,
      message: "LikhaLocal API and database are running.",
    });
  } catch (error) {
    console.error("Health check error:", error);

    return res.status(503).json({
      success: false,
      message: "The database is unavailable.",
    });
  }
});

// =========================
// 9. AUTHENTICATION ROUTES
// =========================

// Register a customer account
app.post("/api/auth/register", async (req, res) => {
  try {
    const { full_name, email, password, phone, address } = req.body;

    if (
      !full_name ||
      !email ||
      !password ||
      typeof full_name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, and password are required.",
      });
    }

    const cleanName = full_name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName || !cleanEmail) {
      return res.status(400).json({
        success: false,
        message: "Full name and email cannot be empty.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 8 characters.",
      });
    }

    if (cleanName.length > 255 || cleanEmail.length > 255) {
      return res.status(400).json({
        success: false,
        message: "Full name or email is too long.",
      });
    }

    const [existingUsers] = await pool.execute(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [cleanEmail]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await pool.execute(
      `INSERT INTO users
        (full_name, email, password_hash, phone, address, role, is_active)
       VALUES (?, ?, ?, ?, ?, 'customer', 1)`,
      [
        cleanName,
        cleanEmail,
        passwordHash,
        phone || null,
        address || null,
      ]
    );

    const user = {
      id: result.insertId,
      full_name: cleanName,
      email: cleanEmail,
      phone: phone || null,
      address: address || null,
      role: "customer",
      profile_image: null,
    };

    const token = createToken(user);

    return res.status(201).json({
      success: true,
      message: "Customer account registered successfully.",
      token,
      user,
    });
  } catch (error) {
    console.error("Registration error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to register account.",
    });
  }
});

// Log in
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;


    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    const [users] = await pool.execute(
      `SELECT
        id,
        full_name,
        email,
        password_hash,
        role,
        phone,
        address,
        profile_image,
        is_active
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [cleanEmail]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const user = users[0];

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "This account is inactive.",
      });
    }

    const token = createToken(user);

    return res.json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role,
        profile_image: user.profile_image,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to log in.",
    });
  }
});

// Get the currently logged-in user's profile
app.post("/api/auth/firebase-login", async (req, res) => {
  try {
    const idToken =
      typeof req.body?.idToken === "string"
        ? req.body.idToken.trim()
        : "";

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "A Firebase ID token is required.",
      });
    }

    let decodedToken;

    try {
      decodedToken = await firebaseAdminAuth.verifyIdToken(idToken);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired Firebase session. Please log in again.",
      });
    }

    const firebaseUid = decodedToken.uid;
    const email =
      typeof decodedToken.email === "string"
        ? decodedToken.email.trim().toLowerCase()
        : "";

    if (
      !firebaseUid ||
      !email ||
      decodedToken.email_verified !== true
    ) {
      return res.status(403).json({
        success: false,
        message:
          "A verified email address is required. Please verify your email and try again.",
      });
    }

    // First, find an account already linked to this Firebase UID.
    const [linkedUsers] = await pool.execute(
      `SELECT
         id, full_name, email, phone, address, profile_image,
         role, firebase_uid, is_active
       FROM users
       WHERE firebase_uid = ?
       LIMIT 1`,
      [firebaseUid]
    );

    let user = linkedUsers[0] || null;

    if (user && user.email.trim().toLowerCase() !== email) {
      return res.status(403).json({
        success: false,
        message:
          "Your Firebase email does not match your linked account. Please contact support.",
      });
    }

    // If not linked, look for an existing MySQL account by verified email.
    if (!user) {
      const [emailUsers] = await pool.execute(
        `SELECT
           id, full_name, email, phone, address, profile_image,
           role, firebase_uid, is_active
         FROM users
         WHERE email = ?
         LIMIT 1`,
        [email]
      );

      if (emailUsers.length > 0) {
        user = emailUsers[0];

        if (user.firebase_uid && user.firebase_uid !== firebaseUid) {
          return res.status(409).json({
            success: false,
            message:
              "This account is already linked to another Firebase account.",
          });
        }

        // Link the existing MySQL account without changing its role.
        if (!user.firebase_uid) {
          const [linkResult] = await pool.execute(
            `UPDATE users
             SET firebase_uid = ?
             WHERE id = ?
               AND firebase_uid IS NULL`,
            [firebaseUid, user.id]
          );

          if (linkResult.affectedRows !== 1) {
            return res.status(409).json({
              success: false,
              message:
                "This account could not be linked. Please try again.",
            });
          }

          const [refreshedUsers] = await pool.execute(
            `SELECT
               id, full_name, email, phone, address, profile_image,
               role, firebase_uid, is_active
             FROM users
             WHERE id = ?
             LIMIT 1`,
            [user.id]
          );

          user = refreshedUsers[0] || null;

          if (!user || user.firebase_uid !== firebaseUid) {
            return res.status(409).json({
              success: false,
              message:
                "This account could not be linked. Please try again.",
            });
          }
        }
      } else {
        // Create a new customer account. Never accept a role from the client.
        const fullName =
          typeof decodedToken.name === "string" &&
          decodedToken.name.trim()
            ? decodedToken.name.trim().slice(0, 120)
            : email.split("@")[0].slice(0, 120) || "Customer";

        // The MySQL password_hash column is NOT NULL.
        const randomSecret = crypto.randomBytes(32).toString("hex");
        const passwordHash = await bcrypt.hash(randomSecret, 12);

        const [result] = await pool.execute(
          `INSERT INTO users
             (full_name, email, password_hash, role, is_active, firebase_uid)
           VALUES (?, ?, ?, 'customer', 1, ?)`,
          [fullName, email, passwordHash, firebaseUid]
        );

        const [newUsers] = await pool.execute(
          `SELECT
             id, full_name, email, phone, address, profile_image,
             role, firebase_uid, is_active
           FROM users
           WHERE id = ?
           LIMIT 1`,
          [result.insertId]
        );

        user = newUsers[0] || null;
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Unable to find or create your account.",
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "This account is inactive.",
      });
    }

    // Continue using the existing custom JWT for protected API routes.
    const token = createToken(user);

    return res.json({
      success: true,
      message: "Firebase login successful.",
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role,
        profile_image: user.profile_image,
      },
    });
  } catch (error) {
    console.error("Firebase login bridge error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message:
          "An account with this email or Firebase identity already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to complete Firebase login.",
    });
  }
});


// Get the currently logged-in user's profile
app.get("/api/auth/me", authenticateUser, async (req, res) => {
  try {
    const [users] = await pool.execute(
      `SELECT
        id,
        full_name,
        email,
        phone,
        address,
        role,
        profile_image
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [req.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.json({
      success: true,
      user: users[0],
    });
  } catch (error) {
    console.error("Get profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve your profile.",
    });
  }
});


// Update the currently logged-in customer's profile
app.put("/api/auth/me", authenticateUser, async (req, res) => {
  try {
    const { full_name, phone, address } = req.body;

    if (
      full_name !== undefined &&
      (typeof full_name !== "string" || !full_name.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Full name must not be empty.",
      });
    }

    if (
      phone !== undefined &&
      phone !== null &&
      typeof phone !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Phone must be a string.",
      });
    }

    if (
      address !== undefined &&
      address !== null &&
      typeof address !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Address must be a string.",
      });
    }

    await pool.execute(
      `UPDATE users
       SET
         full_name = COALESCE(?, full_name),
         phone = COALESCE(?, phone),
         address = COALESCE(?, address)
       WHERE id = ?`,
      [
        full_name === undefined ? null : full_name.trim(),
        phone === undefined ? null : phone,
        address === undefined ? null : address,
        req.userId,
      ]
    );

    const [updatedUsers] = await pool.execute(
      `SELECT
        id,
        full_name,
        email,
        phone,
        address,
        role,
        profile_image
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [req.userId]
    );

    if (updatedUsers.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.json({
      success: true,
      message: "Profile updated successfully.",
      user: updatedUsers[0],
    });
  } catch (error) {
    console.error("Update profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update profile.",
    });
  }
});

// =========================
// 10. PROFILE PICTURE UPLOAD
// =========================

app.post(
  "/api/auth/me/profile-picture",
  authenticateUser,
  (req, res, next) => {
    uploadProfilePictureMiddleware.single("profile_picture")(
      req,
      res,
      (error) => {
        if (error) {
          const message =
            error.code === "LIMIT_FILE_SIZE"
              ? "Profile picture must not exceed 5 MB."
              : error.message || "Could not upload the profile picture.";

          return res.status(400).json({
            success: false,
            message,
          });
        }

        next();
      }
    );
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Please select a profile picture.",
        });
      }

      const cloudinaryResult = await uploadImageToCloudinary(
        req.file.buffer,
        "likhalocal/profile-pictures",
        `profile-${req.userId}-${Date.now()}`
      );

      const profileImageUrl = cloudinaryResult.secure_url;

      const [result] = await pool.execute(
        "UPDATE users SET profile_image = ? WHERE id = ?",
        [profileImageUrl, req.userId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      const [users] = await pool.execute(
        `SELECT
          id,
          full_name,
          email,
          phone,
          address,
          role,
          profile_image
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [req.userId]
      );

      return res.json({
        success: true,
        message: "Profile picture updated successfully.",
        user: users[0],
      });
    } catch (error) {
      console.error("Profile picture upload error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to save your profile picture.",
      });
    }
  }
);

/* PRODUCT IMAGE STORAGE */

const uploadProductImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, callback) => {
    if (!allowedImageTypes[file.mimetype]) {
      return callback(
        new Error("Only JPEG, PNG, and WebP images are allowed.")
      );
    }

    callback(null, true);
  },
});

/* Return readable errors for product image uploads */

function handleProductImageUpload(req, res, next) {
  uploadProductImage.single("image")(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message:
          error.code === "LIMIT_FILE_SIZE"
            ? "Product image must be 5 MB or smaller."
            : error.message ||
              "Unable to upload the product image.",
      });
    }

    next();
  });
}

/* Return readable errors for product image uploads */

function handleProductImageUpload(req, res, next) {
  uploadProductImage.single("image")(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message:
          error.code === "LIMIT_FILE_SIZE"
            ? "Product image must be 5 MB or smaller."
            : error.message ||
              "Unable to upload the product image.",
      });
    }

    next();
  });
}


// =========================
// 11. PUBLIC BROWSING ROUTES
// =========================

// Get product categories
app.get("/api/categories", async (req, res) => {
  try {
    const [categories] = await pool.execute(
      "SELECT * FROM categories ORDER BY id ASC"
    );

    return res.json({
      success: true,
      categories,
    });
  } catch (error) {
    console.error("Get categories error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve categories.",
    });
  }
});

// Get approved products for public browsing
app.get("/api/products", async (req, res) => {
  try {
    const [products] = await pool.execute(
      `SELECT
        p.id,
        p.name,
        p.description,
        p.price,
        p.stock,
        p.image_url,
        p.status,
        c.name AS category,
        u.full_name AS seller_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN users u ON p.seller_id = u.id
       WHERE p.status = 'approved'
       ORDER BY p.id DESC`
    );

    return res.json({
      success: true,
      products,
    });
  } catch (error) {
    console.error("Get products error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve products.",
    });
  }
});

// =========================
// 12. SELLER PRODUCT MANAGEMENT
// =========================

// Get products belonging to the logged-in seller
app.get(
  "/api/seller/products",
  authenticateUser,
  allowRoles("seller"),
  async (req, res) => {
    try {
      const [products] = await pool.execute(
        `SELECT
           p.id,
           p.name,
           p.description,
           p.price,
           p.stock,
           p.image_url,
           p.status,
           p.category_id,
           c.name AS category,
           p.created_at
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.seller_id = ?
         ORDER BY p.id DESC`,
        [req.userId]
      );

      
      return res.json({
        success: true,
        products,
      });
    } catch (error) {
      console.error("Get seller products error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to retrieve your products.",
      });
    }
  }
);

// Submit a new product for admin approval
app.post(
  "/api/seller/products",
  authenticateUser,
  allowRoles("seller"),
  handleProductImageUpload,
  async (req, res) => {
    try {
      const {
        name,
        description,
        price,
        stock,
        category_id,
        image_url,
      } = req.body;

      const productName =
        typeof name === "string" ? name.trim() : "";

      const productDescription =
        typeof description === "string"
          ? description.trim()
          : "";

      const productPrice = Number(price);
      const productStock = Number(stock);

      const categoryId =
        category_id === "" ||
        category_id === null ||
        category_id === undefined
          ? null
          : Number(category_id);

     
	
     let productImage =
  typeof image_url === "string" && image_url.trim()
    ? image_url.trim()
    : null;


      if (!productName || productName.length > 180) {
        return res.status(400).json({
          success: false,
          message:
            "Product name is required and must be 180 characters or fewer.",
        });
      }

      if (
        price === "" ||
        price === null ||
        price === undefined ||
        !Number.isFinite(productPrice) ||
        productPrice <= 0 ||
        productPrice > 99999999.99
      ) {
        return res.status(400).json({
          success: false,
          message: "Enter a valid product price greater than zero.",
        });
      }

      if (
        stock === "" ||
        stock === null ||
        stock === undefined ||
        !Number.isInteger(productStock) ||
        productStock < 0 ||
        productStock > 2147483647
      ) {
        return res.status(400).json({
          success: false,
          message: "Stock must be a non-negative whole number.",
        });
      }

      if (
        categoryId !== null &&
        (!Number.isInteger(categoryId) || categoryId <= 0)
      ) {
        return res.status(400).json({
          success: false,
          message: "Choose a valid category.",
        });
      }

      if (productImage && productImage.length > 500) {
        return res.status(400).json({
          success: false,
          message: "Image URL must be 500 characters or fewer.",
        });
      }

   if (req.file) {
  const cloudinaryResult = await uploadImageToCloudinary(
    req.file.buffer,
    "likhalocal/products",
    `product-${req.userId}-${Date.now()}`
  );

  productImage = cloudinaryResult.secure_url;
}

if (productImage && productImage.length > 500) {
  return res.status(400).json({
    success: false,
    message: "Image URL must be 500 characters or fewer.",
  });
}
      const [result] = await pool.execute(
        `INSERT INTO products
          (
            seller_id,
            category_id,
            name,
            description,
            price,
            stock,
            image_url,
            status
          )
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          req.userId,
          categoryId,
          productName,
          productDescription || null,
          productPrice,
          productStock,
          productImage,
        ]
      );

      // Notify active staff after saving the product.
      await notifyStaffOfPendingProduct({
        id: result.insertId,
        name: productName,
      });

      return res.status(201).json({
        success: true,
        message:
          "Product submitted successfully and is awaiting admin approval.",
        product: {
          id: result.insertId,
          seller_id: req.userId,
          category_id: categoryId,
          name: productName,
          description: productDescription || null,
          price: productPrice,
          stock: productStock,
          image_url: productImage,
          status: "pending",
        },
      });
    } catch (error) {
      console.error("Submit seller product error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to submit your product.",
      });
    }
  }
);


// =========================
// 13. ADMIN PRODUCT APPROVAL
// =========================

// Get products for admin review, optionally filtered by status
app.get(
  "/api/admin/products",
  authenticateUser,
  allowRoles("admin"),
  async (req, res) => {
    try {
      const allowedStatuses = [
        "pending",
        "approved",
        "rejected",
        "inactive",
      ];

      const status =
        typeof req.query.status === "string"
          ? req.query.status.trim().toLowerCase()
          : "";

      if (status && !allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product status filter.",
        });
      }

      let sql = `
        SELECT
          p.id,
          p.seller_id,
          u.full_name AS seller_name,
          u.email AS seller_email,
          p.category_id,
          c.name AS category,
          p.name,
          p.description,
          p.price,
          p.stock,
          p.image_url,
          p.status,
          p.created_at
        FROM products p
        LEFT JOIN users u ON p.seller_id = u.id
        LEFT JOIN categories c ON p.category_id = c.id
      `;

      const params = [];

      if (status) {
        sql += " WHERE p.status = ?";
        params.push(status);
      }

      sql += " ORDER BY p.id DESC";

      const [products] = await pool.execute(sql, params);

      return res.json({
        success: true,
        message: "Products retrieved successfully.",
        products,
      });
    } catch (error) {
      console.error("Get admin products error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to retrieve products for review.",
      });
    }
  }
);

// Approve or reject a pending product
app.patch(
  "/api/admin/products/:id/status",
  authenticateUser,
  allowRoles("admin"),
  async (req, res) => {
    try {
      const productId = Number(req.params.id);

      const status =
        typeof req.body?.status === "string"
          ? req.body.status.trim().toLowerCase()
          : "";

      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID.",
        });
      }

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Status must be approved or rejected.",
        });
      }

      const [result] = await pool.execute(
        `UPDATE products
         SET status = ?
         WHERE id = ?
           AND status = 'pending'`,
        [status, productId]
      );

      if (result.affectedRows === 0) {
        const [products] = await pool.execute(
          `SELECT id, status
           FROM products
           WHERE id = ?
           LIMIT 1`,
          [productId]
        );

        if (products.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Product not found.",
          });
        }

        return res.status(409).json({
          success: false,
          message:
            "Only pending products can be approved or rejected.",
          product: products[0],
        });
      }

      return res.json({
        success: true,
        message: `Product ${status} successfully.`,
        product: {
          id: productId,
          status,
        },
      });
    } catch (error) {
      console.error("Update product approval status error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to update product approval status.",
      });
    }
  }
);

// =========================
// 14. ADMIN DASHBOARD STATISTICS
// =========================

app.get(
  "/api/admin/dashboard",
  authenticateUser,
  allowRoles("admin"),
  async (req, res) => {
    try {
      const [userStats] = await pool.execute(`
        SELECT
          COUNT(*) AS totalUsers,
          COALESCE(SUM(role = 'admin'), 0) AS totalAdmins,
          COALESCE(SUM(role = 'staff'), 0) AS totalStaff,
          COALESCE(SUM(role = 'seller'), 0) AS totalSellers,
          COALESCE(SUM(role = 'customer'), 0) AS totalCustomers,
          COALESCE(SUM(is_active = 1), 0) AS activeUsers,
          COALESCE(SUM(is_active = 0), 0) AS inactiveUsers
        FROM users
      `);

      const [productStats] = await pool.execute(`
        SELECT
          COUNT(*) AS totalProducts,
          COALESCE(SUM(status = 'approved'), 0) AS approvedProducts,
          COALESCE(SUM(status = 'pending'), 0) AS pendingProducts,
          COALESCE(SUM(status = 'rejected'), 0) AS rejectedProducts
        FROM products
      `);

      const [categoryStats] = await pool.execute(`
        SELECT COUNT(*) AS totalCategories
        FROM categories
      `);

      return res.json({
        success: true,
        message: "Admin dashboard statistics retrieved successfully.",
        statistics: {
          users: {
            total: Number(userStats[0].totalUsers),
            admins: Number(userStats[0].totalAdmins),
            staff: Number(userStats[0].totalStaff),
            sellers: Number(userStats[0].totalSellers),
            customers: Number(userStats[0].totalCustomers),
            active: Number(userStats[0].activeUsers),
            inactive: Number(userStats[0].inactiveUsers),
          },
          products: {
            total: Number(productStats[0].totalProducts),
            approved: Number(productStats[0].approvedProducts),
            pending: Number(productStats[0].pendingProducts),
            rejected: Number(productStats[0].rejectedProducts),
          },
          categories: {
            total: Number(categoryStats[0].totalCategories),
          },
        },
      });
    } catch (error) {
      console.error("Admin dashboard statistics error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to retrieve admin dashboard statistics.",
      });
    }
  }
);

// =========================
// 15. ADMIN USER MANAGEMENT
// =========================


 // Create a user account (admin only)
app.post(
  "/api/admin/users",
  authenticateUser,
  allowRoles("admin"),
  async (req, res) => {
    try {
      const { full_name, email, password, role, phone, address } = req.body;

      if (
        typeof full_name !== "string" ||
        typeof email !== "string" ||
        typeof password !== "string" ||
        !full_name.trim() ||
        !email.trim() ||
        !password
      ) {
        return res.status(400).json({
          success: false,
          message: "Full name, email, and password are required.",
        });
      }

      const cleanName = full_name.trim();
      const cleanEmail = email.trim().toLowerCase();
      const allowedRoles = ["admin", "staff", "seller", "customer"];
      const cleanRole = String(role || "").trim().toLowerCase();

      if (!allowedRoles.includes(cleanRole)) {
        return res.status(400).json({
          success: false,
          message: "Choose a valid account role.",
        });
      }

      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: "Password must contain at least 8 characters.",
        });
      }

      if (cleanName.length > 255 || cleanEmail.length > 255) {
        return res.status(400).json({
          success: false,
          message: "Full name or email is too long.",
        });
      }

      const [existingUsers] = await pool.execute(
        "SELECT id FROM users WHERE email = ? LIMIT 1",
        [cleanEmail]
      );

      if (existingUsers.length > 0) {
        return res.status(409).json({
          success: false,
          message: "An account with this email already exists.",
        });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const [result] = await pool.execute(
        `INSERT INTO users
          (full_name, email, password_hash, phone, address, role, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [
          cleanName,
          cleanEmail,
          passwordHash,
          typeof phone === "string" && phone.trim()
            ? phone.trim()
            : null,
          typeof address === "string" && address.trim()
            ? address.trim()
            : null,
          cleanRole,
        ]
      );

      return res.status(201).json({
        success: true,
        message: "User account created successfully.",
        user: {
          id: result.insertId,
          full_name: cleanName,
          email: cleanEmail,
          phone: typeof phone === "string" && phone.trim()
            ? phone.trim()
            : null,
          address: typeof address === "string" && address.trim()
            ? address.trim()
            : null,
          role: cleanRole,
          is_active: true,
          profile_image: null,
        },
      });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          success: false,
          message: "An account with this email already exists.",
        });
      }

      console.error("Admin create user error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to create the user account.",
      });
    }
  }
);


// Get all registered users (admin only)
app.get(
  "/api/admin/users",
  authenticateUser,
  allowRoles("admin"),
  async (req, res) => {
    try {
      const [users] = await pool.execute(`
        SELECT
          id,
          full_name,
          email,
          phone,
          address,
          role,
          is_active,
          profile_image
        FROM users
        ORDER BY id DESC
      `);

      return res.json({
        success: true,
        message: "Users retrieved successfully.",
        users: users.map((user) => ({
          ...user,
          is_active: Boolean(user.is_active),
        })),
      });
    } catch (error) {
      console.error("Admin user list error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to retrieve users.",
      });
    }
  }
);

// Activate or deactivate a user account (admin only)
app.patch(
  "/api/admin/users/:id/status",
  authenticateUser,
  allowRoles("admin"),
  async (req, res) => {
    const userId = Number(req.params.id);
    const { is_active } = req.body;

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    if (typeof is_active !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Account status must be true or false.",
      });
    }

    if (Number(req.userId) === userId && !is_active) {
      return res.status(400).json({
        success: false,
        message: "You cannot deactivate your own account.",
      });
    }

    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [users] = await connection.execute(
        `SELECT id, full_name, email, role, is_active
         FROM users
         WHERE id = ?
         FOR UPDATE`,
        [userId]
      );

      if (users.length === 0) {
        await connection.rollback();

        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      const targetUser = users[0];
      const currentlyActive = Boolean(targetUser.is_active);

      if (currentlyActive === is_active) {
        await connection.rollback();

        return res.json({
          success: true,
          message: `Account is already ${is_active ? "active" : "inactive"}.`,
          user: {
            id: targetUser.id,
            full_name: targetUser.full_name,
            email: targetUser.email,
            role: targetUser.role,
            is_active: currentlyActive,
          },
        });
      }

      if (
        targetUser.role === "admin" &&
        currentlyActive &&
        !is_active
      ) {
        const [adminCounts] = await connection.execute(
          `SELECT COUNT(*) AS total
           FROM users
           WHERE role = 'admin' AND is_active = 1`
        );

        if (Number(adminCounts[0].total) <= 1) {
          await connection.rollback();

          return res.status(400).json({
            success: false,
            message:
              "You cannot deactivate the last active administrator.",
          });
        }
      }

      await connection.execute(
        "UPDATE users SET is_active = ? WHERE id = ?",
        [is_active ? 1 : 0, userId]
      );

      await connection.commit();

      return res.json({
        success: true,
        message: `Account ${is_active ? "activated" : "deactivated"} successfully.`,
        user: {
          id: targetUser.id,
          full_name: targetUser.full_name,
          email: targetUser.email,
          role: targetUser.role,
          is_active,
        },
      });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error("Transaction rollback error:", rollbackError);
        }
      }

      console.error("Update account status error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to update account status.",
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
);

// =========================
// STAFF PRODUCT MANAGEMENT
// Review-only permissions
// =========================

// Get all products or filter by status.
app.get(
  "/api/staff/products",
  authenticateUser,
  allowRoles("staff"),
  async (req, res) => {
    try {
      const allowedStatuses = [
        "pending",
        "approved",
        "rejected",
        "inactive",
      ];

      const status =
        typeof req.query.status === "string"
          ? req.query.status.trim().toLowerCase()
          : "";

      if (status && !allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product status filter.",
        });
      }

      let sql = `
        SELECT
          p.id,
          p.seller_id,
          u.full_name AS seller_name,
          u.email AS seller_email,
          p.category_id,
          c.name AS category,
          p.name,
          p.description,
          p.price,
          p.stock,
          p.image_url,
          p.status,
          p.created_at
        FROM products p
        LEFT JOIN users u ON p.seller_id = u.id
        LEFT JOIN categories c ON p.category_id = c.id
      `;

      const params = [];

      if (status) {
        sql += " WHERE p.status = ?";
        params.push(status);
      }

      sql += " ORDER BY p.id DESC";

      const [products] = await pool.execute(sql, params);

      return res.json({
        success: true,
        message: "Staff products retrieved successfully.",
        products,
      });
    } catch (error) {
      console.error("Get staff products error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to retrieve products for staff review.",
      });
    }
  }
);

// Get one product's details for staff inspection.
app.get(
  "/api/staff/products/:id",
  authenticateUser,
  allowRoles("staff"),
  async (req, res) => {
    try {
      const productId = Number(req.params.id);

      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID.",
        });
      }

      const [products] = await pool.execute(
        `
          SELECT
            p.id,
            p.seller_id,
            u.full_name AS seller_name,
            u.email AS seller_email,
            p.category_id,
            c.name AS category,
            p.name,
            p.description,
            p.price,
            p.stock,
            p.image_url,
            p.status,
            p.created_at
          FROM products p
          LEFT JOIN users u ON p.seller_id = u.id
          LEFT JOIN categories c ON p.category_id = c.id
          WHERE p.id = ?
          LIMIT 1
        `,
        [productId]
      );

      if (products.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Product not found.",
        });
      }

      return res.json({
        success: true,
        message: "Product details retrieved successfully.",
        product: products[0],
      });
    } catch (error) {
      console.error("Get staff product details error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to retrieve product details.",
      });
    }
  }
);

// =========================
// 16. ROLE-PROTECTED TEST ROUTES
// =========================

// Admin-only
app.get(
  "/api/admin/test",
  authenticateUser,
  allowRoles("admin"),
  (req, res) => {
    return res.json({
      success: true,
      message: "Admin access granted.",
      role: req.userRole,
    });
  }
);

// Seller-only
app.get(
  "/api/seller/test",
  authenticateUser,
  allowRoles("seller"),
  (req, res) => {
    return res.json({
      success: true,
      message: "Seller access granted.",
      role: req.userRole,
    });
  }
);

// Staff-only
app.get(
  "/api/staff/test",
  authenticateUser,
  allowRoles("staff"),
  (req, res) => {
    return res.json({
      success: true,
      message: "Staff access granted.",
      role: req.userRole,
    });
  }
);

// Customer-only
app.get(
  "/api/customer/test",
  authenticateUser,
  allowRoles("customer"),
  (req, res) => {
    return res.json({
      success: true,
      message: "Customer access granted.",
      role: req.userRole,
    });
  }
);


/* =========================
   SELLER DELIVERY FEE
========================= */

// Get the logged-in seller's delivery fee.
app.get(
  "/api/seller/delivery-fee",
  authenticateUser,
  allowRoles("seller"),
  async (req, res) => {
    try {
      const [users] = await pool.execute(
        `SELECT delivery_fee
         FROM users
         WHERE id = ? AND role = 'seller'
         LIMIT 1`,
        [req.userId]
      );

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Seller account not found.",
        });
      }

      return res.json({
        success: true,
        deliveryFee: Number(users[0].delivery_fee),
      });
    } catch (error) {
      console.error("Get seller delivery fee error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to retrieve delivery fee.",
      });
    }
  }
);

// Update the logged-in seller's delivery fee.
app.put(
  "/api/seller/delivery-fee",
  authenticateUser,
  allowRoles("seller"),
  async (req, res) => {
    try {
      const deliveryFee = Number(req.body.deliveryFee);

      if (
        req.body.deliveryFee === undefined ||
        req.body.deliveryFee === null ||
        String(req.body.deliveryFee).trim() === "" ||
        !Number.isFinite(deliveryFee) ||
        deliveryFee < 0 ||
        deliveryFee > 100000
      ) {
        return res.status(400).json({
          success: false,
          message: "Enter a valid delivery fee between ₱0 and ₱100,000.",
        });
      }

      const roundedFee = Number(deliveryFee.toFixed(2));

      const [result] = await pool.execute(
        `UPDATE users
         SET delivery_fee = ?
         WHERE id = ? AND role = 'seller'`,
        [roundedFee, req.userId]
      );

      if (result.affectedRows === 0) {
        const [users] = await pool.execute(
          "SELECT id FROM users WHERE id = ? AND role = 'seller' LIMIT 1",
          [req.userId]
        );

        if (users.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Seller account not found.",
          });
        }
      }

      return res.json({
        success: true,
        message: "Delivery fee saved successfully.",
        deliveryFee: roundedFee,
      });
    } catch (error) {
      console.error("Update seller delivery fee error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to save delivery fee.",
      });
    }
  }
);


/* =========================
   SELLER DELIVERY ORIGIN
========================= */

// Get the logged-in seller's delivery origin.
app.get(
  "/api/seller/delivery-origin",
  authenticateUser,
  allowRoles("seller"),
  async (req, res) => {
    try {
      const [users] = await pool.execute(
        `SELECT
           delivery_origin_barangay,
           delivery_origin_municipality
         FROM users
         WHERE id = ? AND role = 'seller'
         LIMIT 1`,
        [req.userId]
      );

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Seller account not found.",
        });
      }

      return res.json({
        success: true,
        deliveryOrigin: {
          barangay: users[0].delivery_origin_barangay || "",
          municipality: users[0].delivery_origin_municipality || "",
        },
      });
    } catch (error) {
      console.error("Get seller delivery origin error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to retrieve delivery origin.",
      });
    }
  }
);

// Save the logged-in seller's delivery origin.
app.put(
  "/api/seller/delivery-origin",
  authenticateUser,
  allowRoles("seller"),
  async (req, res) => {
    try {
      const barangay =
        typeof req.body?.barangay === "string"
          ? req.body.barangay.trim()
          : "";

      const municipality =
        typeof req.body?.municipality === "string"
          ? req.body.municipality.trim()
          : "";

      if (!barangay || !municipality) {
        return res.status(400).json({
          success: false,
          message:
            "Please enter both your origin barangay and municipality/city.",
        });
      }

      if (barangay.length > 120 || municipality.length > 120) {
        return res.status(400).json({
          success: false,
          message:
            "Barangay and municipality/city must not exceed 120 characters each.",
        });
      }

      const [result] = await pool.execute(
        `UPDATE users
         SET
           delivery_origin_barangay = ?,
           delivery_origin_municipality = ?
         WHERE id = ? AND role = 'seller'`,
        [barangay, municipality, req.userId]
      );

      if (result.affectedRows === 0) {
        const [users] = await pool.execute(
          `SELECT id
           FROM users
           WHERE id = ? AND role = 'seller'
           LIMIT 1`,
          [req.userId]
        );

        if (users.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Seller account not found.",
          });
        }
      }

      return res.json({
        success: true,
        message: "Delivery origin saved successfully.",
        deliveryOrigin: {
          barangay,
          municipality,
        },
      });
    } catch (error) {
      console.error("Save seller delivery origin error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to save delivery origin.",
      });
    }
  }
);


/* =========================
   CUSTOMER ORDER CHECKOUT
========================= */

app.post("/api/orders", authenticateCustomer, async (req, res) => {
  const {
    items,
    deliveryAddress,
    contactNumber,
    paymentMethod = "COD",
  } = req.body || {};

  const allowedPaymentMethods = ["COD", "GCASH", "MAYA"];
  const normalizedPaymentMethod =
    typeof paymentMethod === "string"
      ? paymentMethod.trim().toUpperCase()
      : "";

  if (!allowedPaymentMethods.includes(normalizedPaymentMethod)) {
    return res.status(400).json({
      success: false,
      message: "Choose COD, GCash, or Maya as your payment method.",
    });
  }

  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length > 100
  ) {
    return res.status(400).json({
      success: false,
      message: "Your order must contain at least one product.",
    });
  }

  if (
    typeof deliveryAddress !== "string" ||
    !deliveryAddress.trim() ||
    typeof contactNumber !== "string" ||
    !contactNumber.trim()
  ) {
    return res.status(400).json({
      success: false,
      message: "Delivery address and contact number are required.",
    });
  }

  // Combine duplicate product IDs and validate quantities.
  const quantities = new Map();

  for (const item of items) {
    const productId = Number(item.productId);
    const quantity = Number(item.quantity);

    if (
      !Number.isSafeInteger(productId) ||
      productId <= 0 ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      quantity > 999
    ) {
      return res.status(400).json({
        success: false,
        message: "One or more product quantities are invalid.",
      });
    }

    const combinedQuantity =
      (quantities.get(productId) || 0) + quantity;

    if (combinedQuantity > 999) {
      return res.status(400).json({
        success: false,
        message: "The requested quantity is too large.",
      });
    }

    quantities.set(productId, combinedQuantity);
  }

  let connection;
  let transactionStarted = false;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const orderItems = [];
    const sellerFees = new Map();
    let subtotal = 0;

    // Lock each product and retrieve its actual seller fee.
    for (const [productId, quantity] of quantities) {
      const [products] = await connection.execute(
        `SELECT
           p.id,
           p.name,
           p.price,
           p.stock,
           p.status,
           p.seller_id,
           u.delivery_fee
         FROM products p
         INNER JOIN users u ON u.id = p.seller_id
         WHERE p.id = ?
         FOR UPDATE`,
        [productId]
      );

      if (products.length === 0) {
        const error = new Error(
          "A product or its seller no longer exists."
        );
        error.statusCode = 400;
        throw error;
      }

      const product = products[0];

      if (product.status !== "approved") {
        const error = new Error(
          `${product.name} is not currently available for purchase.`
        );
        error.statusCode = 400;
        throw error;
      }

      if (Number(product.stock) < quantity) {
        const error = new Error(
          `Not enough stock available for ${product.name}.`
        );
        error.statusCode = 400;
        throw error;
      }

      const unitPrice = Number(product.price);
      const deliveryFee = Number(product.delivery_fee);

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error("A product has an invalid price.");
      }

      if (
        !Number.isFinite(deliveryFee) ||
        deliveryFee < 0
      ) {
        throw new Error(
          "A seller has an invalid delivery fee. Please contact support."
        );
      }

      subtotal += unitPrice * quantity;

      // Charge each seller's fee only once per order.
      const sellerId = Number(product.seller_id);

      if (!sellerFees.has(sellerId)) {
        sellerFees.set(sellerId, deliveryFee);
      }

      orderItems.push({
        productId: product.id,
        productName: product.name,
        quantity,
        unitPrice,
      });
    }

    subtotal = Number(subtotal.toFixed(2));

    const deliveryFee = Number(
      [...sellerFees.values()]
        .reduce((sum, fee) => sum + fee, 0)
        .toFixed(2)
    );

    const totalAmount = Number(
      (subtotal + deliveryFee).toFixed(2)
    );

    // Payment remains unpaid until confirmed by a real payment process.
    const paymentStatus = "unpaid";

    // Save the order and calculated delivery fee.
    const [orderResult] = await connection.execute(
      `INSERT INTO orders
        (
          customer_id,
          total_amount,
          delivery_address,
          contact_number,
          delivery_fee,
          payment_method,
          payment_status
        )
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.customerId,
        totalAmount,
        deliveryAddress.trim(),
        contactNumber.trim(),
        deliveryFee,
        normalizedPaymentMethod,
        paymentStatus,
      ]
    );

    const orderId = orderResult.insertId;

    // Save the order items and safely reduce stock.
    for (const item of orderItems) {
      await connection.execute(
        `INSERT INTO order_items
          (order_id, product_id, product_name, quantity, unit_price)
         VALUES (?, ?, ?, ?, ?)`,
        [
          orderId,
          item.productId,
          item.productName,
          item.quantity,
          item.unitPrice,
        ]
      );

      const [stockResult] = await connection.execute(
        `UPDATE products
         SET stock = stock - ?
         WHERE id = ? AND stock >= ? AND status = 'approved'`,
        [item.quantity, item.productId, item.quantity]
      );

      if (stockResult.affectedRows !== 1) {
        const error = new Error(
          `Stock changed while processing ${item.productName}. Please try again.`
        );
        error.statusCode = 409;
        throw error;
      }
    }

    await connection.commit();
    transactionStarted = false;

    return res.status(201).json({
      success: true,
      message: "Order placed successfully.",
      order: {
        id: orderId,
        subtotal,
        deliveryFee,
        totalAmount,
        paymentMethod: normalizedPaymentMethod,
        paymentStatus,
        status: "pending",
      },
    });
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Order rollback error:", rollbackError);
      }
    }

    console.error("Create order error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.statusCode
          ? error.message
          : "Unable to place your order. Please try again.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});


 // =========================
 // SELLER ORDER MANAGEMENT
 // =========================

// Get orders containing products owned by the logged-in seller
app.get(
  "/api/seller/orders",
  authenticateUser,
  allowRoles("seller"),
  async (req, res) => {
    const sellerId = req.userId;

    try {
      // Create a pending decision record for this seller
      // when their products appear in an existing order.
      await pool.execute(
        `INSERT IGNORE INTO seller_order_status
          (order_id, seller_id, status)
         SELECT DISTINCT oi.order_id, p.seller_id, 'pending'
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE p.seller_id = ?`,
        [sellerId]
      );

      const [rows] = await pool.execute(
        `SELECT
            o.id AS order_id,
            o.customer_id,
            o.delivery_address,
            o.contact_number,
            o.total_amount,
            o.delivery_fee,
            o.payment_method,
            o.payment_status,
            o.status AS order_status,
            o.created_at,
            sos.status AS seller_status,
            oi.product_id,
            oi.product_name,
            oi.quantity,
            oi.unit_price
         FROM seller_order_status sos
         JOIN orders o ON o.id = sos.order_id
         JOIN order_items oi ON oi.order_id = o.id
         JOIN products p
           ON p.id = oi.product_id
          AND p.seller_id = sos.seller_id
         WHERE sos.seller_id = ?
         ORDER BY o.created_at DESC, o.id DESC`,
        [sellerId]
      );

      const ordersById = new Map();

      for (const row of rows) {
        if (!ordersById.has(row.order_id)) {
          ordersById.set(row.order_id, {
            id: row.order_id,
            customerId: row.customer_id,
            deliveryAddress: row.delivery_address,
            contactNumber: row.contact_number,
            totalAmount: Number(row.total_amount),
            deliveryFee: Number(row.delivery_fee),
            paymentMethod: row.payment_method,
            paymentStatus: row.payment_status,
            orderStatus: row.order_status,
            sellerStatus: row.seller_status,
            createdAt: row.created_at,
            items: [],
          });
        }

        ordersById.get(row.order_id).items.push({
          productId: row.product_id,
          productName: row.product_name,
          quantity: row.quantity,
          unitPrice: Number(row.unit_price),
          subtotal: Number(row.unit_price) * row.quantity,
        });
      }

      return res.json({
        success: true,
        orders: Array.from(ordersById.values()),
      });
    } catch (error) {
      console.error("Fetch seller orders error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to load seller orders.",
      });
    }
  }
);

// Approve or reject the logged-in seller's portion of an order
app.patch(
  "/api/seller/orders/:orderId/decision",
  authenticateUser,
  allowRoles("seller"),
  async (req, res) => {
    const sellerId = req.userId;
    const orderId = Number(req.params.orderId);
    const decision = req.body?.decision;

    if (!Number.isInteger(orderId) || orderId < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID.",
      });
    }

    if (!["confirmed", "rejected"].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: "Decision must be confirmed or rejected.",
      });
    }

    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Ensure this order contains a product belonging to this seller.
      const [sellerItems] = await connection.execute(
        `SELECT oi.id
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = ?
           AND p.seller_id = ?
         LIMIT 1`,
        [orderId, sellerId]
      );

      if (sellerItems.length === 0) {
        await connection.rollback();

        return res.status(404).json({
          success: false,
          message: "Order not found for this seller.",
        });
      }

      // Create the seller-specific status record if necessary.
      await connection.execute(
        `INSERT IGNORE INTO seller_order_status
          (order_id, seller_id, status)
         VALUES (?, ?, 'pending')`,
        [orderId, sellerId]
      );

      const [result] = await connection.execute(
        `UPDATE seller_order_status
         SET status = ?
         WHERE order_id = ?
           AND seller_id = ?
           AND status = 'pending'`,
        [decision, orderId, sellerId]
      );

      if (result.affectedRows === 0) {
        await connection.rollback();

        return res.status(409).json({
          success: false,
          message: "You have already responded to this order.",
        });
      }

      await connection.commit();

      return res.json({
        success: true,
        message:
          decision === "confirmed"
            ? "Order approved successfully."
            : "Order rejected successfully.",
        orderId,
        sellerStatus: decision,
      });
    } catch (error) {
      if (connection) {
        await connection.rollback().catch(() => {});
      }

      console.error("Seller order decision error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to update this order.",
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
);


// =========================
// 17. START THE SERVER
// =========================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`LikhaLocal API running on port ${PORT}`);
});