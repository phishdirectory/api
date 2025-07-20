export function hashData(data, hash_key) {
  // Need to include crypto libraries
  const crypto = require("crypto");

  // Convert data to JSON
  const jsonData = JSON.stringify(data);

  // Create key and iv from the hash_key
  const key = crypto
    .createHash("sha256")
    .update(hash_key)
    .digest()
    .slice(0, 32);
  const iv = Buffer.from(hash_key.slice(0, 16).padEnd(16, "0"), "utf8");

  // Create cipher using aes-256-cbc
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

  // Encrypt the data
  let encrypted = cipher.update(jsonData, "utf8", "binary");
  encrypted += cipher.final("binary");

  // Convert binary to Buffer then encode to base64
  return Buffer.from(encrypted, "binary").toString("base64");
}
