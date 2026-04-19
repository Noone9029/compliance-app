import { PasswordResetPanel } from "../../../components/week10/auth-flows";

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const token = Array.isArray(resolvedSearchParams.token)
    ? resolvedSearchParams.token[0]
    : resolvedSearchParams.token;

  return <PasswordResetPanel token={token} />;
}
