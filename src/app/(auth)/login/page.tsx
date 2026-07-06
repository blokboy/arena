import { AuthForm } from "@/components/auth-form";
import { isAuthErrorCode } from "@/domain/auth";

type LoginPageProps = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const error = (await searchParams)?.error;

  return <AuthForm mode="login" initialError={isAuthErrorCode(error) ? error : undefined} />;
}
