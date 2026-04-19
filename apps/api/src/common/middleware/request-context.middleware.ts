import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { NextFunction, Response } from "express";

import type { AuthenticatedRequest } from "../utils/request-context";

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const headerRequestId = req.headers["x-request-id"];
    const requestId =
      (typeof headerRequestId === "string" ? headerRequestId : undefined)?.trim() ||
      randomUUID();

    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    next();
  }
}
