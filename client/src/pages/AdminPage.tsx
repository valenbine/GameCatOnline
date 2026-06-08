import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createEmulatorConfig, loadEmulatorAssets, pngBytesToDataUrl, stripReservedHotkeys, type EmulatorJsInstance, type EmulatorJsWindow } from '../modules/emulator/EmulatorPlayer';
import { fetchAdminSession } from '../services/api';
import type { Game } from '../types/game';

type UploadResult = {
  path: string;
  filename: string;
};

type JsonResult = {
  success?: boolean;
  message?: string;
  data?: Record<string, unknown>;
};

const COVER_CAPTURE_START_BUTTON = 3;
const COVER_CAPTURE_INITIAL_DELAY_MS = 3000;
const COVER_CAPTURE_STEP_DELAY_MS = 5000;
const COVER_CAPTURE_AFTER_START_MS = 900;

const platformOptions: { value: Game['platform']; label: string }[] = [
  { value: 'nes', label: 'FC / NES' },
  { value: 'arcade', label: '街机 / FBNeo' },
  { value: 'snes', label: 'SFC / SNES' },
  { value: 'gba', label: 'GBA' },
  { value: 'gb', label: 'GB' },
  { value: 'gbc', label: 'GBC' },
  { value: 'segaMD', label: 'MD / Genesis' },
  { value: 'pce', label: 'PCE' },
];

function getPlatformLabel(platform: Game['platform']) {
  return platformOptions.find((option) => option.value === platform)?.label ?? platform;
}

