import { LoginForm } from "@/app/(auth)/login/login-form";
import { isLocalMode } from "@/lib/env";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-6">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Kolmena AgentBee
        </h1>
        <p className="text-muted-foreground text-sm">
          Marketing — acesso interno
        </p>
        {isLocalMode() ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Modo local ativo. Acesse direto em <code>/dashboard</code>.
          </p>
        ) : null}
      </div>
      <LoginForm />
    </div>
  );
}
