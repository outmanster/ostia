import fs from "fs";
import path from "path";
import crypto from "crypto";

const root = process.cwd();
const tauriPath = path.join(root, "src-tauri", "tauri.conf.json");
const tauri = JSON.parse(fs.readFileSync(tauriPath, "utf8"));

const productName = tauri.productName || "Ostia";
const version = tauri.version || "0.1.0";
const bundleId = tauri.identifier || "cc.opensaas.ostia";
const subtitle = process.env.ALTSTORE_SUBTITLE || tauri.bundle?.shortDescription || "";
const description = process.env.ALTSTORE_DESCRIPTION || tauri.bundle?.longDescription || "";
const developerName = process.env.ALTSTORE_DEVELOPER || "Ostia Team";

const sourceName = process.env.ALTSTORE_SOURCE_NAME || `${productName} 源`;
const sourceIdentifier = process.env.ALTSTORE_SOURCE_IDENTIFIER || `${bundleId}.altstore`;
const sourceURL = process.env.ALTSTORE_SOURCE_URL || "http://localhost:8080/altstore.json";

const ipaUrl = process.env.ALTSTORE_IPA_URL || "http://localhost:8080/ostia.ipa";
const ipaPath = process.env.ALTSTORE_IPA_PATH || "";
const minOSVersion = process.env.ALTSTORE_MIN_IOS || "14.0";
const maxOSVersion = process.env.ALTSTORE_MAX_IOS || "";
const buildVersion = process.env.ALTSTORE_BUILD_VERSION || version;

const iconURL = process.env.ALTSTORE_ICON_URL || "";
const tintColor = process.env.ALTSTORE_TINT_COLOR || "";
const category = process.env.ALTSTORE_CATEGORY || "social";
const screenshots = (process.env.ALTSTORE_SCREENSHOTS || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

let size = Number(process.env.ALTSTORE_IPA_SIZE || 0);
let sha256 = process.env.ALTSTORE_SHA256 || "";

if (ipaPath && fs.existsSync(ipaPath)) {
  const buffer = fs.readFileSync(ipaPath);
  size = buffer.length;
  sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
}

if (!size) {
  console.warn("未提供 IPA 文件大小，将输出 size=0，建议设置 ALTSTORE_IPA_PATH 或 ALTSTORE_IPA_SIZE");
}

const versionEntry = {
  version,
  buildVersion,
  date: new Date().toISOString(),
  localizedDescription: process.env.ALTSTORE_RELEASE_NOTES || "",
  downloadURL: ipaUrl,
  size,
  minOSVersion,
  ...(maxOSVersion ? { maxOSVersion } : {}),
  ...(sha256 ? { sha256 } : {}),
};

const appEntry = {
  name: productName,
  bundleIdentifier: bundleId,
  developerName,
  subtitle,
  localizedDescription: description,
  versions: [versionEntry],
  iconURL: iconURL || "https://ostia.opensaas.cc/logo_padded.png",
  ...(tintColor ? { tintColor } : {}),
  ...(category ? { category } : {}),
  ...(screenshots.length ? { screenshots } : {}),
};

const source = {
  name: sourceName,
  identifier: sourceIdentifier,
  sourceURL,
  apps: [appEntry],
};

const outputPath =
  process.env.ALTSTORE_OUTPUT || path.join(root, "altstore", "altstore.json");

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(source, null, 2) + "\n");
console.log(`AltStore 源已生成: ${outputPath}`);