export function AdminPage() {
  const navigate = useNavigate();
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const coverCaptureHostRef = useRef<HTMLDivElement | null>(null);
  const coverCaptureInstanceRef = useRef<EmulatorJsInstance | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [capturingCover, setCapturingCover] = useState(false);
  const [savingGeneratedCover, setSavingGeneratedCover] = useState(false);
  const [coverCandidates, setCoverCandidates] = useState<string[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Game['status']>('all');
  const [sortMode, setSortMode] = useState<'updated-desc' | 'sort-desc' | 'title-asc'>('updated-desc');
  const [form, setForm] = useState({
    title: '',
    description: '',
    platform: 'nes' as Game['platform'],
    status: 'draft',
    sortOrder: '0',
    romPath: '',
    biosPath: '',
    coverPath: '',
  });

  useEffect(() => {
    if (!coverPreviewUrl && form.coverPath) {
      setCoverPreviewUrl(form.coverPath);
    }
  }, [coverPreviewUrl, form.coverPath]);

  async function loadGames() {
    const sessionResult = await fetchAdminSession();

    if (!sessionResult.authenticated) {
      navigate('/admin/login');
      return;
    }

    const response = await fetch('/api/admin/games', { credentials: 'include' });
    const result = await response.json();
    setGames(result.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void loadGames();
  }, []);

  useEffect(() => {
    const host = document.createElement('div');
    host.className = 'cover-capture-host';
    document.body.appendChild(host);
    coverCaptureHostRef.current = host;

    return () => {
      cleanupCoverCapture();
      coverCaptureHostRef.current?.remove();
    };
  }, []);

  function cleanupCoverCapture() {
    const emulatorWindow = window as EmulatorJsWindow;
    const runtimeInstance = coverCaptureInstanceRef.current as (EmulatorJsInstance & {
      exit?: () => void;
      destroy?: () => void;
      stop?: () => void;
      pause?: () => void;
    }) | null;

    try {
      runtimeInstance?.pause?.();
      runtimeInstance?.stop?.();
      runtimeInstance?.exit?.();
      runtimeInstance?.destroy?.();
    } catch {
      // Ignore cleanup errors from the hidden capture emulator.
    }

    if (coverCaptureHostRef.current) {
      coverCaptureHostRef.current.innerHTML = '';
    }

    coverCaptureInstanceRef.current = null;
    delete emulatorWindow.EJS_onGameStart;
    delete emulatorWindow.EJS_onError;
    delete emulatorWindow.EJS_emulator;
  }

  async function handleFileUpload(file: File, type: 'rom' | 'cover') {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`/api/admin/upload/${type}`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message ?? '上传失败');
    }

    return result.data as UploadResult;
  }

  async function handleCreateGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setMessage('');

    const response = await fetch(editingId ? `/api/admin/games/${editingId}` : '/api/admin/games', {
      method: editingId ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        ...form,
        sortOrder: Number(form.sortOrder),
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.message ?? (editingId ? '保存失败' : '创建失败'));
      setCreating(false);
      return;
    }

    setForm({ title: '', description: '', platform: 'nes', status: 'draft', sortOrder: '0', romPath: '', biosPath: '', coverPath: '' });
    setCoverPreviewUrl('');
    setSelectedCandidate(null);
    setEditingId(null);
    setCoverCandidates([]);
    setMessage(editingId ? '游戏更新成功' : '游戏创建成功');
    setCreating(false);
    await loadGames();
  }

  function handleEditGame(game: Game) {
    setEditingId(game.id);
    setForm({
      title: game.title,
      description: game.description,
      platform: game.platform,
      status: game.status,
      sortOrder: String(game.sortOrder),
      romPath: game.romUrl,
      biosPath: game.biosUrl,
      coverPath: game.coverUrl,
    });
    setCoverPreviewUrl(game.coverUrl);
    setSelectedCandidate(null);
    setCoverCandidates([]);
    setMessage(`正在编辑《${game.title}》`);

    window.requestAnimationFrame(() => {
      titleInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  }

  async function handleToggleStatus(game: Game) {
    const nextStatus = game.status === 'published' ? 'draft' : 'published';
    setMessage('');

    const response = await fetch(`/api/admin/games/${game.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ status: nextStatus }),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.message ?? '状态更新失败');
      return;
    }

    setGames((current) =>
      current.map((item) => {
        if (item.id !== game.id) {
          return item;
        }

        return result.data as Game;
      }),
    );
    setMessage(nextStatus === 'published' ? '游戏已上架' : '游戏已下架');
  }

  async function handlePinGame(game: Game) {
    setMessage(`正在置顶《${game.title}》...`);

    const response = await fetch(`/api/admin/games/${game.id}/pin`, {
      method: 'POST',
      credentials: 'include',
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.message ?? '置顶游戏失败');
      return;
    }

    await loadGames();
    setSortMode('sort-desc');
    setMessage(`《${game.title}》已置顶`);
  }

  async function handleDeleteGame(game: Game) {
    const confirmed = window.confirm(`确认删除《${game.title}》吗？此操作会删除后台游戏记录。`);
    if (!confirmed) {
      return;
    }

    setMessage('正在删除游戏...');

    const response = await fetch(`/api/admin/games/${game.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.message ?? '删除游戏失败');
      return;
    }

    setGames((current) => current.filter((item) => item.id !== game.id));

    if (editingId === game.id) {
      setEditingId(null);
      setForm({ title: '', description: '', platform: 'nes', status: 'draft', sortOrder: '0', romPath: '', biosPath: '', coverPath: '' });
      setCoverPreviewUrl('');
      setSelectedCandidate(null);
      setCoverCandidates([]);
    }

    setMessage(`《${game.title}》已删除`);
  }

  async function handleGenerateCoverFromStartScreen() {
    if (!form.romPath) {
      setMessage('请先上传 ROM，再生成封面');
      return;
    }

    const host = coverCaptureHostRef.current;
    if (!host) {
      setMessage('截图容器初始化失败');
      return;
    }

    setCapturingCover(true);
    setMessage('正在启动隐藏模拟器并截取开始界面...');
    setCoverCandidates([]);
    setSelectedCandidate(null);
    host.innerHTML = '';

    const emulatorWindow = window as EmulatorJsWindow;
    const playerId = `cover-capture-${editingId ?? 'new'}`;
    host.id = playerId;

    try {
      await loadEmulatorAssets();
      const EmulatorConstructor = emulatorWindow.EmulatorJS;
      if (!EmulatorConstructor) {
        throw new Error('EmulatorJS 未正确加载');
      }

      const captureGame: Game = {
        id: editingId ?? Date.now(),
        title: form.title || '未命名游戏',
        slug: `capture-${editingId ?? 'new'}`,
        description: form.description,
        coverUrl: form.coverPath,
        romUrl: form.romPath,
        biosUrl: form.biosPath,
        platform: form.platform,
        status: form.status as Game['status'],
        sortOrder: Number(form.sortOrder),
        createdAt: '',
        updatedAt: '',
      };

      const readyPromise = new Promise<void>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => reject(new Error('开始界面截图超时，请稍后重试')), 20000);
        const complete = () => {
          window.clearTimeout(timeoutId);
          window.setTimeout(() => resolve(), 1800);
        };

        emulatorWindow.EJS_onGameStart = complete;
        emulatorWindow.EJS_onError = (errorMessage) => {
          window.clearTimeout(timeoutId);
          reject(new Error(errorMessage || '模拟器启动失败'));
        };
      });

      const instance = new EmulatorConstructor(`#${playerId}`, createEmulatorConfig(captureGame, `#${playerId}`));
      coverCaptureInstanceRef.current = instance;
      stripReservedHotkeys(instance);
      instance.on?.('start', () => {
        emulatorWindow.EJS_onGameStart?.();
      });

      await readyPromise;

      await new Promise((resolve) => window.setTimeout(resolve, COVER_CAPTURE_INITIAL_DELAY_MS));

      const candidates: string[] = [];
      for (let index = 0; index < 3; index += 1) {
        if (index > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, COVER_CAPTURE_STEP_DELAY_MS));
        }

        instance.gameManager.simulateInput(0, COVER_CAPTURE_START_BUTTON, 1);
        await new Promise((resolve) => window.setTimeout(resolve, 120));
        instance.gameManager.simulateInput(0, COVER_CAPTURE_START_BUTTON, 0);
        await new Promise((resolve) => window.setTimeout(resolve, COVER_CAPTURE_AFTER_START_MS));

        const screenshot = await instance.gameManager.screenshot();
        candidates.push(pngBytesToDataUrl(screenshot));
      }

      setCoverCandidates(candidates);
      setSelectedCandidate(candidates[0] ?? null);
      setMessage('已完成 3 次自动按 Start 并生成候选封面，请选择一张保存');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '生成封面失败');
    } finally {
      setCapturingCover(false);
      cleanupCoverCapture();
    }
  }

  async function handleSaveGeneratedCover(imageDataUrl: string) {
    setSavingGeneratedCover(true);
    setSelectedCandidate(imageDataUrl);
    setCoverPreviewUrl(imageDataUrl);
    setMessage('正在保存自动生成的封面...');

    try {
      const response = await fetch('/api/admin/capture-cover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ imageDataUrl }),
      });

      const rawText = await response.text();
      let result: JsonResult | null = null;

      try {
        result = rawText ? (JSON.parse(rawText) as JsonResult) : null;
      } catch {
        throw new Error('封面保存接口返回了无效响应，请刷新页面后重试');
      }

      if (!response.ok) {
        setMessage(result?.message ?? '保存封面失败');
        return;
      }

      const nextCoverPath = result?.data?.path;
      if (typeof nextCoverPath !== 'string' || !nextCoverPath) {
        throw new Error('封面保存成功，但返回数据不完整');
      }

      setForm((current) => ({ ...current, coverPath: nextCoverPath }));
      setCoverPreviewUrl(`${nextCoverPath}?t=${Date.now()}`);
      setCoverCandidates([]);
      setSelectedCandidate(null);
      setMessage('封面已保存并回填到当前表单，点击保存修改即可写入游戏记录');
    } catch (error) {
      setSelectedCandidate(null);
      setCoverPreviewUrl(form.coverPath);
      setMessage(error instanceof Error ? error.message : '保存封面失败');
    } finally {
      setSavingGeneratedCover(false);
    }
  }

  const filteredGames = games
    .filter((game) => {
      if (statusFilter !== 'all' && game.status !== statusFilter) {
        return false;
      }

      if (!searchKeyword.trim()) {
        return true;
      }

      const normalizedKeyword = searchKeyword.trim().toLowerCase();
      return `${game.title} ${game.description} ${game.id}`.toLowerCase().includes(normalizedKeyword);
    })
    .sort((left, right) => {
      if (sortMode === 'title-asc') {
        return left.title.localeCompare(right.title, 'zh-CN');
      }

      if (sortMode === 'sort-desc') {
        return right.sortOrder - left.sortOrder || right.id - left.id;
      }

      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });

  return (
    <main className="page admin-page">
      <div className="page-top-actions align-left">
        <Link to="/" className="text-link">
          返回首页
        </Link>
      </div>

      <section className="panel">
        <p className="eyebrow">管理员后台</p>
        <h1>游戏管理</h1>
        <p className="muted">当前可以登录后台、上传 ROM 和封面、创建游戏记录，也可以编辑已有游戏，并从开始界面自动生成封面。</p>

        <form className="admin-form" onSubmit={handleCreateGame}>
          <div className="admin-editor-shell">
            <div className="admin-form-main">
              <div className="admin-form-primary">
                <label>
                  游戏标题
                  <input ref={titleInputRef} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
                </label>
                <label>
                  简介
                  <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={5} />
                </label>
                <div className="admin-form-inline">
                  <label>
                    状态
                    <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                      <option value="draft">草稿</option>
                      <option value="published">已上架</option>
                    </select>
                  </label>
                  <label>
                    平台
                    <select value={form.platform} onChange={(event) => setForm({ ...form, platform: event.target.value as Game['platform'] })}>
                      {platformOptions.map((option) => (
                        <option value={option.value} key={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    排序值
                    <input value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} />
                  </label>
                </div>
                <div className="admin-form-inline">
                  <label>
                    上传 ROM / ZIP
                    <input
                      type="file"
                      accept=".nes,.fds,.zip,.sfc,.smc,.fig,.gba,.gb,.gbc,.md,.gen,.smd,.pce"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const result = await handleFileUpload(file, 'rom');
                        setForm((current) => ({ ...current, romPath: result.path }));
                      }}
                    />
                  </label>
                  <label>
                    上传 BIOS/依赖包
                    <input
                      type="file"
                      accept=".zip"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const result = await handleFileUpload(file, 'rom');
                        setForm((current) => ({ ...current, biosPath: result.path }));
                      }}
                    />
                  </label>
                  <label>
                    上传封面
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const result = await handleFileUpload(file, 'cover');
                        setForm((current) => ({ ...current, coverPath: result.path }));
                        setCoverPreviewUrl(`${result.path}?t=${Date.now()}`);
                        setSelectedCandidate(null);
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>

            <aside className="admin-form-side">
              <div className="admin-cover-panel">
                <div className="admin-cover-panel-header">
                  <strong>封面预览</strong>
                  <button type="button" onClick={() => void handleGenerateCoverFromStartScreen()} disabled={capturingCover || !form.romPath}>
                    {capturingCover ? '生成中...' : '开始界面截图'}
                  </button>
                </div>
                <div className="admin-cover-frame">
                  {coverPreviewUrl ? (
                    <img src={coverPreviewUrl} alt="当前封面" className="admin-cover-image" />
                  ) : (
                    <div className="game-cover-placeholder admin-cover-placeholder">暂无封面</div>
                  )}
                </div>
                <p className="muted admin-cover-hint">当前预览区显示的是会随表单一起保存的封面。</p>
              </div>
            </aside>
          </div>

          <div className="admin-form-secondary">
              <div className="admin-form-status muted">
                <span>平台: {getPlatformLabel(form.platform)}</span>
                <span>ROM: {form.romPath || '未上传'}</span>
                <span>BIOS/依赖包: {form.biosPath || '未上传'}</span>
                <span>封面: {form.coverPath || '未上传'}</span>
              </div>
              {message ? <p className="muted">{message}</p> : null}
              <div className="admin-form-actions">
                <button type="submit" disabled={creating}>
                  {creating ? '保存中...' : editingId ? '保存修改' : '创建游戏'}
                </button>
                {editingId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setForm({ title: '', description: '', platform: 'nes', status: 'draft', sortOrder: '0', romPath: '', biosPath: '', coverPath: '' });
                      setCoverPreviewUrl('');
                      setSelectedCandidate(null);
                      setCoverCandidates([]);
                      setMessage('');
                    }}
                  >
                    取消编辑
                  </button>
                ) : null}
              </div>
          </div>

          {coverCandidates.length > 0 ? (
            <div className="cover-candidate-grid">
              {coverCandidates.map((candidate, index) => (
                <article className={`cover-candidate-card ${candidate === selectedCandidate ? 'is-active' : ''}`} key={`${candidate}-${index}`}>
                  <img src={candidate} alt={`候选封面 ${index + 1}`} className="cover-candidate-image" />
                  <button type="button" onClick={() => void handleSaveGeneratedCover(candidate)} disabled={savingGeneratedCover}>
                    {candidate === selectedCandidate ? '当前封面' : savingGeneratedCover ? '保存中...' : '设为当前封面'}
                  </button>
                </article>
              ))}
            </div>
          ) : null}
        </form>

        <div className="admin-list-toolbar">
          <label className="admin-filter-field">
            搜索游戏
            <input value={searchKeyword} onChange={(event) => setSearchKeyword(event.target.value)} placeholder="按标题、简介或 ID 搜索" />
          </label>
          <label className="admin-filter-field admin-filter-select">
            状态筛选
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | Game['status'])}>
              <option value="all">全部状态</option>
              <option value="published">仅看已上架</option>
              <option value="draft">仅看草稿</option>
            </select>
          </label>
          <label className="admin-filter-field admin-filter-select">
            排序方式
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as 'updated-desc' | 'sort-desc' | 'title-asc')}>
              <option value="updated-desc">最近更新优先</option>
              <option value="sort-desc">排序值优先</option>
              <option value="title-asc">标题 A-Z</option>
            </select>
          </label>
        </div>

        <div className="admin-list-summary muted">
          当前显示 {filteredGames.length} / {games.length} 个游戏
        </div>

        <div className="game-list admin-game-list">
          {loading ? <p className="muted">正在加载后台游戏列表...</p> : null}
          {!loading && games.length === 0 ? <p className="muted">当前还没有游戏记录。</p> : null}
          {!loading && games.length > 0 && filteredGames.length === 0 ? <p className="muted">当前筛选条件下没有匹配的游戏。</p> : null}
          {filteredGames.map((game) => (
            <article className="card game-row-card" key={game.id}>
              <div className="game-row-media">
                {game.coverUrl ? <img className="game-cover" src={game.coverUrl} alt={game.title} /> : <div className="game-cover game-cover-placeholder">暂无封面</div>}
              </div>
              <div className="game-row-content">
                <div className="game-row-heading">
                  <h3>{game.title}</h3>
                  <span className={`game-row-badge ${game.status === 'published' ? 'is-published' : 'is-draft'}`}>
                    {game.status === 'published' ? '已上架' : '草稿'}
                  </span>
                </div>
                <div className="game-row-description-card">
                  <p className="game-row-description">{game.description || '当前游戏暂无简介。'}</p>
                </div>
                <div className="game-row-meta">
                  <span className="muted">游戏 ID #{game.id}</span>
                  <span className="muted">平台 {getPlatformLabel(game.platform)}</span>
                  <span className="muted">排序值 {game.sortOrder}</span>
                  <span className="muted">更新于 {new Date(game.updatedAt).toLocaleDateString('zh-CN')}</span>
                </div>
              </div>
              <div className="game-row-actions">
                <div className="card-actions game-row-buttons">
                  <button type="button" onClick={() => handleEditGame(game)}>
                    编辑
                  </button>
                  <button type="button" onClick={() => void handlePinGame(game)}>
                    置顶
                  </button>
                  <button type="button" onClick={() => void handleToggleStatus(game)}>
                    {game.status === 'published' ? '下架' : '上架'}
                  </button>
                  <button type="button" className="danger-button" onClick={() => void handleDeleteGame(game)}>
                    删除
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
