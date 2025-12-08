import PasskeySignup from "@/components/PasskeySignIn";

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Zynk Passkey Registration</h1>
        <p className="text-gray-600 mb-8">Step 1: Generate passkey data</p>

        <PasskeySignup />

        <div className="mt-12 p-6 bg-gray-950 rounded-lg">
          <h2 className="text-xl font-semibold mb-3">How to use:</h2>
          <ol className="list-decimal pl-5 space-y-2">
            <li>Click "Create Passkey" button</li>
            <li>Authenticate with your device (Touch ID, Face ID, etc.)</li>
            <li>Copy the generated JSON data</li>
            <li>
              Use it in Postman for{" "}
              <code>POST /prepare-passkey-registration</code>
            </li>
          </ol>
        </div>
      </div>
    </main>
  );
}
