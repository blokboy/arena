"use client";

import React from "react";
import { useState } from "react";

import { AUTH_ERROR_MESSAGES, type AuthErrorCode, validateSignup } from "@/domain/auth";

type AuthFormProps = {
  mode: "login" | "signup";
  initialError?: AuthErrorCode;
};

export function AuthForm({ mode, initialError }: AuthFormProps) {
  const [error, setError] = useState<AuthErrorCode | undefined>(initialError);

  const title = mode === "login" ? "Log in" : "Create account";

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <form
        className="w-full rounded-md border border-slate-200 bg-white p-6 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          if (mode === "signup") {
            const result = validateSignup({
              username: String(data.get("username") ?? ""),
              password: String(data.get("password") ?? ""),
              confirmPassword: String(data.get("confirmPassword") ?? "")
            });
            setError(result.ok ? undefined : result.code);
          } else {
            setError("INVALID_CREDENTIALS");
          }
        }}
      >
        <h1 className="text-2xl font-semibold">{title}</h1>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Username</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              name="username"
              autoComplete="username"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Password</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>
          {mode === "signup" ? (
            <label className="block">
              <span className="text-sm font-medium">Confirm password</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
              />
            </label>
          ) : null}
        </div>
        {error ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {AUTH_ERROR_MESSAGES[error]}
          </p>
        ) : null}
        <button className="mt-5 w-full rounded-md bg-primary px-4 py-2 font-medium text-white">
          {title}
        </button>
      </form>
    </main>
  );
}
