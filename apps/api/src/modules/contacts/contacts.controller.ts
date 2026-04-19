import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { z } from "zod";

import { CurrentSession } from "../../common/decorators/current-session.decorator";
import { AuthenticatedGuard } from "../../common/guards/authenticated.guard";
import { requirePermission } from "../../common/utils/require-permission";
import type { AuthenticatedRequest } from "../../common/utils/request-context";
import { AuditService } from "../audit/audit.service";
import { ContactsService } from "./contacts.service";

const segmentSchema = z.enum(["all", "customers", "suppliers"]).default("all");

const addressSchema = z.object({
  type: z.enum(["BILLING", "DELIVERY", "PRIMARY"]),
  line1: z.string().min(1),
  line2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  countryCode: z.string().min(2).max(2)
});

const numberSchema = z.object({
  label: z.string().min(1),
  phoneNumber: z.string().min(1)
});

const contactSchema = z.object({
  displayName: z.string().min(1),
  companyName: z.string().optional().nullable(),
  email: z.email().optional().nullable(),
  taxNumber: z.string().optional().nullable(),
  customerCode: z.string().optional().nullable(),
  supplierCode: z.string().optional().nullable(),
  isCustomer: z.boolean().default(true),
  isSupplier: z.boolean().default(false),
  currencyCode: z.string().optional().nullable(),
  paymentTermsDays: z.coerce.number().int().nonnegative().optional().nullable(),
  notes: z.string().optional().nullable(),
  receivableBalance: z.string().default("0.00"),
  payableBalance: z.string().default("0.00"),
  addresses: z.array(addressSchema).default([]),
  numbers: z.array(numberSchema).default([]),
  groupIds: z.array(z.string().min(1)).default([])
});

const contactGroupSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable()
});

function parsePatch<TShape extends z.core.$ZodShape>(schema: z.ZodObject<TShape>) {
  return schema.partial().refine(
    (value: Record<string, unknown>) => Object.keys(value).length > 0,
    "At least one field is required."
  );
}

@Controller("v1")
@UseGuards(AuthenticatedGuard)
export class ContactsController {
  private readonly contactsService: ContactsService;
  private readonly auditService: AuditService;

  constructor(
    @Inject(ContactsService) contactsService: ContactsService,
    @Inject(AuditService) auditService: AuditService
  ) {
    this.contactsService = contactsService;
    this.auditService = auditService;
  }

  @Get("contacts")
  listContacts(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Query("segment") segment: string | undefined,
    @Query("search") search: string | undefined
  ) {
    requirePermission(session, "contacts.read");
    return this.contactsService.listContacts(session!.organization!.id, {
      segment: segmentSchema.parse(segment ?? "all"),
      search: search?.trim() ? search.trim() : undefined
    });
  }

  @Post("contacts")
  async createContact(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "contacts.write");
    const parsed = contactSchema.parse(body);
    const contact = await this.contactsService.createContact(
      session!.organization!.id,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "contacts.contact.create",
      targetType: "contact",
      targetId: contact.id,
      result: "SUCCESS"
    });
    return contact;
  }

  @Get("contacts/:contactId")
  getContact(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("contactId") contactId: string
  ) {
    requirePermission(session, "contacts.read");
    return this.contactsService.getContact(session!.organization!.id, contactId);
  }

  @Patch("contacts/:contactId")
  async updateContact(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("contactId") contactId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "contacts.write");
    const parsed = parsePatch(contactSchema).parse(body);
    const contact = await this.contactsService.updateContact(
      session!.organization!.id,
      contactId,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "contacts.contact.update",
      targetType: "contact",
      targetId: contact.id,
      result: "SUCCESS"
    });
    return contact;
  }

  @Get("contact-groups")
  listGroups(@CurrentSession() session: AuthenticatedRequest["currentSession"]) {
    requirePermission(session, "contacts.read");
    return this.contactsService.listGroups(session!.organization!.id);
  }

  @Post("contact-groups")
  async createGroup(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Body() body: unknown
  ) {
    requirePermission(session, "contacts.write");
    const parsed = contactGroupSchema.parse(body);
    const group = await this.contactsService.createGroup(
      session!.organization!.id,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "contacts.group.create",
      targetType: "contact_group",
      targetId: group.id,
      result: "SUCCESS"
    });
    return group;
  }

  @Patch("contact-groups/:groupId")
  async updateGroup(
    @CurrentSession() session: AuthenticatedRequest["currentSession"],
    @Param("groupId") groupId: string,
    @Body() body: unknown
  ) {
    requirePermission(session, "contacts.write");
    const parsed = parsePatch(contactGroupSchema).parse(body);
    const group = await this.contactsService.updateGroup(
      session!.organization!.id,
      groupId,
      parsed
    );
    await this.auditService.log({
      organizationId: session!.organization!.id,
      actorType: "USER",
      actorUserId: session!.user!.id,
      action: "contacts.group.update",
      targetType: "contact_group",
      targetId: group.id,
      result: "SUCCESS"
    });
    return group;
  }
}
