package com.panthereyes.policy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class SecurityPolicyLoaderTest {
    @Test
    fun loadsProdFixture() {
        val prod = SecurityPolicyLoader.load("prod")

        assertEquals("prod", prod.env)
        assertEquals("enforce", prod.mode)
        assertEquals("medium", prod.failOnSeverity)
        assertEquals("false", prod.directives["allowDemoCleartext"])
    }

    @Test
    fun prodDiffersFromDev() {
        val dev = SecurityPolicyLoader.load("dev")
        val prod = SecurityPolicyLoader.load("prod")

        assertEquals("audit", dev.mode)
        assertEquals("enforce", prod.mode)
        assertNotEquals(dev.failOnSeverity, prod.failOnSeverity)
    }
}
