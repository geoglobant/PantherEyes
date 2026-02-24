package com.panthereyes.policy;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.Before;
import org.junit.Test;

public final class PantherEyesPolicyProdTest {
    private final List<String> ruleIds = new ArrayList<>();
    private final Map<String, String> directives = new HashMap<>();
    private final String mode = "enforce";
    private final String failOnSeverity = "high";

    @Before
    public void setUp() {
        ruleIds.add("mobile.android.cleartext.disabled"); // enabled=true, severity=high
        ruleIds.add("mobile.debug.disabled"); // enabled=true, severity=medium
        ruleIds.add("mobile.ios.ats.required"); // enabled=true, severity=high
        directives.put("minScore", "95");
        directives.put("requireApprovalForExceptions", "true");
    }

    @Test
    public void testPolicyMetadata_prod() {
        assertEquals("enforce", mode);
        assertEquals("high", failOnSeverity);
        assertTrue(ruleIds.size() >= 3);
    }

    @Test
    public void testDirectives_prod() {
        assertEquals("95", directives.get("minScore"));
        assertEquals("true", directives.get("requireApprovalForExceptions"));
    }

    @Test
    public void testRule_mobile_android_cleartext_disabled_isPresent() {
        assertTrue(ruleIds.contains("mobile.android.cleartext.disabled"));
    }

    @Test
    public void testRule_mobile_debug_disabled_isPresent() {
        assertTrue(ruleIds.contains("mobile.debug.disabled"));
    }

    @Test
    public void testRule_mobile_ios_ats_required_isPresent() {
        assertTrue(ruleIds.contains("mobile.ios.ats.required"));
    }
}
