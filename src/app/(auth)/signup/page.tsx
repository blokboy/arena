import { AuthForm } from "@/components/auth-form";
import { isAuthErrorCode } from "@/domain/auth";

type SignupPageProps = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const error = (await searchParams)?.error;

  return <AuthForm mode="signup" initialError={isAuthErrorCode(error) ? error : undefined} />;
}
