let API_BASE = localStorage.getItem('docmind.apiBase') || 'http://127.0.0.1:8000';
const API_KEY = 'sk-demo-local';
let preferences = {
  statusAnimation: localStorage.getItem('docmind.statusAnimation') !== 'false',
  failureMessages: localStorage.getItem('docmind.failureMessages') !== 'false',
};

const pages = document.querySelectorAll('.page');
const navItems = document.querySelectorAll('.nav-item');

function openPage(pageId) {
  navItems.forEach(n => n.classList.remove('active'));
  pages.forEach(p => p.classList.remove('active'));
  document.querySelector(`.nav-item[data-page="${pageId}"]`)?.classList.add('active');
  document.getElementById(pageId)?.classList.add('active');
  if (pageId === 'tasks') refreshTaskRecords();
}

navItems.forEach(item => item.addEventListener('click', () => openPage(item.dataset.page)));

const fileInput = document.getElementById('vision-file');
const chooseButton = document.getElementById('choose-file');
const startButton = document.getElementById('start-extract');
const uploadZone = document.getElementById('upload-zone');
const uploadPreview = document.getElementById('upload-preview');
const uploadTitle = document.getElementById('upload-title');
const uploadMeta = document.getElementById('upload-meta');
const resultPanel = document.getElementById('extract-result');
const resultStatus = document.getElementById('extract-status');
const resultFeedback = document.getElementById('extract-feedback');
const resultTable = document.getElementById('extract-table');
const pipelineSteps = [...document.querySelectorAll('#vision-pipeline span')];
const batchFilesInput = document.getElementById('batch-files');
const newBatchButton = document.getElementById('new-batch-task');
const batchQueue = document.getElementById('batch-queue');

let selectedFile = null;
let selectedBatchFiles = [];
let previewUrl = '';
let busy = false;

const fieldLabels = {
  source_file: '来源文件',
  customer: '客户', sale_date: '日期', supplier: '供应商', item: '项目',
  amount: '数量', price: '单价', tax: '税额', total: '总计',
};

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function setPipeline(activeIndex) {
  pipelineSteps.forEach((step, index) => {
    step.classList.toggle('active', index <= activeIndex);
    step.classList.toggle('current', index === activeIndex);
  });
}

function showFile(file) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    showError('当前识别接口仅支持 JPG、PNG 和 WEBP 图片。');
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    showError('文件超过 50 MB，请压缩后重试。');
    return;
  }

  selectedFile = file;
  selectedBatchFiles = [];
  batchQueue.hidden = true;
  batchQueue.replaceChildren();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  uploadPreview.style.backgroundImage = `linear-gradient(rgba(10,15,17,.12), rgba(10,15,17,.34)), url("${previewUrl}")`;
  uploadPreview.classList.add('has-preview');
  uploadPreview.querySelector('span').textContent = '✓';
  uploadTitle.textContent = file.name;
  uploadMeta.textContent = `${formatBytes(file.size)} · ${file.type.replace('image/', '').toUpperCase()} · 已准备上传`;
  startButton.disabled = false;
  startButton.textContent = '开始识别';
  resultPanel.hidden = true;
  setPipeline(0);
}

function validateImage(file) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) return `${file.name}：格式不支持`;
  if (file.size > 50 * 1024 * 1024) return `${file.name}：超过 50 MB`;
  return '';
}

function renderBatchQueue(states = {}) {
  batchQueue.replaceChildren();
  selectedBatchFiles.forEach((file, index) => {
    const row = document.createElement('div');
    row.className = 'batch-file';
    const name = document.createElement('span');
    name.textContent = file.name;
    const size = document.createElement('small');
    size.textContent = formatBytes(file.size);
    const status = document.createElement('b');
    const state = states[index] || 'queued';
    status.className = `batch-state ${state}`;
    status.textContent = ({ queued: '待处理', processing: '识别中', completed: '完成', failed: '失败' })[state];
    row.append(name, size, status);
    batchQueue.appendChild(row);
  });
  batchQueue.hidden = selectedBatchFiles.length === 0;
}

