import PasskeyRegistration from "@/components/PasskeyRegistration";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-2xl mx-auto py-12 px-6">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">
            Passkey Registration
          </h1>
          <p className="text-zinc-400 mt-3">
            Register a passkey as secondary authentication for your Continuum wallet
          </p>
        </div>

        <PasskeyRegistration />

        <div className="mt-12 p-6 bg-zinc-900/50 rounded-xl border border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-200 mb-3">How it works</h2>
          <ol className="list-decimal pl-5 space-y-2 text-zinc-400 text-sm">
            <li>Enter your API credentials (from Postman setup)</li>
            <li>Create a passkey using your device authenticator</li>
            <li>The app calls the prepare API with your passkey attestation</li>
            <li>The payload is signed with your API key (ECDSA P-256)</li>
            <li>Submit the signed payload to complete registration</li>
          </ol>
        </div>
      </div>
    </main>
  );
}
