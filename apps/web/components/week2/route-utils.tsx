import type { CapabilitySnapshot } from "@daftar/types";

import { createServerPlatformClient } from "../api";

export function hasPermission(
  capabilities: CapabilitySnapshot,
  permission: string
) {
  return capabilities.permissions.includes(permission as never);
}

export async function getCapabilities() {
  const client = await createServerPlatformClient();
  return client.capabilities().catch(() => ({ roleKey: null, permissions: [] }));
}

export function settingsNav(orgSlug: string, activeKey: string) {
  return [
    ["tax-rates", "Tax Rates"],
    ["organisation-tax-details", "Organisation Tax Details"],
    ["tracking", "Tracking"],
    ["currencies", "Currencies"],
    ["invoice-settings", "Invoice Settings"],
    ["email-templates", "Email Templates"],
    ["custom-organisation-settings", "Custom Organisation Settings"],
    ["team-access", "Team & Access"],
    ["connector-settings", "Connector Settings"]
  ].map(([key, label]) => ({
    href: `/${orgSlug}/settings/${key}`,
    label,
    active: key === activeKey
  }));
}

export function contactsNav(orgSlug: string, activeKey: string) {
  return [
    ["all", "Contacts", `/${orgSlug}/contacts`],
    ["customers", "Customers", `/${orgSlug}/contacts/customers`],
    ["suppliers", "Suppliers", `/${orgSlug}/contacts/suppliers`],
    ["groups", "Groups", `/${orgSlug}/contacts/groups`]
  ].map(([key, label, href]) => ({
    href,
    label,
    active: key === activeKey
  }));
}
