#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Load test script for Klaro server.
 * Simulates concurrent users hitting various endpoints.
 *
 * Usage:
 *   node scripts/load-test.js                     # defaults: 100 users, http://localhost:3000
 *   node scripts/load-test.js --users 50           # custom user count
 *   node scripts/load-test.js --base http://host   # custom base URL
 *   node scripts/load-test.js --ai                 # include real AI endpoints (costs API quota)
 *
 * What it tests:
 *   - Health endpoint (GET /api/health)            — always included
 *   - Dashboard data (GET /api/dashboard-data)     — always included
 *   - Usage stats (GET /api/usage)                 — always included
 *   - Generate kit (POST /api/generate-kit)        — only with --ai flag
 *   - Generate quiz (POST /api/generate-quiz)      — only with --ai flag
 *   - Generate flashcards (POST /api/generate-flashcards) — only with --ai flag
 *
 * Without --ai, this tests infrastructure (rate limiter, queue, cache,
 * database, request routing) without burning Gemini quota.
 */

const BASE_URL = getArg('--base') || 'http://localhost:3000';
const TOTAL_USERS = parseInt(getArg('--users') || '100', 10);
const INCLUDE_AI = process.argv.includes('--ai');
const BATCH_SIZE = 20; // concurrent requests per wave

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : null;
}

