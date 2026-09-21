export function DeploymentConfigurationError({ message }: { message: string }) {
  return <main className="grid min-h-svh place-items-center bg-[#0b0b0b] p-6 text-white">
    <div role="alert" className="max-w-xl rounded-xl border border-red-400/40 bg-red-950/30 p-6">
      <h1 className="text-xl font-bold">Configurazione dell’app non valida</h1>
      <p className="mt-3">{message}</p>
      <p className="mt-3 text-sm text-white/70">Contatta l’amministratore e verifica le variabili d’ambiente del deploy.</p>
    </div>
  </main>
}
