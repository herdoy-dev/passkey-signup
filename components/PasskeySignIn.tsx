"use client";

import { useState } from "react";

interface PasskeyData {
  authenticatorName: string;
  challenge: string;
  attestation: {
    credentialId: string;
    clientDataJson: string;
    attestationObject: string;
    transports: string[];
  };
}

export default function PasskeySignup() {
  const [passkeyData, setPasskeyData] = useState<{
    passkey: PasskeyData;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createPasskey = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Generate a SIMPLE random challenge (NOT from payload hash)
      const randomBytes = crypto.getRandomValues(new Uint8Array(32));

      // 2. Convert to hex string for the API
      const challengeHex = Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      console.log("Challenge (hex):", challengeHex.substring(0, 32) + "...");

      // 3. For WebAuthn: hex string → UTF-8 bytes
      const encoder = new TextEncoder();
      const challengeForWebAuthn = encoder.encode(challengeHex);

      // 4. Create WebAuthn credential
      const publicKey: any = {
        challenge: challengeForWebAuthn,
        rp: {
          name: "Zynk Continuum",
          id: window.location.hostname,
        },
        user: {
          id: new Uint8Array(16),
          name: "user@example.com",
          displayName: "Zynk User",
        },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: {
          userVerification: "preferred",
          residentKey: "required",
        },
        timeout: 60000,
        attestation: "direct",
      };

      const credential = (await navigator.credentials.create({
        publicKey,
      })) as PublicKeyCredential;

      if (!credential) {
        throw new Error("No credential returned");
      }

      const response = credential.response as AuthenticatorAttestationResponse;

      // 5. Convert ArrayBuffer to Base64URL
      const toBase64Url = (buffer: ArrayBuffer): string => {
        const bytes = new Uint8Array(buffer);
        const binary = String.fromCharCode(...bytes);
        return btoa(binary)
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
      };

      // 6. Build the data object
      const data: { passkey: PasskeyData } = {
        passkey: {
          authenticatorName: "My Passkey",
          challenge: challengeHex, // Send hex string
          attestation: {
            credentialId: toBase64Url(credential.rawId),
            clientDataJson: toBase64Url(response.clientDataJSON),
            attestationObject: toBase64Url(response.attestationObject),
            transports: ["AUTHENTICATOR_TRANSPORT_INTERNAL"],
          },
        },
      };

      setPasskeyData(data);

      // 7. Log what we're sending
      console.log("✅ Generated Passkey Data:");
      console.log(
        "Challenge sent to API (hex):",
        data.passkey.challenge.substring(0, 32) + "..."
      );
      console.log(
        "Challenge sent to WebAuthn (bytes):",
        Array.from(challengeForWebAuthn).slice(0, 16)
      );
      console.log("Full data:", JSON.stringify(data, null, 2));
    } catch (err) {
      console.error("❌ Error:", err);
      setError(err instanceof Error ? err.message : "Failed to create passkey");

      // Check for specific errors
      if (err instanceof DOMException) {
        if (err.name === "NotSupportedError") {
          setError(
            "WebAuthn not supported in this browser. Try Chrome, Safari, or Edge."
          );
        } else if (err.name === "NotAllowedError") {
          setError("Authentication cancelled or timed out.");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <button
        onClick={createPasskey}
        disabled={loading}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
      >
        {loading ? (
          <span className="flex items-center justify-center">
            <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
            Creating...
          </span>
        ) : (
          "🔐 Create Passkey"
        )}
      </button>

      {error && (
        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg border border-red-200">
          <strong>Error:</strong> {error}
          <p className="text-sm mt-1">
            Make sure you're using HTTPS (localhost works) and have WebAuthn
            enabled.
          </p>
        </div>
      )}

      {passkeyData && (
        <div className="mt-6 p-4 bg-green-950 rounded-lg border border-green-200">
          <h3 className="text-lg font-semibold text-green-800 mb-3">
            ✅ Passkey Data Generated!
          </h3>
          <div className="bg-black p-4 rounded border">
            <pre className="text-sm overflow-auto">
              {`{
  "passkey": {
    "authenticatorName": "${passkeyData.passkey.authenticatorName}",
    "challenge": "${passkeyData.passkey.challenge}",
    "attestation": {
      "credentialId": "${passkeyData.passkey.attestation.credentialId}",
      "clientDataJson": "${passkeyData.passkey.attestation.clientDataJson}",
      "attestationObject": "${
        passkeyData.passkey.attestation.attestationObject
      }",
      "transports": ${JSON.stringify(
        passkeyData.passkey.attestation.transports
      )}
    }
  }
}`}
            </pre>
          </div>

          <div className="mt-4 text-sm text-green-700">
            <p>
              ✅ Use this in <strong>POST /prepare-passkey-registration</strong>
            </p>
            <p>
              ✅ Challenge length: {passkeyData.passkey.challenge.length} hex
              chars
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
