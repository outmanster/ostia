const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const CHARSET_REV = new Map(Array.from(CHARSET).map((c, i) => [c, i]));

function bech32Polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= GEN[i];
    }
  }
  return chk >>> 0;
}

function bech32HrpExpand(hrp) {
  const res = [];
  for (let i = 0; i < hrp.length; i++) res.push(hrp.charCodeAt(i) >>> 5);
  res.push(0);
  for (let i = 0; i < hrp.length; i++) res.push(hrp.charCodeAt(i) & 31);
  return res;
}

function bech32VerifyChecksum(hrp, data) {
  const polymod = bech32Polymod(bech32HrpExpand(hrp).concat(data));
  return polymod === 1 || polymod === 0x2bc830a3;
}

function bech32Decode(input) {
  const str = input.toLowerCase();
  const pos = str.lastIndexOf("1");
  if (pos < 1 || pos + 7 > str.length) return null;
  const hrp = str.slice(0, pos);
  const data = [];
  for (let i = pos + 1; i < str.length; i++) {
    const c = str[i];
    const v = CHARSET_REV.get(c);
    if (v === undefined) return null;
    data.push(v);
  }
  if (!bech32VerifyChecksum(hrp, data)) return null;
  return { hrp, data: data.slice(0, -6) };
}

function convertBits(data, from, to, pad) {
  let acc = 0;
  let bits = 0;
  const ret = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    if (value < 0 || value >> from) return null;
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) ret.push((acc << (to - bits)) & maxv);
  } else {
    if (bits >= from) return null;
    if (((acc << (to - bits)) & maxv) !== 0) return null;
  }
  return ret;
}

function main() {
  const raw = process.argv[2];
  if (!raw) {
    console.log("用法: node scripts/npub-to-hex.mjs npub1...");
    process.exit(1);
  }
  const cleaned = raw.startsWith("nostr:") ? raw.slice("nostr:".length) : raw;
  const decoded = bech32Decode(cleaned);
  if (!decoded) {
    console.log("无效的 bech32 编码");
    process.exit(1);
  }
  if (decoded.hrp !== "npub") {
    console.log(`无效的人类可读前缀: ${decoded.hrp}`);
    process.exit(1);
  }
  const bytes = convertBits(decoded.data, 5, 8, false);
  if (!bytes || bytes.length !== 32) {
    console.log("解析失败或长度不正确");
    process.exit(1);
  }
  const hex = Buffer.from(bytes).toString("hex");
  console.log(hex);
}

main();
