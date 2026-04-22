import { describe, expect, it } from "vitest";

import { complianceParityFixtures } from "./compliance-fixtures";
import { SdkParityService } from "./sdk-parity.service";

const sdkParityEnabled = process.env.RUN_SDK_PARITY === "true";

describe.runIf(sdkParityEnabled)("sdk parity validation suite", () => {
  it(
    "verifies SDK validation parity for all fixtures",
    async () => {
      const service = new SdkParityService();
      const report = await service.runParitySuite(complianceParityFixtures);
      const validationMismatches = report.fixtures.filter(
        (fixture) => fixture.validation.expected !== fixture.validation.sdkStatus,
      );
      const invalidFixture = report.fixtures.find(
        (fixture) => fixture.fixtureId === "invalid-case",
      );
      const strictFixtures = report.fixtures.filter(
        (fixture) => fixture.strictParity,
      );
      const strictQrMismatches = strictFixtures.flatMap((fixture) =>
        fixture.mismatches.filter((mismatch) => mismatch.area === "qr"),
      );
      const strictHashMismatches = strictFixtures.flatMap((fixture) =>
        fixture.mismatches.filter((mismatch) => mismatch.area === "hash"),
      );

      expect(invalidFixture?.validation.sdkStatus).toBe("FAILED");
      expect(
        strictFixtures.every((fixture) => fixture.validation.sdkStatus === "PASSED"),
        service.formatSummary(report),
      ).toBe(true);
      expect(validationMismatches.length, service.formatSummary(report)).toBe(0);
      expect(strictHashMismatches.length, service.formatSummary(report)).toBe(0);
      expect(strictQrMismatches.length, service.formatSummary(report)).toBe(0);
    },
    600_000,
  );
});
