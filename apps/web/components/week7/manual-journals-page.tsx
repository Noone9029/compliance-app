import React from "react";
import type {
  AccountRecord,
  ManualJournalDetail,
  ManualJournalSummary,
} from "@daftar/types";
import { Card, CardContent, CardHeader, StatusBadge } from "@daftar/ui";

import { fetchServerJson } from "../api";
import { SectionNav } from "../week2/section-nav";
import { getCapabilities, hasPermission } from "../week2/route-utils";
import { formatDate, money } from "../week3/shared";
import { ManualJournalForm } from "./manual-journal-form";

function manualJournalNav(orgSlug: string) {
  return [
    {
      href: `/${orgSlug}/accounting/manual-journals`,
      label: "Manual Journals",
      active: true,
    },
  ];
}

function accountOptions(accounts: AccountRecord[]) {
  return accounts.map((account) => ({
    id: account.id,
    label: `${account.code} · ${account.name}`,
  }));
}

function JournalDetailCard({ detail }: { detail: ManualJournalDetail }) {
  return (
    <Card>
      <CardHeader>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Journal Detail</h3>
          <p className="text-sm text-slate-500">
            Entry {detail.journalNumber} posted on{" "}
            {formatDate(detail.entryDate)}.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Reference
            </p>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {detail.reference ?? "No reference"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Lines
            </p>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {detail.lineCount}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Total Debit
            </p>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {money(detail.totalDebit)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Total Credit
            </p>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {money(detail.totalCredit)}
            </p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Memo
          </p>
          <p className="mt-2 text-sm text-slate-700">
            {detail.memo ?? "No memo was added."}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Debit</th>
                <th className="px-3 py-2 font-medium">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detail.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-3 py-3 align-top">
                    <p className="font-medium text-slate-900">
                      {line.accountCode} · {line.accountName}
                    </p>
                  </td>
                  <td className="px-3 py-3 align-top text-slate-700">
                    {line.description ?? "No description"}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <StatusBadge label={line.accountType} />
                  </td>
                  <td className="px-3 py-3 align-top font-medium text-slate-900">
                    {money(line.debit)}
                  </td>
                  <td className="px-3 py-3 align-top font-medium text-slate-900">
                    {money(line.credit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function NoAccessCard() {
  return (
    <Card>
      <CardContent className="py-8">
        <p className="text-sm font-medium text-slate-900">
          Your role does not currently include manual journal access.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Ask an administrator for the journals permission if this workflow is
          required.
        </p>
      </CardContent>
    </Card>
  );
}

export async function renderManualJournalsPage(
  orgSlug: string,
  segments: string[],
) {
  const capabilities = await getCapabilities();
  const canRead = hasPermission(capabilities, "journals.read");
  const canWrite = hasPermission(capabilities, "journals.write");
  const canReadAccounts = hasPermission(capabilities, "setup.read");

  if (!canRead) {
    return (
      <div className="space-y-6">
        <SectionNav items={manualJournalNav(orgSlug)} title="Accounting" />
        <NoAccessCard />
      </div>
    );
  }

  const selectedId = segments[2] ?? null;
  const journals =
    await fetchServerJson<ManualJournalSummary[]>("/v1/journals");
  const [selected, accounts] = await Promise.all([
    selectedId
      ? fetchServerJson<ManualJournalDetail>(`/v1/journals/${selectedId}`)
      : null,
    canWrite && canReadAccounts
      ? fetchServerJson<AccountRecord[]>("/v1/setup/chart-of-accounts")
      : [],
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <SectionNav items={manualJournalNav(orgSlug)} title="Accounting" />

      <Card>
        <CardHeader>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Manual Journals</h2>
            <p className="text-sm text-slate-500">
              Review and post balanced manual entries against the chart of
              accounts.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {journals.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-900">
                No manual journals have been recorded yet.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Create the first journal entry to start the general ledger
                trail.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-2 font-medium">Journal</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Reference</th>
                    <th className="px-3 py-2 font-medium">Total</th>
                    <th className="px-3 py-2 font-medium">Lines</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {journals.map((journal) => (
                    <tr key={journal.id}>
                      <td className="px-3 py-3 align-top">
                        <a
                          className="font-medium text-slate-900 underline-offset-4 hover:underline"
                          href={`/${orgSlug}/accounting/manual-journals/${journal.id}`}
                        >
                          {journal.journalNumber}
                        </a>
                        {journal.memo ? (
                          <p className="mt-1 text-xs text-slate-500">
                            {journal.memo}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top text-slate-700">
                        {formatDate(journal.entryDate)}
                      </td>
                      <td className="px-3 py-3 align-top text-slate-700">
                        {journal.reference ?? "No reference"}
                      </td>
                      <td className="px-3 py-3 align-top font-medium text-slate-900">
                        {money(journal.totalDebit)}
                      </td>
                      <td className="px-3 py-3 align-top text-slate-700">
                        {journal.lineCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selected ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <JournalDetailCard detail={selected} />
          {canWrite ? (
            <ManualJournalForm
              accounts={accountOptions(accounts)}
              canWrite={canWrite}
              description="Update the journal header and replace the underlying debit and credit lines."
              endpoint={`/v1/journals/${selected.id}`}
              initialValues={{
                journalNumber: selected.journalNumber,
                reference: selected.reference ?? "",
                entryDate: selected.entryDate.slice(0, 10),
                memo: selected.memo ?? "",
                lines: selected.lines.map((line) => ({
                  accountId: line.accountId,
                  description: line.description ?? "",
                  debit: line.debit,
                  credit: line.credit,
                })),
              }}
              method="PATCH"
              redirectTo={`/${orgSlug}/accounting/manual-journals/${selected.id}`}
              submitLabel="Update Journal"
              title="Edit Manual Journal"
            />
          ) : null}
        </div>
      ) : canWrite ? (
        <ManualJournalForm
          accounts={accountOptions(accounts)}
          canWrite={canWrite}
          description="Create a balanced manual journal entry for adjustments, accruals, or corrections."
          endpoint="/v1/journals"
          initialValues={{
            journalNumber: "",
            reference: "",
            entryDate: today,
            memo: "",
            lines: [
              { accountId: "", description: "", debit: "0.00", credit: "0.00" },
              { accountId: "", description: "", debit: "0.00", credit: "0.00" },
            ],
          }}
          method="POST"
          appendResultId
          redirectTo={`/${orgSlug}/accounting/manual-journals`}
          submitLabel="Create Journal"
          title="New Manual Journal"
        />
      ) : null}
    </div>
  );
}
