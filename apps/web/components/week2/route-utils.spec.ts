import { describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  createServerPlatformClient: vi.fn()
}));

import { contactsNav, hasPermission, settingsNav } from "./route-utils";

describe("week2 route utils", () => {
  it("builds settings navigation links", () => {
    const nav = settingsNav("nomad-events", "connector-settings");

    expect(nav).toHaveLength(9);
    expect(nav[0].href).toBe("/nomad-events/settings/tax-rates");
    expect(nav[7]).toMatchObject({
      href: "/nomad-events/settings/team-access",
      active: false
    });
    expect(nav[8]).toMatchObject({
      href: "/nomad-events/settings/connector-settings",
      active: true
    });
  });

  it("builds contacts navigation links", () => {
    const nav = contactsNav("nomad-events", "suppliers");

    expect(nav).toHaveLength(4);
    expect(nav[0].href).toBe("/nomad-events/contacts");
    expect(nav[2]).toMatchObject({
      href: "/nomad-events/contacts/suppliers",
      active: true
    });
  });

  it("checks permissions against capability snapshots", () => {
    expect(
      hasPermission(
        { roleKey: "ADMIN", permissions: ["setup.read", "setup.write"] },
        "setup.write"
      )
    ).toBe(true);

    expect(
      hasPermission(
        { roleKey: "VIEWER", permissions: ["contacts.read"] },
        "contacts.write"
      )
    ).toBe(false);
  });
});
