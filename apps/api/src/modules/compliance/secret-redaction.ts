const protectedFieldNames = new Set([
  "secret",
  "certificatesecret",
  "privatekeypem",
  "privatekey",
  "private_key",
  "password",
  "otpcode",
  "binarysecuritytoken",
  "authorization",
  "clientsecret",
  "accesstoken",
  "refreshtoken",
]);

const privateKeyBlockPattern =
  /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/gi;
const authHeaderPattern = /\b(Basic|Bearer)\s+[A-Za-z0-9+/=._~-]+\b/gi;
const keyValuePattern =
  /\b(certificateSecret|privateKeyPem|private_key|privateKey|secret|password|otpCode|binarySecurityToken|authorization|clientSecret|accessToken|refreshToken)\b\s*[:=]\s*([^\s,;]+)/gi;
const jsonDoubleQuotePattern =
  /("(certificateSecret|privateKeyPem|private_key|privateKey|secret|password|otpCode|binarySecurityToken|authorization|clientSecret|accessToken|refreshToken)"\s*:\s*)"([^"]*)"/gi;
const jsonSingleQuotePattern =
  /('(?:certificateSecret|privateKeyPem|private_key|privateKey|secret|password|otpCode|binarySecurityToken|authorization|clientSecret|accessToken|refreshToken)'\s*:\s*)'([^']*)'/gi;

function normalizeFieldName(key: string) {
  return key.replace(/[^a-z0-9_]/gi, "").toLowerCase();
}

function isProtectedFieldName(key: string) {
  return protectedFieldNames.has(normalizeFieldName(key));
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(privateKeyBlockPattern, "[REDACTED_PRIVATE_KEY]")
    .replace(authHeaderPattern, "$1 [REDACTED]")
    .replace(jsonDoubleQuotePattern, '$1"[REDACTED]"')
    .replace(jsonSingleQuotePattern, "$1'[REDACTED]'")
    .replace(keyValuePattern, (match, key) => {
      const separatorIndex = match.indexOf(":") >= 0 ? match.indexOf(":") : match.indexOf("=");
      if (separatorIndex < 0) {
        return `${key}=[REDACTED]`;
      }
      const separator = match[separatorIndex];
      return `${key}${separator} [REDACTED]`;
    });
}

export function sanitizeSensitiveValue(value: unknown, parentKey?: string): unknown {
  if (parentKey && isProtectedFieldName(parentKey)) {
    return "[REDACTED]";
  }

  if (typeof value === "string") {
    return redactSensitiveText(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeSensitiveValue(entry, parentKey));
  }

  if (value && typeof value === "object") {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: redactSensitiveText(value.message),
        stack: value.stack ? redactSensitiveText(value.stack) : undefined,
      };
    }

    return Object.entries(value as Record<string, unknown>).reduce<
      Record<string, unknown>
    >((accumulator, [key, entry]) => {
      accumulator[key] = sanitizeSensitiveValue(entry, key);
      return accumulator;
    }, {});
  }

  return value;
}

export function sanitizeSensitiveObject(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return sanitizeSensitiveValue(value) as Record<string, unknown>;
}

