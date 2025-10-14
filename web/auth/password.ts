const ENCODER = new TextEncoder();

function ab2str(buf: ArrayBuffer): string {
  return String.fromCharCode.apply(null, Array.from(new Uint8Array(buf)));
}

function str2ab(str: string): ArrayBuffer {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    ENCODER.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"],
  );
  const key = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );

  return `pbkdf2_sha256$100000$${ab2str(salt)}$${ab2str(key)}`;
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  const [algorithm, iterations, salt, key] = hash.split("$");
  if (algorithm !== "pbkdf2_sha256") {
    throw new Error("Unsupported hash algorithm");
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    ENCODER.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"],
  );
  const derivedKey = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: str2ab(salt),
      iterations: parseInt(iterations),
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );

  return ab2str(derivedKey) === key;
}
