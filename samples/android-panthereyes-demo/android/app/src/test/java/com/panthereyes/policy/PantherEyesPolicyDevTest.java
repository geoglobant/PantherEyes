package com.panthereyes.policy;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.Before;
import org.junit.Test;

public final class PantherEyesPolicyDevTest {
    private final List<String> ruleIds = new ArrayList<>();
    private final Map<String, String> directives = new HashMap<>();
    private final String mode = "audit";
    private final String failOnSeverity = "critical";

    @Before
    public void setUp() {
        ruleIds.add("mobile.android.allow-backup-enabled"); // enabled=true, severity=medium
        ruleIds.add("mobile.android.cleartext-traffic-enabled"); // enabled=true, severity=low
        ruleIds.add("mobile.android.debuggable-enabled"); // enabled=true, severity=low
        ruleIds.add("mobile.android.hardcoded-fake-secret"); // enabled=true, severity=medium
        directives.put("allowDemoCleartext", "true");
        directives.put("minScore", "60");
        directives.put("networkProfile", "\"relaxed\"");
        directives.put("platform", "\"android\"");
        directives.put("requireExceptionApproval", "true");
        directives.put("sampleEnvironmentLabel", "\"android-dev\"");
    }

    @Test
    public void testPolicyMetadata_dev() {
        assertEquals("audit", mode);
        assertEquals("critical", failOnSeverity);
        assertTrue(ruleIds.size() >= 4);
    }

    @Test
    public void testDirectives_dev() {
        assertEquals("true", directives.get("allowDemoCleartext"));
        assertEquals("60", directives.get("minScore"));
        assertEquals("\"relaxed\"", directives.get("networkProfile"));
        assertEquals("\"android\"", directives.get("platform"));
        assertEquals("true", directives.get("requireExceptionApproval"));
        assertEquals("\"android-dev\"", directives.get("sampleEnvironmentLabel"));
    }

    @Test
    public void testRule_mobile_android_allow_backup_enabled_isPresent() {
        assertTrue(ruleIds.contains("mobile.android.allow-backup-enabled"));
    }

    @Test
    public void testRule_mobile_android_cleartext_traffic_enabled_isPresent() {
        assertTrue(ruleIds.contains("mobile.android.cleartext-traffic-enabled"));
    }

    @Test
    public void testRule_mobile_android_debuggable_enabled_isPresent() {
        assertTrue(ruleIds.contains("mobile.android.debuggable-enabled"));
    }

    @Test
    public void testRule_mobile_android_hardcoded_fake_secret_isPresent() {
        assertTrue(ruleIds.contains("mobile.android.hardcoded-fake-secret"));
    }
}
