import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ContactDetail,
  ContactGroupRecord,
  ContactSummary
} from "@daftar/types";

import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class ContactsService {
  private readonly prisma: PrismaService;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    this.prisma = prisma;
  }

  async listContacts(
    organizationId: string,
    options: {
      segment?: "all" | "customers" | "suppliers";
      search?: string;
    }
  ): Promise<ContactSummary[]> {
    const contacts = await this.prisma.contact.findMany({
      where: {
        organizationId,
        ...(options.segment === "customers" ? { isCustomer: true } : {}),
        ...(options.segment === "suppliers" ? { isSupplier: true } : {}),
        ...(options.search
          ? {
              OR: [
                { displayName: { contains: options.search, mode: "insensitive" } },
                { companyName: { contains: options.search, mode: "insensitive" } },
                { email: { contains: options.search, mode: "insensitive" } }
              ]
            }
          : {})
      },
      include: {
        groups: {
          include: {
            group: true
          }
        }
      },
      orderBy: { displayName: "asc" }
    });

    return contacts.map((contact) => ({
      id: contact.id,
      organizationId: contact.organizationId,
      displayName: contact.displayName,
      companyName: contact.companyName,
      email: contact.email,
      taxNumber: contact.taxNumber,
      customerCode: contact.customerCode,
      supplierCode: contact.supplierCode,
      isCustomer: contact.isCustomer,
      isSupplier: contact.isSupplier,
      currencyCode: contact.currencyCode,
      paymentTermsDays: contact.paymentTermsDays,
      receivableBalance: contact.receivableBalance.toString(),
      payableBalance: contact.payableBalance.toString(),
      groupNames: contact.groups.map((entry) => entry.group.name).sort(),
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString()
    }));
  }

  async getContact(organizationId: string, contactId: string): Promise<ContactDetail> {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: contactId,
        organizationId
      },
      include: {
        addresses: {
          orderBy: { type: "asc" }
        },
        numbers: {
          orderBy: { createdAt: "asc" }
        },
        groups: {
          include: {
            group: {
              include: {
                members: true
              }
            }
          }
        }
      }
    });

    if (!contact) {
      throw new NotFoundException("Contact not found.");
    }

    const files = await this.prisma.storedFile.findMany({
      where: {
        organizationId,
        relatedType: "contact",
        relatedId: contactId
      },
      orderBy: { createdAt: "desc" }
    });

    return {
      id: contact.id,
      organizationId: contact.organizationId,
      displayName: contact.displayName,
      companyName: contact.companyName,
      email: contact.email,
      taxNumber: contact.taxNumber,
      customerCode: contact.customerCode,
      supplierCode: contact.supplierCode,
      isCustomer: contact.isCustomer,
      isSupplier: contact.isSupplier,
      currencyCode: contact.currencyCode,
      paymentTermsDays: contact.paymentTermsDays,
      notes: contact.notes,
      receivableBalance: contact.receivableBalance.toString(),
      payableBalance: contact.payableBalance.toString(),
      groupNames: contact.groups.map((entry) => entry.group.name).sort(),
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
      addresses: contact.addresses.map((address) => ({
        id: address.id,
        type: address.type,
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        countryCode: address.countryCode
      })),
      numbers: contact.numbers.map((number) => ({
        id: number.id,
        label: number.label,
        phoneNumber: number.phoneNumber
      })),
      groups: contact.groups.map((entry) => ({
        id: entry.group.id,
        organizationId,
        name: entry.group.name,
        description: entry.group.description,
        memberCount: entry.group.members.length,
        createdAt: entry.group.createdAt.toISOString(),
        updatedAt: entry.group.updatedAt.toISOString()
      })),
      files: files.map((file) => ({
        id: file.id,
        organizationId: file.organizationId,
        storageProvider: file.storageProvider,
        bucket: file.bucket,
        objectKey: file.objectKey,
        originalFileName: file.originalFileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        checksumSha256: file.checksumSha256,
        relatedType: file.relatedType,
        relatedId: file.relatedId,
        metadata: (file.metadata as Record<string, unknown> | null) ?? null,
        createdAt: file.createdAt.toISOString()
      }))
    };
  }

  async createContact(
    organizationId: string,
    input: {
      displayName: string;
      companyName?: string | null;
      email?: string | null;
      taxNumber?: string | null;
      customerCode?: string | null;
      supplierCode?: string | null;
      isCustomer: boolean;
      isSupplier: boolean;
      currencyCode?: string | null;
      paymentTermsDays?: number | null;
      notes?: string | null;
      receivableBalance: string;
      payableBalance: string;
      addresses: {
        type: "BILLING" | "DELIVERY" | "PRIMARY";
        line1: string;
        line2?: string | null;
        city?: string | null;
        state?: string | null;
        postalCode?: string | null;
        countryCode: string;
      }[];
      numbers: {
        label: string;
        phoneNumber: string;
      }[];
      groupIds: string[];
    }
  ): Promise<ContactDetail> {
    await this.ensureGroupsBelongToOrganization(organizationId, input.groupIds);

    const contact = await this.prisma.contact.create({
      data: {
        organizationId,
        displayName: input.displayName,
        companyName: input.companyName ?? null,
        email: input.email ?? null,
        taxNumber: input.taxNumber ?? null,
        customerCode: input.customerCode ?? null,
        supplierCode: input.supplierCode ?? null,
        isCustomer: input.isCustomer,
        isSupplier: input.isSupplier,
        currencyCode: input.currencyCode?.toUpperCase() ?? null,
        paymentTermsDays: input.paymentTermsDays ?? null,
        notes: input.notes ?? null,
        receivableBalance: input.receivableBalance,
        payableBalance: input.payableBalance,
        addresses: {
          create: input.addresses.map((address) => ({
            type: address.type,
            line1: address.line1,
            line2: address.line2 ?? null,
            city: address.city ?? null,
            state: address.state ?? null,
            postalCode: address.postalCode ?? null,
            countryCode: address.countryCode
          }))
        },
        numbers: {
          create: input.numbers.map((number) => ({
            label: number.label,
            phoneNumber: number.phoneNumber
          }))
        },
        groups: {
          create: input.groupIds.map((groupId) => ({
            groupId
          }))
        }
      }
    });

    return this.getContact(organizationId, contact.id);
  }

  async updateContact(
    organizationId: string,
    contactId: string,
    input: Partial<{
      displayName: string;
      companyName: string | null;
      email: string | null;
      taxNumber: string | null;
      customerCode: string | null;
      supplierCode: string | null;
      isCustomer: boolean;
      isSupplier: boolean;
      currencyCode: string | null;
      paymentTermsDays: number | null;
      notes: string | null;
      receivableBalance: string;
      payableBalance: string;
      addresses: {
        type: "BILLING" | "DELIVERY" | "PRIMARY";
        line1: string;
        line2?: string | null;
        city?: string | null;
        state?: string | null;
        postalCode?: string | null;
        countryCode: string;
      }[];
      numbers: {
        label: string;
        phoneNumber: string;
      }[];
      groupIds: string[];
    }>
  ): Promise<ContactDetail> {
    await this.ensureContact(organizationId, contactId);

    if (input.groupIds) {
      await this.ensureGroupsBelongToOrganization(organizationId, input.groupIds);
    }

    await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        displayName: input.displayName,
        companyName: input.companyName,
        email: input.email,
        taxNumber: input.taxNumber,
        customerCode: input.customerCode,
        supplierCode: input.supplierCode,
        isCustomer: input.isCustomer,
        isSupplier: input.isSupplier,
        currencyCode: input.currencyCode?.toUpperCase(),
        paymentTermsDays: input.paymentTermsDays,
        notes: input.notes,
        receivableBalance: input.receivableBalance,
        payableBalance: input.payableBalance
      }
    });

    if (input.addresses) {
      await this.prisma.address.deleteMany({
        where: { contactId }
      });

      if (input.addresses.length > 0) {
        await this.prisma.address.createMany({
          data: input.addresses.map((address) => ({
            contactId,
            type: address.type,
            line1: address.line1,
            line2: address.line2 ?? null,
            city: address.city ?? null,
            state: address.state ?? null,
            postalCode: address.postalCode ?? null,
            countryCode: address.countryCode
          }))
        });
      }
    }

    if (input.numbers) {
      await this.prisma.contactNumber.deleteMany({
        where: { contactId }
      });

      if (input.numbers.length > 0) {
        await this.prisma.contactNumber.createMany({
          data: input.numbers.map((number) => ({
            contactId,
            label: number.label,
            phoneNumber: number.phoneNumber
          }))
        });
      }
    }

    if (input.groupIds) {
      await this.prisma.contactGroupMember.deleteMany({
        where: { contactId }
      });

      if (input.groupIds.length > 0) {
        await this.prisma.contactGroupMember.createMany({
          data: input.groupIds.map((groupId) => ({
            contactId,
            groupId
          }))
        });
      }
    }

    return this.getContact(organizationId, contactId);
  }

  async listGroups(organizationId: string): Promise<ContactGroupRecord[]> {
    const groups = await this.prisma.contactGroup.findMany({
      where: { organizationId },
      include: {
        members: true
      },
      orderBy: { name: "asc" }
    });

    return groups.map((group) => ({
      id: group.id,
      organizationId: group.organizationId,
      name: group.name,
      description: group.description,
      memberCount: group.members.length,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString()
    }));
  }

  async createGroup(
    organizationId: string,
    input: { name: string; description?: string | null }
  ): Promise<ContactGroupRecord> {
    const group = await this.prisma.contactGroup.create({
      data: {
        organizationId,
        name: input.name,
        description: input.description ?? null
      },
      include: {
        members: true
      }
    });

    return {
      id: group.id,
      organizationId: group.organizationId,
      name: group.name,
      description: group.description,
      memberCount: group.members.length,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString()
    };
  }

  async updateGroup(
    organizationId: string,
    groupId: string,
    input: Partial<{ name: string; description: string | null }>
  ): Promise<ContactGroupRecord> {
    const group = await this.prisma.contactGroup.findFirst({
      where: { id: groupId, organizationId },
      include: {
        members: true
      }
    });

    if (!group) {
      throw new NotFoundException("Contact group not found.");
    }

    const updated = await this.prisma.contactGroup.update({
      where: { id: groupId },
      data: {
        name: input.name,
        description: input.description
      },
      include: {
        members: true
      }
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      name: updated.name,
      description: updated.description,
      memberCount: updated.members.length,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    };
  }

  private async ensureContact(organizationId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, organizationId }
    });

    if (!contact) {
      throw new NotFoundException("Contact not found.");
    }
  }

  private async ensureGroupsBelongToOrganization(
    organizationId: string,
    groupIds: string[]
  ) {
    if (groupIds.length === 0) {
      return;
    }

    const matchingGroups = await this.prisma.contactGroup.count({
      where: {
        organizationId,
        id: {
          in: groupIds
        }
      }
    });

    if (matchingGroups !== groupIds.length) {
      throw new NotFoundException("One or more contact groups were not found.");
    }
  }
}
