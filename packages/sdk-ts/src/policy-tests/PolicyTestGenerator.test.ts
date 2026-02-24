import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PolicyTestGenerator } from './PolicyTestGenerator';
import type { PolicyDirectiveInput, PolicyTestEffectivePolicyInput } from './types';

const effectivePolicyBase: PolicyTestEffectivePolicyInput = {
  env: 'prod',
  target: 'ios',
  mode: 'enforce',
  failOnSeverity: 'high',
  rules: [
    { ruleId: 'mobile.ios.ats.required', enabled: true, effectiveSeverity: 'high' },
    { ruleId: 'mobile.android.cleartext.disabled', enabled: false, effectiveSeverity: 'medium' },
    { ruleId: 'mobile.debug.disabled', enabled: true, effectiveSeverity: 'medium' },
  ],
};

const directives: PolicyDirectiveInput[] = [
  { key: 'minScore', value: 95, source: 'envs.prod' },
  { key: 'requireApprovalForExceptions', value: true, source: 'defaults' },
];

test('PolicyTestGenerator returns stable XCTest ChangeSet for iOS', async () => {
  const generator = new PolicyTestGenerator();

  const changeSet = await generator.generate({
    effectivePolicy: effectivePolicyBase,
    directives,
    outputMode: 'changeset',
    basePath: 'generated',
  });

  assert.equal(changeSet.dryRun, true);
  assert.equal(changeSet.changes.length, 1);
  const [file] = changeSet.changes;
  assert.equal(file.path, 'generated/ios/Tests/PantherEyesPolicyTests/PantherEyesPolicyProdTests.swift');
  assert.equal(file.language, 'swift');
  assert.match(file.content, /final class PantherEyesPolicyProdTests: XCTestCase/);
  assert.match(file.content, /func testPolicyMetadata_prod\(\)/);
  assert.match(file.content, /func testDirectives_prod\(\)/);
  assert.match(file.content, /func testRule_mobile_ios_ats_required_isPresent\(\)/);
  assert.match(file.content, /XCTAssertEqual\(failOnSeverity, \"high\"\)/);
});

test('PolicyTestGenerator writes stable JUnit file for Android in write mode', async () => {
  const generator = new PolicyTestGenerator();
  const root = mkdtempSync(path.join(tmpdir(), 'panthereyes-sdk-generator-'));

  try {
    const changeSet = await generator.generate({
      effectivePolicy: {
        ...effectivePolicyBase,
        env: 'staging',
        target: 'android',
        mode: 'warn',
        failOnSeverity: 'critical',
      },
      directives: [{ key: 'minScore', value: 80 }],
      outputMode: 'write',
      outputDir: root,
      namespace: 'com.panthereyes.generated',
    });

    assert.equal(changeSet.dryRun, false);
    const [file] = changeSet.changes;
    assert.equal(
      file.path,
      'android/app/src/test/java/com/panthereyes/generated/PantherEyesPolicyStagingTest.java',
    );

    const written = readFileSync(path.join(root, file.path), 'utf8');
    assert.match(written, /package com\.panthereyes\.generated;/);
    assert.match(written, /public final class PantherEyesPolicyStagingTest/);
    assert.match(written, /public void testPolicyMetadata_staging\(\)/);
    assert.match(written, /assertEquals\(\"critical\", failOnSeverity\);/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
