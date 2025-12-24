import PasskeyRegistration from "@/components/PasskeyRegistration";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-2xl mx-auto py-12 px-6">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold bg-linear-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">
            Passkey Registration
          </h1>
          <p className="text-zinc-400 mt-3">
            Register a passkey as secondary authentication for your Continuum
            wallet
          </p>
        </div>

        <PasskeyRegistration />
      </div>
    </main>
  );
}
