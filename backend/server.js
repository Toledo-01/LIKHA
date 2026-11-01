require("dotenv").config();
const crypto = require("crypto");

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
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

// Accept a file if EITHER its mimetype OR its extension looks like an image.
// This handles image/jpg vs image/jpeg, uppercase .JPG/.PNG, and
// application/octet-stream uploads from some mobile devices.
const allowedImageMimeTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/x-png",
  "image/webp",
]);

const allowedImageExtensions = [".jpg", ".jpeg", ".png", ".webp"];

function imageFileFilter(req, file, callback) {
  const mimetype = (file.mimetype || "").toLowerCase();
  const ext = path.extname(file.originalname || "").toLowerCase();

  if (
    allowedImageMimeTypes.has(mimetype) ||
    allowedImageExtensions.includes(ext)
  ) {
    return callback(null, true);
  }

  return callback(
    new Error("Only JPEG, PNG, and WebP images are allowed.")
  );
}

const uploadProfilePictureMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: imageFileFilter,
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

function getPasswordResetTransport() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;
  const port = Number(process.env.SMTP_PORT);

  if (
    !SMTP_HOST ||
    !SMTP_USER ||
    !SMTP_PASSWORD ||
    !SMTP_FROM ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    return null;
  }

  return {
    transporter: nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASSWORD,
      },
    }),
    from: SMTP_FROM,
  };
}

