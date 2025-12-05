'use client';

import { useState } from 'react';
import apiClient from '@/lib/api-client';

interface PasskeyData {
  passkey: {
    authenticatorName: string;
    challenge: string;
    attestation: {
      credentialId: string;
      clientDataJson: string;
      attestationObject: string;
      transports: string[];
    };
  };
}

interface ServerResponse {
  success: boolean;
  data: {
    payloadId: string;
    payloadToSign: string;
    rpId: string;
  };
}


export default function PasskeySignIn() {
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'idle' | 'creating'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [passkeyData, setPasskeyData] = useState<PasskeyData | null>(null);
  const [serverResponse, setServerResponse] = useState<ServerResponse | null>(null);

  // Helper function to convert ArrayBuffer to base64
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  // Helper function to convert base64 to ArrayBuffer
  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  };


  const handlePasskeySignIn = async () => {
    setIsLoading(true);
    setError(null);
    setPasskeyData(null);
    setServerResponse(null);
    setStep('creating');

    try {
      // STEP 1: Create passkey and send to server
      // Check if WebAuthn is supported
      if (!window.PublicKeyCredential) {
        throw new Error('WebAuthn is not supported in this browser');
      }

      // Generate a random challenge (in production, this should come from your server)
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      const challengeBase64 = arrayBufferToBase64(challenge.buffer);

      // Create credential options
      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge: challenge,
        rp: {
          name: 'Zynk App',
          id: window.location.hostname,
        },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: 'user@example.com',
          displayName: 'User',
        },
        pubKeyCredParams: [
          {
            type: 'public-key',
            alg: -7, // ES256
          },
          {
            type: 'public-key',
            alg: -257, // RS256
          },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'preferred',
        },
        timeout: 60000,
        attestation: 'direct',
      };

      // Create the credential
      const credential = (await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions,
      })) as PublicKeyCredential & {
        response: AuthenticatorAttestationResponse;
      };

      if (!credential || !credential.response) {
        throw new Error('Failed to create credential');
      }

      const response = credential.response;

      // Get authenticator name (if available)
      const authenticatorName =
        (credential as any).authenticatorAttachment === 'platform'
          ? 'Platform Authenticator'
          : 'Cross-Platform Authenticator';

      // Extract credential ID
      const credentialId = arrayBufferToBase64(credential.rawId);

      // Extract client data JSON
      const clientDataJson = arrayBufferToBase64(response.clientDataJSON);

      // Extract attestation object
      const attestationObject = arrayBufferToBase64(response.attestationObject);

      // Extract transports (if available)
      const transports: string[] = [];
      if (response.getTransports) {
        const transportArray = response.getTransports();
        transports.push(...transportArray);
      }

      // Format the data according to the required structure
      const formattedData: PasskeyData = {
        passkey: {
          authenticatorName,
          challenge: challengeBase64,
          attestation: {
            credentialId,
            clientDataJson,
            attestationObject,
            transports,
          },
        },
      };

      setPasskeyData(formattedData);

      // Send to server
      const serverRes = await apiClient.post<ServerResponse>('/api/v1/wallets/entity_0e2cbb95_c382_4548_ab04_3109fc6b63cb/prepare-passkey-registration', formattedData);
      setServerResponse(serverRes.data);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'An unknown error occurred';
      setError(errorMessage);
      console.error('Passkey sign-in error:', err);
    } finally {
      setIsLoading(false);
      setStep('idle');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={handlePasskeySignIn}
        disabled={isLoading}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] disabled:opacity-50 disabled:cursor-not-allowed md:w-[200px]"
      >
        {isLoading ? (
          <>
            <span className="animate-spin">⏳</span>
            <span>
              {step === 'creating' ? 'Creating Passkey...' : 'Sign in with Passkey'}
            </span>
          </>
        ) : (
          <>
            <span>🔐</span>
            <span>Sign in with Passkey</span>
          </>
        )}
      </button>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-700 dark:bg-red-900/20 dark:text-red-200">
          <p className="font-semibold">Error:</p>
          <p>{error}</p>
        </div>
      )}

      {passkeyData && (
        <div className="rounded-lg border border-blue-300 bg-blue-50 p-4 dark:border-blue-700 dark:bg-blue-900/20">
          <p className="mb-2 font-semibold text-blue-800 dark:text-blue-200">
            Step 1: Passkey created successfully!
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-blue-700 dark:text-blue-300">
              View Passkey Data
            </summary>
            <pre className="mt-2 overflow-auto rounded bg-white p-3 text-xs dark:bg-black">
              {JSON.stringify(passkeyData, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {serverResponse && (
        <div className="rounded-lg border border-purple-300 bg-purple-50 p-4 dark:border-purple-700 dark:bg-purple-900/20">
          <p className="mb-2 font-semibold text-purple-800 dark:text-purple-200">
            Server Response Received
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-purple-700 dark:text-purple-300">
              View Server Response
            </summary>
            <pre className="mt-2 overflow-auto rounded bg-white p-3 text-xs dark:bg-black">
              {JSON.stringify(serverResponse, null, 2)}
            </pre>
          </details>
        </div>
      )}

    </div>
  );
}
