import type { Request } from "express";
import type { CapabilitySnapshot, OrganizationSummary, SessionSnapshot } from "@daftar/types";

export type AuthenticatedRequest = Request & {
  requestId?: string;
  currentSession?: {
    id: string;
    user: SessionSnapshot["user"];
    organization: OrganizationSummary | null;
    membership: SessionSnapshot["membership"];
    capabilitySnapshot: CapabilitySnapshot;
  } | null;
};