function getPasswordResetLink(token) {
  const appBaseUrl = process.env.APP_BASE_URL || "likhalocal://";
  const normalizedBaseUrl = appBaseUrl.endsWith("://")
    ? `${appBaseUrl}/`
    : appBaseUrl.replace(/\/+$/, "");
  const separator = normalizedBaseUrl.endsWith("/") ? "" : "/";

  return `${normalizedBaseUrl}${separator}reset-password?token=${encodeURIComponent(token)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
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

async function recordUserActivity(userId, role, activityType, summary) {
  try {
    await pool.execute(
      `INSERT INTO user_activity
         (user_id, user_role, activity_type, summary)
       VALUES (?, ?, ?, ?)`,
      [
        userId,
        role,
        activityType,
        String(summary).slice(0, 255),
      ]
    );
  } catch (error) {
    console.error("Record user activity error:", {
      userId,
      role,
      activityType,
      error,
    });
  }
}

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

      await recordUserActivity(
        req.userId,
        req.userRole,
        "product_review",
        "Marked a product review notification as read"
      );

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

app.get("/api/activity/me", authenticateUser, async (req, res) => {
  const requestedLimit = Number(req.query.limit ?? 30);

  if (
    !Number.isInteger(requestedLimit) ||
    requestedLimit < 1 ||
    requestedLimit > 100
  ) {
    return res.status(400).json({
      success: false,
      message: "Activity history limit must be between 1 and 100.",
    });
  }

  try {
    const [activities] = await pool.execute(
      `SELECT id, user_role, activity_type, summary, created_at
       FROM user_activity
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ${requestedLimit}`,
      [req.userId]
    );

    return res.json({
      success: true,
      activities,
    });
  } catch (error) {
    console.error("Get user activity history error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load your activity history.",
    });
  }
});

app.post("/api/auth/logout", authenticateUser, async (req, res) => {
  await recordUserActivity(
    req.userId,
    req.userRole,
    "auth",
    "Logged out of LikhaLocal"
  );

  return res.json({
    success: true,
    message: "Logout recorded.",
  });
});

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

// Register a customer or seller account
app.post("/api/auth/register", async (req, res) => {
  try {
    const {
      full_name,
      email,
      password,
      phone,
      address,
      role,
    } = req.body;
    const accountRole = role === undefined ? "customer" : role;

    if (accountRole !== "customer" && accountRole !== "seller") {
      return res.status(400).json({
        success: false,
        message: "Account type must be customer or seller.",
      });
    }

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
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [
        cleanName,
        cleanEmail,
        passwordHash,
        phone || null,
        address || null,
        accountRole,
      ]
    );

    const user = {
      id: result.insertId,
      full_name: cleanName,
      email: cleanEmail,
      phone: phone || null,
      address: address || null,
      role: accountRole,
      profile_image: null,
    };

    const token = createToken(user);

    await recordUserActivity(
      user.id,
      user.role,
      "auth",
      `Created a ${accountRole} account`
    );

    return res.status(201).json({
      success: true,
      message: `${accountRole === "seller" ? "Seller" : "Customer"} account registered successfully.`,
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

app.post("/api/auth/forgot-password", async (req, res) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

  if (
    !email ||
    email.length > 190 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid email address.",
    });
  }

  const mailConfig = getPasswordResetTransport();
  if (!mailConfig) {
    console.error(
      "Password reset email is unavailable: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM must be configured."
    );
    return res.status(503).json({
      success: false,
      message:
        "Password recovery is temporarily unavailable. Please contact support.",
    });
  }

  let resetId = null;

  try {
    const [users] = await pool.execute(
      `SELECT id, full_name, email, firebase_uid
       FROM users
       WHERE email = ? AND is_active = 1
       LIMIT 1`,
      [email]
    );

    if (users.length === 0) {
      return res.json({
        success: true,
        message:
          "If an active account uses that email, password reset instructions will be sent.",
      });
    }

    const user = users[0];
    const [recentRequests] = await pool.execute(
      `SELECT id
       FROM password_reset_tokens
       WHERE user_id = ?
         AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 MINUTE)
       LIMIT 1`,
      [user.id]
    );

    if (recentRequests.length > 0) {
      return res.json({
        success: true,
        message:
          "If an active account uses that email, password reset instructions will be sent.",
      });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    await pool.execute(
      `DELETE FROM password_reset_tokens
       WHERE user_id = ? AND used_at IS NULL`,
      [user.id]
    );

    const [insertResult] = await pool.execute(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 MINUTE))`,
      [user.id, tokenHash]
    );
    resetId = insertResult.insertId;

    const resetLink = getPasswordResetLink(rawToken);
    const safeName = escapeHtml(user.full_name);
    const safeLink = escapeHtml(resetLink);

    await mailConfig.transporter.sendMail({
      from: mailConfig.from,
      to: user.email,
      subject: "Reset your LikhaLocal password",
      text:
        `Hello ${user.full_name},\n\n` +
        `Use this link to reset your LikhaLocal password within 30 minutes:\n${resetLink}\n\n` +
        "If you did not request this, you can ignore this email.",
      html:
        `<p>Hello ${safeName},</p>` +
        "<p>Use the link below to reset your LikhaLocal password. It expires in 30 minutes.</p>" +
        `<p><a href="${safeLink}">Reset password</a></p>` +
        "<p>If you did not request this, you can ignore this email.</p>",
    });

    return res.json({
      success: true,
      message:
        "If an active account uses that email, password reset instructions will be sent.",
    });
  } catch (error) {
    if (resetId !== null) {
      await pool
        .execute("DELETE FROM password_reset_tokens WHERE id = ?", [resetId])
        .catch((cleanupError) => {
          console.error("Could not remove unsent password reset token:", cleanupError);
        });
    }

    console.error("Request password reset error:", error);
    return res.status(503).json({
      success: false,
      message:
        "Unable to send password reset instructions right now. Please try again later.",
    });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  const token =
    typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";

  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).json({
      success: false,
      message: "This password reset link is invalid or has expired.",
    });
  }

  if (password.length < 8 || password.length > 72) {
    return res.status(400).json({
      success: false,
      message: "Password must contain between 8 and 72 characters.",
    });
  }

  let connection;

  try {
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");
    const passwordHash = await bcrypt.hash(password, 12);

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [resetRows] = await connection.execute(
      `SELECT
         reset.id AS reset_id,
         account.id AS user_id,
         account.firebase_uid
       FROM password_reset_tokens reset
       JOIN users account ON account.id = reset.user_id
       WHERE reset.token_hash = ?
         AND reset.used_at IS NULL
         AND reset.expires_at > CURRENT_TIMESTAMP
         AND account.is_active = 1
       LIMIT 1
       FOR UPDATE`,
      [tokenHash]
    );

    if (resetRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "This password reset link is invalid or has expired.",
      });
    }

    const reset = resetRows[0];

    if (reset.firebase_uid) {
      await firebaseAdminAuth.updateUser(reset.firebase_uid, { password });
    }

    await connection.execute(
      "UPDATE users SET password_hash = ? WHERE id = ?",
      [passwordHash, reset.user_id]
    );
    await connection.execute(
      `UPDATE password_reset_tokens
       SET used_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND used_at IS NULL`,
      [reset.user_id]
    );

    await connection.commit();
    return res.json({
      success: true,
      message: "Your password was reset successfully. You can now log in.",
    });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch((rollbackError) => {
        console.error("Password reset rollback error:", rollbackError);
      });
    }

    console.error("Reset password error:", error);
    return res.status(500).json({
      success: false,
      message:
        "Unable to reset your password. Please request a new reset link or contact support.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
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

    await recordUserActivity(
      user.id,
      user.role,
      "auth",
      "Signed in to LikhaLocal"
    );

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

// Firebase login bridge
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

    await recordUserActivity(
      user.id,
      user.role,
      "auth",
      "Signed in to LikhaLocal"
    );

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

    await recordUserActivity(
      req.userId,
      req.userRole,
      "profile",
      "Updated profile information"
    );

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

      await recordUserActivity(
        req.userId,
        req.userRole,
        "profile",
        "Updated profile picture"
      );

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
  fileFilter: imageFileFilter,
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
async function attachProductVariants(products, executor = pool) {
  if (products.length === 0) {
    return products;
  }

  const productIds = products.map((product) => Number(product.id));
  const placeholders = productIds.map(() => "?").join(", ");
  const [variants] = await executor.execute(
    `SELECT id, product_id, size, color, price, stock
     FROM product_variants
     WHERE product_id IN (${placeholders})
     ORDER BY id ASC`,
    productIds
  );
  const variantsByProduct = new Map();

  for (const variant of variants) {
    const productId = Number(variant.product_id);
    const productVariants = variantsByProduct.get(productId) || [];
    productVariants.push({
      id: Number(variant.id),
      size: variant.size || "",
      color: variant.color || "",
      price: Number(variant.price),
      stock: Number(variant.stock),
    });
    variantsByProduct.set(productId, productVariants);
  }

  return products.map((product) => {
    const productVariants = variantsByProduct.get(Number(product.id)) || [];
    if (productVariants.length === 0) {
      return product;
    }

    return {
      ...product,
      price: Math.min(...productVariants.map((variant) => variant.price)),
      stock: productVariants.reduce(
        (total, variant) => total + variant.stock,
        0
      ),
      variants: productVariants,
    };
  });
}

app.get("/api/products", async (req, res) => {
  try {
    const [productRows] = await pool.execute(
      `SELECT
        p.id,
        p.seller_id,
        p.name,
        p.description,
        p.price,
        p.shipping_fee,
        p.stock,
        p.image_url,
        p.status,
        c.name AS category,
        u.full_name AS seller_name
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       INNER JOIN users u
         ON p.seller_id = u.id
        AND u.role = 'seller'
        AND u.is_active = 1
       WHERE p.status = 'approved'
       ORDER BY p.id DESC`
    );
    const products = await attachProductVariants(productRows);

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
      const [productRows] = await pool.execute(
        `SELECT
           p.id,
           p.name,
           p.description,
           p.price,
           p.shipping_fee,
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
      const products = await attachProductVariants(productRows);

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
    let connection;

    try {
      const {
        name,
        description,
        price,
        shipping_fee,
        stock,
        variants,
        category_id,
        image_url,
      } = req.body;

      const productName =
        typeof name === "string" ? name.trim() : "";

      const productDescription =
        typeof description === "string"
          ? description.trim()
          : "";

      let productPrice = Number(price);
      const productShippingFee = Number(shipping_fee);
      let productStock = Number(stock);
      let productVariants = [];

      if (variants !== undefined && variants !== null) {
        try {
          productVariants =
            typeof variants === "string" ? JSON.parse(variants) : variants;
        } catch {
          return res.status(400).json({
            success: false,
            message: "Product variations must be valid JSON.",
          });
        }

        if (
          !Array.isArray(productVariants) ||
          productVariants.length === 0 ||
          productVariants.length > 100
        ) {
          return res.status(400).json({
            success: false,
            message: "Add between 1 and 100 product variations.",
          });
        }

        const seenOptions = new Set();
        let totalVariantStock = 0;
        let lowestVariantPrice = Number.POSITIVE_INFINITY;

        for (const [index, variant] of productVariants.entries()) {
          const size =
            typeof variant?.size === "string" ? variant.size.trim() : "";
          const color =
            typeof variant?.color === "string" ? variant.color.trim() : "";
          const variantPrice = Number(variant?.price);
          const variantStock = Number(variant?.stock);

          if (
            (!size && !color) ||
            size.length > 100 ||
            color.length > 100 ||
            !Number.isFinite(variantPrice) ||
            variantPrice <= 0 ||
            variantPrice > 99999999.99 ||
            !Number.isInteger(variantStock) ||
            variantStock < 0 ||
            variantStock > 2147483647
          ) {
            return res.status(400).json({
              success: false,
              message: `Variation ${index + 1} needs a size or color, a valid price, and whole-number stock.`,
            });
          }

          const optionKey = `${size.toLowerCase()}\u0000${color.toLowerCase()}`;
          if (seenOptions.has(optionKey)) {
            return res.status(400).json({
              success: false,
              message: "Product variation combinations must be unique.",
            });
          }

          seenOptions.add(optionKey);
          totalVariantStock += variantStock;
          lowestVariantPrice = Math.min(lowestVariantPrice, variantPrice);
          productVariants[index] = {
            size: size || null,
            color: color || null,
            price: variantPrice,
            stock: variantStock,
          };
        }

        const hasSizes = productVariants.some((variant) => variant.size);
        const hasColors = productVariants.some((variant) => variant.color);
        if (
          productVariants.some(
            (variant) =>
              Boolean(variant.size) !== hasSizes ||
              Boolean(variant.color) !== hasColors
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Use the same variation fields for every option combination.",
          });
        }

        if (totalVariantStock > 2147483647) {
          return res.status(400).json({
            success: false,
            message: "The combined variation stock is too large.",
          });
        }

        productPrice = lowestVariantPrice;
        productStock = totalVariantStock;
      }

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
        productVariants.length === 0 &&
        (price === "" ||
          price === null ||
          price === undefined ||
          !Number.isFinite(productPrice) ||
          productPrice <= 0 ||
          productPrice > 99999999.99)
      ) {
        return res.status(400).json({
          success: false,
          message: "Enter a valid product price greater than zero.",
        });
      }

      if (
        shipping_fee === "" ||
        shipping_fee === null ||
        shipping_fee === undefined ||
        !Number.isFinite(productShippingFee) ||
        productShippingFee < 0 ||
        productShippingFee > 99999999.99
      ) {
        return res.status(400).json({
          success: false,
          message: "Enter a valid shipping fee of zero or more.",
        });
      }

      if (
        productVariants.length === 0 &&
        (stock === "" ||
          stock === null ||
          stock === undefined ||
          !Number.isInteger(productStock) ||
          productStock < 0 ||
          productStock > 2147483647)
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

      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [result] = await connection.execute(
        `INSERT INTO products
          (
            seller_id,
            category_id,
            name,
            description,
            price,
            shipping_fee,
            stock,
            image_url,
            status
          )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          req.userId,
          categoryId,
          productName,
          productDescription || null,
          productPrice,
          productShippingFee,
          productStock,
          productImage,
        ]
      );

      const savedVariants = [];
      for (const variant of productVariants) {
        const [variantResult] = await connection.execute(
          `INSERT INTO product_variants
            (product_id, size, color, price, stock)
           VALUES (?, ?, ?, ?, ?)`,
          [
            result.insertId,
            variant.size,
            variant.color,
            variant.price,
            variant.stock,
          ]
        );
        savedVariants.push({
          id: variantResult.insertId,
          ...variant,
        });
      }

      await connection.commit();
      connection.release();
      connection = null;

      // Notify active staff after saving the product.
      await notifyStaffOfPendingProduct({
        id: result.insertId,
        name: productName,
      });

      await recordUserActivity(
        req.userId,
        req.userRole,
        "product",
        `Submitted product "${productName}" for review`
      );

      return res.status(201).json({
        success: true,
        message:
          "Product submitted successfully and is now available for staff review. An administrator makes the final approval decision.",
        product: {
          id: result.insertId,
          seller_id: req.userId,
          category_id: categoryId,
          name: productName,
          description: productDescription || null,
          price: productPrice,
          shipping_fee: productShippingFee,
          stock: productStock,
          image_url: productImage,
          status: "pending",
          variants: savedVariants,
        },
      });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error("Product creation rollback error:", rollbackError);
        }
      }

      console.error("Submit seller product error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to submit your product.",
      });
    } finally {
      if (connection) {
        connection.release();
      }
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
          p.shipping_fee,
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

      const [productRows] = await pool.execute(sql, params);
      const products = await attachProductVariants(productRows);

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

// Permanently delete a product that has not been included in an order.
app.delete(
  "/api/admin/products/:id",
  authenticateUser,
  allowRoles("admin"),
  async (req, res) => {
    let connection;

    try {
      const productId = Number(req.params.id);

      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID.",
        });
      }

      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [products] = await connection.execute(
        `SELECT id
         FROM products
         WHERE id = ?
         FOR UPDATE`,
        [productId]
      );

      if (products.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Product not found.",
        });
      }

      const [orderItems] = await connection.execute(
        `SELECT id
         FROM order_items
         WHERE product_id = ?
         LIMIT 1`,
        [productId]
      );

      if (orderItems.length > 0) {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message:
            "This product is part of order history and cannot be permanently deleted.",
        });
      }

      await connection.execute(
        "DELETE FROM cart_items WHERE product_id = ?",
        [productId]
      );

      const [result] = await connection.execute(
        "DELETE FROM products WHERE id = ?",
        [productId]
      );

      if (result.affectedRows !== 1) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Product not found.",
        });
      }

      await connection.commit();

      await recordUserActivity(
        req.userId,
        req.userRole,
        "product",
        `Deleted product #${productId}`
      );

      return res.json({
        success: true,
        message: "Product deleted successfully.",
      });
    } catch (error) {
      if (connection) {
        await connection.rollback().catch((rollbackError) => {
          console.error("Rollback admin product deletion error:", rollbackError);
        });
      }

      console.error("Delete admin product error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to delete the product.",
      });
    } finally {
      if (connection) {
        connection.release();
      }
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

      await recordUserActivity(
        req.userId,
        req.userRole,
        "product",
        `${status === "approved" ? "Approved" : "Rejected"} product #${productId}`
      );

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

app.post(
  "/api/admin/categories",
  authenticateUser,
  allowRoles("admin"),
  async (req, res) => {
    const name =
      typeof req.body?.name === "string" ? req.body.name.trim() : "";

    if (!name || name.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Category name must be between 1 and 100 characters.",
      });
    }

    try {
      const [result] = await pool.execute(
        "INSERT INTO categories (name) VALUES (?)",
        [name]
      );

      const category = {
        id: result.insertId,
        name,
        description: null,
      };

      await recordUserActivity(
        req.userId,
        req.userRole,
        "category",
        `Created category "${name}"`
      );

      return res.status(201).json({
        success: true,
        message: "Category created successfully.",
        category,
      });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          success: false,
          message: "A category with this name already exists.",
        });
      }

      console.error("Create category error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to create the category.",
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

      await recordUserActivity(
        req.userId,
        req.userRole,
        "account_management",
        `Created a ${cleanRole} account`
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

      await recordUserActivity(
        req.userId,
        req.userRole,
        "account_management",
        `${is_active ? "Activated" : "Deactivated"} ${targetUser.role} account #${targetUser.id}`
      );

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
          p.shipping_fee,
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

      const [productRows] = await pool.execute(sql, params);
      const products = await attachProductVariants(productRows);

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

      const [productRows] = await pool.execute(
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
            p.shipping_fee,
            p.stock,
            p.image_url,
            p.status,
            p.created_at
          FROM products p
          LEFT JOIN users u ON u.id = p.seller_id
          LEFT JOIN categories c ON c.id = p.category_id
          WHERE p.id = ?
          LIMIT 1
        `,
        [productId]
      );

      if (productRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Product not found.",
        });
      }
      const [product] = await attachProductVariants(productRows);

      await recordUserActivity(
        req.userId,
        req.userRole,
        "product_review",
        `Inspected product #${productId}`
      );

      return res.json({
        success: true,
        message: "Product details retrieved successfully.",
        product,
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

      await recordUserActivity(
        req.userId,
        req.userRole,
        "seller_settings",
        `Updated delivery fee to ₱${roundedFee.toFixed(2)}`
      );

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

      await recordUserActivity(
        req.userId,
        req.userRole,
        "seller_settings",
        "Updated delivery origin"
      );

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

app.get(
  "/api/seller/reviews",
  authenticateUser,
  allowRoles("seller"),
  async (req, res) => {
    try {
      const [reviews] = await pool.execute(
        `SELECT
           review.id,
           review.order_id,
           review.product_id,
           review.rating,
           review.comment,
           review.created_at,
           product.name AS product_name,
           customer.full_name AS customer_name
         FROM product_reviews review
         JOIN products product ON product.id = review.product_id
         JOIN users customer ON customer.id = review.customer_id
         WHERE product.seller_id = ?
         ORDER BY review.created_at DESC, review.id DESC
         LIMIT 100`,
        [req.userId]
      );

      return res.json({
        success: true,
        reviews: reviews.map((review) => ({
          id: review.id,
          orderId: review.order_id,
          productId: review.product_id,
          productName: review.product_name,
          customerName: review.customer_name,
          rating: Number(review.rating),
          comment: review.comment || "",
          createdAt: review.created_at,
        })),
      });
    } catch (error) {
      console.error("Fetch seller reviews error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to retrieve product reviews.",
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

  // Combine duplicate product/variation pairs and validate quantities.
  const quantities = new Map();

  for (const item of items) {
    const productId = Number(item.productId);
    const quantity = Number(item.quantity);
    const variantId =
      item.variantId === undefined ||
      item.variantId === null ||
      item.variantId === ""
        ? null
        : Number(item.variantId);

    if (
      !Number.isSafeInteger(productId) ||
      productId <= 0 ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      quantity > 999 ||
      (variantId !== null &&
        (!Number.isSafeInteger(variantId) || variantId <= 0))
    ) {
      return res.status(400).json({
        success: false,
        message: "One or more product quantities are invalid.",
      });
    }

    const itemKey = `${productId}:${variantId ?? "base"}`;
    const combinedQuantity =
      (quantities.get(itemKey)?.quantity || 0) + quantity;

    if (combinedQuantity > 999) {
      return res.status(400).json({
        success: false,
        message: "The requested quantity is too large.",
      });
    }

    quantities.set(itemKey, {
      productId,
      variantId,
      quantity: combinedQuantity,
    });
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
    for (const { productId, variantId, quantity } of quantities.values()) {
      const [products] = await connection.execute(
        `SELECT
           p.id,
           p.name,
           p.price,
           p.shipping_fee,
           p.stock,
           p.status,
           p.seller_id
         FROM products p
         INNER JOIN users u
           ON u.id = p.seller_id
          AND u.role = 'seller'
          AND u.is_active = 1
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
      let variant = null;

      if (variantId !== null) {
        const [variantRows] = await connection.execute(
          `SELECT id, size, color, price, stock
           FROM product_variants
           WHERE id = ? AND product_id = ?
           FOR UPDATE`,
          [variantId, productId]
        );

        if (variantRows.length === 0) {
          const error = new Error(
            `The selected variation for ${product.name} is unavailable.`
          );
          error.statusCode = 400;
          throw error;
        }

        variant = variantRows[0];
      } else {
        const [variantRows] = await connection.execute(
          `SELECT id
           FROM product_variants
           WHERE product_id = ?
           LIMIT 1
           FOR UPDATE`,
          [productId]
        );

        if (variantRows.length > 0) {
          const error = new Error(
            `Choose a variation for ${product.name} before checkout.`
          );
          error.statusCode = 400;
          throw error;
        }
      }

      if (product.status !== "approved") {
        const error = new Error(
          `${product.name} is not currently available for purchase.`
        );
        error.statusCode = 400;
        throw error;
      }

      const availableStock = variant
        ? Number(variant.stock)
        : Number(product.stock);

      if (availableStock < quantity) {
        const error = new Error(
          `Not enough stock available for ${product.name}${variant ? " in the selected variation" : ""}.`
        );
        error.statusCode = 400;
        throw error;
      }

      const unitPrice = Number(variant ? variant.price : product.price);
      const productShippingFee = Number(product.shipping_fee);
      const variantDetails = variant
        ? [
            variant.size ? `Size: ${variant.size}` : "",
            variant.color ? `Color: ${variant.color}` : "",
          ]
            .filter(Boolean)
            .join(", ")
        : null;

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error("A product has an invalid price.");
      }

      if (
        !Number.isFinite(productShippingFee) ||
        productShippingFee < 0
      ) {
        throw new Error(
          `The shipping fee for ${product.name} is invalid. Please contact support.`
        );
      }

      subtotal += unitPrice * quantity;

      // Charge once per seller, using the highest fee among their products.
      const sellerId = Number(product.seller_id);

      sellerFees.set(
        sellerId,
        Math.max(sellerFees.get(sellerId) || 0, productShippingFee)
      );

      orderItems.push({
        productId: product.id,
        variantId,
        variantDetails,
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

    const totalAmount = Number((subtotal + deliveryFee).toFixed(2));

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
    const [createdOrderRows] = await connection.execute(
      "SELECT created_at FROM orders WHERE id = ?",
      [orderId]
    );

    if (createdOrderRows.length === 0) {
      throw new Error("Could not load the newly created order date.");
    }

    const createdAt = createdOrderRows[0].created_at;

    // Save the order items and safely reduce stock.
    for (const item of orderItems) {
      await connection.execute(
        `INSERT INTO order_items
          (
            order_id,
            product_id,
            product_variant_id,
            variant_details,
            product_name,
            quantity,
            unit_price
          )
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.productId,
          item.variantId,
          item.variantDetails,
          item.productName,
          item.quantity,
          item.unitPrice,
        ]
      );

      let stockResult;

      if (item.variantId !== null) {
        [stockResult] = await connection.execute(
          `UPDATE product_variants
           SET stock = stock - ?
           WHERE id = ? AND product_id = ? AND stock >= ?`,
          [item.quantity, item.variantId, item.productId, item.quantity]
        );

        if (stockResult.affectedRows === 1) {
          [stockResult] = await connection.execute(
            `UPDATE products
             SET stock = stock - ?
             WHERE id = ? AND stock >= ? AND status = 'approved'`,
            [item.quantity, item.productId, item.quantity]
          );
        }
      } else {
        [stockResult] = await connection.execute(
          `UPDATE products
           SET stock = stock - ?
           WHERE id = ? AND stock >= ? AND status = 'approved'`,
          [item.quantity, item.productId, item.quantity]
        );
      }

      if (stockResult.affectedRows !== 1) {
        const error = new Error(
          `Stock changed while processing ${item.productName}. Please try again.`
        );
        error.statusCode = 409;
        throw error;
      }
    }

    await connection.execute(
      `INSERT INTO seller_order_status (order_id, seller_id, status)
       SELECT ?, p.seller_id, 'pending'
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?
       GROUP BY p.seller_id`,
      [orderId, orderId]
    );

    await connection.commit();
    transactionStarted = false;

    await recordUserActivity(
      req.customerId,
      "customer",
      "order",
      `Placed order #${orderId}`
    );

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
        createdAt,
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
      message: error.statusCode
        ? error.message
        : "Unable to place your order. Please try again.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.get("/api/customer/orders", ...authenticateCustomer, async (req, res) => {
  try {
    await pool.execute(
      `INSERT IGNORE INTO seller_order_status (order_id, seller_id, status)
       SELECT DISTINCT o.id, p.seller_id, 'pending'
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       WHERE o.customer_id = ?`,
      [req.customerId]
    );

    const [rows] = await pool.execute(
      `SELECT
         o.id AS order_id,
         o.total_amount,
         o.delivery_address,
         o.contact_number,
         o.status AS order_status,
         o.created_at,
         o.delivery_fee,
         o.payment_method,
         o.payment_status,
         o.delivery_fee_status,
         oi.id AS order_item_id,
         oi.product_id,
         oi.product_name,
         oi.variant_details,
         oi.quantity,
         oi.unit_price,
         p.image_url,
         p.seller_id,
         seller.full_name AS seller_name,
         sos.status AS seller_status,
         sos.tracking_carrier,
         sos.tracking_number,
         sos.shipped_at,
         sos.delivered_at,
         review.id AS review_id,
         review.rating AS review_rating,
         review.comment AS review_comment,
         returnRequest.id AS return_id,
         returnRequest.reason AS return_reason,
         returnRequest.details AS return_details,
         returnRequest.status AS return_status,
         returnRequest.seller_response AS return_seller_response
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN users seller ON seller.id = p.seller_id
       LEFT JOIN seller_order_status sos
         ON sos.order_id = o.id AND sos.seller_id = p.seller_id
       LEFT JOIN product_reviews review ON review.order_item_id = oi.id
       LEFT JOIN return_requests returnRequest
         ON returnRequest.order_item_id = oi.id
       WHERE o.customer_id = ?
       ORDER BY o.created_at DESC, o.id DESC, oi.id ASC`,
      [req.customerId]
    );

    const orderMap = new Map();

    for (const row of rows) {
      if (!orderMap.has(row.order_id)) {
        orderMap.set(row.order_id, {
          id: row.order_id,
          totalAmount: Number(row.total_amount),
          deliveryAddress: row.delivery_address,
          contactNumber: row.contact_number,
          orderStatus: row.order_status,
          createdAt: row.created_at,
          deliveryFee: Number(row.delivery_fee),
          paymentMethod: row.payment_method,
          paymentStatus: row.payment_status,
          deliveryFeeStatus: row.delivery_fee_status,
          items: [],
          sellers: new Map(),
        });
      }

      const order = orderMap.get(row.order_id);
      const sellerKey = String(row.seller_id || "unknown");
      const sellerStatus = row.seller_status || "pending";

      if (!order.sellers.has(sellerKey)) {
        order.sellers.set(sellerKey, {
          sellerId: row.seller_id,
          sellerName: row.seller_name || "Local Seller",
          status: sellerStatus,
          trackingCarrier: row.tracking_carrier,
          trackingNumber: row.tracking_number,
          shippedAt: row.shipped_at,
          deliveredAt: row.delivered_at,
        });
      } else {
        const seller = order.sellers.get(sellerKey);
        if (sellerStatus === "shipped" || sellerStatus === "delivered") {
          seller.status = sellerStatus;
        } else if (seller.status === "pending" && sellerStatus !== "pending") {
          seller.status = sellerStatus;
        }
      }

      order.items.push({
        id: row.order_item_id,
        productId: row.product_id,
        productName: row.product_name,
        variantDetails: row.variant_details,
        imageUrl: row.image_url,
        sellerId: row.seller_id,
        sellerName: row.seller_name || "Local Seller",
        quantity: Number(row.quantity),
        unitPrice: Number(row.unit_price),
        subtotal: Number(row.quantity) * Number(row.unit_price),
        sellerStatus,
        trackingCarrier: row.tracking_carrier,
        trackingNumber: row.tracking_number,
        shippedAt: row.shipped_at,
        deliveredAt: row.delivered_at,
        review: row.review_id
          ? {
              id: row.review_id,
              rating: Number(row.review_rating),
              comment: row.review_comment,
            }
          : null,
        returnRequest: row.return_id
          ? {
              id: row.return_id,
              reason: row.return_reason,
              details: row.return_details,
              status: row.return_status,
              sellerResponse: row.return_seller_response,
            }
          : null,
      });
    }

    const orders = Array.from(orderMap.values()).map((order) => {
      const sellers = Array.from(order.sellers.values());
      const statuses = sellers.map((seller) => seller.status);
      let derivedStatus = order.orderStatus;

      if (
        statuses.length > 0 &&
        statuses.every((status) => status === "delivered" || status === "rejected")
      ) {
        derivedStatus = statuses.every((status) => status === "rejected")
          ? "cancelled"
          : "delivered";
      } else if (statuses.some((status) => status === "shipped")) {
        derivedStatus = "shipped";
      } else if (statuses.some((status) => status === "processing")) {
        derivedStatus = "processing";
      } else if (statuses.some((status) => status === "confirmed")) {
        derivedStatus = "confirmed";
      } else if (statuses.some((status) => status === "pending")) {
        derivedStatus = "pending";
      }

      return {
        ...order,
        sellers,
        orderStatus: derivedStatus,
      };
    });

    return res.json({ success: true, orders });
  } catch (error) {
    console.error("Fetch customer orders error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load your orders.",
    });
  }
});

app.get(
  "/api/orders/conversations",
  authenticateUser,
  allowRoles("customer", "seller"),
  async (req, res) => {
    try {
      const isCustomer = req.userRole === "customer";
      const participantId = req.userId;
      const [rows] = await pool.execute(
        `SELECT
           o.id AS order_id,
           o.created_at AS order_created_at,
           ${isCustomer ? "seller.id" : "customer.id"} AS other_user_id,
           ${isCustomer ? "seller.full_name" : "customer.full_name"} AS other_name,
           p.seller_id,
           (
             SELECT message
             FROM order_messages
             WHERE order_id = o.id AND seller_id = p.seller_id
             ORDER BY id DESC
             LIMIT 1
           ) AS last_message,
           (
             SELECT created_at
             FROM order_messages
             WHERE order_id = o.id AND seller_id = p.seller_id
             ORDER BY id DESC
             LIMIT 1
           ) AS last_message_at,
           (
             SELECT COUNT(*)
             FROM order_messages unread
             WHERE unread.order_id = o.id
               AND unread.seller_id = p.seller_id
               AND unread.sender_id <> ?
               AND unread.read_at IS NULL
           ) AS unread_count
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN products p ON p.id = oi.product_id
         JOIN users seller ON seller.id = p.seller_id
         JOIN users customer ON customer.id = o.customer_id
         WHERE ${isCustomer ? "o.customer_id = ?" : "p.seller_id = ?"}
         GROUP BY o.id, o.created_at, other_user_id, other_name, p.seller_id
         ORDER BY COALESCE(last_message_at, o.created_at) DESC, o.id DESC`,
        [participantId, participantId]
      );

      return res.json({
        success: true,
        conversations: rows.map((row) => ({
          orderId: row.order_id,
          orderCreatedAt: row.order_created_at,
          sellerId: row.seller_id,
          otherUserId: row.other_user_id,
          otherName: row.other_name,
          lastMessage: row.last_message,
          lastMessageAt: row.last_message_at,
          unreadCount: Number(row.unread_count),
        })),
      });
    } catch (error) {
      console.error("Fetch order conversations error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to load order messages.",
      });
    }
  }
);

async function verifyOrderConversationAccess(orderId, sellerId, userId, role) {
  const [rows] = await pool.execute(
    `SELECT o.id
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     WHERE o.id = ?
       AND p.seller_id = ?
       AND ${role === "customer" ? "o.customer_id = ?" : "p.seller_id = ?"}
     LIMIT 1`,
    [orderId, sellerId, userId]
  );
  return rows.length > 0;
}

app.get(
  "/api/orders/:orderId/messages",
  authenticateUser,
  allowRoles("customer", "seller"),
  async (req, res) => {
    const orderId = Number(req.params.orderId);
    const sellerId = Number(req.query.sellerId);

    if (!Number.isSafeInteger(orderId) || orderId < 1 ||
        !Number.isSafeInteger(sellerId) || sellerId < 1) {
      return res.status(400).json({
        success: false,
        message: "A valid order and seller are required.",
      });
    }

    try {
      const allowed = await verifyOrderConversationAccess(
        orderId,
        sellerId,
        req.userId,
        req.userRole
      );

      if (!allowed) {
        return res.status(404).json({
          success: false,
          message: "Order conversation not found.",
        });
      }

      await pool.execute(
        `UPDATE order_messages
         SET read_at = CURRENT_TIMESTAMP
         WHERE order_id = ?
           AND seller_id = ?
           AND sender_id <> ?
           AND read_at IS NULL`,
        [orderId, sellerId, req.userId]
      );

      const [messages] = await pool.execute(
        `SELECT id, sender_id, message, read_at, created_at
         FROM order_messages
         WHERE order_id = ? AND seller_id = ?
         ORDER BY id ASC`,
        [orderId, sellerId]
      );

      return res.json({
        success: true,
        messages: messages.map((message) => ({
          id: message.id,
          senderId: message.sender_id,
          message: message.message,
          readAt: message.read_at,
          createdAt: message.created_at,
        })),
      });
    } catch (error) {
      console.error("Fetch order messages error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to load this conversation.",
      });
    }
  }
);

app.post(
  "/api/orders/:orderId/messages",
  authenticateUser,
  allowRoles("customer", "seller"),
  async (req, res) => {
    const orderId = Number(req.params.orderId);
    const sellerId = Number(req.body?.sellerId);
    const message =
      typeof req.body?.message === "string" ? req.body.message.trim() : "";

    if (!Number.isSafeInteger(orderId) || orderId < 1 ||
        !Number.isSafeInteger(sellerId) || sellerId < 1) {
      return res.status(400).json({
        success: false,
        message: "A valid order and seller are required.",
      });
    }

    if (!message || message.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Message must be between 1 and 2000 characters.",
      });
    }

    try {
      const allowed = await verifyOrderConversationAccess(
        orderId,
        sellerId,
        req.userId,
        req.userRole
      );

      if (!allowed) {
        return res.status(404).json({
          success: false,
          message: "Order conversation not found.",
        });
      }

      const [result] = await pool.execute(
        `INSERT INTO order_messages (order_id, seller_id, sender_id, message)
         VALUES (?, ?, ?, ?)`,
        [orderId, sellerId, req.userId, message]
      );

      await recordUserActivity(
        req.userId,
        req.userRole,
        "message",
        `Sent a message about order #${orderId}`
      );

      return res.status(201).json({
        success: true,
        message: {
          id: result.insertId,
          senderId: req.userId,
          message,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Send order message error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to send your message.",
      });
    }
  }
);

app.patch(
  "/api/seller/orders/:orderId/shipment",
  authenticateUser,
  allowRoles("seller"),
  async (req, res) => {
    const orderId = Number(req.params.orderId);
    const carrier =
      typeof req.body?.carrier === "string" ? req.body.carrier.trim() : "";
    const trackingNumber =
      typeof req.body?.trackingNumber === "string"
        ? req.body.trackingNumber.trim()
        : "";

    if (!Number.isSafeInteger(orderId) || orderId < 1) {
      return res.status(400).json({ success: false, message: "Invalid order ID." });
    }

    if (!carrier || carrier.length > 100 ||
        !trackingNumber || trackingNumber.length > 120) {
      return res.status(400).json({
        success: false,
        message: "Enter a carrier and tracking number.",
      });
    }

    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [result] = await connection.execute(
        `UPDATE seller_order_status
         SET status = 'shipped',
             tracking_carrier = ?,
             tracking_number = ?,
             shipped_at = CURRENT_TIMESTAMP
         WHERE order_id = ?
           AND seller_id = ?
           AND status IN ('confirmed', 'processing')`,
        [carrier, trackingNumber, orderId, req.userId]
      );

      if (result.affectedRows !== 1) {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: "Only an accepted order can be marked as shipped.",
        });
      }

      await connection.execute(
        `UPDATE orders o
         SET o.status = 'shipped'
         WHERE o.id = ?
           AND EXISTS (
             SELECT 1 FROM seller_order_status currentStatus
             WHERE currentStatus.order_id = o.id
               AND currentStatus.status IN ('shipped', 'delivered')
           )
           AND NOT EXISTS (
             SELECT 1 FROM seller_order_status pendingStatus
             WHERE pendingStatus.order_id = o.id
               AND pendingStatus.status NOT IN ('shipped', 'delivered', 'rejected')
           )`,
        [orderId]
      );

      await connection.commit();
      await recordUserActivity(
        req.userId,
        req.userRole,
        "shipment",
        `Added tracking details for order #${orderId}`
      );
      return res.json({ success: true, message: "Shipment details saved." });
    } catch (error) {
      if (connection) await connection.rollback().catch(() => {});
      console.error("Update seller shipment error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to save shipment details.",
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

app.patch(
  "/api/customer/orders/:orderId/delivery",
  ...authenticateCustomer,
  async (req, res) => {
    const orderId = Number(req.params.orderId);
    const sellerId = Number(req.body?.sellerId);

    if (!Number.isSafeInteger(orderId) || orderId < 1 ||
        !Number.isSafeInteger(sellerId) || sellerId < 1) {
      return res.status(400).json({
        success: false,
        message: "A valid order and seller are required.",
      });
    }

    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [result] = await connection.execute(
        `UPDATE seller_order_status sos
         JOIN orders o ON o.id = sos.order_id
         SET sos.status = 'delivered',
             sos.delivered_at = CURRENT_TIMESTAMP
         WHERE sos.order_id = ?
           AND sos.seller_id = ?
           AND o.customer_id = ?
           AND sos.status = 'shipped'`,
        [orderId, sellerId, req.customerId]
      );

      if (result.affectedRows !== 1) {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: "This shipment cannot be marked as received yet.",
        });
      }

      await connection.execute(
        `UPDATE orders o
         SET o.status = 'delivered'
         WHERE o.id = ?
           AND NOT EXISTS (
             SELECT 1 FROM seller_order_status notDelivered
             WHERE notDelivered.order_id = o.id
               AND notDelivered.status NOT IN ('delivered', 'rejected')
           )`,
        [orderId]
      );

      await connection.commit();
      await recordUserActivity(
        req.customerId,
        "customer",
        "order",
        `Confirmed delivery for order #${orderId}`
      );
      return res.json({ success: true, message: "Order marked as received." });
    } catch (error) {
      if (connection) await connection.rollback().catch(() => {});
      console.error("Confirm customer delivery error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to confirm delivery.",
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

app.post(
  "/api/customer/reviews",
  ...authenticateCustomer,
  async (req, res) => {
    const orderItemId = Number(req.body?.orderItemId);
    const rating = Number(req.body?.rating);
    const comment =
      typeof req.body?.comment === "string" ? req.body.comment.trim() : "";

    if (!Number.isSafeInteger(orderItemId) || orderItemId < 1 ||
        !Number.isInteger(rating) || rating < 1 || rating > 5 ||
        comment.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Provide a valid order item, 1–5 star rating, and comment under 2000 characters.",
      });
    }

    try {
      const [items] = await pool.execute(
        `SELECT
           oi.order_id,
           oi.product_id,
           p.seller_id,
           p.name AS product_name,
           customer.full_name AS customer_name,
           sos.status
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN products p ON p.id = oi.product_id
         JOIN users customer ON customer.id = o.customer_id
         JOIN seller_order_status sos
           ON sos.order_id = o.id AND sos.seller_id = p.seller_id
         WHERE oi.id = ? AND o.customer_id = ?
         LIMIT 1`,
        [orderItemId, req.customerId]
      );

      if (!items.length || items[0].status !== "delivered") {
        return res.status(409).json({
          success: false,
          message: "You can review a product after its delivery is confirmed.",
        });
      }

      const item = items[0];
      await pool.execute(
        `INSERT INTO product_reviews
           (order_id, order_item_id, product_id, customer_id, rating, comment)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          item.order_id,
          orderItemId,
          item.product_id,
          req.customerId,
          rating,
          comment || null,
        ]
      );

      await recordUserActivity(
        req.customerId,
        "customer",
        "review",
        `Reviewed product #${item.product_id} from order #${item.order_id}`
      );
      await recordUserActivity(
        item.seller_id,
        "seller",
        "review",
        `${item.customer_name} left a ${rating}-star review for "${item.product_name}"`
      );

      return res.status(201).json({ success: true, message: "Review submitted." });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          success: false,
          message: "This order item has already been reviewed.",
        });
      }
      console.error("Submit product review error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to submit your review.",
      });
    }
  }
);

