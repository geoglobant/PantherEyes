package com.panthereyes.policy

import java.io.InputStreamReader

internal data class LoadedSecurityPolicy(
    val env: String,
    val mode: String,
    val failOnSeverity: String,
    val directives: Map<String, String>,
)

internal object SecurityPolicyLoader {
    fun load(env: String): LoadedSecurityPolicy {
        val stream = SecurityPolicyLoader::class.java.classLoader
            ?.getResourceAsStream("policy/$env.json")
            ?: error("Missing policy fixture for $env")

        val json = InputStreamReader(stream).use { it.readText() }
        return parsePolicyJson(json)
    }

    private fun parsePolicyJson(raw: String): LoadedSecurityPolicy {
        fun extractString(key: String): String {
            val regex = Regex("\"$key\"\\s*:\\s*\"([^\"]+)\"")
            return regex.find(raw)?.groupValues?.get(1)
                ?: error("Missing key '$key' in fixture")
        }

        val directivesBlock = Regex("\"directives\"\\s*:\\s*\\{([\\s\\S]*?)\\}")
            .find(raw)?.groupValues?.get(1)
            ?: ""
        val directives = Regex("\"([^\"]+)\"\\s*:\\s*\"([^\"]+)\"")
            .findAll(directivesBlock)
            .associate { it.groupValues[1] to it.groupValues[2] }

        return LoadedSecurityPolicy(
            env = extractString("env"),
            mode = extractString("mode"),
            failOnSeverity = extractString("failOnSeverity"),
            directives = directives,
        )
    }
}
