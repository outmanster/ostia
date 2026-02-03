import { useState } from "react";
import { Login } from "./Login";
import { Register } from "./Register";

type AuthView = "login" | "register" | "unlock";

export function AuthPage() {
  const [view, setView] = useState<AuthView>("login");

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-16 w-16 items-center justify-center mb-4">
            <img src="/logo.png" alt="Ostia Logo" className="w-full h-full object-contain" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg">
          {view === "register" ? (
            <Register onSwitchToLogin={() => setView("login")} />
          ) : (
            <Login onSwitchToRegister={() => setView("register")} />
          )}
        </div>
      </div>
    </main>
  );
}
