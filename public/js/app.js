/**
 * Talk Dojo 🥋 — Enterprise Voice AI Platform
 * Controller with URL GUID-based Deep Linking (/#/account/:accountId/...),
 * Dynamic Markdown Company Info Cards (SEC-xxx),
 * Policies Management (POL-xxx: Always, Never, Conditional),
 * Procedures with Tool Constraints & Integrated Scenarios (PROC-xxx),
 * Animated Status Circle & Timer for AI Tool Generation,
 * Native Gemini Live Audio Voice Previews,
 * and In-Progress Live Certification Runner.
 */

class TalkDojoEnterpriseApp {
  constructor() {
    this.activeTab = 'account';
    this.activeSub = 'info';
    this.activeAccountId = null;
    this.activeAssistantId = null;
    this.activeToolId = null;
    this.activePolicyId = null;
    this.activeProcedureId = null;
    this.activeTestId = null;
    this.activeBankId = 'default-bank';

    this.policyFilter = 'all_enabled';
    this.procFilter = 'enabled';
    this.testFilter = 'all';

    this.policies = [];
    this.procedures = [];
    this.testScenarios = [];
    this.coverageGaps = { uncovered_policies: [], uncovered_procedures: [], total_gaps: 0, has_gaps: false };
    this.activeTestLinkedPolicies = [];
    this.activeTestLinkedProcedures = [];
    this.virtualTools = [];
    this.assistant = null;
    this.accounts = [];
    this.companySections = [];
    this.rawMarkdownMode = false;

    this.certMode = 'text'; // 'text' | 'voice'
    this.chatModality = 'text'; // 'text' | 'voice' | 'hybrid'
    this.chatSparringHistory = [];
    this.chatSessionActive = false;

    this.currentCertSnapshot = null;
    this.selectedCertTestIndex = 0;
    this.liveTestTranscripts = {}; // testId -> array of turns
    this.certFilter = 'all';

    this.activeEditingScenarioIndex = -1;
    this.toolGenInterval = null;

    this.cacheDom();
    this.bindEvents();
    this.initAutoGrow();
    this.connectWebSocket();
    this.init();
  }

  cacheDom() {
    this.el = {
      // Toast container
      toastContainer: document.getElementById('toast-container'),

      // Navigation
      navItems: document.querySelectorAll('.nav-item'),
      navTreeGroups: document.querySelectorAll('.nav-tree-group'),
      navSubItems: document.querySelectorAll('.nav-sub-item'),
      panes: document.querySelectorAll('.tab-pane'),
      navBadgeTools: document.getElementById('nav-badge-tools'),
      navBadgePolicies: document.getElementById('nav-badge-policies'),
      navBadgeProcedures: document.getElementById('nav-badge-procedures'),
      navBadgeProcDrafts: document.getElementById('nav-badge-proc-drafts'),
      navBadgeScenariosWarning: document.getElementById('nav-badge-scenarios-warning'),
      navBadgeTestScenarios: document.getElementById('nav-badge-testscenarios'),
      navBadgeTestDrafts: document.getElementById('nav-badge-test-drafts'),
      navBadgeGapsCount: document.getElementById('nav-badge-gaps-count'),
      navBadgeCert: document.getElementById('nav-badge-cert'),

      // Top Header
      headerAccountName: document.getElementById('header-account-name'),
      btnHeaderAccountSwitcher: document.getElementById('btn-header-account-switcher'),
      btnAccountSettings: document.getElementById('btn-account-settings'),
      btnNewAccount: document.getElementById('btn-new-account'),
      activeDeploymentBadge: document.getElementById('active-deployment-badge'),
      activeDeployText: document.getElementById('active-deploy-text'),
      apiKeyInput: document.getElementById('api-key-input'),
      saveKeyBtn: document.getElementById('save-key-btn'),
      keyStatusIndicator: document.getElementById('key-status-indicator'),
      btnOpenRecycleBin: document.getElementById('btn-open-recycle-bin'),
      recycleBinCount: document.getElementById('recycle-bin-count'),

      // Tab 1: Account (Company Info Dynamic Markdown)
      accName: document.getElementById('acc-name'),
      companySectionsContainer: document.getElementById('company-sections-container'),
      btnAddSectionCard: document.getElementById('btn-add-section-card'),
      btnSaveCompanyInfo: document.getElementById('btn-save-company-info'),
      btnToggleRawMarkdown: document.getElementById('btn-toggle-raw-markdown'),
      companyRawMarkdownBox: document.getElementById('company-raw-markdown-box'),
      companyRawMarkdown: document.getElementById('company-raw-markdown'),

      // Tab 2: Tools (Master-Detail)
      toolsSubviewAll: document.getElementById('tools-subview-all'),
      toolsSubviewNew: document.getElementById('tools-subview-new'),
      btnToolsNavNew: document.getElementById('btn-tools-nav-new'),
      btnToolsCancelNew: document.getElementById('btn-tools-cancel-new'),
      toolsMasterCount: document.getElementById('tools-master-count'),
      btnMasterAddTool: document.getElementById('btn-master-add-tool'),
      toolsMasterList: document.getElementById('tools-master-list'),
      toolsZeroState: document.getElementById('tools-zero-state'),
      btnEmptyStartTool: document.getElementById('btn-empty-start-tool'),
      toolEditorCard: document.getElementById('tool-editor-card'),
      toolEditorTitle: document.getElementById('tool-editor-title'),
      toolEditorSub: document.getElementById('tool-editor-sub'),
      btnToolDelete: document.getElementById('btn-tool-delete'),
      btnToolSave: document.getElementById('btn-tool-save'),
      toolNameInput: document.getElementById('tool-name-input'),
      toolDescInput: document.getElementById('tool-desc-input'),
      btnAddToolEndpoint: document.getElementById('btn-add-tool-endpoint'),
      toolEndpointsList: document.getElementById('tool-endpoints-list'),
      newToolPromptInput: document.getElementById('new-tool-prompt-input'),
      btnAiCreateTool: document.getElementById('btn-ai-create-tool'),
      blankToolName: document.getElementById('blank-tool-name'),
      btnCreateBlankTool: document.getElementById('btn-create-blank-tool'),
      toolGenLoadingState: document.getElementById('tool-gen-loading-state'),
      toolGenTimer: document.getElementById('tool-gen-timer'),
      toolGenStatusText: document.getElementById('tool-gen-status-text'),

      // Tab 3: Policies (Always, Never, Conditional)
      panePolicies: document.getElementById('pane-policies'),
      btnPoliciesNavNew: document.getElementById('btn-policies-nav-new'),
      policyFilterBtns: document.querySelectorAll('.policy-filter-btn'),
      policiesMasterCount: document.getElementById('policies-master-count'),
      btnMasterAddPolicy: document.getElementById('btn-master-add-policy'),
      policiesMasterList: document.getElementById('policies-master-list'),
      policiesZeroState: document.getElementById('policies-zero-state'),
      btnEmptyStartPolicy: document.getElementById('btn-empty-start-policy'),
      policyEditorCard: document.getElementById('policy-editor-card'),
      policyRefIdBadge: document.getElementById('policy-ref-id-badge'),
      policyEditorTitle: document.getElementById('policy-editor-title'),
      policyEditorSub: document.getElementById('policy-editor-sub'),
      btnPolicyDelete: document.getElementById('btn-policy-delete'),
      btnPolicySave: document.getElementById('btn-policy-save'),
      policyTitleInput: document.getElementById('policy-title-input'),
      policyTypeSelect: document.getElementById('policy-type-select'),
      policyStatusSelect: document.getElementById('policy-status-select'),
      policyConditionRow: document.getElementById('policy-condition-row'),
      policyConditionInput: document.getElementById('policy-condition-input'),
      policyActionLabel: document.getElementById('policy-action-label'),
      policyActionInput: document.getElementById('policy-action-input'),
      policyUncoveredWarning: document.getElementById('policy-uncovered-warning'),
      btnPolicyCreateTest: document.getElementById('btn-policy-create-test'),

      // Tab 4: Procedures (Workflows & Granular Actions)
      paneProcedures: document.getElementById('pane-procedures'),
      btnProceduresNavNew: document.getElementById('btn-procedures-nav-new'),
      procFilterBtns: document.querySelectorAll('.proc-filter-btn'),
      proceduresMasterCount: document.getElementById('procedures-master-count'),
      btnMasterAddProcedure: document.getElementById('btn-master-add-procedure'),
      proceduresMasterList: document.getElementById('procedures-master-list'),
      proceduresZeroState: document.getElementById('procedures-zero-state'),
      btnEmptyStartProcedure: document.getElementById('btn-empty-start-procedure'),
      procedureEditorCard: document.getElementById('procedure-editor-card'),
      procRefIdBadge: document.getElementById('proc-ref-id-badge'),
      procEditorTitle: document.getElementById('proc-editor-title'),
      procEditorSub: document.getElementById('proc-editor-sub'),
      btnProcedureDelete: document.getElementById('btn-procedure-delete'),
      btnProcedureSave: document.getElementById('btn-procedure-save'),
      procNameInput: document.getElementById('proc-name-input'),
      procStatusSelect: document.getElementById('proc-status-select'),
      procObjectiveInput: document.getElementById('proc-objective-input'),
      procToolsCheckboxes: document.getElementById('proc-tools-checkboxes'),
      procStepsInput: document.getElementById('proc-steps-input'),
      procConstraintsInput: document.getElementById('proc-constraints-input'),
      procUncoveredWarning: document.getElementById('proc-uncovered-warning'),
      btnProcCreateTest: document.getElementById('btn-proc-create-test'),
      procTestsCoverageList: document.getElementById('proc-tests-coverage-list'),
      btnProcGotoTests: document.getElementById('btn-proc-goto-tests'),

      // Tab 5: Test Scenarios (Top-Level Test Banks & Coverage)
      paneTestScenarios: document.getElementById('pane-testscenarios'),
      testscenariosGapBanner: document.getElementById('testscenarios-gap-banner'),
      gapBannerCount: document.getElementById('gap-banner-count'),
      btnBannerCreateGapDrafts: document.getElementById('btn-banner-create-gap-drafts'),
      gapBannerPills: document.getElementById('gap-banner-pills'),
      btnTestsGapDraft: document.getElementById('btn-tests-gap-draft'),
      btnTestScenariosNavNew: document.getElementById('btn-testscenarios-nav-new'),
      testFilterBtns: document.querySelectorAll('.test-filter-btn'),
      filterBadgeTestDrafts: document.getElementById('filter-badge-test-drafts'),
      filterBadgeTestGaps: document.getElementById('filter-badge-test-gaps'),
      testsMasterCount: document.getElementById('tests-master-count'),
      btnMasterAddTest: document.getElementById('btn-master-add-test'),
      testsMasterList: document.getElementById('tests-master-list'),
      testsZeroState: document.getElementById('tests-zero-state'),
      btnEmptyStartTest: document.getElementById('btn-empty-start-test'),
      testEditorCard: document.getElementById('test-editor-card'),
      testRefIdBadge: document.getElementById('test-ref-id-badge'),
      testEditorTitle: document.getElementById('test-editor-title'),
      testEditorSub: document.getElementById('test-editor-sub'),
      btnTestDelete: document.getElementById('btn-test-delete'),
      btnTestSave: document.getElementById('btn-test-save'),
      testTitleInput: document.getElementById('test-title-input'),
      testStatusSelect: document.getElementById('test-status-select'),
      btnTestSuggestLinks: document.getElementById('btn-test-suggest-links'),
      btnTestAddLinkPicker: document.getElementById('btn-test-add-link-picker'),
      testActiveLinksList: document.getElementById('test-active-links-list'),
      testSuggestedLinksBox: document.getElementById('test-suggested-links-box'),
      testSuggestedLinksList: document.getElementById('test-suggested-links-list'),
      testRoleInput: document.getElementById('test-role-input'),
      testMaxTurnsInput: document.getElementById('test-max-turns-input'),
      testObjectiveInput: document.getElementById('test-objective-input'),
      testSecretInstructionsInput: document.getElementById('test-secret-instructions-input'),
      btnTestAddCriteria: document.getElementById('btn-test-add-criteria'),
      testCriteriaList: document.getElementById('test-criteria-list'),

      // Tab 6: Single Assistant + Embedded Chat
      assistantEditorCard: document.getElementById('assistant-editor-card'),
      editorHeading: document.getElementById('editor-heading'),
      editorSubheading: document.getElementById('editor-subheading'),
      btnEditorSaveAsst: document.getElementById('btn-editor-save-asst'),
      editorAiCreatorBox: document.getElementById('editor-ai-creator-box'),
      editorDescribeAsstInput: document.getElementById('editor-describe-asst-input'),
      btnAiGenerateAsst: document.getElementById('btn-ai-generate-asst'),
      asstNameInput: document.getElementById('asst-name-input'),
      asstVoiceSelect: document.getElementById('asst-voice-select'),
      btnPreviewVoice: document.getElementById('btn-preview-voice'),
      voicePreviewAudio: document.getElementById('voice-preview-audio'),
      asstPersonalityInput: document.getElementById('asst-personality-input'),
      asstBackstoryInput: document.getElementById('asst-backstory-input'),
      asstToolsCheckboxes: document.getElementById('asst-tools-checkboxes'),
      asstRulesList: document.getElementById('asst-rules-list'),
      btnAsstAddRule: document.getElementById('btn-asst-add-rule'),

      // Embedded Chat inside Assistant Edit View
      btnReviewChatInteraction: document.getElementById('btn-review-chat-interaction'),
      chatTargetMode: document.getElementById('chat-target-mode'),
      chatScenarioSelectBox: document.getElementById('chat-scenario-select-box'),
      chatScenarioSelect: document.getElementById('chat-scenario-select'),
      chatPastedScenarioBox: document.getElementById('chat-pasted-scenario-box'),
      chatPastedInput: document.getElementById('chat-pasted-input'),
      chatModalityText: document.getElementById('chat-modality-text'),
      chatModalityVoice: document.getElementById('chat-modality-voice'),
      chatModalityHybrid: document.getElementById('chat-modality-hybrid'),
      btnBeginChat: document.getElementById('btn-begin-chat'),
      btnResetChat: document.getElementById('btn-reset-chat'),
      chatPreCallBanner: document.getElementById('chat-pre-call-banner'),
      chatSparringFeed: document.getElementById('chat-sparring-feed'),
      chatInputRowBox: document.getElementById('chat-input-row-box'),
      chatUserInput: document.getElementById('chat-user-input'),
      btnSendChat: document.getElementById('btn-send-chat'),
      chatAudioPlayer: document.getElementById('chat-audio-player'),

      // Tab 6: Certification
      certSubviewHistory: document.getElementById('cert-subview-history'),
      certSubviewNew: document.getElementById('cert-subview-new'),
      btnCertNavNew: document.getElementById('btn-cert-nav-new'),
      btnCertCancelNew: document.getElementById('btn-cert-cancel-new'),
      filterPills: document.querySelectorAll('.filter-pill'),
      btnRefreshSnapshots: document.getElementById('btn-refresh-snapshots'),
      snapshotsHistoryList: document.getElementById('snapshots-history-list'),
      certParamsCard: document.getElementById('cert-params-card'),
      certAssistantSummary: document.getElementById('cert-assistant-summary'),
      btnCertModeText: document.getElementById('btn-cert-mode-text'),
      btnCertModeVoice: document.getElementById('btn-cert-mode-voice'),
      btnSnapshotCertify: document.getElementById('btn-snapshot-certify'),
      certProgressBanner: document.getElementById('cert-progress-banner'),
      certBannerSpinner: document.getElementById('cert-banner-spinner'),
      certBannerTitle: document.getElementById('cert-banner-title'),
      certBannerSub: document.getElementById('cert-banner-sub'),
      btnCertPause: document.getElementById('btn-cert-pause'),
      btnCertResume: document.getElementById('btn-cert-resume'),
      btnCertRestart: document.getElementById('btn-cert-restart'),
      certFractionBadge: document.getElementById('cert-fraction-badge'),
      certTestsList: document.getElementById('cert-tests-list'),
      certDetailTitle: document.getElementById('cert-detail-title'),
      certDetailSub: document.getElementById('cert-detail-sub'),
      certDetailScore: document.getElementById('cert-detail-score'),
      certDetailStatus: document.getElementById('cert-detail-status'),
      certAudioPlayer: document.getElementById('cert-audio-player'),
      btnCertPlayPause: document.getElementById('btn-cert-play-pause'),
      certAudioCur: document.getElementById('cert-audio-cur'),
      certAudioTotal: document.getElementById('cert-audio-total'),
      certScrubberTrack: document.getElementById('cert-scrubber-track'),
      certScrubberFill: document.getElementById('cert-scrubber-fill'),
      certAudioEl: document.getElementById('cert-audio-el'),
      certDetailTranscript: document.getElementById('cert-detail-transcript'),

      // Account Settings & Switcher
      settingsCurrentAccountName: document.getElementById('settings-current-account-name'),
      btnOpenAccountSwitcher: document.getElementById('btn-open-account-switcher'),
      accountSwitcherModal: document.getElementById('account-switcher-modal'),
      btnCloseAccountSwitcher: document.getElementById('btn-close-account-switcher'),
      accountSwitcherList: document.getElementById('account-switcher-list'),

      // Recycle Bin Drawer
      recycleBinDrawer: document.getElementById('recycle-bin-drawer'),
      btnCloseRecycleBin: document.getElementById('btn-close-recycle-bin'),
      recycleBinList: document.getElementById('recycle-bin-list'),
      btnClearRecycleBin: document.getElementById('btn-clear-recycle-bin'),
    };
  }

