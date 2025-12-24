"use client";

import { useState } from "react";
import { signPayloadWithApiKey, toBase64UrlBytes } from "@/lib/crypto";
import apiClient from "@/lib/api-client";

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

const config = {
  entityId: process.env.NEXT_PUBLIC_ENTITY_ID || "",
  apiPrivateKey: process.env.NEXT_PUBLIC_API_PRIVATE_KEY || "",
  apiPublicKey: process.env.NEXT_PUBLIC_API_PUBLIC_KEY || "",
};

export default function PasskeyRegistration() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);

  const registerPasskey = async () => {
    setLoading(true);
    setError(null);

    try {
      const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
      const challengeBase64Url = toBase64UrlBytes(challengeBytes);

      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: challengeBytes,
          rp: { name: "Zynk Continuum", id: window.location.hostname },
          user: {
            id: crypto.getRandomValues(new Uint8Array(16)),
            name: "user@zynk.com",
            displayName: "Zynk User",
          },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          authenticatorSelection: { userVerification: "preferred", residentKey: "required" },
          timeout: 60000,
          attestation: "direct",
        },
      })) as PublicKeyCredential;

      if (!credential) throw new Error("No credential returned");

      const response = credential.response as AuthenticatorAttestationResponse;

      const passkeyData: { passkey: PasskeyData } = {
        passkey: {
          authenticatorName: "My Passkey",
          challenge: challengeBase64Url,
          attestation: {
            credentialId: toBase64UrlBytes(credential.rawId),
            clientDataJson: toBase64UrlBytes(response.clientDataJSON),
            attestationObject: toBase64UrlBytes(response.attestationObject),
            transports: ["AUTHENTICATOR_TRANSPORT_INTERNAL"],
          },
        },
      };

      // Prepare
      const prepareRes = await apiClient.post(
        `/api/v1/wallets/${config.entityId}/prepare-passkey-registration`,
        passkeyData
      );
      const prepareData = prepareRes.data.data || prepareRes.data;

      // Sign
      const signData = await signPayloadWithApiKey(
        prepareData.payloadToSign,
        config.apiPrivateKey,
        config.apiPublicKey
      );

      // Submit
      await apiClient.post("/api/v1/wallets/submit-passkey-registration", {
        payloadId: prepareData.payloadId,
        signature: signData.signature,
      });

      // Success - show toast
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === "NotSupportedError") {
          setError("WebAuthn not supported. Try Chrome, Safari, or Edge.");
        } else if (err.name === "NotAllowedError") {
          setError("Authentication cancelled or timed out.");
        } else {
          setError(err.message);
        }
      } else if (err && typeof err === "object" && "response" in err) {
        const axiosErr = err as { response?: { data?: { message?: string; error?: { message?: string } } } };
        setError(axiosErr.response?.data?.message || axiosErr.response?.data?.error?.message || "API error");
      } else {
        setError(err instanceof Error ? err.message : "Failed to register passkey");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
          {error}
        </div>
      )}

      <button
        onClick={registerPasskey}
        disabled={loading}
        className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:bg-zinc-600 transition-colors flex items-center justify-center"
      >
        {loading ? (
          <>
            <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2" />
            Registering...
          </>
        ) : (
          "🔐 Register Passkey"
        )}
      </button>

      {showToast && (
        <div className="fixed bottom-6 right-6 px-6 py-3 bg-emerald-600 text-white rounded-lg shadow-lg">
          ✅ Passkey registered successfully!
        </div>
      )}
    </div>
  );
}
