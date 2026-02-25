export interface FindingKnowledge {
  canonicalId: string;
  aliases: string[];
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  target: 'web' | 'mobile';
  explanation: string;
  risk: string[];
  remediation: string[];
  references: string[];
}

const FINDING_KNOWLEDGE: FindingKnowledge[] = [
  {
    canonicalId: 'mobile.ios.ats.arbitrary-loads-enabled',
    aliases: ['IOS-ATS-001', 'ios-ats-001'],
    title: 'iOS ATS relaxed (NSAllowsArbitraryLoads=true)',
    severity: 'high',
    target: 'mobile',
    explanation:
      'App Transport Security (ATS) is broadly disabled, allowing insecure HTTP connections and weakening transport protections expected by iOS.',
    risk: [
      'Traffic can be downgraded to plaintext when endpoints are not strictly HTTPS.',
      'Increases exposure to interception and man-in-the-middle attacks in production environments.',
    ],
    remediation: [
      'Remove `NSAllowsArbitraryLoads = true` from `Info.plist` for production builds.',
      'Use per-domain exceptions (`NSExceptionDomains`) only when strictly necessary.',
      'Keep relaxed networking only for local development and document it in PantherEyes policy as `warn` for dev.',
    ],
    references: ['samples/ios-panthereyes-demo/ios/Resources/Info.plist'],
  },
  {
    canonicalId: 'mobile.android.cleartext-traffic-enabled',
    aliases: ['AND-NET-001', 'and-net-001'],
    title: 'Android cleartext traffic enabled',
    severity: 'high',
    target: 'mobile',
    explanation:
      'The Android app manifest allows cleartext traffic, which permits non-TLS HTTP connections and weakens transport security guarantees.',
    risk: [
      'Data sent over HTTP can be intercepted or modified on hostile networks.',
      'Cleartext allowances often leak from dev/test into prod builds if not explicitly gated.',
    ],
    remediation: [
      'Set `android:usesCleartextTraffic=\"false\"` in production manifests.',
      'If local dev needs HTTP, use a debug-only manifest override or network security config scoped to debug.',
      'Align PantherEyes prod policy to block transport findings while keeping dev as warn/audit if needed.',
    ],
    references: ['samples/android-panthereyes-demo/android/app/src/main/AndroidManifest.xml'],
  },
  {
    canonicalId: 'mobile.android.debuggable-enabled',
    aliases: ['AND-DBG-001', 'and-dbg-001'],
    title: 'Android debuggable enabled',
    severity: 'high',
    target: 'mobile',
    explanation:
      'The app is marked debuggable in a configuration that should be hardened, increasing attack surface and runtime inspection risk.',
    risk: [
      'Attackers can attach debuggers more easily on compromised devices.',
      'Debug-only behavior may remain active in builds distributed beyond local development.',
    ],
    remediation: [
      'Ensure `android:debuggable` is not hardcoded `true` in release-like manifests.',
      'Control debuggable through build types and verify release builds set it to false.',
    ],
    references: ['samples/android-panthereyes-demo/android/app/src/main/AndroidManifest.xml'],
  },
];

export function resolveFindingKnowledge(rawIdOrAlias: string | undefined): FindingKnowledge | undefined {
  if (!rawIdOrAlias) {
    return undefined;
  }
  const normalized = rawIdOrAlias.trim().toLowerCase();
  return FINDING_KNOWLEDGE.find(
    (entry) =>
      entry.canonicalId.toLowerCase() === normalized || entry.aliases.some((alias) => alias.toLowerCase() === normalized),
  );
}

export function extractFindingIdFromMessage(message: string): string | undefined {
  const aliasMatch = message.match(/\b([A-Z]{2,}-[A-Z]{2,}-\d{3})\b/i);
  if (aliasMatch) {
    return aliasMatch[1];
  }
  const canonicalMatch = message.match(/\b((?:mobile|web)\.[a-z0-9.-]+)\b/i);
  if (canonicalMatch) {
    return canonicalMatch[1];
  }
  return undefined;
}

