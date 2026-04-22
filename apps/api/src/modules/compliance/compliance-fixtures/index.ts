import { creditNoteFixture } from "./credit-note.fixture";
import { debitNoteFixture } from "./debit-note.fixture";
import { invalidFixture } from "./invalid.fixture";
import { simplifiedFixture } from "./simplified.fixture";
import { standardFixture } from "./standard.fixture";
import { zeroRatedFixture } from "./zero-rated.fixture";

export { type ComplianceParityFixture } from "./types";

export const complianceParityFixtures = [
  standardFixture,
  simplifiedFixture,
  creditNoteFixture,
  debitNoteFixture,
  zeroRatedFixture,
  invalidFixture,
] as const;
