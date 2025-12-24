"use client";

import { useState } from "react";
import { signPayloadWithApiKey, toBase64UrlBytes } from "@/lib/crypto";

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

type Step = "create" | "complete";

// Environment variables
const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "",
  apiToken: process.env.NEXT_PUBLIC_API_TOKEN || "",
  entityId: process.env.NEXT_PUBLIC_ENTITY_ID || "",
  apiPrivateKey: process.env.NEXT_PUBLIC_API_PRIVATE_KEY || "",
  apiPublicKey: process.env.NEXT_PUBLIC_API_PUBLIC_KEY || "",
};

export default function PasskeyRegistration() {
  const [step, setStep] = useState<Step>("create");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Result data
  const [result, setResult] = useState<{
    authenticatorId: string;
    authenticatorName: string;
  } | null>(null);

  // Step 1: Create WebAuthn Credential
  const createPasskey = async () => {
    setLoading(true);
    setError(null);

    try {
      // Generate random challenge bytes
      const challengeBytes = crypto.getRandomValues(new Uint8Array(32));

      // Convert to base64url for sending to API (this matches what will be in clientDataJSON)
      const challengeBase64Url = toBase64UrlBytes(challengeBytes);

      // Create WebAuthn credential
      const publicKey: PublicKeyCredentialCreationOptions = {
        challenge: challengeBytes, // Pass raw bytes to WebAuthn
        rp: {
          name: "Zynk Continuum",
          id: window.location.hostname,
        },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: "user@zynk.com",
          displayName: "Zynk User",
        },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }], // ES256
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
        throw new Error("No credential returned from WebAuthn");
      }

      const response = credential.response as AuthenticatorAttestationResponse;

      // Debug: Parse clientDataJSON to see the challenge format
      const clientDataText = new TextDecoder().decode(response.clientDataJSON);
      const clientData = JSON.parse(clientDataText);
      console.log("📝 clientDataJSON.challenge:", clientData.challenge);
      console.log("📝 Our challenge (base64url):", challengeBase64Url);
      console.log(
        "📝 Challenge match:",
        clientData.challenge === challengeBase64Url
      );

      // Build passkey data - send challenge in base64url format (matches clientDataJSON)
      const data: { passkey: PasskeyData } = {
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

      console.log("✅ WebAuthn credential created:", data);

      // Step 2: Call prepare API
      console.log("📤 Calling Prepare API...");
      const prepareData = await prepareRegistration(data);

      // Step 3: Sign the payload
      console.log("✍️ Signing payload...");
      const signData = await signPayload(prepareData);

      // Step 4: Submit registration
      console.log("🚀 Submitting registration...");
      const registrationResult = await submitRegistration(
        prepareData,
        signData
      );
      setResult(registrationResult);

      // Done!
      setStep("complete");
    } catch (err) {
      console.error("❌ Registration error:", err);
      if (err instanceof DOMException) {
        if (err.name === "NotSupportedError") {
          setError("WebAuthn not supported. Try Chrome, Safari, or Edge.");
        } else if (err.name === "NotAllowedError") {
          setError("Authentication cancelled or timed out.");
        } else {
          setError(err.message);
        }
      } else {
        setError(
          err instanceof Error ? err.message : "Failed to register passkey"
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Call Prepare API
  const prepareRegistration = async (passkeyData: { passkey: PasskeyData }) => {
    const fetchResponse = await fetch(
      `${config.apiUrl}/api/v1/wallets/${config.entityId}/prepare-passkey-registration`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-token": config.apiToken,
        },
        body: JSON.stringify(passkeyData),
      }
    );

    if (!fetchResponse.ok) {
      const errorData = await fetchResponse.json();
      throw new Error(
        errorData.message ||
          errorData.error?.message ||
          `HTTP ${fetchResponse.status}`
      );
    }

    const responseData = await fetchResponse.json();
    console.log(
      "✅ Full Prepare API response:",
      JSON.stringify(responseData, null, 2)
    );

    // Handle different response structures - API might wrap the response
    const prepareData = responseData.data || responseData;

    console.log("📝 payloadId:", prepareData.payloadId);
    console.log(
      "📝 payloadToSign:",
      prepareData.payloadToSign?.substring(0, 100) + "..."
    );

    return prepareData as {
      payloadId: string;
      payloadToSign: string;
      rpId: string;
    };
  };

  // Step 3: Sign the Payload with API Key
  const signPayload = async (prepareData: {
    payloadId: string;
    payloadToSign: string;
    rpId: string;
  }) => {
    const signResult = await signPayloadWithApiKey(
      prepareData.payloadToSign,
      config.apiPrivateKey,
      config.apiPublicKey
    );

    console.log("✅ Signature created:", signResult);
    return signResult;
  };

  // Step 4: Submit Registration
  const submitRegistration = async (
    prepareData: { payloadId: string; payloadToSign: string; rpId: string },
    signData: { signature: string; details: any }
  ) => {
    const requestBody = {
      payloadId: prepareData.payloadId,
      signature: signData.signature,
    };

    console.log(
      "🚀 Submit Request Body:",
      JSON.stringify(requestBody, null, 2)
    );

    const fetchResponse = await fetch(
      `${config.apiUrl}/api/v1/wallets/submit-passkey-registration`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-token": config.apiToken,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!fetchResponse.ok) {
      const errorData = await fetchResponse.json();
      throw new Error(errorData.message || `HTTP ${fetchResponse.status}`);
    }

    const data = await fetchResponse.json();
    console.log("✅ Registration complete:", data);
    return data;
  };

  // Reset to start over
  const reset = () => {
    setStep("create");
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-center mb-8">
        {["create", "complete"].map((s, i) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                step === s
                  ? "bg-indigo-600 text-white"
                  : ["create", "complete"].indexOf(step) > i
                  ? "bg-emerald-500 text-white"
                  : "bg-zinc-700 text-zinc-400"
              }`}
            >
              {["create", "complete"].indexOf(step) > i ? "✓" : i + 1}
            </div>
            {i < 1 && (
              <div
                className={`w-24 h-1 mx-2 ${
                  ["create", "complete"].indexOf(step) > i
                    ? "bg-emerald-500"
                    : "bg-zinc-700"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Step 1: Register Passkey */}
      {step === "create" && (
        <div className="space-y-4 p-6 bg-zinc-800/50 rounded-xl border border-zinc-700">
          <h2 className="text-xl font-semibold text-zinc-100">
            Register Passkey
          </h2>
          <p className="text-zinc-400 text-sm">
            Click the button below to create and register a new passkey using
            your device's authenticator (Touch ID, Face ID, Windows Hello, etc.)
          </p>

          <button
            onClick={createPasskey}
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
        </div>
      )}

      {/* Complete */}
      {step === "complete" && result && (
        <div className="space-y-4 p-6 bg-emerald-900/30 rounded-xl border border-emerald-500">
          <h2 className="text-xl font-semibold text-emerald-300">
            ✅ Passkey Registered!
          </h2>
          <p className="text-zinc-300">
            Your passkey has been successfully registered.
          </p>

          <button
            onClick={reset}
            className="w-full px-6 py-3 bg-zinc-700 text-white rounded-lg font-medium hover:bg-zinc-600 transition-colors"
          >
            🔄 Register Another Passkey
          </button>
        </div>
      )}
    </div>
  );
}
