require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const path = require("path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const credentialPath = path.resolve(
  __dirname,
  process.env.GOOGLE_APPLICATION_CREDENTIALS
);

const serviceAccount = require(credentialPath);

initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

async function testFirebaseAdmin() {
  try {
    await getAuth().getUserByEmail(
      "firebase-admin-check@example.invalid"
    );
    console.log("Firebase Admin initialized successfully.");
    console.log("Test account lookup completed.");
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      console.log("Firebase Admin initialized successfully.");
      console.log("Test lookup reached Firebase Authentication.");
    } else {
      console.error("Firebase Admin test failed:", error.message);
      process.exitCode = 1;
    }
  }
}

testFirebaseAdmin();
