/**
 * Certification Manager for Talk Dojo
 * Manages immutable configuration snapshots, test certification runs, and Active Deployment history.
 */

import fs from 'fs/promises';
import path from 'path';
import { BatchRunner } from '../runner/batch-runner.js';
import { VirtualToolManager } from '../tools/virtual-tool-manager.js';
import { config } from '../config.js';

export class CertificationManager {
  constructor(accountManager, baseDir = 'data/accounts') {
    this.accountManager = accountManager;
    this.virtualToolManager = new VirtualToolManager(baseDir);
    this.baseDir = path.resolve(process.cwd(), baseDir);
    this.batchRunner = new BatchRunner({ accountManager, apiKey: config.geminiApiKey });
  }

  getSnapshotsDir(accountId) {
    return path.join(this.baseDir, accountId, 'snapshots');
  }

  async listSnapshots(accountId) {
    const dir = this.getSnapshotsDir(accountId);
    try {
      await fs.mkdir(dir, { recursive: true });
      const files = await fs.readdir(dir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      const snapshots = [];
      for (const f of jsonFiles) {
        try {
          const raw = await fs.readFile(path.join(dir, f), 'utf8');
          snapshots.push(JSON.parse(raw));
        } catch (e) {}
      }

      snapshots.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return snapshots;
    } catch (e) {
      return [];
    }
  }

  async getSnapshot(accountId, snapshotId) {
    const file = path.join(this.getSnapshotsDir(accountId), `snapshot_${snapshotId}.json`);
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  }

  /**
   * Snapshot and Certify: Captures the configuration set and executes the test bank
   */
  async snapshotAndCertify({ accountId, assistantId, bankId = 'default-bank', mode = 'text', onProgress = null }) {
    const account = await this.accountManager.getAccount(accountId);
    const assistant = await this.accountManager.getAssistant(accountId, assistantId);
    const virtualTools = await this.virtualToolManager.listTools(accountId);
    const companyInfo = await this.accountManager.getCompanyInfo(accountId);
    const enabledPolicies = await this.accountManager.listPolicies(accountId, 'all_enabled');
    const enabledProcedures = await this.accountManager.listProcedures(accountId, 'enabled');

    if (!account) throw new Error(`Account ${accountId} not found`);
    if (!assistant) throw new Error(`Assistant ${assistantId} not found`);

    const snapshotId = `cert-${Date.now()}`;
    const snapshot = {
      snapshotId,
      timestamp: new Date().toISOString(),
      accountId,
      assistantId,
      assistantName: assistant.name,
      assistantVoice: assistant.voice,
      mode,
      accountSnapshot: {
        id: account.id,
        name: account.name,
        company_info_markdown: companyInfo.markdown,
        sections: companyInfo.sections,
      },
      policiesSnapshot: enabledPolicies,
      proceduresSnapshot: enabledProcedures,
      assistantSnapshot: {
        ...assistant,
      },
      virtualToolsSnapshot: virtualTools,
      status: 'CERTIFYING',
      passedCount: 0,
      failedCount: 0,
      totalTests: 0,
      overallPassed: false,
      results: [],
    };

    // Relay progress if callback provided
    if (onProgress) {
      this.batchRunner.on('test_started', (d) => onProgress({ event: 'test_started', ...d }));
      this.batchRunner.on('turn_update', (d) => onProgress({ event: 'turn_update', ...d }));
      this.batchRunner.on('tool_executed', (d) => onProgress({ event: 'tool_executed', ...d }));
      this.batchRunner.on('test_completed', (d) => onProgress({ event: 'test_completed', ...d }));
      this.batchRunner.on('batch_paused', () => onProgress({ event: 'batch_paused' }));
      this.batchRunner.on('batch_resumed', () => onProgress({ event: 'batch_resumed' }));
    }

    // Run batch certification
    const batchResult = await this.batchRunner.runBatch({
      accountId,
      assistantId,
      bankId,
      mode,
      maxTurns: 6, // default or test-specific
    });

    snapshot.totalTests = batchResult.totalTests || batchResult.results.length;
    snapshot.status = batchResult.failedCount === 0 ? 'CERTIFIED' : 'FAILED_CERTIFICATION';
    snapshot.passedCount = batchResult.passedCount;
    snapshot.failedCount = batchResult.failedCount;
    snapshot.overallPassed = batchResult.failedCount === 0 && batchResult.passedCount > 0;
    snapshot.results = batchResult.results;
    snapshot.durationSec = batchResult.durationSec;

    // Save snapshot
    const dir = this.getSnapshotsDir(accountId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `snapshot_${snapshotId}.json`), JSON.stringify(snapshot, null, 2), 'utf8');

    return snapshot;
  }

  pause() {
    this.batchRunner.pause();
  }

  resume() {
    this.batchRunner.resume();
  }

  abort() {
    this.batchRunner.abort();
  }

  /**
   * Deploy a tested configuration snapshot as Active
   */
  async deployActiveConfiguration(accountId, snapshotId, forced = false) {
    const snapshot = await this.getSnapshot(accountId, snapshotId);
    if (!snapshot) throw new Error(`Snapshot ${snapshotId} not found`);

    if (!snapshot.overallPassed && !forced) {
      return {
        warning: true,
        message: `This configuration snapshot has ${snapshot.failedCount} failed test(s). Deploying it may cause issues on live calls. Are you sure you want to activate it?`,
        snapshotId,
        failedCount: snapshot.failedCount,
      };
    }

    const deployRecord = {
      deployedAt: new Date().toISOString(),
      snapshotId: snapshot.snapshotId,
      assistantId: snapshot.assistantId,
      assistantName: snapshot.assistantName,
      passedCount: snapshot.passedCount,
      failedCount: snapshot.failedCount,
      overallPassed: snapshot.overallPassed,
      mode: snapshot.mode,
    };

    // Save active configuration pointer
    const activeFile = path.join(this.baseDir, accountId, 'active_configuration.json');
    await fs.writeFile(activeFile, JSON.stringify({ activeSnapshot: snapshot, deployedAt: deployRecord.deployedAt }, null, 2), 'utf8');

    // Append to deployment history
    const historyFile = path.join(this.baseDir, accountId, 'deployment_history.json');
    let history = [];
    try {
      const raw = await fs.readFile(historyFile, 'utf8');
      history = JSON.parse(raw);
    } catch (e) {}

    history.unshift(deployRecord);
    await fs.writeFile(historyFile, JSON.stringify(history, null, 2), 'utf8');

    return {
      success: true,
      activeConfiguration: deployRecord,
      history,
    };
  }

  async getActiveConfiguration(accountId) {
    const activeFile = path.join(this.baseDir, accountId, 'active_configuration.json');
    try {
      const raw = await fs.readFile(activeFile, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  async getDeploymentHistory(accountId) {
    const historyFile = path.join(this.baseDir, accountId, 'deployment_history.json');
    try {
      const raw = await fs.readFile(historyFile, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  }
}
