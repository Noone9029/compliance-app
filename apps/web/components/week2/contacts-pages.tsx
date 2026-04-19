import React from "react";
import type {
  ContactDetail,
  ContactGroupRecord,
  ContactSummary
} from "@daftar/types";

import { fetchServerJson } from "../api";
import { ContactDetailView } from "./contact-detail-view";
import { ContactForm } from "./contact-form";
import { ContactsManager } from "./contacts-manager";
import { ResourceManager } from "./resource-manager";
import { SectionNav } from "./section-nav";
import { contactsNav, getCapabilities, hasPermission } from "./route-utils";

export async function renderContactsPage(orgSlug: string, segments: string[]) {
  const capabilities = await getCapabilities();
  const canWrite = hasPermission(capabilities, "contacts.write");
  const groups = await fetchServerJson<ContactGroupRecord[]>("/v1/contact-groups");

  if (segments.length === 1) {
    const contacts = await fetchServerJson<ContactSummary[]>("/v1/contacts?segment=all");

    return (
      <div className="space-y-6">
        <SectionNav items={contactsNav(orgSlug, "all")} title="Contacts" />
        <ContactsManager
          canWrite={canWrite}
          contacts={contacts}
          description="Unified contacts list with customer and supplier context."
          groups={groups}
          orgSlug={orgSlug}
          title="Contacts"
        />
      </div>
    );
  }

  if (segments[1] === "customers") {
    const contacts = await fetchServerJson<ContactSummary[]>(
      "/v1/contacts?segment=customers"
    );

    return (
      <div className="space-y-6">
        <SectionNav items={contactsNav(orgSlug, "customers")} title="Contacts" />
        <ContactsManager
          canWrite={canWrite}
          contacts={contacts}
          description="Customers only view."
          groups={groups}
          orgSlug={orgSlug}
          title="Customers"
        />
      </div>
    );
  }

  if (segments[1] === "suppliers") {
    const contacts = await fetchServerJson<ContactSummary[]>(
      "/v1/contacts?segment=suppliers"
    );

    return (
      <div className="space-y-6">
        <SectionNav items={contactsNav(orgSlug, "suppliers")} title="Contacts" />
        <ContactsManager
          canWrite={canWrite}
          contacts={contacts}
          description="Suppliers only view."
          groups={groups}
          orgSlug={orgSlug}
          title="Suppliers"
        />
      </div>
    );
  }

  if (segments[1] === "groups") {
    return (
      <div className="space-y-6">
        <SectionNav items={contactsNav(orgSlug, "groups")} title="Contacts" />
        <ResourceManager
          canWrite={canWrite}
          columns={[
            { label: "Name", field: "name" },
            { label: "Description", field: "description", empty: "None" },
            { label: "Members", field: "memberCount" }
          ]}
          createPath="/v1/contact-groups"
          description="Group contacts for reporting and operational filters."
          emptyState="No contact groups created."
          fields={[
            { name: "name", label: "Name", type: "text" },
            { name: "description", label: "Description", type: "textarea", rows: 4 }
          ]}
          items={groups}
          formsById={Object.fromEntries(
            groups.map((item) => [
              item.id,
              {
                name: item.name,
                description: item.description ?? ""
              }
            ])
          )}
          newItem={{
            name: "",
            description: ""
          }}
          payloadPreset="contact-groups"
          title="Groups"
          updatePathBase="/v1/contact-groups"
        />
      </div>
    );
  }

  const contact = await fetchServerJson<ContactDetail>(`/v1/contacts/${segments[1]}`);

  return (
    <div className="space-y-6">
      <SectionNav items={contactsNav(orgSlug, "all")} title="Contacts" />
      <ContactDetailView contact={contact} />
      <ContactForm
        canWrite={canWrite}
        description="Update contact information, financial details, addresses, and contact numbers."
        endpoint={`/v1/contacts/${contact.id}`}
        groups={groups}
        initialContact={contact}
        method="PATCH"
        submitLabel="Update contact"
        title="Edit Contact"
      />
    </div>
  );
}