  // --- AUTO-GROWING TEXTAREAS ---

  initAutoGrow() {
    const adjust = (el) => {
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight, 60)}px`;
    };
    document.addEventListener('input', (e) => {
      if (e.target.classList.contains('auto-grow')) adjust(e.target);
    });
    this.adjustAllAutoGrow = () => {
      document.querySelectorAll('textarea.auto-grow').forEach(adjust);
    };
  }

  // --- TOAST NOTIFICATIONS ---

  showToast(message, type = 'success', diagnostics = null) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div><strong>${type === 'success' ? '✓ ' : '⚠️ '}${message}</strong></div>
      ${diagnostics ? `<div class="toast-diagnostics">${diagnostics}</div>` : ''}
    `;
    this.el.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      setTimeout(() => toast.remove(), 350);
    }, 3500);
  }

  // --- HASH-BASED DEEP LINKING ROUTER WITH TOP-LEVEL ACCOUNT GUID ---

  navigate(tab, sub = 'all', id = null) {
    tab = this.normalizeTabId(tab);
    const accId = this.activeAccountId || 'default';
    let hash = `#/account/${accId}`;
    if (tab === 'account') {
      hash += '/info';
    } else {
      hash += `/${tab}/${sub}`;
    }
    if (id) hash += `?id=${encodeURIComponent(id)}`;
    window.location.hash = hash;
  }

  normalizeTabId(tab = 'account') {
    const normalized = tab.replace(/-/g, '').toLowerCase();
    return normalized === 'assistants' ? 'assistant' : normalized;
  }

  parseHashRoute() {
    const raw = window.location.hash.replace(/^#\/?/, '');
    if (!raw) return { accountId: null, tab: 'account', sub: 'info', id: null };

    const [pathPart, queryPart] = raw.split('?');
    const parts = pathPart.split('/').filter(Boolean);

    let accountId = null;
    let tab = 'account';
    let sub = 'info';

    // Matches /account/:accountId/...
    if (parts[0] === 'account' && parts[1]) {
      accountId = parts[1];
      if (!parts[2] || parts[2] === 'info') {
        tab = 'account';
        sub = 'info';
      } else {
        tab = this.normalizeTabId(parts[2]);
        sub = parts[3] || (parts[2] === 'policies' ? 'all_enabled' : 'all');
      }
    } else {
      tab = this.normalizeTabId(parts[0] || 'account');
      sub = parts[1] || (tab === 'policies' ? 'all_enabled' : 'all');
    }

    let id = null;
    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      id = params.get('id');
    }

    return { accountId, tab, sub, id };
  }

  async applyHashRoute() {
    const { accountId, tab, sub, id } = this.parseHashRoute();

    if (accountId && accountId !== this.activeAccountId && this.accounts.some(account => account.id === accountId)) {
      await this.selectAccount(accountId);
    }

    this.switchTab(tab, sub, id, false);
  }

  // --- EVENT BINDING ---

  bindEvents() {
    window.addEventListener('hashchange', () => this.applyHashRoute());

    // Single nav tabs
    this.el.navItems.forEach(btn => {
      if (!btn.classList.contains('nav-tree-header')) {
        btn.addEventListener('click', () => this.navigate(btn.dataset.tab, btn.dataset.sub || 'info'));
      }
    });

    // Tree headers
    this.el.navTreeGroups.forEach(group => {
      const header = group.querySelector('.nav-tree-header');
      if (!header) return;
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        const tab = header.dataset.tab;
        const wasExpanded = group.classList.contains('expanded');
        this.el.navTreeGroups.forEach(g => { if (g !== group) g.classList.remove('expanded'); });
        group.classList.toggle('expanded', !wasExpanded);
        const defaultSub = tab === 'policies' ? 'all_enabled' : (tab === 'procedures' ? 'enabled' : 'all');
        this.navigate(tab, defaultSub);
      });
    });

    // Sub-items
    this.el.navSubItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.navigate(item.dataset.tab, item.dataset.sub);
      });
    });

    // Account Settings & Header
    this.el.btnHeaderAccountSwitcher.addEventListener('click', () => this.openAccountSwitcher());
    this.el.btnAccountSettings.addEventListener('click', () => this.navigate('accountsettings', 'overview'));
    this.el.btnOpenAccountSwitcher.addEventListener('click', () => this.openAccountSwitcher());
    this.el.btnCloseAccountSwitcher.addEventListener('click', () => this.closeAccountSwitcher());
    this.el.btnNewAccount.addEventListener('click', () => this.createNewAccountModal());
    this.el.saveKeyBtn.addEventListener('click', () => this.saveApiKey());

    // Tab 1: Account (Company Info)
    this.el.btnAddSectionCard.addEventListener('click', () => this.addCompanySectionCard());
    this.el.btnSaveCompanyInfo.addEventListener('click', () => this.saveCompanyInfo());
    this.el.btnToggleRawMarkdown.addEventListener('click', () => this.toggleRawMarkdown());

    // Tab 2: Tools
    this.el.btnToolsNavNew.addEventListener('click', () => this.navigate('tools', 'new'));
    this.el.btnMasterAddTool.addEventListener('click', () => this.navigate('tools', 'new'));
    this.el.btnEmptyStartTool.addEventListener('click', () => this.navigate('tools', 'new'));
    this.el.btnToolsCancelNew.addEventListener('click', () => this.navigate('tools', 'all'));
    this.el.btnAiCreateTool.addEventListener('click', () => this.runAiDescribeTool());
    this.el.btnCreateBlankTool.addEventListener('click', () => this.createBlankTool());
    this.el.btnToolSave.addEventListener('click', () => this.saveCurrentTool());
    this.el.btnToolDelete.addEventListener('click', () => this.deleteCurrentTool());
    this.el.btnAddToolEndpoint.addEventListener('click', () => this.addToolEndpointRow());

    // Tab 3: Policies
    this.el.btnPoliciesNavNew.addEventListener('click', () => this.createNewPolicy());
    this.el.btnMasterAddPolicy.addEventListener('click', () => this.createNewPolicy());
    this.el.btnEmptyStartPolicy.addEventListener('click', () => this.createNewPolicy());
    this.el.policyFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.el.policyFilterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.policyFilter = btn.dataset.filter;
        this.loadPolicies(this.activeAccountId, this.policyFilter);
      });
    });
    this.el.policyTypeSelect.addEventListener('change', () => {
      this.el.policyConditionRow.classList.toggle('hidden', this.el.policyTypeSelect.value !== 'conditional');
      this.el.policyActionLabel.textContent = this.el.policyTypeSelect.value === 'never' ? 'Prohibited Action / Guardrail' : 'Mandatory Action / Directive';
    });
    this.el.btnPolicySave.addEventListener('click', () => this.saveCurrentPolicy());
    this.el.btnPolicyDelete.addEventListener('click', () => this.deleteCurrentPolicy());

    // Tab 4: Procedures
    this.el.btnProceduresNavNew.addEventListener('click', () => this.createNewProcedure());
    this.el.btnMasterAddProcedure.addEventListener('click', () => this.createNewProcedure());
    this.el.btnEmptyStartProcedure.addEventListener('click', () => this.createNewProcedure());
    this.el.procFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.el.procFilterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.procFilter = btn.dataset.filter;
        this.loadProcedures(this.activeAccountId, this.procFilter);
      });
    });
    if (this.el.btnProcedureSave) this.el.btnProcedureSave.addEventListener('click', () => this.saveCurrentProcedure());
    if (this.el.btnProcedureDelete) this.el.btnProcedureDelete.addEventListener('click', () => this.deleteCurrentProcedure());

    // Policy & Procedure Coverage Warnings
    if (this.el.btnPolicyCreateTest) {
      this.el.btnPolicyCreateTest.addEventListener('click', () => {
        const pol = this.policies.find(p => p.id === this.activePolicyId);
        this.createNewTestScenario({ linked_policies: pol ? [pol.ref_id || pol.id] : [] });
      });
    }
    if (this.el.btnProcCreateTest) {
      this.el.btnProcCreateTest.addEventListener('click', () => {
        const proc = this.procedures.find(p => p.id === this.activeProcedureId);
        this.createNewTestScenario({ linked_procedures: proc ? [proc.ref_id || proc.id] : [] });
      });
    }
    if (this.el.btnProcGotoTests) {
      this.el.btnProcGotoTests.addEventListener('click', () => {
        this.navigate('testscenarios', 'all');
      });
    }

    // Tab 5: Test Scenarios
    if (this.el.btnTestScenariosNavNew) this.el.btnTestScenariosNavNew.addEventListener('click', () => this.createNewTestScenario());
    if (this.el.btnMasterAddTest) this.el.btnMasterAddTest.addEventListener('click', () => this.createNewTestScenario());
    if (this.el.btnEmptyStartTest) this.el.btnEmptyStartTest.addEventListener('click', () => this.createNewTestScenario());
    if (this.el.btnTestsGapDraft) this.el.btnTestsGapDraft.addEventListener('click', () => this.generateGapDraftTests());
    if (this.el.btnBannerCreateGapDrafts) this.el.btnBannerCreateGapDrafts.addEventListener('click', () => this.generateGapDraftTests());
    this.el.testFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.el.testFilterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.testFilter = btn.dataset.filter;
        this.loadTestScenarios(this.activeAccountId, this.testFilter);
      });
    });
    if (this.el.btnTestSave) this.el.btnTestSave.addEventListener('click', () => this.saveCurrentTestScenario());
    if (this.el.btnTestDelete) this.el.btnTestDelete.addEventListener('click', () => this.deleteCurrentTestScenario());
    if (this.el.btnTestSuggestLinks) this.el.btnTestSuggestLinks.addEventListener('click', () => this.suggestLinksForCurrentTest());
    if (this.el.btnTestAddLinkPicker) this.el.btnTestAddLinkPicker.addEventListener('click', () => this.openAddLinkPickerModal());
    if (this.el.btnTestAddCriteria) this.el.btnTestAddCriteria.addEventListener('click', () => this.addTestCriteriaRow());

    // Tab 6: Assistant
    this.el.btnAiGenerateAsst.addEventListener('click', () => this.runAiDescribeAssistant());
    this.el.btnEditorSaveAsst.addEventListener('click', () => this.saveCurrentAssistant());
    this.el.btnAsstAddRule.addEventListener('click', () => this.addAssistantRuleRow());
    this.el.btnPreviewVoice.addEventListener('click', () => this.playVoicePreview());

    // Embedded Chat in Assistant Edit Pane
    this.el.chatTargetMode.addEventListener('change', () => this.updateChatTargetMode());
    [this.el.chatModalityText, this.el.chatModalityVoice, this.el.chatModalityHybrid].forEach(b => {
      b.addEventListener('click', () => this.setChatModality(b.dataset.mod));
    });
    this.el.btnBeginChat.addEventListener('click', () => this.beginChatSession());
    this.el.btnResetChat.addEventListener('click', () => this.resetChatSession());
    this.el.btnSendChat.addEventListener('click', () => this.sendChatTurn());
    this.el.chatUserInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendChatTurn();
    });
    this.el.btnReviewChatInteraction.addEventListener('click', () => this.reviewChatInteraction());

    // Tab 6: Certification
    this.el.btnCertNavNew.addEventListener('click', () => this.navigate('certification', 'new'));
    this.el.btnCertCancelNew.addEventListener('click', () => this.navigate('certification', 'history'));
    this.el.filterPills.forEach(p => {
      p.addEventListener('click', () => this.setCertFilter(p.dataset.filter));
    });
    this.el.btnCertModeText.addEventListener('click', () => this.setCertMode('text'));
    this.el.btnCertModeVoice.addEventListener('click', () => this.setCertMode('voice'));
    this.el.btnSnapshotCertify.addEventListener('click', () => this.startSnapshotCertification());
    this.el.btnCertPause.addEventListener('click', () => this.pauseCertification());
    this.el.btnCertResume.addEventListener('click', () => this.resumeCertification());
    this.el.btnCertRestart.addEventListener('click', () => this.startSnapshotCertification());
    this.el.btnRefreshSnapshots.addEventListener('click', () => this.loadCertificationHistory());
    this.el.btnCertPlayPause.addEventListener('click', () => this.toggleCertAudio());
    this.el.certScrubberTrack.addEventListener('click', (e) => this.seekCertAudio(e));

    // Recycle Bin
    this.el.btnOpenRecycleBin.addEventListener('click', () => this.openRecycleBin());
    this.el.btnCloseRecycleBin.addEventListener('click', () => this.closeRecycleBin());
    this.el.btnClearRecycleBin.addEventListener('click', () => this.clearRecycleBinArchive());
  }

  // --- INITIALIZATION ---

  async init() {
    await this.checkConfig();
    await this.loadAccounts();
    await this.applyHashRoute();
  }

  async checkConfig() {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      this.updateKeyStatus(data.hasApiKey);
    } catch (e) {}
  }

  switchTab(tabId, sub = 'all', id = null, updateHash = true) {
    tabId = this.normalizeTabId(tabId);
    this.activeTab = tabId;
    this.activeSub = sub;
    this.el.btnAccountSettings.classList.toggle('active', tabId === 'accountsettings');

    // Update nav active states
    this.el.navItems.forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    this.el.navSubItems.forEach(b => {
      const match = b.dataset.tab === tabId && b.dataset.sub === sub;
      b.classList.toggle('active', match);
    });

    // Expand tree group
    this.el.navTreeGroups.forEach(g => {
      const header = g.querySelector('.nav-tree-header');
      if (header && header.dataset.tab === tabId) g.classList.add('expanded');
    });

    // Switch pane
    this.el.panes.forEach(p => p.classList.toggle('active', p.id === `pane-${tabId}`));

    // Route actions
    if (tabId === 'account') {
      this.loadCompanyInfo(this.activeAccountId);
    }
    if (tabId === 'tools') {
      const isNew = sub === 'new';
      this.el.toolsSubviewAll.classList.toggle('hidden', isNew);
      this.el.toolsSubviewNew.classList.toggle('hidden', !isNew);
      if (!isNew) this.loadToolsMasterDetail(id);
    }
    if (tabId === 'policies') {
      const isNew = sub === 'new';
      if (isNew) {
        this.createNewPolicy();
      } else {
        this.policyFilter = sub || 'all_enabled';
        this.loadPolicies(this.activeAccountId, this.policyFilter, id);
      }
    }
    if (tabId === 'procedures') {
      const isNew = sub === 'new';
      if (isNew) {
        this.createNewProcedure();
      } else {
        this.procFilter = sub === 'drafts' ? 'draft' : (sub === 'all_enabled' ? 'enabled' : 'all');
        this.loadProcedures(this.activeAccountId, this.procFilter, id);
      }
    }
    if (tabId === 'testscenarios') {
      const isNew = sub === 'new';
      if (isNew) {
        this.createNewTestScenario();
      } else {
        this.testFilter = sub || 'all';
        this.loadTestScenarios(this.activeAccountId, this.testFilter, id);
      }
    }
    if (tabId === 'assistant') {
      this.loadAssistant(this.activeAccountId);
    }
    if (tabId === 'certification') {
      const isNew = sub === 'new';
      this.el.certSubviewHistory.classList.toggle('hidden', isNew);
      this.el.certSubviewNew.classList.toggle('hidden', !isNew);
      if (isNew) this.renderCertTestsList();
      else this.loadCertificationHistory();
    }
    if (tabId === 'accountsettings') {
      this.renderAccountSettings();
    }

    if (updateHash) {
      this.navigate(tabId, sub, id);
    }
    setTimeout(() => this.adjustAllAutoGrow(), 50);
  }

  // --- TAB 1: ACCOUNT (COMPANY INFO DYNAMIC MARKDOWN) ---

  async loadAccounts() {
    try {
      const res = await fetch('/api/accounts');
      const accounts = await res.json();
      this.accounts = accounts || [];
      this.renderAccountSwitcher();
      if (accounts.length > 0 && !this.activeAccountId) {
        await this.selectAccount(accounts[0].id);
      }
    } catch (e) {
      console.error('Error loading accounts:', e);
    }
  }

  async selectAccount(accountId) {
    this.activeAccountId = accountId;
    try {
      const res = await fetch(`/api/accounts/${accountId}`);
      const acc = await res.json();
      if (!acc) return;

      this.el.headerAccountName.textContent = acc.name || 'Account';
      this.el.settingsCurrentAccountName.textContent = `${acc.name || 'Account'} · ${acc.id}`;
      this.el.accName.value = acc.name || '';
      await this.loadCompanyInfo(accountId);
      await this.loadVirtualTools();
      await this.loadPolicies(accountId, this.policyFilter);
      await this.loadProcedures(accountId, this.procFilter);
      await this.loadTestScenarios(accountId, this.testFilter);
      await this.loadCoverageGaps(accountId);
      await this.loadAssistant(accountId);
      await this.refreshRecycleBinCount();
      await this.loadActiveDeploymentBadge();
      this.renderAccountSwitcher();
      this.adjustAllAutoGrow();
    } catch (e) {
      console.error('Error selecting account:', e);
    }
  }

  async loadCompanyInfo(accountId) {
    if (!accountId) return;
    try {
      const res = await fetch(`/api/accounts/${accountId}/company-info`);
      const data = await res.json();
      this.companySections = data.sections || [];
      this.el.companyRawMarkdown.value = data.markdown || '';
      this.renderCompanySections();
    } catch (e) {
      console.error('Error loading company info:', e);
    }
  }

  renderCompanySections() {
    if (this.companySections.length === 0) {
      this.companySections = [
        { id: 'SEC-001', title: 'Company Overview & Pronunciation', body: 'We are Smoky Mountain Family Medicine (pronounced "SMOH-kee").' },
        { id: 'SEC-002', title: 'Contact Details & Hours', body: 'Telephone: 865-555-0199. Hours: Mon-Fri 8:00 AM - 5:00 PM.' },
      ];
    }

    this.el.companySectionsContainer.innerHTML = this.companySections.map((sec, idx) => `
      <div class="section-card" data-idx="${idx}">
        <div class="sec-header-row">
          <span class="sec-id-badge">${sec.id || `SEC-${String(idx + 1).padStart(3, '0')}`}</span>
          <input type="text" class="sec-title-input input-soft" value="${(sec.title || '').replace(/"/g, '&quot;')}" placeholder="Section Title (e.g. Pronunciation, Slogans)">
          <button class="btn-icon-soft btn-del-sec" title="Delete section">✕</button>
        </div>
        <textarea class="textarea-soft auto-grow sec-body-input" rows="3" placeholder="Write section details in Markdown...">${sec.body || ''}</textarea>
      </div>
    `).join('');

    this.el.companySectionsContainer.querySelectorAll('.btn-del-sec').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = e.target.closest('.section-card');
        const idx = parseInt(card.dataset.idx, 10);
        this.companySections.splice(idx, 1);
        this.renderCompanySections();
      });
    });

    this.adjustAllAutoGrow();
  }

  addCompanySectionCard() {
    const nextIdx = this.companySections.length + 1;
    const nextId = `SEC-${String(nextIdx).padStart(3, '0')}`;
    this.companySections.push({
      id: nextId,
      title: 'New Section',
      body: '',
    });
    this.renderCompanySections();
    const inputs = this.el.companySectionsContainer.querySelectorAll('.sec-title-input');
    if (inputs.length > 0) inputs[inputs.length - 1].focus();
  }

  toggleRawMarkdown() {
    this.rawMarkdownMode = !this.rawMarkdownMode;
    if (this.rawMarkdownMode) {
      // Sync cards to markdown
      this.syncCardsToState();
      const serialized = this.companySections.map(s => `## ${s.title}\n\n${s.body}\n`).join('\n');
      this.el.companyRawMarkdown.value = serialized;
      this.el.companyRawMarkdownBox.classList.remove('hidden');
      this.el.companySectionsContainer.classList.add('hidden');
      this.el.btnToggleRawMarkdown.textContent = '🃏 Section Cards';
    } else {
      // Sync markdown to cards
      this.el.companyRawMarkdownBox.classList.add('hidden');
      this.el.companySectionsContainer.classList.remove('hidden');
      this.el.btnToggleRawMarkdown.textContent = '📝 Raw Markdown';
    }
  }

  syncCardsToState() {
    const cards = this.el.companySectionsContainer.querySelectorAll('.section-card');
    const updated = [];
    cards.forEach((c, i) => {
      const id = c.querySelector('.sec-id-badge').textContent.trim();
      const title = c.querySelector('.sec-title-input').value.trim();
      const body = c.querySelector('.sec-body-input').value.trim();
      updated.push({ id, title, body });
    });
    if (updated.length > 0) this.companySections = updated;
  }

  async saveCompanyInfo() {
    if (this.rawMarkdownMode) {
      const markdown = this.el.companyRawMarkdown.value;
      await fetch(`/api/accounts/${this.activeAccountId}/company-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown }),
      });
    } else {
      this.syncCardsToState();
      await fetch(`/api/accounts/${this.activeAccountId}/company-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections: this.companySections }),
      });
    }

    // Save account name
    const name = this.el.accName.value.trim() || 'My Business';
    await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: this.activeAccountId, name }),
    });

    await this.loadAccounts();
    await this.selectAccount(this.activeAccountId);
    this.showToast('Company info & organization profile saved!');
  }

  renderAccountSettings() {
    const account = this.accounts.find(item => item.id === this.activeAccountId);
    if (account) {
      this.el.settingsCurrentAccountName.textContent = `${account.name} · ${account.id}`;
    }
  }

  renderAccountSwitcher() {
    if (!this.el.accountSwitcherList) return;
    this.el.accountSwitcherList.innerHTML = this.accounts.map(account => `
      <button class="account-switch-card ${account.id === this.activeAccountId ? 'active' : ''}" data-account-id="${account.id}">
        <div class="flex-between">
          <strong>${account.name}</strong>
          ${account.id === this.activeAccountId ? '<span class="badge-mini">CURRENT</span>' : ''}
        </div>
        <div class="text-xs text-muted mt-1">${account.id}</div>
        <div class="text-xs mt-2">🤖 ${account.assistantName || 'Assistant'}</div>
        <div class="account-card-stats">
          <span class="badge-mini">📜 ${account.policiesCount || 0}</span>
          <span class="badge-mini">📋 ${account.proceduresCount || 0}</span>
          <span class="badge-mini">🏦 ${account.testsCount || 0}</span>
          <span class="badge-mini">🛠️ ${account.toolsCount || 0}</span>
        </div>
      </button>
    `).join('');

    this.el.accountSwitcherList.querySelectorAll('.account-switch-card').forEach(card => {
      card.addEventListener('click', async () => {
        const accountId = card.dataset.accountId;
        await this.selectAccount(accountId);
        this.renderAccountSwitcher();
        this.closeAccountSwitcher();
        if (this.activeTab === 'accountsettings') this.navigate('accountsettings', 'overview');
        else this.navigate(this.activeTab, this.activeSub);
      });
    });
  }

  openAccountSwitcher() {
    this.renderAccountSwitcher();
    this.el.accountSwitcherModal.classList.remove('hidden');
  }

  closeAccountSwitcher() {
    this.el.accountSwitcherModal.classList.add('hidden');
  }

  async createNewAccountModal() {
    const name = prompt('Enter new Organization / Account Name:');
    if (!name) return;
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const acc = await res.json();
      await this.loadAccounts();
      await this.selectAccount(acc.id);
      this.closeAccountSwitcher();
      this.navigate('account', 'info');
      this.showToast(`Created account "${acc.name}" with ID ${acc.id}`);
    } catch (e) {
      this.showToast('Account creation failed', 'error', e.message);
    }
  }

  // --- TAB 2: TOOLS (MASTER-DETAIL) ---

  async loadVirtualTools() {
    try {
      const res = await fetch(`/api/accounts/${this.activeAccountId}/virtual-tools`);
      const tools = await res.json();
      this.virtualTools = tools || [];
      this.el.navBadgeTools.textContent = tools.length;
      this.el.toolsMasterCount.textContent = tools.length;

      if (this.activeTab === 'tools' && this.activeSub === 'all') {
        this.loadToolsMasterDetail(this.activeToolId);
      }
    } catch (e) {
      console.error('Error loading tools:', e);
    }
  }

  loadToolsMasterDetail(selectId = null) {
    const list = this.virtualTools || [];
    if (list.length === 0) {
      this.el.toolsZeroState.classList.remove('hidden');
      this.el.toolEditorCard.classList.add('hidden');
      this.el.toolsMasterList.innerHTML = '<div class="text-xs text-dim text-center py-3">No tools created.</div>';
      return;
    }

    this.el.toolsZeroState.classList.add('hidden');
    this.el.toolEditorCard.classList.remove('hidden');

    if (selectId && list.some(t => t.id === selectId)) {
      this.activeToolId = selectId;
    } else if (!this.activeToolId || !list.some(t => t.id === this.activeToolId)) {
      this.activeToolId = list[0].id;
    }

    this.el.toolsMasterList.innerHTML = list.map(t => `
      <div class="asst-master-item ${t.id === this.activeToolId ? 'active' : ''}" data-id="${t.id}">
        <div class="asst-master-title">🛠️ ${t.name}</div>
        <div class="asst-master-sub">${t.endpoints?.length || 0} callable endpoints</div>
      </div>
    `).join('');

    this.el.toolsMasterList.querySelectorAll('.asst-master-item').forEach(item => {
      item.addEventListener('click', () => {
        this.activeToolId = item.dataset.id;
        this.navigate('tools', 'all', this.activeToolId);
        this.loadToolsMasterDetail(this.activeToolId);
      });
    });

    const activeTool = list.find(t => t.id === this.activeToolId) || list[0];
    this.populateToolForm(activeTool);
  }

  populateToolForm(tool) {
    if (!tool) return;
    this.el.toolEditorTitle.textContent = `Edit Tool: ${tool.name}`;
    this.el.toolNameInput.value = tool.name || '';
    this.el.toolDescInput.value = tool.description || '';

    this.el.toolEndpointsList.innerHTML = (tool.endpoints || []).map((ep, i) => `
      <div class="endpoint-item" data-index="${i}">
        <div class="flex-between">
          <div class="endpoint-signature">
            <span>⚡</span>
            <input type="text" value="${ep.name}" class="ep-name-input input-soft" style="width:200px; padding:2px 6px;">
          </div>
          <button class="btn-icon-soft btn-del-endpoint">✕</button>
        </div>
        <input type="text" value="${ep.description || ''}" class="ep-desc-input input-soft mt-1" placeholder="Endpoint description...">

        <div class="form-grid-2 mt-2">
          <div>
            <label class="text-xs text-muted">Parameters Schema (JSON)</label>
            <textarea class="textarea-soft ep-params-input auto-grow" rows="2" placeholder='{"type":"OBJECT","properties":{...}}'>${ep.parameters ? JSON.stringify(ep.parameters, null, 2) : ''}</textarea>
          </div>
          <div>
            <label class="text-xs text-muted">Example Call Parameters (JSON)</label>
            <textarea class="textarea-soft ep-call-params-input auto-grow" rows="2" placeholder='{"patient_id":"123"}'>${ep.example_call_parameters ? JSON.stringify(ep.example_call_parameters, null, 2) : (ep.example_call ? JSON.stringify(ep.example_call, null, 2) : '')}</textarea>
          </div>
        </div>

        <div class="form-grid-2 mt-1">
          <div>
            <label class="text-xs text-muted">Expected Response Schema (JSON)</label>
            <textarea class="textarea-soft ep-resp-schema-input auto-grow" rows="2" placeholder='{"type":"OBJECT","properties":{...}}'>${ep.expected_response_schema ? JSON.stringify(ep.expected_response_schema, null, 2) : ''}</textarea>
          </div>
          <div>
            <label class="text-xs text-muted">Example Call Response (JSON)</label>
            <textarea class="textarea-soft ep-call-resp-input auto-grow" rows="2" placeholder='{"status":"available"}'>${ep.example_call_response ? JSON.stringify(ep.example_call_response, null, 2) : ''}</textarea>
          </div>
        </div>
      </div>
    `).join('');

    this.el.toolEndpointsList.querySelectorAll('.btn-del-endpoint').forEach(b => {
      b.addEventListener('click', (e) => e.target.closest('.endpoint-item').remove());
    });
    this.adjustAllAutoGrow();
  }

  addToolEndpointRow() {
    const div = document.createElement('div');
    div.className = 'endpoint-item';
    div.innerHTML = `
      <div class="flex-between">
        <div class="endpoint-signature">
          <span>⚡</span>
          <input type="text" placeholder="endpoint_name" class="ep-name-input input-soft" style="width:200px; padding:2px 6px;">
        </div>
        <button class="btn-icon-soft btn-del-endpoint">✕</button>
      </div>
      <input type="text" placeholder="Endpoint description..." class="ep-desc-input input-soft mt-1">
      <div class="form-grid-2 mt-2">
        <div>
          <label class="text-xs text-muted">Parameters Schema (JSON)</label>
          <textarea class="textarea-soft ep-params-input auto-grow" rows="2" placeholder='{"type":"OBJECT","properties":{}}'></textarea>
        </div>
        <div>
          <label class="text-xs text-muted">Example Call Parameters (JSON)</label>
          <textarea class="textarea-soft ep-call-params-input auto-grow" rows="2" placeholder='{"param":"value"}'></textarea>
        </div>
      </div>
      <div class="form-grid-2 mt-1">
        <div>
          <label class="text-xs text-muted">Expected Response Schema (JSON)</label>
          <textarea class="textarea-soft ep-resp-schema-input auto-grow" rows="2" placeholder='{"type":"OBJECT","properties":{}}'></textarea>
        </div>
        <div>
          <label class="text-xs text-muted">Example Call Response (JSON)</label>
          <textarea class="textarea-soft ep-call-resp-input auto-grow" rows="2" placeholder='{"result":"ok"}'></textarea>
        </div>
      </div>
    `;
    div.querySelector('.btn-del-endpoint').addEventListener('click', () => div.remove());
    this.el.toolEndpointsList.appendChild(div);
  }

  async saveCurrentTool() {
    const name = this.el.toolNameInput.value.trim();
    if (!name) return this.showToast('Tool name is required', 'error');

    const endpoints = [];
    this.el.toolEndpointsList.querySelectorAll('.endpoint-item').forEach(el => {
      const epName = el.querySelector('.ep-name-input').value.trim();
      const epDesc = el.querySelector('.ep-desc-input').value.trim();

      const parseJsonSafe = (sel) => {
        const val = el.querySelector(sel)?.value.trim();
        if (!val) return null;
        try { return JSON.parse(val); } catch (e) { return val; }
      };

      if (epName) {
        endpoints.push({
          name: epName,
          description: epDesc,
          parameters: parseJsonSafe('.ep-params-input') || { type: 'OBJECT', properties: {} },
          example_call_parameters: parseJsonSafe('.ep-call-params-input'),
          expected_response_schema: parseJsonSafe('.ep-resp-schema-input'),
          example_call_response: parseJsonSafe('.ep-call-resp-input'),
        });
      }
    });

    const payload = {
      id: this.activeToolId,
      name,
      description: this.el.toolDescInput.value.trim(),
      endpoints,
    };

    try {
      await fetch(`/api/accounts/${this.activeAccountId}/virtual-tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await this.loadVirtualTools();
      this.showToast(`Tool "${name}" saved!`);
    } catch (e) {
      this.showToast('Save tool failed', 'error', e.message);
    }
  }

  async deleteCurrentTool() {
    if (!this.activeToolId) return;
    if (!confirm('Delete this tool?')) return;
    try {
      await fetch(`/api/accounts/${this.activeAccountId}/virtual-tools/${this.activeToolId}`, { method: 'DELETE' });
      this.activeToolId = null;
      await this.loadVirtualTools();
      this.navigate('tools', 'all');
      this.showToast('Tool deleted');
    } catch (e) {
      this.showToast('Delete tool failed', 'error', e.message);
    }
  }

  async runAiDescribeTool() {
    const prompt = this.el.newToolPromptInput.value.trim();
    if (!prompt) return this.showToast('Please describe the tool integration.', 'error');

    // Show waiting animation with elapsed seconds timer
    this.el.toolGenLoadingState.classList.remove('hidden');
    this.el.btnAiCreateTool.disabled = true;
    let elapsed = 0;
    this.el.toolGenTimer.textContent = 'Waiting: 0s';
    this.el.toolGenStatusText.textContent = 'Synthesizing MCP schemas and endpoint definitions...';

    if (this.toolGenInterval) clearInterval(this.toolGenInterval);
    this.toolGenInterval = setInterval(() => {
      elapsed++;
      this.el.toolGenTimer.textContent = `Waiting: ${elapsed}s`;
      if (elapsed > 4) {
        this.el.toolGenStatusText.textContent = 'Formatting parameters and example calls...';
      }
      if (elapsed > 8) {
        this.el.toolGenStatusText.textContent = 'Finalizing schema validation with Gemini Live AI...';
      }
    }, 1000);

    try {
      const res = await fetch(`/api/accounts/${this.activeAccountId}/virtual-tools/describe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      data.id = `tool-${Date.now()}`;
      await fetch(`/api/accounts/${this.activeAccountId}/virtual-tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      this.el.newToolPromptInput.value = '';
      await this.loadVirtualTools();
      this.navigate('tools', 'all', data.id);
      this.showToast(`Generated tool: ${data.name}!`);
    } catch (e) {
      this.showToast('Tool generation failed', 'error', e.message);
    } finally {
      if (this.toolGenInterval) clearInterval(this.toolGenInterval);
      this.el.toolGenLoadingState.classList.add('hidden');
      this.el.btnAiCreateTool.disabled = false;
    }
  }

  async createBlankTool() {
    const name = this.el.blankToolName.value.trim() || 'New Tool';
    const toolId = `tool-${Date.now()}`;
    const stub = {
      id: toolId,
      name,
      description: 'Custom tool endpoints',
      endpoints: [
        {
          name: 'query_records',
          description: 'Fetch records',
          parameters: { type: 'OBJECT', properties: {} },
        },
      ],
    };
    await fetch(`/api/accounts/${this.activeAccountId}/virtual-tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stub),
    });
    this.el.blankToolName.value = '';
    await this.loadVirtualTools();
    this.navigate('tools', 'all', toolId);
    this.showToast(`Created blank tool: ${name}`);
  }

  // --- TAB 3: POLICIES (ALWAYS, NEVER, CONDITIONAL) ---

  async loadPolicies(accountId, filter = 'all_enabled', selectId = null) {
    if (!accountId) return;
    try {
      const res = await fetch(`/api/accounts/${accountId}/policies?filter=${filter}`);
      const policies = await res.json();
      this.policies = policies || [];
      this.el.navBadgePolicies.textContent = policies.length;
      this.el.policiesMasterCount.textContent = policies.length;
      this.renderPoliciesMasterDetail(selectId);
    } catch (e) {
      console.error('Error loading policies:', e);
    }
  }

  renderPoliciesMasterDetail(selectId = null) {
    const list = this.policies || [];
    if (list.length === 0) {
      this.el.policiesZeroState.classList.remove('hidden');
      this.el.policyEditorCard.classList.add('hidden');
      this.el.policiesMasterList.innerHTML = '<div class="text-xs text-dim text-center py-3">No policies match filter.</div>';
      return;
    }

    this.el.policiesZeroState.classList.add('hidden');
    this.el.policyEditorCard.classList.remove('hidden');

    if (selectId && list.some(p => p.id === selectId)) {
      this.activePolicyId = selectId;
    } else if (!this.activePolicyId || !list.some(p => p.id === this.activePolicyId)) {
      this.activePolicyId = list[0].id;
    }

    this.el.policiesMasterList.innerHTML = list.map(p => {
      const typeClass = p.type === 'always' ? 'type-pill-always' : (p.type === 'never' ? 'type-pill-never' : 'type-pill-conditional');
      return `
        <div class="asst-master-item ${p.id === this.activePolicyId ? 'active' : ''}" data-id="${p.id}">
          <div class="flex-between">
            <span class="ref-badge ref-badge-pol">${p.id}</span>
            <span class="type-pill ${typeClass}">${p.type}</span>
          </div>
          <div class="asst-master-title mt-1">${p.title}</div>
          <div class="asst-master-sub">${p.status.toUpperCase()}</div>
        </div>
      `;
    }).join('');

    this.el.policiesMasterList.querySelectorAll('.asst-master-item').forEach(item => {
      item.addEventListener('click', () => {
        this.activePolicyId = item.dataset.id;
        this.navigate('policies', this.policyFilter, this.activePolicyId);
        this.renderPoliciesMasterDetail(this.activePolicyId);
      });
    });

    const activePolicy = list.find(p => p.id === this.activePolicyId) || list[0];
    this.populatePolicyForm(activePolicy);
  }

  populatePolicyForm(policy) {
    if (!policy) return;
    this.el.policyRefIdBadge.textContent = policy.id;
    this.el.policyEditorTitle.textContent = policy.title || 'Edit Policy';
    this.el.policyTitleInput.value = policy.title || '';
    this.el.policyTypeSelect.value = policy.type || 'always';
    this.el.policyStatusSelect.value = policy.status || 'enabled';
    this.el.policyConditionInput.value = policy.condition || '';
    this.el.policyActionInput.value = policy.action || '';

    this.el.policyConditionRow.classList.toggle('hidden', policy.type !== 'conditional');
    this.el.policyActionLabel.textContent = policy.type === 'never' ? 'Prohibited Action / Guardrail' : 'Mandatory Action / Directive';

    // Coverage Gap Warning check
    if (this.el.policyUncoveredWarning) {
      const isUncovered = (this.coverageGaps.uncovered_policies || []).some(p => p.id === policy.id || p.ref_id === policy.id);
      this.el.policyUncoveredWarning.classList.toggle('hidden', !isUncovered);
    }

    this.adjustAllAutoGrow();
  }

  createNewPolicy() {
    this.activePolicyId = null;
    this.el.policyRefIdBadge.textContent = 'POL-NEW';
    this.el.policyEditorTitle.textContent = 'Create New Compliance Policy';
    this.el.policyTitleInput.value = '';
    this.el.policyTypeSelect.value = 'always';
    this.el.policyStatusSelect.value = 'enabled';
    this.el.policyConditionInput.value = '';
    this.el.policyActionInput.value = '';
    this.el.policyConditionRow.classList.add('hidden');
    this.el.policyActionLabel.textContent = 'Mandatory Action / Directive';
    this.el.policiesZeroState.classList.add('hidden');
    this.el.policyEditorCard.classList.remove('hidden');
    this.el.policyTitleInput.focus();
  }

  async saveCurrentPolicy() {
    const title = this.el.policyTitleInput.value.trim();
    if (!title) return this.showToast('Policy title is required', 'error');

    const payload = {
      id: this.activePolicyId,
      title,
      type: this.el.policyTypeSelect.value,
      status: this.el.policyStatusSelect.value,
      condition: this.el.policyConditionInput.value.trim(),
      action: this.el.policyActionInput.value.trim(),
    };

    try {
      const res = await fetch(`/api/accounts/${this.activeAccountId}/policies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const saved = await res.json();
      this.activePolicyId = saved.id;
      await this.loadPolicies(this.activeAccountId, this.policyFilter, saved.id);
      this.showToast(`Policy [${saved.id}] saved!`);
    } catch (e) {
      this.showToast('Save policy failed', 'error', e.message);
    }
  }

  async deleteCurrentPolicy() {
    if (!this.activePolicyId) return;
    if (!confirm(`Delete policy ${this.activePolicyId}?`)) return;
    try {
      await fetch(`/api/accounts/${this.activeAccountId}/policies/${this.activePolicyId}`, { method: 'DELETE' });
      this.activePolicyId = null;
      await this.loadPolicies(this.activeAccountId, this.policyFilter);
      this.showToast('Policy deleted');
    } catch (e) {
      this.showToast('Delete policy failed', 'error', e.message);
    }
  }

  // --- TAB 4: PROCEDURES (WORKFLOWS & INTEGRATED TEST SCENARIOS) ---

  async loadProcedures(accountId, filter = 'enabled', selectId = null) {
    if (!accountId) return;
    try {
      const res = await fetch(`/api/accounts/${accountId}/procedures?filter=${filter}`);
      const procedures = await res.json();
      this.procedures = procedures || [];
      this.el.navBadgeProcedures.textContent = procedures.length;
      this.el.proceduresMasterCount.textContent = procedures.length;
      this.renderProceduresMasterDetail(selectId);
    } catch (e) {
      console.error('Error loading procedures:', e);
    }
  }

  renderProceduresMasterDetail(selectId = null) {
    const list = this.procedures || [];
    if (list.length === 0) {
      this.el.proceduresZeroState.classList.remove('hidden');
      this.el.procedureEditorCard.classList.add('hidden');
      this.el.proceduresMasterList.innerHTML = '<div class="text-xs text-dim text-center py-3">No procedures found.</div>';
      return;
    }

    this.el.proceduresZeroState.classList.add('hidden');
    this.el.procedureEditorCard.classList.remove('hidden');

    if (selectId && list.some(p => p.id === selectId)) {
      this.activeProcedureId = selectId;
    } else if (!this.activeProcedureId || !list.some(p => p.id === this.activeProcedureId)) {
      this.activeProcedureId = list[0].id;
    }

    this.el.proceduresMasterList.innerHTML = list.map(p => `
      <div class="asst-master-item ${p.id === this.activeProcedureId ? 'active' : ''}" data-id="${p.id}">
        <div class="flex-between">
          <span class="ref-badge ref-badge-proc">${p.id}</span>
          <span class="badge-mini">${p.test_scenarios?.length || 0} scenarios</span>
        </div>
        <div class="asst-master-title mt-1">${p.name}</div>
        <div class="asst-master-sub">${p.status.toUpperCase()}</div>
      </div>
    `).join('');

    this.el.proceduresMasterList.querySelectorAll('.asst-master-item').forEach(item => {
      item.addEventListener('click', () => {
        this.activeProcedureId = item.dataset.id;
        this.navigate('procedures', this.procFilter, this.activeProcedureId);
        this.renderProceduresMasterDetail(this.activeProcedureId);
      });
    });

    const activeProc = list.find(p => p.id === this.activeProcedureId) || list[0];
    this.populateProcedureForm(activeProc);
  }

  populateProcedureForm(proc) {
    if (!proc) return;
    this.el.procRefIdBadge.textContent = proc.id;
    this.el.procEditorTitle.textContent = proc.name || 'Edit Procedure';
    this.el.procNameInput.value = proc.name || '';
    this.el.procStatusSelect.value = proc.status || 'enabled';
    this.el.procObjectiveInput.value = proc.objective || '';
    this.el.procStepsInput.value = proc.steps || '';
    this.el.procConstraintsInput.value = proc.constraints || '';

    // Coverage Gap Warning check
    if (this.el.procUncoveredWarning) {
      const isUncovered = (this.coverageGaps.uncovered_procedures || []).some(p => p.id === proc.id || p.ref_id === proc.id);
      this.el.procUncoveredWarning.classList.toggle('hidden', !isUncovered);
    }

    // Render Grouped Service Accordions with Action Checkboxes
    this.renderProcedureToolsAccordions(proc);

    // Render covering tests list
    if (this.el.procTestsCoverageList) {
      const coveringTests = (this.testScenarios || []).filter(t =>
        (t.linked_procedures || []).includes(proc.id) ||
        (t.linked_procedures || []).includes(proc.ref_id)
      );
      if (coveringTests.length > 0) {
        this.el.procTestsCoverageList.innerHTML = coveringTests.map(t => `
          <span class="linked-pill-tag pill-proc" data-test-id="${t.id}" title="Click to view in Test Scenarios">
            🏦 [${t.ref_id || t.id}] ${t.title}
          </span>
        `).join('');
        this.el.procTestsCoverageList.querySelectorAll('.linked-pill-tag').forEach(tag => {
          tag.addEventListener('click', () => {
            this.navigate('testscenarios', 'all', tag.dataset.testId);
          });
        });
      } else {
        this.el.procTestsCoverageList.innerHTML = '<span class="text-xs text-dim">No covering tests linked yet.</span>';
      }
    }

    this.adjustAllAutoGrow();
  }

  renderProcedureToolsAccordions(proc = null) {
    const vtools = this.virtualTools || [];
    if (vtools.length === 0) {
      this.el.procToolsCheckboxes.innerHTML = '<div class="text-xs text-dim p-2">No tools registered in this organization. Add tools in the Tools section.</div>';
      return;
    }

    const authorized = proc ? (proc.authorized_actions || proc.authorized_tools || []) : [];

    this.el.procToolsCheckboxes.innerHTML = vtools.map(t => {
      const endpoints = t.endpoints || [];
      const checkedCount = endpoints.filter(ep =>
        authorized.includes(ep.name) ||
        authorized.includes(`${t.id}:${ep.name}`) ||
        authorized.includes(t.id)
      ).length;

      return `
        <div class="tool-accordion">
          <div class="tool-accordion-header" data-tool-id="${t.id}">
            <div class="flex-center gap-2">
              <span>🛠️</span>
              <strong>${t.name}</strong>
              <span class="badge-mini">${checkedCount}/${endpoints.length} actions</span>
            </div>
            <span class="tree-arrow">▾</span>
          </div>
          <div class="tool-accordion-body">
            ${endpoints.length === 0 ? '<div class="text-xs text-dim">No endpoints defined.</div>' : endpoints.map(ep => {
              const isChecked = authorized.includes(ep.name) ||
                                authorized.includes(`${t.id}:${ep.name}`) ||
                                authorized.includes(t.id);
              return `
                <label class="action-check-item">
                  <input type="checkbox" class="proc-action-checkbox" data-service="${t.id}" value="${ep.name}" ${isChecked ? 'checked' : ''}>
                  <div>
                    <strong>${ep.name}</strong>
                    <div class="text-xs text-dim">${ep.description || ''}</div>
                  </div>
                </label>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

    this.el.procToolsCheckboxes.querySelectorAll('.tool-accordion-header').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const body = hdr.nextElementSibling;
        body.classList.toggle('hidden');
      });
    });
  }

  createNewProcedure() {
    this.activeProcedureId = null;
    this.el.procRefIdBadge.textContent = 'PROC-NEW';
    this.el.procEditorTitle.textContent = 'Create New Procedure';
    this.el.procNameInput.value = '';
    this.el.procStatusSelect.value = 'enabled';
    this.el.procObjectiveInput.value = '';
    this.el.procStepsInput.value = '';
    this.el.procConstraintsInput.value = '';

    if (this.el.procUncoveredWarning) this.el.procUncoveredWarning.classList.add('hidden');
    this.renderProcedureToolsAccordions(null);
    if (this.el.procTestsCoverageList) this.el.procTestsCoverageList.innerHTML = '<span class="text-xs text-dim">Will be linkable after saving.</span>';

    this.el.proceduresZeroState.classList.add('hidden');
    this.el.procedureEditorCard.classList.remove('hidden');
    this.el.procNameInput.focus();
  }

  async saveCurrentProcedure() {
    const name = this.el.procNameInput.value.trim();
    if (!name) return this.showToast('Procedure name is required', 'error');

    const authorized_actions = Array.from(this.el.procToolsCheckboxes.querySelectorAll('.proc-action-checkbox:checked')).map(i => i.value);
    const authorized_tools = Array.from(new Set(
      Array.from(this.el.procToolsCheckboxes.querySelectorAll('.proc-action-checkbox:checked')).map(i => i.dataset.service)
    ));

    const existing = this.procedures.find(p => p.id === this.activeProcedureId);
    const test_scenarios = existing?.test_scenarios || [];

    const payload = {
      id: this.activeProcedureId,
      name,
      status: this.el.procStatusSelect.value,
      objective: this.el.procObjectiveInput.value.trim(),
      authorized_tools,
      authorized_actions,
      steps: this.el.procStepsInput.value.trim(),
      constraints: this.el.procConstraintsInput.value.trim(),
      test_scenarios,
    };

    try {
      const res = await fetch(`/api/accounts/${this.activeAccountId}/procedures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const saved = await res.json();
      this.activeProcedureId = saved.id;
      await this.loadProcedures(this.activeAccountId, this.procFilter, saved.id);
      await this.loadCoverageGaps(this.activeAccountId);
      this.showToast(`Procedure [${saved.id}] saved!`);
    } catch (e) {
      this.showToast('Save procedure failed', 'error', e.message);
    }
  }

  async deleteCurrentProcedure() {
    if (!this.activeProcedureId) return;
    if (!confirm(`Delete procedure ${this.activeProcedureId}?`)) return;
    try {
      await fetch(`/api/accounts/${this.activeAccountId}/procedures/${this.activeProcedureId}`, { method: 'DELETE' });
      this.activeProcedureId = null;
      await this.loadProcedures(this.activeAccountId, this.procFilter);
      await this.loadCoverageGaps(this.activeAccountId);
      this.showToast('Procedure deleted');
    } catch (e) {
      this.showToast('Delete procedure failed', 'error', e.message);
    }
  }

  // --- TAB 5: TEST SCENARIOS (STANDALONE SUITE & COVERAGE) ---

  async loadTestScenarios(accountId, filter = 'all', selectId = null) {
    if (!accountId) return;
    try {
      const res = await fetch(`/api/accounts/${accountId}/test-scenarios?filter=${filter}`);
      const tests = await res.json();
      this.testScenarios = tests || [];

      if (this.el.navBadgeTestScenarios) this.el.navBadgeTestScenarios.textContent = tests.length;
      if (this.el.testsMasterCount) this.el.testsMasterCount.textContent = tests.length;

      const draftsCount = (this.testScenarios || []).filter(t => t.status === 'draft').length;
      if (this.el.navBadgeTestDrafts) this.el.navBadgeTestDrafts.textContent = draftsCount;
      if (this.el.filterBadgeTestDrafts) this.el.filterBadgeTestDrafts.textContent = draftsCount;

      this.renderTestScenariosMasterDetail(selectId);
    } catch (e) {
      console.error('Error loading test scenarios:', e);
    }
  }

  async loadCoverageGaps(accountId) {
    if (!accountId) return;
    try {
      const res = await fetch(`/api/accounts/${accountId}/test-scenarios/gaps`);
      const gaps = await res.json();
      this.coverageGaps = gaps || { uncovered_policies: [], uncovered_procedures: [], total_gaps: 0, has_gaps: false };

      const count = this.coverageGaps.total_gaps || 0;
      if (this.el.navBadgeScenariosWarning) {
        this.el.navBadgeScenariosWarning.classList.toggle('hidden', count === 0);
        this.el.navBadgeScenariosWarning.textContent = `⚠️ ${count}`;
      }
      if (this.el.navBadgeGapsCount) this.el.navBadgeGapsCount.textContent = count;
      if (this.el.filterBadgeTestGaps) this.el.filterBadgeTestGaps.textContent = count;

      // Update Coverage Gap Alert Card
      if (this.el.testscenariosGapBanner) {
        this.el.testscenariosGapBanner.classList.toggle('hidden', count === 0);
        if (this.el.gapBannerCount) this.el.gapBannerCount.textContent = count;
        if (this.el.gapBannerPills) {
          const polPills = (this.coverageGaps.uncovered_policies || []).map(p =>
            `<span class="linked-pill-tag pill-pol" title="Uncovered Policy: ${p.title}">📜 ${p.ref_id}: ${p.title}</span>`
          ).join('');
          const procPills = (this.coverageGaps.uncovered_procedures || []).map(p =>
            `<span class="linked-pill-tag pill-proc" title="Uncovered Procedure: ${p.name}">📋 ${p.ref_id}: ${p.name}</span>`
          ).join('');
          this.el.gapBannerPills.innerHTML = polPills + procPills;
        }
      }

      if (this.el.btnTestsGapDraft) {
        this.el.btnTestsGapDraft.classList.toggle('hidden', count === 0);
      }
    } catch (e) {
      console.error('Error loading coverage gaps:', e);
    }
  }

  renderTestScenariosMasterDetail(selectId = null) {
    if (!this.el.testsMasterList) return;
    const list = this.testScenarios || [];
    if (list.length === 0) {
      if (this.el.testsZeroState) this.el.testsZeroState.classList.remove('hidden');
      if (this.el.testEditorCard) this.el.testEditorCard.classList.add('hidden');
      this.el.testsMasterList.innerHTML = '<div class="text-xs text-dim text-center py-3">No scenarios found.</div>';
      return;
    }

    if (this.el.testsZeroState) this.el.testsZeroState.classList.add('hidden');
    if (this.el.testEditorCard) this.el.testEditorCard.classList.remove('hidden');

    if (selectId && list.some(t => t.id === selectId)) {
      this.activeTestId = selectId;
    } else if (!this.activeTestId || !list.some(t => t.id === this.activeTestId)) {
      this.activeTestId = list[0].id;
    }

    this.el.testsMasterList.innerHTML = list.map(t => {
      const polCount = (t.linked_policies || []).length;
      const procCount = (t.linked_procedures || []).length;
      const linksSummary = [
        polCount > 0 ? `${polCount} pol` : '',
        procCount > 0 ? `${procCount} proc` : '',
      ].filter(Boolean).join(' · ');

      return `
        <div class="asst-master-item ${t.id === this.activeTestId ? 'active' : ''}" data-id="${t.id}">
          <div class="flex-between">
            <span class="ref-badge ref-badge-proc">${t.ref_id || t.id}</span>
            <span class="badge-mini ${t.status === 'draft' ? 'badge-warn' : ''}">${t.status.toUpperCase()}</span>
          </div>
          <div class="asst-master-title mt-1">${t.title}</div>
          <div class="asst-master-sub">${linksSummary ? `Linked: ${linksSummary}` : 'No links attached'}</div>
        </div>
      `;
    }).join('');

    this.el.testsMasterList.querySelectorAll('.asst-master-item').forEach(item => {
      item.addEventListener('click', () => {
        this.activeTestId = item.dataset.id;
        this.navigate('testscenarios', this.testFilter, this.activeTestId);
        this.renderTestScenariosMasterDetail(this.activeTestId);
      });
    });

    const activeTest = list.find(t => t.id === this.activeTestId) || list[0];
    this.populateTestScenarioForm(activeTest);
  }

  populateTestScenarioForm(test) {
    if (!test) return;
    if (this.el.testRefIdBadge) this.el.testRefIdBadge.textContent = test.ref_id || test.id;
    if (this.el.testEditorTitle) this.el.testEditorTitle.textContent = test.title || 'Edit Test Scenario';
    if (this.el.testTitleInput) this.el.testTitleInput.value = test.title || '';
    if (this.el.testStatusSelect) this.el.testStatusSelect.value = test.status || 'enabled';
    if (this.el.testRoleInput) this.el.testRoleInput.value = test.callee?.role || test.customer_role || '';
    if (this.el.testMaxTurnsInput) this.el.testMaxTurnsInput.value = test.max_turns || 6;
    if (this.el.testObjectiveInput) this.el.testObjectiveInput.value = test.description || test.test_objective || '';
    if (this.el.testSecretInstructionsInput) this.el.testSecretInstructionsInput.value = test.callee?.secret_instructions || test.secret_instructions || '';

    this.activeTestLinkedPolicies = [...(test.linked_policies || [])];
    this.activeTestLinkedProcedures = [...(test.linked_procedures || [])];
    this.renderActiveTestLinks();

    // Hide suggestions box initially
    if (this.el.testSuggestedLinksBox) this.el.testSuggestedLinksBox.classList.add('hidden');

    // Render criteria checklist
    const checklist = test.evaluation_checklist || test.checklist || [];
    this.renderTestCriteriaList(checklist);

    this.adjustAllAutoGrow();
  }

  renderActiveTestLinks() {
    if (!this.el.testActiveLinksList) return;
    const pols = this.activeTestLinkedPolicies || [];
    const procs = this.activeTestLinkedProcedures || [];

    if (pols.length === 0 && procs.length === 0) {
      this.el.testActiveLinksList.innerHTML = '<span class="text-xs text-dim">No policies or procedures linked yet. Click "+ Link Item" or "✨ AI Suggest Links".</span>';
      return;
    }

    const polItems = pols.map(pId => `
      <span class="linked-pill-tag pill-pol" data-id="${pId}">
        📜 ${pId}
        <span class="pill-remove btn-del-pol-link" data-id="${pId}" title="Unlink Policy">✕</span>
      </span>
    `).join('');

    const procItems = procs.map(pId => `
      <span class="linked-pill-tag pill-proc" data-id="${pId}">
        📋 ${pId}
        <span class="pill-remove btn-del-proc-link" data-id="${pId}" title="Unlink Procedure">✕</span>
      </span>
    `).join('');

    this.el.testActiveLinksList.innerHTML = polItems + procItems;

    this.el.testActiveLinksList.querySelectorAll('.btn-del-pol-link').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.activeTestLinkedPolicies = this.activeTestLinkedPolicies.filter(id => id !== btn.dataset.id);
        this.renderActiveTestLinks();
      });
    });

    this.el.testActiveLinksList.querySelectorAll('.btn-del-proc-link').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.activeTestLinkedProcedures = this.activeTestLinkedProcedures.filter(id => id !== btn.dataset.id);
        this.renderActiveTestLinks();
      });
    });
  }

  renderTestCriteriaList(checklist) {
    if (!this.el.testCriteriaList) return;
    if (checklist.length === 0) {
      this.el.testCriteriaList.innerHTML = '<div class="text-xs text-dim p-2">No criteria defined. Click "+ Add Criteria" to add verification goals.</div>';
      return;
    }

    this.el.testCriteriaList.innerHTML = checklist.map((c, i) => {
      const goalText = typeof c === 'string' ? c : (c.goal || '');
      const req = typeof c === 'object' ? c.required !== false : true;
      return `
        <div class="policy-item" data-idx="${i}">
          <span class="policy-num">#${i + 1}</span>
          <input type="text" class="test-criteria-input" value="${goalText.replace(/"/g, '&quot;')}" placeholder="e.g. Verified caller date of birth per POL-001">
          <label class="flex-center gap-1 text-xs text-dim cursor-pointer">
            <input type="checkbox" class="test-criteria-req" ${req ? 'checked' : ''}>
            <span>Req</span>
          </label>
          <button class="btn-icon-soft btn-del-criteria">✕</button>
        </div>
      `;
    }).join('');

    this.el.testCriteriaList.querySelectorAll('.btn-del-criteria').forEach(b => {
      b.addEventListener('click', (e) => e.target.closest('.policy-item').remove());
    });
  }

  addTestCriteriaRow(goal = '', required = true) {
    if (!this.el.testCriteriaList) return;
    const div = document.createElement('div');
    div.className = 'policy-item';
    const count = this.el.testCriteriaList.querySelectorAll('.policy-item').length + 1;
    div.innerHTML = `
      <span class="policy-num">#${count}</span>
      <input type="text" class="test-criteria-input" value="${goal.replace(/"/g, '&quot;')}" placeholder="e.g. Followed authorized workflow step">
      <label class="flex-center gap-1 text-xs text-dim cursor-pointer">
        <input type="checkbox" class="test-criteria-req" ${required ? 'checked' : ''}>
        <span>Req</span>
      </label>
      <button class="btn-icon-soft btn-del-criteria">✕</button>
    `;
    div.querySelector('.btn-del-criteria').addEventListener('click', () => div.remove());
    this.el.testCriteriaList.appendChild(div);
    div.querySelector('.test-criteria-input').focus();
  }

  createNewTestScenario(defaults = {}) {
    this.activeTestId = null;
    if (this.el.testRefIdBadge) this.el.testRefIdBadge.textContent = 'TEST-NEW';
    if (this.el.testEditorTitle) this.el.testEditorTitle.textContent = 'Create New Test Scenario';
    if (this.el.testTitleInput) this.el.testTitleInput.value = defaults.title || '';
    if (this.el.testStatusSelect) this.el.testStatusSelect.value = defaults.status || 'enabled';
    if (this.el.testRoleInput) this.el.testRoleInput.value = defaults.role || 'Caller inquiring regarding services';
    if (this.el.testMaxTurnsInput) this.el.testMaxTurnsInput.value = 6;
    if (this.el.testObjectiveInput) this.el.testObjectiveInput.value = defaults.objective || '';
    if (this.el.testSecretInstructionsInput) this.el.testSecretInstructionsInput.value = defaults.secret_instructions || '';

    this.activeTestLinkedPolicies = Array.isArray(defaults.linked_policies) ? [...defaults.linked_policies] : [];
    this.activeTestLinkedProcedures = Array.isArray(defaults.linked_procedures) ? [...defaults.linked_procedures] : [];
    this.renderActiveTestLinks();

    this.renderTestCriteriaList([
      { id: 'c1', goal: 'Representative handled inquiry politely and followed company policies', required: true },
    ]);

    if (this.el.testsZeroState) this.el.testsZeroState.classList.add('hidden');
    if (this.el.testEditorCard) this.el.testEditorCard.classList.remove('hidden');
    this.switchTab('testscenarios', 'new', null, false);
    if (this.el.testTitleInput) this.el.testTitleInput.focus();
  }

  async saveCurrentTestScenario() {
    const title = this.el.testTitleInput.value.trim();
    if (!title) return this.showToast('Scenario title is required', 'error');

    const criteriaInputs = this.el.testCriteriaList.querySelectorAll('.policy-item');
    const checklist = Array.from(criteriaInputs).map((row, idx) => ({
      id: `c_${idx + 1}`,
      goal: row.querySelector('.test-criteria-input')?.value.trim() || '',
      required: row.querySelector('.test-criteria-req')?.checked !== false,
    })).filter(c => c.goal.length > 0);

    const payload = {
      id: this.activeTestId,
      title,
      status: this.el.testStatusSelect.value,
      max_turns: parseInt(this.el.testMaxTurnsInput.value, 10) || 6,
      customer_role: this.el.testRoleInput.value.trim(),
      test_objective: this.el.testObjectiveInput.value.trim(),
      secret_instructions: this.el.testSecretInstructionsInput.value.trim(),
      callee: {
        role: this.el.testRoleInput.value.trim(),
        secret_instructions: this.el.testSecretInstructionsInput.value.trim(),
      },
      linked_policies: this.activeTestLinkedPolicies,
      linked_procedures: this.activeTestLinkedProcedures,
      evaluation_checklist: checklist,
    };

    try {
      const res = await fetch(`/api/accounts/${this.activeAccountId}/test-scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const saved = await res.json();
      this.activeTestId = saved.id;
      await this.loadTestScenarios(this.activeAccountId, this.testFilter, saved.id);
      await this.loadCoverageGaps(this.activeAccountId);
      this.showToast(`Test scenario [${saved.id}] saved!`);
    } catch (e) {
      this.showToast('Save scenario failed', 'error', e.message);
    }
  }

  async deleteCurrentTestScenario() {
    if (!this.activeTestId) return;
    if (!confirm(`Delete test scenario ${this.activeTestId}?`)) return;
    try {
      await fetch(`/api/accounts/${this.activeAccountId}/test-scenarios/${this.activeTestId}`, { method: 'DELETE' });
      this.activeTestId = null;
      await this.loadTestScenarios(this.activeAccountId, this.testFilter);
      await this.loadCoverageGaps(this.activeAccountId);
      this.showToast('Test scenario deleted');
    } catch (e) {
      this.showToast('Delete scenario failed', 'error', e.message);
    }
  }

  async suggestLinksForCurrentTest() {
    try {
      const title = this.el.testTitleInput.value.trim();
      const description = this.el.testObjectiveInput.value.trim();
      const instructions = this.el.testSecretInstructionsInput.value.trim();

      const res = await fetch(`/api/accounts/${this.activeAccountId}/test-scenarios/suggest-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, instructions }),
      });
      const data = await res.json();

      const suggestedPolicies = (data.suggested_policies || []).filter(p => !this.activeTestLinkedPolicies.includes(p.ref_id));
      const suggestedProcedures = (data.suggested_procedures || []).filter(p => !this.activeTestLinkedProcedures.includes(p.ref_id));

      if (suggestedPolicies.length === 0 && suggestedProcedures.length === 0) {
        this.showToast('No new suggestions found', 'success', 'All matching items already linked or none detected.');
        return;
      }

      this.el.testSuggestedLinksBox.classList.remove('hidden');
      const polBadges = suggestedPolicies.map(p => `
        <span class="suggested-pill-tag btn-add-suggested-link" data-type="policy" data-id="${p.ref_id}">
          + 📜 ${p.ref_id}: ${p.title}
        </span>
      `).join('');
      const procBadges = suggestedProcedures.map(p => `
        <span class="suggested-pill-tag btn-add-suggested-link" data-type="procedure" data-id="${p.ref_id}">
          + 📋 ${p.ref_id}: ${p.name}
        </span>
      `).join('');
      this.el.testSuggestedLinksList.innerHTML = polBadges + procBadges;

      this.el.testSuggestedLinksList.querySelectorAll('.btn-add-suggested-link').forEach(tag => {
        tag.addEventListener('click', () => {
          const type = tag.dataset.type;
          const id = tag.dataset.id;
          if (type === 'policy' && !this.activeTestLinkedPolicies.includes(id)) {
            this.activeTestLinkedPolicies.push(id);
          } else if (type === 'procedure' && !this.activeTestLinkedProcedures.includes(id)) {
            this.activeTestLinkedProcedures.push(id);
          }
          tag.remove();
          this.renderActiveTestLinks();
          if (this.el.testSuggestedLinksList.children.length === 0) {
            this.el.testSuggestedLinksBox.classList.add('hidden');
          }
        });
      });

      this.showToast(`Found ${suggestedPolicies.length + suggestedProcedures.length} suggested links!`);
    } catch (e) {
      this.showToast('Suggest links failed', 'error', e.message);
    }
  }

  openAddLinkPickerModal() {
    const unlinkedPolicies = (this.policies || []).filter(p => !this.activeTestLinkedPolicies.includes(p.ref_id || p.id));
    const unlinkedProcedures = (this.procedures || []).filter(p => !this.activeTestLinkedProcedures.includes(p.ref_id || p.id));

    if (unlinkedPolicies.length === 0 && unlinkedProcedures.length === 0) {
      this.showToast('All policies and procedures already linked!', 'success');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'drawer-overlay';
    modal.innerHTML = `
      <div class="drawer-panel" style="max-width: 500px;">
        <div class="drawer-header">
          <h3>Link Policy or Procedure</h3>
          <button class="btn-icon-soft btn-close-picker">✕</button>
        </div>
        <div class="flex-col gap-3">
          ${unlinkedPolicies.length > 0 ? `
            <div>
              <strong class="text-xs text-dim block mb-1">📜 POLICIES</strong>
              <div class="flex-col gap-1">
                ${unlinkedPolicies.map(p => `
                  <button class="btn-soft-xs text-left p-2 flex-between btn-select-link" data-type="policy" data-id="${p.ref_id || p.id}">
                    <span><strong>[${p.ref_id || p.id}]</strong> ${p.title}</span>
                    <span class="badge-mini">${p.type}</span>
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}

          ${unlinkedProcedures.length > 0 ? `
            <div>
              <strong class="text-xs text-dim block mb-1">📋 PROCEDURES</strong>
              <div class="flex-col gap-1">
                ${unlinkedProcedures.map(p => `
                  <button class="btn-soft-xs text-left p-2 flex-between btn-select-link" data-type="procedure" data-id="${p.ref_id || p.id}">
                    <span><strong>[${p.ref_id || p.id}]</strong> ${p.name}</span>
                    <span class="badge-mini">${p.status}</span>
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('.btn-close-picker').addEventListener('click', () => modal.remove());
    modal.querySelectorAll('.btn-select-link').forEach(b => {
      b.addEventListener('click', () => {
        const type = b.dataset.type;
        const id = b.dataset.id;
        if (type === 'policy') this.activeTestLinkedPolicies.push(id);
        if (type === 'procedure') this.activeTestLinkedProcedures.push(id);
        this.renderActiveTestLinks();
        modal.remove();
        this.showToast(`Linked [${id}]`);
      });
    });
  }

  async generateGapDraftTests() {
    try {
      const res = await fetch(`/api/accounts/${this.activeAccountId}/test-scenarios/generate-gap-drafts`, {
        method: 'POST',
      });
      const data = await res.json();
      await this.loadTestScenarios(this.activeAccountId, 'draft');
      await this.loadCoverageGaps(this.activeAccountId);
      this.showToast(`Generated ${data.count} draft test scenarios for review!`, 'success');
    } catch (e) {
      this.showToast('Generate draft tests failed', 'error', e.message);
    }
  }

  openScenarioModalForNew() {
    this.activeEditingScenarioIndex = -1;
    this.el.scenarioModalTitle.textContent = 'Add Test Scenario';
    this.el.scenModalTitle.value = 'Happy Path Appointment Booking';
    this.el.scenModalRole.value = 'Patient (John Smith)';
    this.el.scenModalObjective.value = 'Caller wants to book an appointment for Thursday morning.';
    this.el.scenModalInstructions.value = 'You are John Smith. You need to see Dr. Who on Thursday around 10 AM. If offered 10 AM, confirm it.';
    this.renderScenarioModalChecklist(['Caller confirms patient identity', 'Assistant queries slots', 'Assistant confirms slot']);
    this.el.btnModalDeleteScen.classList.add('hidden');
    this.el.scenarioModal.classList.remove('hidden');
    this.adjustAllAutoGrow();
  }

  openScenarioModalForEdit(index, procId = null) {
    const targetId = procId || this.activeProcedureId;
    const proc = this.procedures.find(p => p.id === targetId || p.ref_id === targetId) || this.procedures[0];
    if (!proc) {
      console.warn('Procedure not found for scenario edit:', targetId);
      return;
    }
    this.activeProcedureId = proc.id;
    if (!proc.test_scenarios || !proc.test_scenarios[index]) {
      console.warn('Scenario index not found:', index, proc.test_scenarios);
      return;
    }
    const sc = proc.test_scenarios[index];
    this.activeEditingScenarioIndex = index;
    this.el.scenarioModalTitle.textContent = `Edit Scenario: ${sc.title || `Scenario #${index + 1}`}`;
    this.el.scenModalTitle.value = sc.title || '';
    this.el.scenModalRole.value = sc.callee?.role || sc.customer_role || 'Patient';
    this.el.scenModalObjective.value = sc.description || sc.test_objective || '';
    this.el.scenModalInstructions.value = sc.callee?.secret_instructions || sc.secret_instructions || '';

    let goals = [];
    if (Array.isArray(sc.evaluation_checklist) && sc.evaluation_checklist.length > 0) {
      goals = sc.evaluation_checklist.map(g => typeof g === 'string' ? g : (g.goal || JSON.stringify(g)));
    } else if (Array.isArray(sc.checklist) && sc.checklist.length > 0) {
      goals = sc.checklist.map(g => typeof g === 'string' ? g : (g.goal || JSON.stringify(g)));
    }
    this.renderScenarioModalChecklist(goals.length > 0 ? goals : ['Caller verifies identity', 'Follows procedure steps']);
    this.el.btnModalDeleteScen.classList.remove('hidden');
    this.el.scenarioModal.classList.remove('hidden');
    this.adjustAllAutoGrow();
  }

  closeScenarioModal() {
    this.el.scenarioModal.classList.add('hidden');
  }

  renderScenarioModalChecklist(goals) {
    this.el.scenModalChecklist.innerHTML = goals.map((g, i) => `
      <div class="policy-item">
        <span class="policy-num">#${i + 1}</span>
        <input type="text" value="${(g || '').replace(/"/g, '&quot;')}" class="scen-check-input">
        <button type="button" class="btn-icon-soft btn-del-check">✕</button>
      </div>
    `).join('');

    this.el.scenModalChecklist.querySelectorAll('.btn-del-check').forEach(b => {
      b.addEventListener('click', (e) => e.target.closest('.policy-item').remove());
    });
  }

  addScenarioChecklistRow() {
    const div = document.createElement('div');
    div.className = 'policy-item';
    div.innerHTML = `
      <span class="policy-num">#${this.el.scenModalChecklist.children.length + 1}</span>
      <input type="text" placeholder="Evaluation criteria..." class="scen-check-input">
      <button type="button" class="btn-icon-soft btn-del-check">✕</button>
    `;
    div.querySelector('.btn-del-check').addEventListener('click', () => div.remove());
    this.el.scenModalChecklist.appendChild(div);
  }

  async saveScenarioFromModal() {
    const title = this.el.scenModalTitle.value.trim();
    if (!title) return this.showToast('Scenario title required', 'error');

    const checklist = Array.from(this.el.scenModalChecklist.querySelectorAll('.scen-check-input'))
      .map(i => i.value.trim())
      .filter(Boolean)
      .map((g, idx) => ({ id: `crit_${idx + 1}`, goal: g, required: true }));

    const proc = this.procedures.find(p => p.id === this.activeProcedureId || p.ref_id === this.activeProcedureId) || this.procedures[0];
    if (proc) this.activeProcedureId = proc.id;

    const existingScenario = (this.activeEditingScenarioIndex >= 0 && proc && proc.test_scenarios)
      ? proc.test_scenarios[this.activeEditingScenarioIndex]
      : null;

    const scenarioId = existingScenario ? existingScenario.id : `scen-${Date.now()}`;

    const scenarioObj = {
      id: scenarioId,
      title,
      description: this.el.scenModalObjective.value.trim(),
      test_objective: this.el.scenModalObjective.value.trim(),
      customer_role: this.el.scenModalRole.value.trim(),
      secret_instructions: this.el.scenModalInstructions.value.trim(),
      enabled: true,
      max_turns: 6,
      callee: {
        role: this.el.scenModalRole.value.trim(),
        secret_instructions: this.el.scenModalInstructions.value.trim(),
      },
      evaluation_checklist: checklist,
      checklist: checklist.map(c => c.goal),
    };

    if (!this.activeProcedureId) {
      await this.saveCurrentProcedure();
    }

    try {
      await fetch(`/api/accounts/${this.activeAccountId}/procedures/${this.activeProcedureId}/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scenarioObj),
      });
      this.closeScenarioModal();
      await this.loadProcedures(this.activeAccountId, this.procFilter, this.activeProcedureId);
      this.showToast('Test scenario saved to procedure!');
    } catch (e) {
      this.showToast('Save scenario failed', 'error', e.message);
    }
  }

  async deleteScenarioFromModal() {
    if (this.activeEditingScenarioIndex < 0) return;
    const proc = this.procedures.find(p => p.id === this.activeProcedureId);
    if (!proc || !proc.test_scenarios) return;
    const sc = proc.test_scenarios[this.activeEditingScenarioIndex];
    if (!sc) return;

    try {
      await fetch(`/api/accounts/${this.activeAccountId}/procedures/${this.activeProcedureId}/scenarios/${sc.id}`, {
        method: 'DELETE',
      });
      this.closeScenarioModal();
      await this.loadProcedures(this.activeAccountId, this.procFilter, this.activeProcedureId);
      this.showToast('Test scenario deleted');
    } catch (e) {
      this.showToast('Delete scenario failed', 'error', e.message);
    }
  }

  // --- TAB 6: SINGLE ASSISTANT + EMBEDDED CHAT ---

  async loadAssistant(accountId) {
    if (!accountId) return;
    try {
      const res = await fetch(`/api/accounts/${accountId}/assistant`);
      if (!res.ok) throw new Error('Assistant not found');
      this.assistant = await res.json();
      this.activeAssistantId = this.assistant.id;
      this.el.certAssistantSummary.textContent = `${this.assistant.name} · ${this.assistant.voice || 'Aoede'}`;
      this.el.btnSnapshotCertify.disabled = false;
      this.el.editorHeading.textContent = `Edit Assistant: ${this.assistant.name}`;
      this.el.editorSubheading.textContent = 'Update the account assistant persona, guidelines, or voice timbre.';
      this.el.editorAiCreatorBox.classList.remove('hidden');
      this.populateAssistantForm(this.assistant);
    } catch (e) {
      this.assistant = null;
      this.activeAssistantId = null;
      this.el.certAssistantSummary.textContent = 'Assistant configuration unavailable';
      this.el.btnSnapshotCertify.disabled = true;
      console.error('Error loading assistant:', e);
    }
  }

  populateAssistantForm(asst) {
    this.el.asstNameInput.value = asst.name || '';
    this.el.asstVoiceSelect.value = asst.voice || 'Aoede';
    this.el.asstPersonalityInput.value = asst.personality_style || '';
    this.el.asstBackstoryInput.value = asst.backstory || '';

    this.renderAssistantRulesList(asst.conversational_rules || [
      'Speak with gentle warmth and polite courtesy.',
      'Remain calm and attentive when callers are stressed.',
    ]);

    // Populate scenario selector for embedded chat
    const allScens = this.testScenarios || [];
    this.el.chatScenarioSelect.innerHTML = allScens.map(s => `<option value="${s.id}">${s.title}</option>`).join('');

    this.adjustAllAutoGrow();
  }

  renderAssistantRulesList(rules) {
    this.el.asstRulesList.innerHTML = rules.map((r, i) => `
      <div class="policy-item">
        <span class="policy-num">#${i + 1}</span>
        <input type="text" value="${r.replace(/"/g, '&quot;')}" class="asst-rule-input">
        <button class="btn-icon-soft btn-del-asst-rule">✕</button>
      </div>
    `).join('');
    this.el.asstRulesList.querySelectorAll('.btn-del-asst-rule').forEach(b => {
      b.addEventListener('click', (e) => e.target.closest('.policy-item').remove());
    });
  }

  addAssistantRuleRow() {
    const div = document.createElement('div');
    div.className = 'policy-item';
    const count = this.el.asstRulesList.children.length + 1;
    div.innerHTML = `
      <span class="policy-num">#${count}</span>
      <input type="text" placeholder="Guideline rule..." class="asst-rule-input">
      <button class="btn-icon-soft btn-del-asst-rule">✕</button>
    `;
    div.querySelector('.btn-del-asst-rule').addEventListener('click', () => div.remove());
    this.el.asstRulesList.appendChild(div);
    div.querySelector('.asst-rule-input').focus();
  }

  async runAiDescribeAssistant() {
    const prompt = this.el.editorDescribeAsstInput.value.trim();
    if (!prompt) return this.showToast('Please describe your desired assistant.', 'error');

    try {
      const res = await fetch(`/api/accounts/${this.activeAccountId}/assistant/describe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (data.name) this.el.asstNameInput.value = data.name;
      if (data.voice) this.el.asstVoiceSelect.value = data.voice;
      if (data.personality_style) this.el.asstPersonalityInput.value = data.personality_style;
      if (data.backstory) this.el.asstBackstoryInput.value = data.backstory;
      if (Array.isArray(data.conversational_rules)) this.renderAssistantRulesList(data.conversational_rules);
      this.el.editorDescribeAsstInput.value = '';
      this.adjustAllAutoGrow();
      this.showToast(`AI generated: ${data.name}!`);
    } catch (e) {
      this.showToast('AI generation failed', 'error', e.message);
    }
  }

  async playVoicePreview() {
    const voice = this.el.asstVoiceSelect.value || 'Aoede';
    this.el.btnPreviewVoice.disabled = true;
    this.el.btnPreviewVoice.textContent = '🔊 Playing (10s)...';

    try {
      this.el.voicePreviewAudio.src = `/api/voice-preview/${voice}?t=${Date.now()}`;
      await this.el.voicePreviewAudio.play();

      this.el.voicePreviewAudio.onended = () => {
        this.el.btnPreviewVoice.disabled = false;
        this.el.btnPreviewVoice.textContent = '🔊 Preview Voice (10s)';
      };
      this.el.voicePreviewAudio.onerror = () => {
        this.el.btnPreviewVoice.disabled = false;
        this.el.btnPreviewVoice.textContent = '🔊 Preview Voice (10s)';
      };
    } catch (e) {
      this.el.btnPreviewVoice.disabled = false;
      this.el.btnPreviewVoice.textContent = '🔊 Preview Voice (10s)';
      this.showToast(`Voice preview error: ${e.message}`, 'error');
    }
  }

  async saveCurrentAssistant() {
    const name = this.el.asstNameInput.value.trim();
    if (!name) return this.showToast('Assistant name is required', 'error');

    const rules = Array.from(this.el.asstRulesList.querySelectorAll('.asst-rule-input')).map(i => i.value.trim()).filter(Boolean);

    const payload = {
      id: this.activeAssistantId || 'assistant',
      name,
      voice: this.el.asstVoiceSelect.value,
      personality_style: this.el.asstPersonalityInput.value.trim(),
      backstory: this.el.asstBackstoryInput.value.trim(),
      conversational_rules: rules,
    };

    try {
      const res = await fetch(`/api/accounts/${this.activeAccountId}/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      await this.loadAssistant(this.activeAccountId);
      this.navigate('assistant', 'edit');
      this.showToast(`Assistant "${name}" saved!`);
    } catch (e) {
      this.showToast('Save assistant failed', 'error', e.message);
    }
  }

  // --- EMBEDDED CHAT CONTROLLER ---

  updateChatTargetMode() {
    const mode = this.el.chatTargetMode.value;
    this.el.chatScenarioSelectBox.classList.toggle('hidden', mode !== 'scenario');
    this.el.chatPastedScenarioBox.classList.toggle('hidden', mode !== 'pasted');
    this.resetChatSession();
  }

  setChatModality(mod) {
    this.chatModality = mod;
    this.el.chatModalityText.classList.toggle('active', mod === 'text');
    this.el.chatModalityVoice.classList.toggle('active', mod === 'voice');
    this.el.chatModalityHybrid.classList.toggle('active', mod === 'hybrid');
  }

  beginChatSession() {
    const asst = this.assistant;
    if (!asst) return this.showToast('Please select an assistant first', 'error');

    this.chatSessionActive = true;
    this.el.chatPreCallBanner.classList.add('hidden');
    this.el.chatSparringFeed.classList.remove('hidden');
    this.el.chatInputRowBox.classList.remove('hidden');
    this.el.chatUserInput.focus();

    this.chatSparringHistory = [];
    this.el.chatSparringFeed.innerHTML = '';

    const greeting = `Hello! Thank you for calling. My name is ${asst.name}. How can I help you today?`;
    this.appendChatSparring('caller', greeting);
    this.showToast(`Connected with ${asst.name} (${this.chatModality.toUpperCase()})`);
  }

  resetChatSession() {
    this.chatSessionActive = false;
    this.chatSparringHistory = [];
    this.el.chatPreCallBanner.classList.remove('hidden');
    this.el.chatSparringFeed.classList.add('hidden');
    this.el.chatInputRowBox.classList.add('hidden');
    if (this.el.chatAudioPlayer) {
      this.el.chatAudioPlayer.pause();
    }
  }

  async sendChatTurn() {
    if (!this.chatSessionActive) return;
    const text = this.el.chatUserInput.value.trim();
    if (!text) return;
    this.el.chatUserInput.value = '';
    this.appendChatSparring('callee', text);

    const mode = this.el.chatTargetMode.value;
    let scenarioContext = '';
    if (mode === 'pasted') {
      scenarioContext = this.el.chatPastedInput.value.trim();
    } else if (mode === 'scenario') {
      const sc = (this.testScenarios || []).find(s => s.id === this.el.chatScenarioSelect.value);
      if (sc) scenarioContext = `${sc.title}\n${sc.description}`;
    }

    try {
      const res = await fetch('/api/chat/assistant-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: this.activeAccountId,
          message: text,
          history: this.chatSparringHistory,
          modality: this.chatModality,
          scenarioContext,
        }),
      });
      const data = await res.json();
      this.appendChatSparring('caller', data.reply);

      if ((this.chatModality === 'voice' || this.chatModality === 'hybrid') && data.audioBase64) {
        this.el.chatAudioPlayer.src = `data:audio/wav;base64,${data.audioBase64}`;
        this.el.chatAudioPlayer.play().catch(e => console.warn('Audio autoplay prevented:', e));
      }
    } catch (e) {
      this.appendChatSparring('caller', 'Thank you for calling.');
    }
  }

  appendChatSparring(speaker, text) {
    this.chatSparringHistory.push({ speaker, text, timeStr: '0:05' });
    const div = document.createElement('div');
    const isCaller = speaker === 'caller';
    div.className = `turn-bubble ${isCaller ? 'turn-caller' : 'turn-callee'}`;
    div.innerHTML = `
      <div class="turn-meta">
        <span class="turn-speaker">${isCaller ? '🤖 Assistant' : '👤 You'}</span>
      </div>
      <div class="turn-text">${text}</div>
    `;
    this.el.chatSparringFeed.appendChild(div);
    this.el.chatSparringFeed.scrollTop = this.el.chatSparringFeed.scrollHeight;
  }

  async reviewChatInteraction() {
    if (this.chatSparringHistory.length === 0) return this.showToast('Please have a conversation with the assistant first.', 'error');
    try {
      const res = await fetch('/api/chat/review-interaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: this.chatSparringHistory,
        }),
      });
      const evalData = await res.json();
      this.showToast(`Evaluation score: ${evalData.overall_score}%`);
      alert(`AI Referee Review:\nScore: ${evalData.overall_score}%\nSummary: ${evalData.summary}\n\nCoaching Tips:\n${(evalData.coaching_feedback || []).join('\n')}`);
    } catch (e) {
      this.showToast('Review failed', 'error', e.message);
    }
  }

  // --- TAB 6: CERTIFICATION (HISTORY VS IN-PROGRESS LIVE RUNNER) ---

  setCertFilter(filter) {
    this.certFilter = filter;
    this.el.filterPills.forEach(p => p.classList.toggle('active', p.dataset.filter === filter));
    this.loadCertificationHistory();
  }

  setCertMode(mode) {
    this.certMode = mode;
    this.el.btnCertModeText.classList.toggle('active', mode === 'text');
    this.el.btnCertModeVoice.classList.toggle('active', mode === 'voice');
  }

  getAllEnabledScenarios() {
    return (this.testScenarios || []).filter(test => test.status === 'enabled');
  }

  renderCertTestsList() {
    const list = this.getAllEnabledScenarios();
    this.el.certFractionBadge.textContent = `0 / ${list.length}`;

    if (list.length === 0) {
      this.el.certTestsList.innerHTML = '<div class="text-xs text-dim py-3 text-center">No enabled test scenarios. Enable at least one scenario before certification.</div>';
      return;
    }

    this.el.certTestsList.innerHTML = list.map((t, idx) => `
      <div class="cert-test-row ${idx === this.selectedCertTestIndex ? 'active' : ''}" data-idx="${idx}" data-test-id="${t.id}">
        <span class="status-light status-light-gray" id="cert-light-${t.id}"></span>
        <div class="flex-1">
          <div class="text-xs font-bold">${t.title}</div>
          <div class="text-dim" style="font-size:0.68rem;">${(t.linked_procedures || []).join(', ') || 'Policy-only scenario'} · ${t.callee?.role || t.customer_role || 'Customer'} (${t.max_turns || 6} turns)</div>
        </div>
      </div>
    `).join('');

    this.el.certTestsList.querySelectorAll('.cert-test-row').forEach(row => {
      row.addEventListener('click', () => {
        this.el.certTestsList.querySelectorAll('.cert-test-row').forEach(r => r.classList.remove('active'));
        row.classList.add('active');
        this.selectedCertTestIndex = parseInt(row.dataset.idx, 10);
        this.inspectCertTest(row.dataset.testId);
      });
    });
  }

  async startSnapshotCertification() {
    const asst = this.assistant;
    if (!asst) {
      this.showToast('Configure the account assistant before certification.', 'error');
      this.navigate('assistant', 'edit');
      return;
    }

    this.el.certParamsCard.classList.add('hidden');
    this.el.certProgressBanner.classList.remove('hidden');
    this.el.btnCertPause.classList.remove('hidden');
    this.el.btnCertResume.classList.add('hidden');

    this.el.certBannerTitle.textContent = 'Certification Run In Progress...';
    this.el.certBannerSub.textContent = `Assistant: ${asst?.name || 'Selected'} | Mode: ${this.certMode.toUpperCase()} | Started: ${new Date().toLocaleTimeString()}`;

    this.liveTestTranscripts = {};
    const scenarios = this.getAllEnabledScenarios();
    scenarios.forEach(t => {
      const light = document.getElementById(`cert-light-${t.id}`);
      if (light) light.className = 'status-light status-light-gray';
    });

    try {
      await fetch(`/api/accounts/${this.activeAccountId}/certification/certify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankId: this.activeBankId,
          mode: this.certMode,
        }),
      });
      this.showToast('Certification suite launched across all enabled scenarios!');
    } catch (e) {
      this.showToast('Launch failed', 'error', e.message);
      this.el.certParamsCard.classList.remove('hidden');
      this.el.certProgressBanner.classList.add('hidden');
    }
  }

  async pauseCertification() {
    await fetch(`/api/accounts/${this.activeAccountId}/certification/pause`, { method: 'POST' });
    this.el.btnCertPause.classList.add('hidden');
    this.el.btnCertResume.classList.remove('hidden');
    this.el.certBannerTitle.textContent = 'Certification Run Paused ⏸';
    this.showToast('Certification paused');
  }

  async resumeCertification() {
    await fetch(`/api/accounts/${this.activeAccountId}/certification/resume`, { method: 'POST' });
    this.el.btnCertPause.classList.remove('hidden');
    this.el.btnCertResume.classList.add('hidden');
    this.el.certBannerTitle.textContent = 'Certification Run In Progress...';
    this.showToast('Certification resumed');
  }

  inspectCertTest(testId) {
    const scenarios = this.getAllEnabledScenarios();
    const sc = scenarios.find(s => s.id === testId);
    if (!sc) return;

    this.el.certDetailTitle.textContent = sc.title;
    this.el.certDetailSub.textContent = `Procedures: ${(sc.linked_procedures || []).join(', ') || 'None'} | Persona: ${sc.callee?.role || sc.customer_role || 'Customer'}`;

    const completedResult = this.currentCertSnapshot?.results?.find(r => r.scenarioId === testId);

    if (completedResult) {
      this.el.certDetailScore.textContent = `${completedResult.evaluation?.overall_score || 0}%`;
      this.el.certDetailStatus.textContent = completedResult.evaluation?.overall_passed ? 'PASSED' : 'FAILED';
      this.el.certDetailStatus.className = `status-pill ${completedResult.evaluation?.overall_passed ? 'state-connected' : 'state-idle'}`;

      this.el.certDetailTranscript.innerHTML = (completedResult.transcript || []).map(t => `
        <div class="turn-bubble ${t.speaker === 'caller' ? 'turn-caller' : 'turn-callee'}">
          <div class="turn-meta">
            <span class="turn-speaker">${t.speaker === 'caller' ? '🤖 Assistant' : '👤 Caller'}</span>
          </div>
          <div class="turn-text">${t.text}</div>
        </div>
      `).join('');

      if (completedResult.audioUrl) {
        this.el.certAudioPlayer.classList.remove('hidden');
        this.el.certAudioEl.src = completedResult.audioUrl;
      } else {
        this.el.certAudioPlayer.classList.add('hidden');
      }
    } else {
      this.el.certDetailScore.textContent = '--';
      this.el.certDetailStatus.textContent = 'IDLE';
      this.el.certDetailStatus.className = 'status-pill state-idle';
      this.el.certDetailTranscript.innerHTML = '<div class="text-xs text-dim p-3">Awaiting execution...</div>';
      this.el.certAudioPlayer.classList.add('hidden');
    }
  }

  toggleCertAudio() {
    if (this.el.certAudioEl.paused) {
      this.el.certAudioEl.play();
      this.el.btnCertPlayPause.textContent = '⏸';
    } else {
      this.el.certAudioEl.pause();
      this.el.btnCertPlayPause.textContent = '▶';
    }
  }

  seekCertAudio(e) {
    const rect = this.el.certScrubberTrack.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    if (this.el.certAudioEl.duration) {
      this.el.certAudioEl.currentTime = pos * this.el.certAudioEl.duration;
    }
  }

  async loadCertificationHistory() {
    try {
      const res = await fetch(`/api/accounts/${this.activeAccountId}/certification/snapshots`);
      const snapshots = await res.json();
      this.renderCertificationHistory(snapshots || []);
    } catch (e) {
      console.error('Error loading cert history:', e);
    }
  }

  renderCertificationHistory(snapshots) {
    let filtered = snapshots;
    if (this.certFilter === 'passed') filtered = snapshots.filter(s => s.overallPassed);
    if (this.certFilter === 'failed') filtered = snapshots.filter(s => !s.overallPassed);
    if (this.certFilter === 'deployed') filtered = snapshots.filter(s => s.deployed);

    if (filtered.length === 0) {
      this.el.snapshotsHistoryList.innerHTML = '<div class="text-xs text-dim py-3 text-center">No certification runs found matching filter.</div>';
      return;
    }

    this.el.snapshotsHistoryList.innerHTML = filtered.map(s => `
      <div class="snapshot-row">
        <div>
          <div class="text-xs font-bold">${s.id} · ${s.assistantName || 'Assistant'}</div>
          <div class="text-dim text-xs">${new Date(s.timestamp).toLocaleString()} · ${s.overallScore || 0}% Score</div>
        </div>
        <div class="flex-center gap-2">
          <span class="status-pill ${s.overallPassed ? 'state-connected' : 'state-idle'}">${s.overallPassed ? 'PASSED' : 'FAILED'}</span>
          ${s.deployed ? '<span class="status-pill state-connected">ACTIVE DEPLOYED 🚀</span>' : `
            <button class="btn-soft-xs btn-deploy-snap" data-id="${s.id}">Deploy to Active</button>
          `}
        </div>
      </div>
    `).join('');

    this.el.snapshotsHistoryList.querySelectorAll('.btn-deploy-snap').forEach(b => {
      b.addEventListener('click', async () => {
        await fetch(`/api/accounts/${this.activeAccountId}/certification/snapshots/${b.dataset.id}/deploy`, { method: 'POST' });
        await this.loadCertificationHistory();
        await this.loadActiveDeploymentBadge();
        this.showToast('Snapshot configuration deployed as active production!');
      });
    });
  }

  async loadActiveDeploymentBadge() {
    try {
      const res = await fetch(`/api/accounts/${this.activeAccountId}/certification/active`);
      const data = await res.json();
      if (data && data.activeSnapshot) {
        this.el.activeDeploymentBadge.classList.remove('hidden');
        this.el.activeDeployText.textContent = `Active: ${data.activeSnapshot.assistantName || 'Assistant'} (${data.activeSnapshot.snapshotId || data.activeSnapshot.id})`;
      } else {
        this.el.activeDeployText.textContent = 'Active: None';
      }
    } catch (e) {}
  }

  // --- RECYCLE BIN & API KEY ---

  async refreshRecycleBinCount() {
    try {
      const res = await fetch(`/api/accounts/${this.activeAccountId}/recycle-bin`);
      const data = await res.json();
      const count = Array.isArray(data) ? data.length : (data.items?.length || 0);
      this.el.recycleBinCount.textContent = count;
    } catch (e) {}
  }

  async openRecycleBin() {
    this.el.recycleBinDrawer.classList.remove('hidden');
    try {
      const res = await fetch(`/api/accounts/${this.activeAccountId}/recycle-bin`);
      const data = await res.json();
      const items = Array.isArray(data) ? data : (data.items || []);
      if (items.length === 0) {
        this.el.recycleBinList.innerHTML = '<div class="text-xs text-dim p-3">Recycle bin is empty.</div>';
        return;
      }
      this.el.recycleBinList.innerHTML = items.map(item => `
        <div class="recycle-bin-item">
          <div>
            <strong class="text-xs">${item.type.toUpperCase()}: ${item.name || item.id}</strong>
            <div class="text-dim text-xs">Deleted ${new Date(item.deletedAt).toLocaleTimeString()}</div>
          </div>
          <button class="btn-soft-xs btn-restore-item" data-id="${item.binItemId}">Restore</button>
        </div>
      `).join('');

      this.el.recycleBinList.querySelectorAll('.btn-restore-item').forEach(b => {
        b.addEventListener('click', async () => {
          await fetch(`/api/accounts/${this.activeAccountId}/recycle-bin/${b.dataset.id}/restore`, { method: 'POST' });
          await this.openRecycleBin();
          await this.refreshRecycleBinCount();
          this.showToast('Item restored!');
        });
      });
    } catch (e) {}
  }

  closeRecycleBin() {
    this.el.recycleBinDrawer.classList.add('hidden');
  }

  async clearRecycleBinArchive() {
    if (!confirm('Permanently clear all items to audit archive?')) return;
    await fetch(`/api/accounts/${this.activeAccountId}/recycle-bin`, { method: 'DELETE' });
    this.closeRecycleBin();
    await this.refreshRecycleBinCount();
    this.showToast('Recycle bin cleared to archive');
  }

  async saveApiKey() {
    const key = this.el.apiKeyInput.value.trim();
    if (!key) return this.showToast('API Key cannot be empty', 'error');
    try {
      const res = await fetch('/api/config/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = await res.json();
      this.updateKeyStatus(data.hasApiKey);
      this.el.apiKeyInput.value = '';
      this.showToast('API Key saved successfully!');
    } catch (e) {
      this.showToast('Failed to save API key', 'error', e.message);
    }
  }

  updateKeyStatus(hasKey) {
    if (hasKey) {
      this.el.keyStatusIndicator.className = 'key-dot status-active';
      this.el.keyStatusIndicator.title = 'API Key Valid & Active';
    } else {
      this.el.keyStatusIndicator.className = 'key-dot status-missing';
      this.el.keyStatusIndicator.title = 'API Key Required';
    }
  }

  // --- WEBSOCKET LIVE STREAMING ---

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleWebSocketMessage(msg);
      } catch (e) {}
    };

    this.ws.onclose = () => {
      setTimeout(() => this.connectWebSocket(), 2500);
    };
  }

  handleWebSocketMessage(msg) {
    if (msg.type === 'TEST_COMPLETED') {
      const light = document.getElementById(`cert-light-${msg.testId}`);
      if (light) {
        light.className = `status-light ${msg.passed ? 'status-light-green' : 'status-light-red'}`;
      }
    }
    if (msg.type === 'BATCH_COMPLETED') {
      this.el.certProgressBanner.classList.add('hidden');
      this.el.certParamsCard.classList.remove('hidden');
      this.currentCertSnapshot = msg.snapshot;
      this.loadCertificationHistory();
      this.showToast(msg.passed ? 'Certification PASSED! 🎉' : 'Certification complete (some tests failed).');
    }
  }
}

// Instantiate App
document.addEventListener('DOMContentLoaded', () => {
  window.app = new TalkDojoEnterpriseApp();
});
