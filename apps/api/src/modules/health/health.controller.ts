import { Controller, Get, Inject } from "@nestjs/common";

import { HealthService } from "./health.service";

@Controller()
export class HealthController {
  private readonly healthService: HealthService;

  constructor(@Inject(HealthService) healthService: HealthService) {
    this.healthService = healthService;
  }

  @Get("health")
  health() {
    return this.healthService.health();
  }

  @Get("ready")
  async ready() {
    return this.healthService.ready();
  }
}
