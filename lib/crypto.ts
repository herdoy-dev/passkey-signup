import { ec as EC } from 'elliptic';

// SHA-256 hashing function
export const sha256 = async (input: string): Promise<string> => {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

// Base64URL encoding for strings
export const toBase64Url = (str: string): string => {
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

// Base64URL encoding for ArrayBuffer
export const toBase64UrlBytes = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * Sign payload using API key pair (ECDSA P-256)
 * @param payload - The payload string to sign (typically JSON.stringify(requestBody))
 * @param apiPrivateKey - 64-character hex string (32 bytes)
 * @param apiPublicKey - 66-character hex string (33 bytes, compressed)
 * @returns Signature result with base64url encoded signature
 */
export const signPayloadWithApiKey = async (
  payload: string,
  apiPrivateKey: string,
  apiPublicKey: string
): Promise<{
  signature: string;
  details: {
    publicKey: string;
    scheme: string;
    signature: string;
    payloadHash: string;
  };
}> => {
  if (!apiPrivateKey || !apiPublicKey) {
    throw new Error('API key pair not found');
  }

  // Initialize elliptic curve (P-256)
  const ec = new EC('p256');

  // Verify public key matches private key
  const key = ec.keyFromPrivate(apiPrivateKey, 'hex');
  const derivedPubHex = key.getPublic(true, 'hex'); // Compressed format

  if (derivedPubHex !== apiPublicKey) {
    throw new Error(`Public key does not match private key. Expected: ${derivedPubHex}, Got: ${apiPublicKey}`);
  }

  // Hash the payload
  const hashHex = await sha256(payload);

  // Sign the hash
  const sig = key.sign(hashHex, { canonical: true });

  // Encode signature to DER format
  const derHex = sig.toDER('hex');

  // Construct signature object
  const stampObj = {
    publicKey: apiPublicKey,
    scheme: 'SIGNATURE_SCHEME_TK_API_P256',
    signature: derHex,
  };

  // Base64URL encode the signature
  const signature = toBase64Url(JSON.stringify(stampObj));

  return {
    signature,
    details: {
      publicKey: apiPublicKey,
      scheme: stampObj.scheme,
      signature: derHex,
      payloadHash: hashHex,
    },
  };
};

/**
 * Generate a new API key pair (P-256)
 * @returns Object with compressed public key and private key (both hex)
 */
export const generateApiKeyPair = (): { publicKey: string; privateKey: string } => {
  const ec = new EC('p256');
  const keyPair = ec.genKeyPair();
  
  return {
    publicKey: keyPair.getPublic(true, 'hex'),  // Compressed (66 chars)
    privateKey: keyPair.getPrivate('hex'),       // 64 chars
  };
};