async function timedFetch(label, url, options = {}) {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        // Simulate different IPs via X-Forwarded-For
        'X-Forwarded-For': `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        ...options.headers,
      },
    });
    const duration = Date.now() - start;
    const body = await res.text();
    let json;
    try { json = JSON.parse(body); } catch { json = null; }
    return { label, status: res.status, duration, success: json?.success ?? (res.status < 400), json };
  } catch (err) {
    const duration = Date.now() - start;
    return { label, status: 0, duration, success: false, error: err.message };
  }
}

// ─── Request generators ──────────────────────────────────────────────────────

function makeRequest(userId) {
  // Weight distribution: mostly lightweight endpoints
  const rand = Math.random();

  if (rand < 0.30) {
    return timedFetch(`user-${userId} health`, `${BASE_URL}/api/health`);
  }
  if (rand < 0.55) {
    return timedFetch(`user-${userId} dashboard`, `${BASE_URL}/api/dashboard-data`);
  }
  if (rand < 0.70) {
    return timedFetch(`user-${userId} usage`, `${BASE_URL}/api/usage`);
  }
  if (rand < 0.80) {
    return timedFetch(`user-${userId} save-library`, `${BASE_URL}/api/save-to-library`, {
      method: 'POST',
      body: JSON.stringify({
        item: {
          title: `Load Test Kit ${userId}-${Date.now()}`,
          type: 'revision-kit',
          progress: 0,
          contentSnippet: 'Load test item',
        },
      }),
    });
  }
  if (rand < 0.90) {
    return timedFetch(`user-${userId} update-stats`, `${BASE_URL}/api/update-stats`, {
      method: 'POST',
      body: JSON.stringify({ xp: Math.floor(Math.random() * 100) }),
    });
  }

  // AI endpoints — only if --ai flag is set
  if (INCLUDE_AI) {
    const topics = [
      'Electricity', 'Chemical Reactions', 'Linear Equations',
      'Nationalism in India', 'Life Processes', 'Magnetic Effects',
      'Carbon and its Compounds', 'Statistics', 'Light Reflection',
    ];
    const topic = topics[Math.floor(Math.random() * topics.length)];

    if (rand < 0.95) {
      return timedFetch(`user-${userId} generate-quiz`, `${BASE_URL}/api/generate-quiz`, {
        method: 'POST',
        body: JSON.stringify({ topic, classLevel: 'Class 10', examMode: 'CBSE', count: 3 }),
      });
    }
    return timedFetch(`user-${userId} generate-flashcards`, `${BASE_URL}/api/generate-flashcards`, {
      method: 'POST',
      body: JSON.stringify({ topic, classLevel: 'Class 10', examMode: 'CBSE' }),
    });
  }

  // Fallback: another dashboard request
  return timedFetch(`user-${userId} dashboard`, `${BASE_URL}/api/dashboard-data`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function runLoadTest() {
  console.log('='.repeat(60));
  console.log(`  Klaro Load Test`);
  console.log(`  Target:     ${BASE_URL}`);
  console.log(`  Users:      ${TOTAL_USERS}`);
  console.log(`  Batch size: ${BATCH_SIZE}`);
  console.log(`  AI endpoints: ${INCLUDE_AI ? 'YES (costs quota)' : 'NO (infra-only)'}`);
  console.log('='.repeat(60));

  // Verify server is up
  try {
    const check = await fetch(`${BASE_URL}/api/health`);
    if (!check.ok) throw new Error(`Health check returned ${check.status}`);
    console.log('\n✓ Server is reachable\n');
  } catch (err) {
    console.error(`\n✗ Cannot reach ${BASE_URL}/api/health — is the server running?\n  ${err.message}\n`);
    process.exit(1);
  }

  const allResults = [];
  const startTime = Date.now();

  // Send requests in batches
  for (let wave = 0; wave < Math.ceil(TOTAL_USERS / BATCH_SIZE); wave++) {
    const batchStart = wave * BATCH_SIZE;
    const batchEnd = Math.min(batchStart + BATCH_SIZE, TOTAL_USERS);
    const batchPromises = [];

    for (let i = batchStart; i < batchEnd; i++) {
      batchPromises.push(makeRequest(i));
    }

    console.log(`  Wave ${wave + 1}: sending ${batchPromises.length} requests...`);
    const batchResults = await Promise.all(batchPromises);
    allResults.push(...batchResults);

    // Brief pause between waves to avoid overwhelming localhost
    if (wave < Math.ceil(TOTAL_USERS / BATCH_SIZE) - 1) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  const totalTime = Date.now() - startTime;

  // ─── Report ──────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('  RESULTS');
  console.log('='.repeat(60));

  const successful = allResults.filter(r => r.success);
  const failed = allResults.filter(r => !r.success);
  const durations = allResults.map(r => r.duration).sort((a, b) => a - b);
  const rateLimited = allResults.filter(r => r.status === 429);

  console.log(`\n  Total requests:   ${allResults.length}`);
  console.log(`  Successful:       ${successful.length} (${((successful.length / allResults.length) * 100).toFixed(1)}%)`);
  console.log(`  Failed:           ${failed.length}`);
  console.log(`  Rate limited:     ${rateLimited.length}`);
  console.log(`  Total time:       ${totalTime}ms`);
  console.log(`  Throughput:       ${(allResults.length / (totalTime / 1000)).toFixed(1)} req/s`);

  console.log(`\n  Latency (ms):`);
  console.log(`    Min:     ${durations[0]}`);
  console.log(`    Median:  ${durations[Math.floor(durations.length / 2)]}`);
  console.log(`    p95:     ${durations[Math.floor(durations.length * 0.95)]}`);
  console.log(`    p99:     ${durations[Math.floor(durations.length * 0.99)]}`);
  console.log(`    Max:     ${durations[durations.length - 1]}`);
  console.log(`    Avg:     ${Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)}`);

  // Breakdown by endpoint
  const byEndpoint = {};
  for (const r of allResults) {
    const ep = r.label.split(' ').slice(1).join(' ');
    if (!byEndpoint[ep]) byEndpoint[ep] = { count: 0, ok: 0, fail: 0, durations: [] };
    byEndpoint[ep].count++;
    byEndpoint[ep].durations.push(r.duration);
    if (r.success) byEndpoint[ep].ok++; else byEndpoint[ep].fail++;
  }

  console.log('\n  By endpoint:');
  for (const [ep, data] of Object.entries(byEndpoint)) {
    const sorted = data.durations.sort((a, b) => a - b);
    const avg = Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
    console.log(`    ${ep.padEnd(22)} ${data.count} reqs | ${data.ok} ok | ${data.fail} fail | avg ${avg}ms | p95 ${p95}ms`);
  }

  // Show failed request details
  if (failed.length > 0 && failed.length <= 10) {
    console.log('\n  Failed request details:');
    for (const r of failed) {
      console.log(`    ${r.label}: status=${r.status} ${r.error || r.json?.error || ''}`);
    }
  } else if (failed.length > 10) {
    console.log(`\n  (${failed.length} failures — showing first 5)`);
    for (const r of failed.slice(0, 5)) {
      console.log(`    ${r.label}: status=${r.status} ${r.error || r.json?.error || ''}`);
    }
  }

  // Final health check
  console.log('\n  Post-test health check:');
  try {
    const health = await fetch(`${BASE_URL}/api/health`);
    const hData = await health.json();
    console.log(`    Status:    ${hData.status}`);
    console.log(`    Queue:     ${hData.queue.active} active, ${hData.queue.waiting} waiting`);
    console.log(`    Cache:     ${hData.cache.entries} entries, ${hData.cache.hitRate}% hit rate`);
    console.log(`    Database:  ${hData.database.kits} kits, ${hData.database.libraryItems} library items`);
  } catch (err) {
    console.log(`    ✗ Health check failed: ${err.message}`);
  }

  console.log('\n' + '='.repeat(60));

  // Exit with error code if too many failures (excluding rate limits which are expected)
  const realFailures = failed.filter(r => r.status !== 429);
  if (realFailures.length > allResults.length * 0.1) {
    console.log('  ✗ FAIL — more than 10% non-rate-limit failures\n');
    process.exit(1);
  } else {
    console.log('  ✓ PASS\n');
  }
}

runLoadTest().catch(err => {
  console.error('Load test crashed:', err);
  process.exit(1);
});
