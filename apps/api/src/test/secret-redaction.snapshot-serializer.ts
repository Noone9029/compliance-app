import { redactSensitiveText, sanitizeSensitiveValue } from "../modules/compliance/secret-redaction";

type SnapshotSerializer = {
  test(value: unknown): boolean;
  serialize(value: unknown): string;
};

const serializer: SnapshotSerializer = {
  test(value: unknown) {
    if (typeof value === "string") {
      return redactSensitiveText(value) !== value;
    }

    return Boolean(value && typeof value === "object");
  },
  serialize(value: unknown) {
    return JSON.stringify(sanitizeSensitiveValue(value), null, 2);
  },
};

export default serializer;

