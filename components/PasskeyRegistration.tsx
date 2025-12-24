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

type Step = "create" | "prepare" | "sign" | "submit" | "complete";

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

  // Step data
  const [passkeyData, setPasskeyData] = useState<{
    passkey: PasskeyData;
  } | null>(null);
  const [prepareResponse, setPrepareResponse] = useState<{
    payloadId: string;
    payloadToSign: string;
    rpId: string;
  } | null>(null);
  const [signatureData, setSignatureData] = useState<{
    signature: string;
    details: any;
  } | null>(null);
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

      setPasskeyData(data);
      setStep("prepare");
      console.log("✅ WebAuthn credential created:", data);
    } catch (err) {
      console.error("❌ WebAuthn error:", err);
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
          err instanceof Error ? err.message : "Failed to create passkey"
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Call Prepare API
  const prepareRegistration = async () => {
    if (!passkeyData) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
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

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message ||
            errorData.error?.message ||
            `HTTP ${response.status}`
        );
      }

      const data = await response.json();
      console.log(
        "✅ Full Prepare API response:",
        JSON.stringify(data, null, 2)
      );

      // Handle different response structures - API might wrap the response
      const prepareData = data.data || data;

      // Log the actual payloadId we're getting
      console.log("📝 payloadId:", prepareData.payloadId);
      console.log(
        "📝 payloadToSign:",
        prepareData.payloadToSign?.substring(0, 100) + "..."
      );

      setPrepareResponse(prepareData);
      setStep("sign");
      console.log("✅ Prepare response set:", prepareData);
    } catch (err) {
      console.error("❌ Prepare error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to prepare registration"
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Sign the Payload with API Key
  const signPayload = async () => {
    if (!prepareResponse) return;

    setLoading(true);
    setError(null);

    try {
      const result = await signPayloadWithApiKey(
        prepareResponse.payloadToSign,
        config.apiPrivateKey,
        config.apiPublicKey
      );

      setSignatureData(result);
      setStep("submit");
      console.log("✅ Signature created:", result);
    } catch (err) {
      console.error("❌ Signing error:", err);
      setError(err instanceof Error ? err.message : "Failed to sign payload");
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Submit Registration
  const submitRegistration = async () => {
    if (!prepareResponse || !signatureData) return;

    setLoading(true);
    setError(null);

    // Build request body
    const requestBody = {
      payloadId: prepareResponse.payloadId,
      signature: signatureData.signature,
    };

    console.log(
      "🚀 Submit Request Body:",
      JSON.stringify(requestBody, null, 2)
    );

    try {
      const response = await fetch(
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

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
      setStep("complete");
      console.log("✅ Registration complete:", data);
    } catch (err) {
      console.error("❌ Submit error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to submit registration"
      );
    } finally {
      setLoading(false);
    }
  };

  // Reset to start over
  const reset = () => {
    setStep("create");
    setPasskeyData(null);
    setPrepareResponse(null);
    setSignatureData(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-8">
        {["create", "prepare", "sign", "submit", "complete"].map((s, i) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                step === s
                  ? "bg-indigo-600 text-white"
                  : ["create", "prepare", "sign", "submit", "complete"].indexOf(
                      step
                    ) > i
                  ? "bg-emerald-500 text-white"
                  : "bg-zinc-700 text-zinc-400"
              }`}
            >
              {["create", "prepare", "sign", "submit", "complete"].indexOf(
                step
              ) > i
                ? "✓"
                : i + 1}
            </div>
            {i < 4 && (
              <div
                className={`w-12 h-1 mx-1 ${
                  ["create", "prepare", "sign", "submit", "complete"].indexOf(
                    step
                  ) > i
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

      {/* Step 1: Create Passkey */}
      {step === "create" && (
        <div className="space-y-4 p-6 bg-zinc-800/50 rounded-xl border border-zinc-700">
          <h2 className="text-xl font-semibold text-zinc-100">
            Step 1: Create Passkey
          </h2>
          <p className="text-zinc-400 text-sm">
            Click the button below to create a new passkey using your device's
            authenticator (Touch ID, Face ID, Windows Hello, etc.)
          </p>

          <button
            onClick={createPasskey}
            disabled={loading}
            className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:bg-zinc-600 transition-colors flex items-center justify-center"
          >
            {loading ? (
              <>
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                Creating...
              </>
            ) : (
              "🔐 Create Passkey"
            )}
          </button>
        </div>
      )}

      {/* Step 2: Prepare Registration */}
      {step === "prepare" && passkeyData && (
        <div className="space-y-4 p-6 bg-zinc-800/50 rounded-xl border border-zinc-700">
          <h2 className="text-xl font-semibold text-zinc-100">
            Step 2: Prepare Registration
          </h2>
          <p className="text-zinc-400 text-sm">
            Passkey created! Now sending to API to prepare the registration
            challenge.
          </p>

          <div className="bg-zinc-900 p-4 rounded-lg overflow-auto max-h-48">
            <pre className="text-xs text-zinc-300">
              {JSON.stringify(passkeyData, null, 2)}
            </pre>
          </div>

          <button
            onClick={prepareRegistration}
            disabled={loading}
            className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:bg-zinc-600 transition-colors flex items-center justify-center"
          >
            {loading ? (
              <>
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                Preparing...
              </>
            ) : (
              "📤 Call Prepare API"
            )}
          </button>
        </div>
      )}

      {/* Step 3: Sign Payload */}
      {step === "sign" && prepareResponse && (
        <div className="space-y-4 p-6 bg-zinc-800/50 rounded-xl border border-zinc-700">
          <h2 className="text-xl font-semibold text-zinc-100">
            Step 3: Sign Payload
          </h2>
          <p className="text-zinc-400 text-sm">
            Signing the payload with your API key (ECDSA P-256).
          </p>

          {/* Debug: Show full prepare response */}
          <div className="bg-yellow-900/30 p-3 rounded-lg border border-yellow-600">
            <p className="text-xs text-yellow-400 mb-2">
              Debug - Full Prepare Response:
            </p>
            <pre className="text-xs text-yellow-200 overflow-auto max-h-32">
              {JSON.stringify(prepareResponse, null, 2)}
            </pre>
          </div>

          <div className="space-y-2">
            <div className="text-sm text-zinc-400">
              <strong>Payload ID:</strong>{" "}
              <code className="bg-zinc-900 px-2 py-1 rounded">
                {prepareResponse.payloadId || "⚠️ MISSING"}
              </code>
            </div>
            <div className="text-sm text-zinc-400">
              <strong>RP ID:</strong>{" "}
              <code className="bg-zinc-900 px-2 py-1 rounded">
                {prepareResponse.rpId || "N/A"}
              </code>
            </div>
          </div>

          <div className="bg-zinc-900 p-4 rounded-lg overflow-auto max-h-32">
            <p className="text-xs text-zinc-500 mb-1">Payload to Sign:</p>
            <pre className="text-xs text-zinc-300 break-all">
              {prepareResponse.payloadToSign
                ? prepareResponse.payloadToSign.substring(0, 200) + "..."
                : "⚠️ No payload"}
            </pre>
          </div>

          <button
            onClick={signPayload}
            disabled={loading}
            className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:bg-zinc-600 transition-colors flex items-center justify-center"
          >
            {loading ? (
              <>
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                Signing...
              </>
            ) : (
              "✍️ Sign with API Key"
            )}
          </button>
        </div>
      )}

      {/* Step 4: Submit Registration */}
      {step === "submit" && signatureData && prepareResponse && (
        <div className="space-y-4 p-6 bg-zinc-800/50 rounded-xl border border-zinc-700">
          <h2 className="text-xl font-semibold text-zinc-100">
            Step 4: Submit Registration
          </h2>
          <p className="text-zinc-400 text-sm">
            Payload signed! Submitting to complete passkey registration.
          </p>

          {/* Debug: Show what we're sending */}
          <div className="bg-yellow-900/30 p-3 rounded-lg border border-yellow-600">
            <p className="text-xs text-yellow-400 mb-2">
              Debug - Request Body to Send:
            </p>
            <pre className="text-xs text-yellow-200 overflow-auto max-h-32">
              {JSON.stringify(
                {
                  payloadId: prepareResponse.payloadId,
                  signature: signatureData.signature?.substring(0, 50) + "...",
                },
                null,
                2
              )}
            </pre>
          </div>

          <div className="bg-zinc-900 p-4 rounded-lg overflow-auto max-h-32">
            <p className="text-xs text-zinc-500 mb-1">Signature Details:</p>
            <pre className="text-xs text-zinc-300">
              {JSON.stringify(signatureData.details, null, 2)}
            </pre>
          </div>

          <button
            onClick={submitRegistration}
            disabled={loading}
            className="w-full px-6 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:bg-zinc-600 transition-colors flex items-center justify-center"
          >
            {loading ? (
              <>
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                Submitting...
              </>
            ) : (
              "🚀 Submit Registration"
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

      {/* Back Button */}
      {step !== "create" && step !== "complete" && (
        <button
          onClick={() => {
            const steps: Step[] = [
              "create",
              "prepare",
              "sign",
              "submit",
              "complete",
            ];
            const currentIndex = steps.indexOf(step);
            if (currentIndex > 0) {
              setStep(steps[currentIndex - 1]);
            }
          }}
          className="text-zinc-400 hover:text-zinc-200 text-sm"
        >
          ← Back
        </button>
      )}
    </div>
  );
}
