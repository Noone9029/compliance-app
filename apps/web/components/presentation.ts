function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const organizationNameMap = new Map<string, string>([
  ["nomad events arabia limited", "Your Organization"],
  ["nomad labs", "Additional Organization"]
]);

const organizationSlugMap = new Map<string, string>([
  ["nomad-events", "Primary Workspace"],
  ["nomad-labs", "Additional Workspace"]
]);

const contactNameMap = new Map<string, string>([
  ["al noor hospitality", "Primary Customer"],
  ["al noor hospitality llc", "Primary Customer"],
  ["summit retail arabia", "Retail Customer"],
  ["desert print works", "Preferred Supplier"],
  ["riyadh venue tech", "Operations Supplier"],
  ["orbit support", "Customer Account"],
  ["orbit support ltd", "Customer Account"],
  ["vertex client services", "Client Services Account"],
  ["blue harbor services", "Vendor Account"],
  ["north star hosting", "Infrastructure Vendor"],
  ["ochre interiors exhibitions llc", "Customer Account"]
]);

export function presentOrganizationName(name: string | null | undefined) {
  if (!name) {
    return "Your Organization";
  }

  return organizationNameMap.get(normalize(name)) ?? name;
}

export function presentOrganizationSlug(slug: string | null | undefined) {
  if (!slug) {
    return "Workspace";
  }

  return organizationSlugMap.get(normalize(slug)) ?? slug;
}

export function presentContactName(name: string | null | undefined) {
  if (!name) {
    return "Client Account";
  }

  return contactNameMap.get(normalize(name)) ?? name;
}

export function presentCompanyName(name: string | null | undefined) {
  if (!name) {
    return null;
  }

  return contactNameMap.get(normalize(name)) ?? name;
}

export function presentEmail(email: string | null | undefined) {
  if (!email) {
    return null;
  }

  const normalized = email.trim().toLowerCase();

  if (normalized.endsWith("@daftar.local")) {
    return "admin@your-company.com";
  }

  if (
    normalized.endsWith(".example") ||
    normalized.includes("@alnoor.") ||
    normalized.includes("@nomad-")
  ) {
    if (normalized.includes("finance") || normalized.includes("billing") || normalized.includes("accounts")) {
      return "accounts@client-company.com";
    }

    if (normalized.includes("ap@")) {
      return "payables@client-company.com";
    }

    return "team@client-company.com";
  }

  return email;
}
