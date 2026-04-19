import { ForbiddenException } from "@nestjs/common";
import type { PermissionKey } from "@daftar/types";

import type { AuthenticatedRequest } from "./request-context";

export function requirePermission(
  session: AuthenticatedRequest["currentSession"],
  permission: PermissionKey
) {
  if (!session?.capabilitySnapshot.permissions.includes(permission)) {
    throw new ForbiddenException(`Missing permission: ${permission}`);
  }
}
