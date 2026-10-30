
require("dotenv").config();

const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const readline = require("readline/promises");
const { stdin, stdout } = require("process");

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  let connection;

  try {
    const fullName = (await rl.question("Admin full name: ")).trim();
    const email = (await rl.question("Admin email: ")).trim().toLowerCase();
    const password = await rl.question("Admin password (hidden input is not supported): ");

    if (fullName.length < 2 || fullName.length > 120) {
      throw new Error("Name must be between 2 and 120 characters.");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Please enter a valid email address.");
    }

    if (password.length < 12 || password.length > 72) {
      throw new Error("Use a password between 12 and 72 characters.");
    }

    connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "likhalocal",
    });

    const [existing] = await connection.execute(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (existing.length) {
      throw new Error("An account with this email already exists.");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await connection.execute(
      `INSERT INTO users
       (full_name, email, password_hash, role, is_active)
       VALUES (?, ?, ?, 'admin', 1)`,
      [fullName, email, passwordHash]
    );

    console.log("Admin account created successfully.");
    console.log("You can now use this email and password to log in.");
  } finally {
    rl.close();
    if (connection) await connection.end();
  }
}

main().catch((error) => {
  console.error("Could not create admin:", error.message);
  process.exitCode = 1;
});