function showBatchFiles(fileList) {
  const files = [...fileList];
  const invalid = files.map(validateImage).filter(Boolean);
  if (invalid.length) {
    showError(invalid.slice(0, 3).join('；'));
    return;
  }
  if (!files.length) return;
  selectedFile = null;
  selectedBatchFiles = files;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = '';
  uploadPreview.style.backgroundImage = '';
  uploadPreview.classList.remove('has-preview');
  uploadPreview.querySelector('span').textContent = '▤';
  uploadTitle.textContent = `已选择 ${files.length} 张采购发票`;
  uploadMeta.textContent = `总计 ${formatBytes(files.reduce((sum, file) => sum + file.size, 0))} · 将按队列顺序处理`;
  startButton.disabled = false;
  startButton.textContent = `开始批量识别（${files.length}）`;
  resultPanel.hidden = true;
  renderBatchQueue();
  setPipeline(0);
}

function showError(message) {
  resultPanel.hidden = false;
  resultStatus.textContent = '失败';
  resultStatus.className = 'result-status error';
  resultFeedback.textContent = preferences.failureMessages ? message : '任务执行失败，请稍后重试。';
  resultTable.replaceChildren();
  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderRows(rows) {
  resultTable.replaceChildren();
  if (!Array.isArray(rows) || rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'result-empty';
    empty.textContent = '模型已返回内容，但没有解析出标准结构化字段。';
    resultTable.appendChild(empty);
    return;
  }

  const fields = Object.keys(fieldLabels).filter(field => rows.some(row => row[field] !== undefined));
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  fields.forEach(field => {
    const th = document.createElement('th');
    th.textContent = fieldLabels[field];
    headRow.appendChild(th);
  });
  head.appendChild(headRow);
  table.appendChild(head);

  const body = document.createElement('tbody');
  rows.forEach(row => {
    const tr = document.createElement('tr');
    fields.forEach(field => {
      const td = document.createElement('td');
      const value = row[field];
      td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  table.appendChild(body);
  resultTable.appendChild(table);
}

async function extractOne(file, batchId = '') {
  const form = new FormData();
  form.append('file', file, file.name);
  if (batchId) form.append('batch_id', batchId);
  const response = await fetch(`${API_BASE}/v1/extract`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || `接口返回 ${response.status}`);
  return payload;
}

async function runExtraction() {
  if ((!selectedFile && selectedBatchFiles.length === 0) || busy) return;
  busy = true;
  startButton.disabled = true;
  chooseButton.disabled = true;
  resultPanel.hidden = false;
  resultStatus.textContent = '识别中';
  resultStatus.className = 'result-status loading';
  resultFeedback.textContent = '正在上传图像并等待 InternVL 返回结构化字段…';
  resultTable.replaceChildren();
  setPipeline(1);

  const isBatch = selectedBatchFiles.length > 0;
  const files = isBatch ? selectedBatchFiles : [selectedFile];
  const batchId = isBatch ? `batch-${Date.now()}` : '';
  const states = {};
  const startedAt = Date.now();
  const timer = window.setInterval(() => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    startButton.textContent = `识别中 · ${seconds}s`;
  }, 1000);

  try {
    const allRows = [];
    const failures = [];
    let lastAnswer = '';
    for (let index = 0; index < files.length; index += 1) {
      states[index] = 'processing';
      if (isBatch) renderBatchQueue(states);
      try {
        const payload = await extractOne(files[index], batchId);
        (payload.rows || []).forEach(row => allRows.push(isBatch ? { source_file: files[index].name, ...row } : row));
        lastAnswer = payload.answer || lastAnswer;
        states[index] = 'completed';
      } catch (error) {
        states[index] = 'failed';
        failures.push(`${files[index].name}：${error.message}`);
      }
      if (isBatch) renderBatchQueue(states);
    }

    setPipeline(2);
    resultStatus.textContent = failures.length ? '部分完成' : '识别完成';
    resultStatus.className = failures.length ? 'result-status warning' : 'result-status success';
    resultFeedback.textContent = isBatch
      ? `${files.length - failures.length}/${files.length} 个任务完成，共提取 ${allRows.length} 条记录${failures.length ? `；${failures.join('；')}` : '。'}`
      : (lastAnswer || `已识别 ${allRows.length} 条结构化记录。`);
    renderRows(allRows);
    startButton.textContent = isBatch ? '重新运行批任务' : '重新识别';
    await Promise.all([refreshDashboard(), refreshTaskRecords()]);
  } catch (error) {
    setPipeline(0);
    showError(error.message.includes('Failed to fetch')
      ? '无法连接 DocMind API，请确认 http://127.0.0.1:8000 正在运行。'
      : error.message);
    startButton.textContent = '重试识别';
  } finally {
    window.clearInterval(timer);
    busy = false;
    startButton.disabled = false;
    chooseButton.disabled = false;
  }
}

chooseButton?.addEventListener('click', () => fileInput.click());
fileInput?.addEventListener('change', event => {
  const file = event.target.files?.[0];
  if (file) showFile(file);
});
newBatchButton?.addEventListener('click', () => batchFilesInput.click());
batchFilesInput?.addEventListener('change', event => showBatchFiles(event.target.files || []));
startButton?.addEventListener('click', runExtraction);

['dragenter', 'dragover'].forEach(type => uploadZone?.addEventListener(type, event => {
  event.preventDefault();
  uploadZone.classList.add('dragging');
}));

['dragleave', 'drop'].forEach(type => uploadZone?.addEventListener(type, event => {
  event.preventDefault();
  uploadZone.classList.remove('dragging');
}));

uploadZone?.addEventListener('drop', event => {
  const file = event.dataTransfer?.files?.[0];
  if (file) showFile(file);
});

uploadZone?.addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target === uploadZone) {
    event.preventDefault();
    fileInput.click();
  }
});

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendQuestionButton = document.getElementById('send-question');
const evidenceCount = document.getElementById('evidence-count');
const evidenceList = document.getElementById('evidence-list');
const suggestionButtons = document.querySelectorAll('.chat-suggestions button');
let chatBusy = false;

function appendMessage(role, text, extraClass = '') {
  const message = document.createElement('div');
  message.className = `message ${role} ${extraClass}`.trim();
  if (role === 'bot') {
    const avatar = document.createElement('b');
    avatar.textContent = 'DM';
    message.appendChild(avatar);
  }
  const bubble = document.createElement('p');
  bubble.textContent = text;
  message.appendChild(bubble);
  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return message;
}

function renderEvidence(citations) {
  evidenceList.replaceChildren();
  if (!Array.isArray(citations) || citations.length === 0) {
    evidenceCount.textContent = '本轮未检索到引用片段';
    const empty = document.createElement('div');
    empty.className = 'evidence-empty';
    empty.textContent = '回答中没有可展示的证据来源';
    evidenceList.appendChild(empty);
    return;
  }

  evidenceCount.textContent = `${citations.length} 个已引用片段`;
  citations.forEach((citation, index) => {
    const card = document.createElement('div');
    card.className = 'evidence-card';
    const heading = document.createElement('strong');
    heading.textContent = `手册第 ${citation.page ?? '—'} 页 · 摘录 ${index + 1}`;
    const meta = document.createElement('small');
    const score = Number(citation.score);
    meta.textContent = Number.isFinite(score) ? `相关度 ${(score * 100).toFixed(1)}%` : '已引用';
    const excerpt = document.createElement('p');
    excerpt.textContent = citation.text || '暂无摘录内容';
    card.append(heading, meta, excerpt);
    evidenceList.appendChild(card);
  });
}

async function sendQuestion(questionText = chatInput.value) {
  const question = questionText.trim();
  if (!question || chatBusy) return;

  chatBusy = true;
  chatInput.value = '';
  chatInput.disabled = true;
  sendQuestionButton.disabled = true;
  suggestionButtons.forEach(button => { button.disabled = true; });
  appendMessage('user', question);
  const loadingMessage = appendMessage('bot', '正在检索知识库并生成回答…', 'thinking');
  evidenceCount.textContent = '正在检索证据…';
  evidenceList.replaceChildren();

  try {
    const response = await fetch(`${API_BASE}/v1/rag/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question, scene: 'rag', mime: 'image/png' }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || `接口返回 ${response.status}`);

    loadingMessage.remove();
    appendMessage('bot', payload.answer || '知识库暂未返回答案。');
    renderEvidence(payload.citations);
    const dashboardCount = document.querySelector('#dashboard .metric:nth-child(2) strong');
    if (dashboardCount) dashboardCount.textContent = String(Number(dashboardCount.textContent) + 1);
  } catch (error) {
    loadingMessage.remove();
    appendMessage('bot', error.message.includes('Failed to fetch')
      ? '无法连接 DocMind API，请确认后端服务正在运行。'
      : `问答失败：${error.message}`, 'failed');
    renderEvidence([]);
  } finally {
    chatBusy = false;
    chatInput.disabled = false;
    sendQuestionButton.disabled = false;
    suggestionButtons.forEach(button => { button.disabled = false; });
    chatInput.focus();
  }
}

sendQuestionButton?.addEventListener('click', () => sendQuestion());
chatInput?.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendQuestion();
  }
});
suggestionButtons.forEach(button => button.addEventListener('click', () => sendQuestion(button.textContent)));

const dashboardTaskList = document.getElementById('dashboard-task-list');
const taskRecords = document.getElementById('task-records');
const taskStatusFilter = document.getElementById('task-status-filter');
const taskTotal = document.getElementById('task-total');
const refreshTasksButton = document.getElementById('refresh-tasks');
const exportTasksButton = document.getElementById('export-tasks');
const taskDialog = document.getElementById('task-detail-dialog');
const taskDetailContent = document.getElementById('task-detail-content');
const globalSearchInput = document.getElementById('global-search-input');
const globalSearchResults = document.getElementById('global-search-results');
let currentTasks = [];
let taskSearchQuery = '';
let searchTimer = 0;

const statusMeta = {
  pending: ['等待中', 'warning'],
  processing: ['处理中', 'alert'],
  completed: ['已完成', ''],
  failed: ['失败', 'failure'],
};

function hideGlobalSearch() {
  globalSearchResults.hidden = true;
  globalSearchResults.replaceChildren();
}

function renderGlobalSearchResults(tasks, query) {
  globalSearchResults.replaceChildren();
  const heading = document.createElement('div');
  heading.className = 'search-result-heading';
  heading.textContent = `任务与识别记录 · ${tasks.length} 条结果`;
  globalSearchResults.appendChild(heading);
  if (!tasks.length) {
    const empty = document.createElement('div');
    empty.className = 'search-result-empty';
    empty.textContent = `未找到“${query}”相关的真实任务`;
    globalSearchResults.appendChild(empty);
  } else {
    tasks.forEach(task => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'search-result-item';
      button.dataset.taskId = task.id;
      const icon = document.createElement('span');
      icon.textContent = '▤';
      const content = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = task.name;
      const meta = document.createElement('small');
      const [statusLabel] = taskStatus(task);
      meta.textContent = `${task.batch_id ? `批次 ${task.batch_id.slice(-8)} · ` : ''}${statusLabel} · ${task.row_count || 0} 条记录`;
      content.append(title, meta);
      const time = document.createElement('time');
      time.textContent = formatTaskTime(task.submitted_at);
      button.append(icon, content, time);
      globalSearchResults.appendChild(button);
    });
  }
  const footer = document.createElement('button');
  footer.type = 'button';
  footer.className = 'search-result-all';
  footer.textContent = '在任务记录中查看全部结果 →';
  footer.addEventListener('click', () => {
    taskSearchQuery = query;
    hideGlobalSearch();
    openPage('tasks');
  });
  globalSearchResults.appendChild(footer);
  globalSearchResults.hidden = false;
}

async function searchTasks(query) {
  try {
    const payload = await apiFetch(`/v1/tasks?limit=6&q=${encodeURIComponent(query)}`);
    if (globalSearchInput.value.trim() === query) renderGlobalSearchResults(payload.tasks || [], query);
  } catch (error) {
    globalSearchResults.replaceChildren();
    const failed = document.createElement('div');
    failed.className = 'search-result-empty';
    failed.textContent = '搜索服务暂时不可用';
    globalSearchResults.appendChild(failed);
    globalSearchResults.hidden = false;
  }
}

globalSearchInput?.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  const query = globalSearchInput.value.trim();
  taskSearchQuery = query;
  if (!query) {
    hideGlobalSearch();
    if (document.getElementById('tasks')?.classList.contains('active')) refreshTaskRecords();
    return;
  }
  searchTimer = window.setTimeout(() => searchTasks(query), 220);
});

globalSearchInput?.addEventListener('keydown', event => {
  if (event.key === 'Escape') hideGlobalSearch();
  if (event.key === 'Enter' && globalSearchInput.value.trim()) {
    taskSearchQuery = globalSearchInput.value.trim();
    hideGlobalSearch();
    openPage('tasks');
  }
});

globalSearchResults?.addEventListener('click', event => {
  const item = event.target.closest('[data-task-id]');
  if (!item) return;
  hideGlobalSearch();
  openPage('tasks');
  viewTask(item.dataset.taskId);
});

document.addEventListener('click', event => {
  if (!event.target.closest('.global-search')) hideGlobalSearch();
});

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${API_KEY}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || `接口返回 ${response.status}`);
  return payload;
}

function formatTaskTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

function taskStatus(task) {
  return statusMeta[task.status] || [task.status || '未知', 'warning'];
}

function renderDashboardTasks(tasks) {
  dashboardTaskList.replaceChildren();
  if (!tasks.length) {
    const empty = document.createElement('div');
    empty.className = 'task-empty';
    empty.textContent = '暂无识别任务，上传采购发票后会在这里显示。';
    dashboardTaskList.appendChild(empty);
    return;
  }
  tasks.forEach(task => {
    const row = document.createElement('div');
    row.className = 'dashboard-task';
    const icon = document.createElement('span');
    icon.className = `doc-icon ${task.status === 'completed' ? 'teal' : task.status === 'failed' ? 'orange' : ''}`;
    icon.textContent = '▤';
    const name = document.createElement('b');
    name.textContent = task.name;
    const meta = document.createElement('small');
    meta.textContent = `${task.batch_id ? `批次 ${task.batch_id.slice(-8)} · ` : ''}${formatBytes(task.file_size || 0)} · ${task.row_count || 0} 条记录`;
    const time = document.createElement('time');
    time.textContent = formatTaskTime(task.submitted_at);
    const mark = document.createElement('mark');
    const [label, className] = taskStatus(task);
    mark.textContent = label;
    if (className) mark.className = className;
    row.append(icon, name, time, meta, mark);
    dashboardTaskList.appendChild(row);
  });
}

async function refreshDashboard() {
  try {
    const [dashboard, records] = await Promise.all([
      apiFetch('/v1/dashboard'),
      apiFetch('/v1/tasks?limit=4'),
    ]);
    const stats = dashboard.tasks || {};
    document.getElementById('today-task-count').textContent = String(stats.today || 0);
    document.getElementById('completed-task-count').textContent = `${stats.completed || 0} 项已完成`;
    document.getElementById('failed-task-count').textContent = String(stats.failed || 0);
    document.getElementById('processing-task-count').textContent = `${stats.processing || 0} 项处理中`;
    renderDashboardTasks(records.tasks || []);
  } catch (error) {
    dashboardTaskList.innerHTML = '<div class="task-empty">任务服务暂时不可用</div>';
  }
}

function makeTaskRow(task) {
  const row = document.createElement('div');
  row.className = 'record';
  const name = document.createElement('b');
  name.textContent = task.name;
  const type = document.createElement('span');
  type.textContent = task.batch_id ? `批次 ${task.batch_id.slice(-8)}` : task.task_type;
  const model = document.createElement('span');
  model.textContent = (task.model || 'InternVL').replace('InternVL3_5-2B-HF', 'InternVL 3.5');
  const mark = document.createElement('mark');
  const [label, className] = taskStatus(task);
  mark.textContent = label;
  if (className) mark.className = className;
  const time = document.createElement('time');
  time.textContent = formatTaskTime(task.submitted_at);
  const actions = document.createElement('div');
  actions.className = 'task-actions';
  const view = document.createElement('button');
  view.type = 'button';
  view.textContent = '查看';
  view.dataset.action = 'view';
  view.dataset.taskId = task.id;
  actions.appendChild(view);
  if (task.status === 'failed') {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = '重试';
    retry.dataset.action = 'retry';
    retry.dataset.taskId = task.id;
    actions.appendChild(retry);
  }
  row.append(name, type, model, mark, time, actions);
  return row;
}

async function refreshTaskRecords() {
  if (!taskRecords) return;
  refreshTasksButton.disabled = true;
  const status = taskStatusFilter.value;
  try {
    const payload = await apiFetch(`/v1/tasks?limit=100${status ? `&status=${encodeURIComponent(status)}` : ''}${taskSearchQuery ? `&q=${encodeURIComponent(taskSearchQuery)}` : ''}`);
    currentTasks = payload.tasks || [];
    taskRecords.querySelectorAll('.record:not(.head), .task-empty').forEach(node => node.remove());
    if (!currentTasks.length) {
      const empty = document.createElement('div');
      empty.className = 'task-empty';
      empty.textContent = status ? '当前筛选条件下没有任务' : '暂无真实任务，上传采购发票后会自动创建记录。';
      taskRecords.appendChild(empty);
    } else {
      currentTasks.forEach(task => taskRecords.appendChild(makeTaskRow(task)));
    }
    taskTotal.textContent = `${currentTasks.length} 个任务${taskSearchQuery ? ` · “${taskSearchQuery}”` : ''}`;
  } catch (error) {
    taskTotal.textContent = '加载失败';
  } finally {
    refreshTasksButton.disabled = false;
  }
}

function detailLine(label, value) {
  const item = document.createElement('div');
  const key = document.createElement('span');
  key.textContent = label;
  const content = document.createElement('strong');
  content.textContent = value || '—';
  item.append(key, content);
  return item;
}

async function viewTask(taskId) {
  try {
    const { task } = await apiFetch(`/v1/tasks/${taskId}`);
    taskDetailContent.replaceChildren();
    const [statusLabel] = taskStatus(task);
    [
      ['任务名称', task.name], ['任务 ID', task.id], ['批次 ID', task.batch_id],
      ['状态', statusLabel], ['模型', task.model], ['文件大小', formatBytes(task.file_size || 0)],
      ['结构化记录', `${task.row_count || 0} 条`], ['提交时间', task.submitted_at],
      ['完成时间', task.completed_at], ['结果摘要', task.answer], ['失败原因', task.error],
    ].forEach(([label, value]) => taskDetailContent.appendChild(detailLine(label, value)));
    taskDialog.showModal();
  } catch (error) {
    window.alert(`无法读取任务：${error.message}`);
  }
}

async function retryTask(taskId, button) {
  button.disabled = true;
  button.textContent = '重试中';
  try {
    await apiFetch(`/v1/tasks/${taskId}/retry`, { method: 'POST' });
  } catch (error) {
    window.alert(`重试失败：${error.message}`);
  } finally {
    await Promise.all([refreshTaskRecords(), refreshDashboard()]);
  }
}

taskRecords?.addEventListener('click', event => {
  const button = event.target.closest('button[data-task-id]');
  if (!button) return;
  if (button.dataset.action === 'view') viewTask(button.dataset.taskId);
  if (button.dataset.action === 'retry') retryTask(button.dataset.taskId, button);
});
taskStatusFilter?.addEventListener('change', refreshTaskRecords);
refreshTasksButton?.addEventListener('click', refreshTaskRecords);
document.getElementById('close-task-detail')?.addEventListener('click', () => taskDialog.close());
taskDialog?.addEventListener('click', event => { if (event.target === taskDialog) taskDialog.close(); });
document.getElementById('dashboard-new-task')?.addEventListener('click', () => { openPage('vision'); fileInput.click(); });
document.getElementById('view-all-tasks')?.addEventListener('click', () => openPage('tasks'));

exportTasksButton?.addEventListener('click', () => {
  if (!currentTasks.length) return;
  const columns = ['任务ID', '批次ID', '文件名', '类型', '模型', '状态', '提交时间', '完成时间', '记录数', '错误'];
  const escapeCsv = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = currentTasks.map(task => [task.id, task.batch_id, task.name, task.task_type, task.model, task.status, task.submitted_at, task.completed_at, task.row_count, task.error]);
  const csv = '\ufeff' + [columns, ...rows].map(row => row.map(escapeCsv).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `DocMind-任务记录-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
});

const workspaceDisplay = document.getElementById('workspace-display');
const workspaceNameInput = document.getElementById('workspace-name');
const apiBaseInput = document.getElementById('api-base-url');
const modelStatus = document.getElementById('model-status');
const testApiButton = document.getElementById('test-api-connection');
const serviceCheckStatus = document.getElementById('service-check-status');
const saveSettingsButton = document.getElementById('save-settings');
const settingsFeedback = document.getElementById('settings-feedback');
const settingsTabs = document.querySelectorAll('.settings-tab');
const settingsSections = document.querySelectorAll('.settings-section');
const preferenceToggles = document.querySelectorAll('[data-preference]');

function applyPreferences() {
  document.body.classList.toggle('reduce-status-animation', !preferences.statusAnimation);
  preferenceToggles.forEach(toggle => {
    const enabled = preferences[toggle.dataset.preference];
    toggle.classList.toggle('on', enabled);
    toggle.setAttribute('aria-checked', String(enabled));
  });
}

function setModelStatus(ok, text) {
  if (!modelStatus) return;
  modelStatus.classList.toggle('offline', !ok);
  const label = modelStatus.querySelector('span');
  if (label) label.textContent = text;
}

async function testApiConnection(showFeedback = true) {
  if (testApiButton) testApiButton.disabled = true;
  if (serviceCheckStatus) {
    serviceCheckStatus.textContent = '检测中…';
    serviceCheckStatus.className = 'service-state checking';
  }
  try {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const health = await response.json();
    const modelName = health.model || 'InternVL';
    setModelStatus(true, 'InternVL · 在线');
    if (serviceCheckStatus) {
      serviceCheckStatus.textContent = `${modelName} · 网关在线`;
      serviceCheckStatus.className = 'service-state online';
    }
    if (showFeedback && settingsFeedback) settingsFeedback.textContent = '连接测试成功';
    return true;
  } catch (error) {
    setModelStatus(false, 'InternVL · 离线');
    if (serviceCheckStatus) {
      serviceCheckStatus.textContent = preferences.failureMessages ? `连接失败：${error.message}` : '连接失败';
      serviceCheckStatus.className = 'service-state offline';
    }
    if (showFeedback && settingsFeedback) settingsFeedback.textContent = '请检查 API 地址或后端服务';
    return false;
  } finally {
    if (testApiButton) testApiButton.disabled = false;
  }
}

settingsTabs.forEach(tab => tab.addEventListener('click', () => {
  settingsTabs.forEach(item => item.classList.remove('selected'));
  settingsSections.forEach(section => section.classList.remove('active'));
  tab.classList.add('selected');
  document.querySelector(`[data-settings-section="${tab.dataset.settingsTab}"]`)?.classList.add('active');
  settingsFeedback.textContent = '';
}));

preferenceToggles.forEach(toggle => toggle.addEventListener('click', () => {
  const key = toggle.dataset.preference;
  preferences[key] = !preferences[key];
  applyPreferences();
}));

testApiButton?.addEventListener('click', async () => {
  const candidate = apiBaseInput.value.trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(candidate)) {
    serviceCheckStatus.textContent = '请输入以 http:// 或 https:// 开头的地址';
    serviceCheckStatus.className = 'service-state offline';
    return;
  }
  API_BASE = candidate;
  await testApiConnection();
});

saveSettingsButton?.addEventListener('click', () => {
  const workspaceName = workspaceNameInput.value.trim() || '05';
  const apiCandidate = apiBaseInput.value.trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(apiCandidate)) {
    settingsFeedback.textContent = 'API 地址格式不正确';
    return;
  }
  API_BASE = apiCandidate;
  workspaceDisplay.textContent = workspaceName;
  workspaceNameInput.value = workspaceName;
  localStorage.setItem('docmind.workspaceName', workspaceName);
  localStorage.setItem('docmind.apiBase', API_BASE);
  localStorage.setItem('docmind.statusAnimation', String(preferences.statusAnimation));
  localStorage.setItem('docmind.failureMessages', String(preferences.failureMessages));
  settingsFeedback.textContent = '设置已保存';
});

const initialWorkspaceName = localStorage.getItem('docmind.workspaceName') || '05';
workspaceDisplay.textContent = initialWorkspaceName;
workspaceNameInput.value = initialWorkspaceName;
apiBaseInput.value = API_BASE;
applyPreferences();
testApiConnection(false);
refreshDashboard();
refreshTaskRecords();

window.setInterval(() => {
  refreshDashboard();
  if (document.getElementById('tasks')?.classList.contains('active')) refreshTaskRecords();
}, 8000);
