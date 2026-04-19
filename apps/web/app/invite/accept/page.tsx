import { InvitationAcceptPanel } from "../../../components/week10/auth-flows";

export default async function InviteAcceptPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const token = Array.isArray(resolvedSearchParams.token)
    ? resolvedSearchParams.token[0]
    : resolvedSearchParams.token;

  return <InvitationAcceptPanel token={token} />;
}