app.post(
  "/api/customer/returns",
  ...authenticateCustomer,
  async (req, res) => {
    const orderItemId = Number(req.body?.orderItemId);
    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const details =
      typeof req.body?.details === "string" ? req.body.details.trim() : "";
    const allowedReasons = [
      "Damaged item",
      "Wrong item",
      "Missing parts",
      "Not as described",
      "Other",
    ];

    if (!Number.isSafeInteger(orderItemId) || orderItemId < 1 ||
        !allowedReasons.includes(reason) || details.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Choose a return reason and provide details under 2000 characters.",
      });
    }

    try {
      const [items] = await pool.execute(
        `SELECT oi.order_id, p.seller_id, sos.status
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN products p ON p.id = oi.product_id
         JOIN seller_order_status sos
           ON sos.order_id = o.id AND sos.seller_id = p.seller_id
         WHERE oi.id = ? AND o.customer_id = ?
         LIMIT 1`,
        [orderItemId, req.customerId]
      );

      if (!items.length || items[0].status !== "delivered") {
        return res.status(409).json({
          success: false,
          message: "Returns can only be requested for delivered items.",
        });
      }

      const item = items[0];
      await pool.execute(
        `INSERT INTO return_requests
           (order_id, order_item_id, customer_id, seller_id, reason, details)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          item.order_id,
          orderItemId,
          req.customerId,
          item.seller_id,
          reason,
          details || null,
        ]
      );

      await recordUserActivity(
        req.customerId,
        "customer",
        "return",
        `Requested a return for order #${item.order_id}`
      );

      return res.status(201).json({
        success: true,
        message: "Return request sent to the seller.",
      });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          success: false,
          message: "A return request already exists for this item.",
        });
      }
      console.error("Submit return request error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to submit your return request.",
      });
    }
  }
);

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
            customer.full_name AS customer_name,
            o.delivery_address,
            o.contact_number,
            o.total_amount,
            o.delivery_fee,
            o.payment_method,
            o.payment_status,
            o.status AS order_status,
            o.created_at,
            sos.status AS seller_status,
            sos.tracking_carrier,
            sos.tracking_number,
            sos.shipped_at,
            rr.id AS return_id,
            rr.reason AS return_reason,
            rr.details AS return_details,
            rr.status AS return_status,
            oi.product_id,
            oi.id AS order_item_id,
            oi.product_name,
            oi.variant_details,
            oi.quantity,
            oi.unit_price
         FROM seller_order_status sos
         JOIN orders o ON o.id = sos.order_id
         JOIN users customer ON customer.id = o.customer_id
         JOIN order_items oi ON oi.order_id = o.id
         JOIN products p
           ON p.id = oi.product_id
          AND p.seller_id = sos.seller_id
         LEFT JOIN return_requests rr ON rr.order_item_id = oi.id
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
            customerName: row.customer_name,
            deliveryAddress: row.delivery_address,
            contactNumber: row.contact_number,
            totalAmount: Number(row.total_amount),
            deliveryFee: Number(row.delivery_fee),
            paymentMethod: row.payment_method,
            paymentStatus: row.payment_status,
            orderStatus: row.order_status,
            sellerStatus: row.seller_status,
            trackingCarrier: row.tracking_carrier,
            trackingNumber: row.tracking_number,
            shippedAt: row.shipped_at,
            createdAt: row.created_at,
            items: [],
          });
        }

        ordersById.get(row.order_id).items.push({
          orderItemId: row.order_item_id,
          productId: row.product_id,
          productName: row.product_name,
          variantDetails: row.variant_details,
          quantity: row.quantity,
          unitPrice: Number(row.unit_price),
          subtotal: Number(row.unit_price) * row.quantity,
          returnRequest: row.return_id
            ? {
                id: row.return_id,
                reason: row.return_reason,
                details: row.return_details,
                status: row.return_status,
              }
            : null,
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

app.patch(
  "/api/seller/returns/:returnId",
  authenticateUser,
  allowRoles("seller"),
  async (req, res) => {
    const returnId = Number(req.params.returnId);
    const decision = req.body?.decision;
    const response =
      typeof req.body?.response === "string" ? req.body.response.trim() : "";

    if (!Number.isSafeInteger(returnId) || returnId < 1 ||
        !["approved", "rejected"].includes(decision) ||
        response.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Provide a valid return decision and response.",
      });
    }

    try {
      const [result] = await pool.execute(
        `UPDATE return_requests
         SET status = ?, seller_response = ?
         WHERE id = ? AND seller_id = ? AND status = 'requested'`,
        [decision, response || null, returnId, req.userId]
      );

      if (result.affectedRows !== 1) {
        return res.status(404).json({
          success: false,
          message: "Pending return request not found.",
        });
      }

      await recordUserActivity(
        req.userId,
        req.userRole,
        "return",
        `${decision === "approved" ? "Approved" : "Rejected"} return request #${returnId}`
      );

      return res.json({
        success: true,
        message: `Return request ${decision}.`,
      });
    } catch (error) {
      console.error("Respond to return request error:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to update the return request.",
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

      // Lock the seller's order items so rejection and inventory restoration
      // happen together without racing another response to the same order.
      const [sellerItems] = await connection.execute(
        `SELECT oi.product_id, oi.product_variant_id, oi.quantity
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = ?
           AND p.seller_id = ?
         FOR UPDATE`,
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

      if (decision === "rejected") {
        const restockQuantities = new Map();
        const variantRestockQuantities = new Map();

        for (const item of sellerItems) {
          const productId = Number(item.product_id);
          const quantity = Number(item.quantity);

          restockQuantities.set(
            productId,
            (restockQuantities.get(productId) || 0) + quantity
          );

          if (item.product_variant_id !== null) {
            const variantId = Number(item.product_variant_id);
            variantRestockQuantities.set(
              variantId,
              (variantRestockQuantities.get(variantId) || 0) + quantity
            );
          }
        }

        for (const [variantId, quantity] of variantRestockQuantities) {
          const [variantResult] = await connection.execute(
            `UPDATE product_variants
             SET stock = stock + ?
             WHERE id = ?`,
            [quantity, variantId]
          );

          if (variantResult.affectedRows !== 1) {
            throw new Error(
              `Could not restore stock for variation #${variantId}.`
            );
          }
        }

        for (const [productId, quantity] of restockQuantities) {
          const [stockResult] = await connection.execute(
            `UPDATE products
             SET stock = stock + ?
             WHERE id = ? AND seller_id = ?`,
            [quantity, productId, sellerId]
          );

          if (stockResult.affectedRows !== 1) {
            throw new Error(
              `Could not restore stock for product #${productId}.`
            );
          }
        }
      }

      await connection.commit();

      await recordUserActivity(
        req.userId,
        req.userRole,
        "order",
        `${decision === "confirmed" ? "Accepted" : "Rejected"} order #${orderId}`
      );

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