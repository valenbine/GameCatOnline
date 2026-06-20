import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getDefaultKeyBindings } from '../modules/emulator/keyBindings';
import { pngBytesToDataUrl } from '../modules/emulator/emulatorImage';
import { stripReservedHotkeys } from '../modules/emulator/emulatorInputRuntime';
import { createEmulatorConfig, forceCloseActiveEmulator, loadEmulatorAssets, type EmulatorJsInstance, type EmulatorJsWindow } from '../modules/emulator/emulatorRuntime';
import { fetchAdminSession, type PaginatedResult } from '../services/api';
import type { Game } from '../types/game';

type UploadResult = {
  path: string;
  filename: string;
};

type JsonResult<T = Record<string, unknown>> = {
  success?: boolean;
  message?: string;
  data?: T;
};

type AdminGamesResult = PaginatedResult<Game>;
type CoverCandidate = {
  imageDataUrl: string;
  score: number;
  status: Game['coverCaptureStatus'];
};

const COVER_CAPTURE_START_BUTTON = 3;
const COVER_CAPTURE_COIN_BUTTON = 2;
const COVER_CAPTURE_INITIAL_DELAY_MS = 3000;
const COVER_CAPTURE_STEP_DELAY_MS = 5000;
const COVER_CAPTURE_AFTER_START_MS = 900;
const COVER_REVIEW_SCORE_THRESHOLD = 250;
const pageSizeOptions = [10, 20, 50, 100];

const platformOptions: { value: Game['platform']; label: string }[] = [
  { value: 'nes', label: 'FC / NES' },
  { value: 'arcade', label: '街机 / FBNeo' },
  { value: 'mame', label: '街机 / MAME 2003 Plus' },
  { value: 'cps1', label: '街机 / CPS1' },
  { value: 'cps2', label: '街机 / CPS2' },
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

function isArcadeZipPlatform(platform: Game['platform']) {
  return platform === 'arcade' || platform === 'mame' || platform === 'cps1' || platform === 'cps2';
}

function inferPlatformFromRomName(fileName: string, currentPlatform: Game['platform']) {
  const extension = fileName.split('.').pop()?.toLowerCase();
  const platformByExtension: Partial<Record<string, Game['platform']>> = {
    fds: 'nes',
    fig: 'snes',
    gba: 'gba',
    gb: 'gb',
    gbc: 'gbc',
    gen: 'segaMD',
    md: 'segaMD',
    nes: 'nes',
    pce: 'pce',
    sfc: 'snes',
    smc: 'snes',
    smd: 'segaMD',
    zip: isArcadeZipPlatform(currentPlatform) ? currentPlatform : 'arcade',
  };

  return extension ? platformByExtension[extension] ?? currentPlatform : currentPlatform;
}

function buildPublicRomPath(fileName: string, uploadedPath: string, platform: Game['platform']) {
  if (!isArcadeZipPlatform(platform)) {
    return uploadedPath;
  }

  return `/uploads/roms/${fileName.replace(/[^a-zA-Z0-9-_.]/g, '-')}`;
}

function needsBiosPackage(platform: Game['platform']) {
  return platform === 'arcade' || platform === 'mame';
}

function getBiosPackageLabel(platform: Game['platform']) {
  if (platform === 'arcade' || platform === 'mame') {
    return 'BIOS/依赖包（Neo Geo 游戏通常需要 neogeo.zip）';
  }

  return 'BIOS/依赖包';
}

function usesArcadeCreditFlow(platform: Game['platform']) {
  return isArcadeZipPlatform(platform);
}

function createEmptyForm() {
  return {
    title: '',
    description: '',
    controlsHelp: '',
    platform: 'nes' as Game['platform'],
    status: 'draft' as Game['status'],
    sortOrder: '0',
    romPath: '',
    biosPath: '',
    coverPath: '',
    coverCaptureScore: 0,
    coverCaptureStatus: 'unknown' as Game['coverCaptureStatus'],
    coverCaptureError: '',
  };
}

function getCoverCaptureStatusLabel(status: Game['coverCaptureStatus']) {
  const statusLabels: Record<Game['coverCaptureStatus'], string> = {
    'auto-ok': '自动截图通过',
    failed: '截图失败',
    manual: '人工上传覆盖',
    'needs-review': '待复核',
    unknown: '未记录',
  };

  return statusLabels[status];
}

function getCoverCaptureStatus(score: number) {
  return score >= COVER_REVIEW_SCORE_THRESHOLD ? 'auto-ok' : 'needs-review';
}

function formatCoverScore(score: number) {
  if (!Number.isFinite(score) || score <= 0) {
    return '0.00';
  }

  return score.toFixed(2);
}

async function scoreCoverCandidate(imageDataUrl: string) {
  const image = new Image();
  image.decoding = 'async';
  image.src = imageDataUrl;
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    return 0;
  }

  context.drawImage(image, 0, 0);
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  let edgeSum = 0;
  let brightnessSum = 0;
  let sampleCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
      brightnessSum += luminance;
      sampleCount += 1;

      if (x === 0 || y === 0) {
        continue;
      }

      const leftIndex = index - 4;
      const topIndex = index - width * 4;
      const leftLuminance = data[leftIndex] * 0.299 + data[leftIndex + 1] * 0.587 + data[leftIndex + 2] * 0.114;
      const topLuminance = data[topIndex] * 0.299 + data[topIndex + 1] * 0.587 + data[topIndex + 2] * 0.114;
      edgeSum += Math.abs(luminance - leftLuminance) + Math.abs(luminance - topLuminance);
    }
  }

  if (sampleCount === 0) {
    return 0;
  }

  const averageBrightness = brightnessSum / sampleCount;
  const brightnessPenalty = Math.abs(averageBrightness - 128) * 4;
  return Math.max(0, edgeSum / sampleCount - brightnessPenalty);
}

export function AdminPage() {
  const navigate = useNavigate();
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const coverUploadInputRef = useRef<HTMLInputElement | null>(null);
  const coverCaptureHostRef = useRef<HTMLIFrameElement | null>(null);
  const coverCaptureWindowRef = useRef<EmulatorJsWindow | null>(null);
  const coverCaptureInstanceRef = useRef<EmulatorJsInstance | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [capturingCover, setCapturingCover] = useState(false);
  const [savingGeneratedCover, setSavingGeneratedCover] = useState(false);
  const [uploadingRom, setUploadingRom] = useState(false);
  const [uploadingBios, setUploadingBios] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverCandidates, setCoverCandidates] = useState<CoverCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Game['status']>('all');
  const [sortMode, setSortMode] = useState<'updated-desc' | 'sort-desc' | 'title-asc'>('updated-desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalGames, setTotalGames] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedGameIds, setSelectedGameIds] = useState<number[]>([]);
  const [form, setForm] = useState(createEmptyForm);

  useEffect(() => {
    if (!coverPreviewUrl && form.coverPath) {
      setCoverPreviewUrl(form.coverPath);
    }
  }, [coverPreviewUrl, form.coverPath]);

  async function loadGames(nextPage = page) {
    setLoading(true);
    const sessionResult = await fetchAdminSession();

    if (!sessionResult.authenticated) {
      navigate('/admin/login');
      return;
    }

    const query = new URLSearchParams({
      page: String(nextPage),
      pageSize: String(pageSize),
      search: searchKeyword.trim(),
      status: statusFilter,
      sort: sortMode,
    });
    const response = await fetch(`/api/admin/games?${query.toString()}`, { credentials: 'include' });
    const result = (await response.json()) as JsonResult<AdminGamesResult>;
    const payload = result.data;
    setGames(payload?.items ?? []);
    setTotalGames(payload?.total ?? 0);
    setTotalPages(payload?.totalPages ?? 1);
    setPage(payload?.page ?? nextPage);
    setLoading(false);
  }

  useEffect(() => {
    void loadGames(page);
  }, [page, pageSize, searchKeyword, statusFilter, sortMode]);

  useEffect(() => () => cleanupCoverCapture(), []);

  function cleanupCoverCapture() {
    const host = coverCaptureHostRef.current;
    const captureWindow = coverCaptureWindowRef.current;
    if (captureWindow) {
      forceCloseActiveEmulator(undefined, captureWindow);
    }
    host?.remove();
    coverCaptureHostRef.current = null;
    coverCaptureWindowRef.current = null;
    coverCaptureInstanceRef.current = null;
  }

  function createCoverCaptureFrame() {
    const frame = document.createElement('iframe');
    frame.className = 'cover-capture-host';
    frame.title = 'cover-capture';
    document.body.appendChild(frame);

    const captureWindow = frame.contentWindow as EmulatorJsWindow | null;
    if (!captureWindow) {
      frame.remove();
      throw new Error('无法创建封面截图运行环境');
    }

    captureWindow.document.open();
    captureWindow.document.write('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="cover-capture-player"></div></body></html>');
    captureWindow.document.close();
    const captureHost = captureWindow.document.getElementById('cover-capture-player') as HTMLDivElement | null;
    if (!captureHost) {
      frame.remove();
      throw new Error('无法创建封面截图容器');
    }

    captureWindow.document.body.style.margin = '0';
    captureHost.style.width = '960px';
    captureHost.style.height = '720px';
    coverCaptureHostRef.current = frame;
    coverCaptureWindowRef.current = captureWindow;

    return { captureHost, captureWindow };
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

  async function reportCoverCapture(gameId: number, payload: Pick<Game, 'coverCaptureError' | 'coverCaptureScore' | 'coverCaptureStatus'>) {
    await fetch(`/api/admin/games/${gameId}/cover-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
  }

  function resetEditor() {
    setEditingId(null);
    setForm(createEmptyForm());
    setCoverPreviewUrl('');
    setSelectedCandidate(null);
    setCoverCandidates([]);
  }

  function toggleGameSelection(gameId: number) {
    setSelectedGameIds((current) => (current.includes(gameId) ? current.filter((id) => id !== gameId) : [...current, gameId]));
  }

  function toggleSelectCurrentPage() {
    const visibleIds = games.map((game) => game.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedGameIds.includes(id));
    setSelectedGameIds((current) => (allVisibleSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]));
  }

  async function handleBulkAction(action: 'feature' | 'publish' | 'draft') {
    if (selectedGameIds.length === 0) {
      setMessage('请先勾选需要批量处理的游戏');
      return;
    }

    const actionLabel = action === 'feature' ? '加入精选' : action === 'publish' ? '批量上架' : '批量下架';
    setMessage(`正在${actionLabel}...`);

    const response = await fetch('/api/admin/games/bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ ids: selectedGameIds, action }),
    });
    const result = (await response.json()) as JsonResult<{ count: number }>;

    if (!response.ok) {
      setMessage(result.message ?? `${actionLabel}失败`);
      return;
    }

    await loadGames(page);
    setSelectedGameIds([]);
    setMessage(`${actionLabel}完成，共处理 ${result.data?.count ?? selectedGameIds.length} 款游戏`);
  }

  async function handleCoverFileSelected(file: File) {
    setUploadingCover(true);
    setMessage(`正在上传封面：${file.name}`);

    try {
      const result = await handleFileUpload(file, 'cover');
      setForm((current) => ({
        ...current,
        coverPath: result.path,
        coverCaptureScore: 0,
        coverCaptureStatus: 'manual',
        coverCaptureError: '',
      }));
      setCoverPreviewUrl(`${result.path}?t=${Date.now()}`);
      setSelectedCandidate(null);
      setCoverCandidates([]);
      if (editingId) {
        await reportCoverCapture(editingId, {
          coverCaptureScore: 0,
          coverCaptureStatus: 'manual',
          coverCaptureError: '',
        });
      }
      setMessage(`封面已上传：${result.filename}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '封面上传失败');
    } finally {
      setUploadingCover(false);
      if (coverUploadInputRef.current) {
        coverUploadInputRef.current.value = '';
      }
    }
  }

  async function handleCreateGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (uploadingRom || uploadingBios || uploadingCover) {
      setMessage('文件仍在上传中，请等待上传完成后再保存');
      return;
    }

    if (!form.title.trim() || !form.romPath) {
      setMessage('请填写游戏标题并等待 ROM 上传完成');
      return;
    }

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

    resetEditor();
    setMessage(editingId ? '游戏更新成功' : '游戏创建成功');
    setCreating(false);
    await loadGames(editingId ? page : 1);
  }

  function handleEditGame(game: Game) {
    setEditingId(game.id);
    setForm({
      title: game.title,
      description: game.description,
      controlsHelp: game.controlsHelp,
      platform: game.platform,
      status: game.status,
      sortOrder: String(game.sortOrder),
      romPath: game.romUrl,
      biosPath: game.biosUrl,
      coverPath: game.coverUrl,
      coverCaptureScore: game.coverCaptureScore,
      coverCaptureStatus: game.coverCaptureStatus,
      coverCaptureError: game.coverCaptureError,
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

    await loadGames(page);
    setMessage(nextStatus === 'published' ? '游戏已上架' : '游戏已下架');
  }

  async function handlePinGame(game: Game) {
    setMessage(`正在把《${game.title}》加入精选...`);

    const response = await fetch(`/api/admin/games/${game.id}/pin`, {
      method: 'POST',
      credentials: 'include',
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.message ?? '精选更新失败');
      return;
    }

    setSortMode('sort-desc');
    setPage(1);
    setMessage(`《${game.title}》已加入精选，最新置顶顺序已更新`);
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

    await loadGames(page);

    if (editingId === game.id) {
      resetEditor();
    }

    setMessage(`《${game.title}》已删除`);
  }

  async function handleGenerateCoverFromStartScreen() {
    if (uploadingRom) {
      setMessage('ROM 上传中，请等待上传完成后再生成封面');
      return;
    }

    if (!form.romPath) {
      setMessage('请先上传 ROM，再生成封面');
      return;
    }

    setCapturingCover(true);
    setMessage('正在启动隐藏模拟器并截取开始界面...');
    setCoverCandidates([]);
    setSelectedCandidate(null);
    cleanupCoverCapture();
    const { captureWindow: emulatorWindow } = createCoverCaptureFrame();
    const playerSelector = '#cover-capture-player';

    try {
      await loadEmulatorAssets(emulatorWindow);
      await new Promise((resolve) => emulatorWindow.requestAnimationFrame(resolve));
      const EmulatorConstructor = emulatorWindow.EmulatorJS;
      if (!EmulatorConstructor) {
        throw new Error('EmulatorJS 未正确加载');
      }

      const captureGame: Game = {
        id: editingId ?? Date.now(),
        title: form.title || '未命名游戏',
        slug: `capture-${editingId ?? 'new'}`,
        description: form.description,
        controlsHelp: form.controlsHelp,
        coverUrl: form.coverPath,
        coverCaptureScore: form.coverCaptureScore,
        coverCaptureStatus: form.coverCaptureStatus,
        coverCaptureError: form.coverCaptureError,
        romUrl: form.romPath,
        biosUrl: form.biosPath,
        platform: form.platform,
        status: form.status as Game['status'],
        sortOrder: Number(form.sortOrder),
        createdAt: '',
        updatedAt: '',
      };

      let cleanupRuntimeErrorListener = () => {};
      const readyPromise = new Promise<void>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => reject(new Error('开始界面截图超时，请稍后重试')), 20000);
        const complete = () => {
          window.clearTimeout(timeoutId);
          cleanupRuntimeErrorListener();
          window.setTimeout(() => resolve(), 1800);
        };
        const handleRuntimeError = (event: ErrorEvent) => {
          if (event.message.includes("reading 'EJS'")) {
            window.clearTimeout(timeoutId);
            cleanupRuntimeErrorListener();
            reject(new Error('模拟器截图实例初始化失败，请稍后重试'));
          }
        };

        emulatorWindow.EJS_onGameStart = complete;
        emulatorWindow.EJS_onError = (errorMessage) => {
          window.clearTimeout(timeoutId);
          cleanupRuntimeErrorListener();
          reject(new Error(errorMessage || '模拟器启动失败'));
        };
        emulatorWindow.addEventListener('error', handleRuntimeError);
        cleanupRuntimeErrorListener = () => emulatorWindow.removeEventListener('error', handleRuntimeError);
      });

      const instance = new EmulatorConstructor(playerSelector, {
        ...createEmulatorConfig(captureGame, playerSelector, getDefaultKeyBindings(captureGame.platform)),
        muted: true,
        volume: 0,
      });
      coverCaptureInstanceRef.current = instance;
      stripReservedHotkeys(instance);
      instance.on?.('start', () => {
        emulatorWindow.EJS_onGameStart?.();
      });
      const simulateInputSafely = (buttonIndex: number, value: number) => {
        const gameManager = instance.gameManager;
        if (!gameManager?.simulateInput) {
          throw new Error('模拟器输入系统尚未准备完成，请稍后重试');
        }

        gameManager.simulateInput(0, buttonIndex, value);
      };

      await readyPromise;

      await new Promise((resolve) => window.setTimeout(resolve, COVER_CAPTURE_INITIAL_DELAY_MS));

      const candidates: CoverCandidate[] = [];
      for (let index = 0; index < 3; index += 1) {
        if (index > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, COVER_CAPTURE_STEP_DELAY_MS));
        }

        if (usesArcadeCreditFlow(captureGame.platform)) {
          simulateInputSafely(COVER_CAPTURE_COIN_BUTTON, 1);
          await new Promise((resolve) => window.setTimeout(resolve, 120));
          simulateInputSafely(COVER_CAPTURE_COIN_BUTTON, 0);
          await new Promise((resolve) => window.setTimeout(resolve, 120));
        }

        simulateInputSafely(COVER_CAPTURE_START_BUTTON, 1);
        await new Promise((resolve) => window.setTimeout(resolve, 120));
        simulateInputSafely(COVER_CAPTURE_START_BUTTON, 0);
        await new Promise((resolve) => window.setTimeout(resolve, COVER_CAPTURE_AFTER_START_MS));

        const screenshot = await instance.gameManager.screenshot();
        const imageDataUrl = pngBytesToDataUrl(screenshot);
        const score = await scoreCoverCandidate(imageDataUrl);
        candidates.push({
          imageDataUrl,
          score,
          status: getCoverCaptureStatus(score),
        });
      }

      setCoverCandidates(candidates);
      setSelectedCandidate(candidates[0]?.imageDataUrl ?? null);
      const reviewCount = candidates.filter((candidate) => candidate.status === 'needs-review').length;
      setMessage(
        usesArcadeCreditFlow(captureGame.platform)
          ? `已自动投币并完成 3 次 Start 截图，请选择一张保存${reviewCount > 0 ? `，其中 ${reviewCount} 张建议复核` : ''}`
          : `已完成 3 次自动按 Start 并生成候选封面，请选择一张保存${reviewCount > 0 ? `，其中 ${reviewCount} 张建议复核` : ''}`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '生成封面失败';
      if (editingId) {
        void reportCoverCapture(editingId, {
          coverCaptureScore: 0,
          coverCaptureStatus: 'failed',
          coverCaptureError: errorMessage,
        });
      }
      setForm((current) => ({
        ...current,
        coverCaptureScore: 0,
        coverCaptureStatus: 'failed',
        coverCaptureError: errorMessage,
      }));
      setMessage(`生成封面失败：${errorMessage}`);
    } finally {
      setCapturingCover(false);
      cleanupCoverCapture();
    }
  }

  async function handleSaveGeneratedCover(candidate: CoverCandidate) {
    setSavingGeneratedCover(true);
    setSelectedCandidate(candidate.imageDataUrl);
    setCoverPreviewUrl(candidate.imageDataUrl);
    setMessage('正在保存自动生成的封面...');

    try {
      const response = await fetch('/api/admin/capture-cover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ imageDataUrl: candidate.imageDataUrl }),
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

      setForm((current) => ({
        ...current,
        coverPath: nextCoverPath,
        coverCaptureScore: candidate.score,
        coverCaptureStatus: candidate.status,
        coverCaptureError: '',
      }));
      setCoverPreviewUrl(`${nextCoverPath}?t=${Date.now()}`);
      setCoverCandidates([]);
      setSelectedCandidate(null);
      if (editingId) {
        await reportCoverCapture(editingId, {
          coverCaptureScore: candidate.score,
          coverCaptureStatus: candidate.status,
          coverCaptureError: '',
        });
      }
      setMessage('封面已保存并回填到当前表单，点击保存修改即可写入游戏记录');
    } catch (error) {
      setSelectedCandidate(null);
      setCoverPreviewUrl(form.coverPath);
      setMessage(error instanceof Error ? error.message : '保存封面失败');
    } finally {
      setSavingGeneratedCover(false);
    }
  }

  const firstItem = totalGames === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalGames);

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
        <p className="muted">当前可以登录后台、上传 ROM 和封面、创建游戏记录，也可以编辑已有游戏，并从开始界面自动生成封面。最新置顶的 3 款游戏会进入首页精选区，最后一次置顶的游戏会进入 Hero 区。</p>

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
                <label>
                  操作说明
                  <textarea
                    value={form.controlsHelp}
                    onChange={(event) => setForm({ ...form, controlsHelp: event.target.value })}
                    rows={5}
                    placeholder="例如：按钮1 普攻，按钮2 跳跃，投币后按 Start 开始。"
                  />
                </label>
                <div className="admin-form-inline">
                  <label>
                    状态
                    <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Game['status'] })}>
                      <option value="draft">草稿</option>
                      <option value="published">已上架</option>
                    </select>
                  </label>
                  <label>
                    平台
                    <select
                      value={form.platform}
                      onChange={(event) => {
                        const nextPlatform = event.target.value as Game['platform'];
                        setForm((current) => ({ ...current, platform: nextPlatform, biosPath: needsBiosPackage(nextPlatform) ? current.biosPath : '' }));
                      }}
                    >
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
                        setUploadingRom(true);
                        setMessage(`正在上传 ROM：${file.name}`);
                        try {
                          const result = await handleFileUpload(file, 'rom');
                          setForm((current) => {
                            const platform = inferPlatformFromRomName(file.name, current.platform);
                            return { ...current, platform, romPath: buildPublicRomPath(file.name, result.path, platform), biosPath: needsBiosPackage(platform) ? current.biosPath : '' };
                          });
                          setMessage(`ROM 已上传：${result.filename}`);
                        } catch (error) {
                          setMessage(error instanceof Error ? error.message : 'ROM 上传失败');
                        } finally {
                          setUploadingRom(false);
                        }
                      }}
                    />
                  </label>
                  {needsBiosPackage(form.platform) ? (
                    <label>
                      上传 {getBiosPackageLabel(form.platform)}
                      <input
                        type="file"
                        accept=".zip"
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          setUploadingBios(true);
                          setMessage(`正在上传 BIOS/依赖包：${file.name}`);
                          try {
                            const result = await handleFileUpload(file, 'rom');
                            setForm((current) => ({ ...current, biosPath: result.path }));
                            setMessage(`BIOS/依赖包已上传：${result.filename}`);
                          } catch (error) {
                            setMessage(error instanceof Error ? error.message : 'BIOS/依赖包上传失败');
                          } finally {
                            setUploadingBios(false);
                          }
                        }}
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            </div>

            <aside className="admin-form-side">
              <div className="admin-cover-panel">
                <div className="admin-cover-panel-header">
                  <strong>封面预览</strong>
                  <span className={`cover-status-badge is-${form.coverCaptureStatus.replace(/[^a-z-]/g, '-')}`}>{getCoverCaptureStatusLabel(form.coverCaptureStatus)}</span>
                </div>
                <div className="admin-cover-actions">
                  <button type="button" onClick={() => void handleGenerateCoverFromStartScreen()} disabled={capturingCover || uploadingRom || !form.romPath}>
                    {uploadingRom ? 'ROM 上传中' : capturingCover ? '生成中...' : '开始界面截图'}
                  </button>
                  <button type="button" onClick={() => coverUploadInputRef.current?.click()} disabled={uploadingCover}>
                    {uploadingCover ? '上传中...' : '手动上传覆盖'}
                  </button>
                  <input
                    ref={coverUploadInputRef}
                    type="file"
                    accept="image/*"
                    className="visually-hidden"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        return;
                      }
                      await handleCoverFileSelected(file);
                    }}
                  />
                </div>
                <div className="admin-cover-frame">
                  {coverPreviewUrl ? (
                    <img src={coverPreviewUrl} alt="当前封面" className="admin-cover-image" />
                  ) : (
                    <div className="game-cover-placeholder admin-cover-placeholder">暂无封面</div>
                  )}
                </div>
                <div className="admin-cover-metrics muted">
                  <span>截图评分 {formatCoverScore(form.coverCaptureScore)}</span>
                  <span>{form.coverCaptureStatus === 'needs-review' ? '建议人工复核' : '当前封面可直接保存'}</span>
                </div>
                {form.coverCaptureError ? <p className="admin-cover-error">最近一次失败原因：{form.coverCaptureError}</p> : null}
                <p className="muted admin-cover-hint">当前预览区显示的是会随表单一起保存的封面。</p>
              </div>
            </aside>
          </div>

          <div className="admin-form-secondary">
                <div className="admin-form-status muted">
                  <span>平台: {getPlatformLabel(form.platform)}</span>
                  <span>ROM: {form.romPath || '未上传'}</span>
                  {needsBiosPackage(form.platform) ? <span>{getBiosPackageLabel(form.platform)}: {form.biosPath || '未上传'}</span> : null}
                  <span>封面: {form.coverPath || '未上传'}</span>
                </div>
              {message ? <p className="muted">{message}</p> : null}
              <div className="admin-form-actions">
                <button type="submit" disabled={creating || uploadingRom || uploadingBios || uploadingCover}>
                  {creating ? '保存中...' : uploadingRom || uploadingBios || uploadingCover ? '上传中...' : editingId ? '保存修改' : '创建游戏'}
                </button>
                {editingId ? (
                  <button
                    type="button"
                    onClick={() => {
                      resetEditor();
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
                <article className={`cover-candidate-card ${candidate.imageDataUrl === selectedCandidate ? 'is-active' : ''}`} key={`${candidate.imageDataUrl}-${index}`}>
                  <img src={candidate.imageDataUrl} alt={`候选封面 ${index + 1}`} className="cover-candidate-image" />
                  <div className="cover-candidate-meta">
                    <span>候选 {index + 1}</span>
                    <span>评分 {formatCoverScore(candidate.score)}</span>
                    <span className={`cover-status-badge is-${candidate.status}`}>{getCoverCaptureStatusLabel(candidate.status)}</span>
                  </div>
                  <button type="button" onClick={() => void handleSaveGeneratedCover(candidate)} disabled={savingGeneratedCover}>
                    {candidate.imageDataUrl === selectedCandidate ? '当前封面' : savingGeneratedCover ? '保存中...' : '设为当前封面'}
                  </button>
                </article>
              ))}
            </div>
          ) : null}
        </form>

        <div className="admin-list-toolbar">
          <label className="admin-filter-field">
            搜索游戏
            <input
              value={searchKeyword}
              onChange={(event) => {
                setSearchKeyword(event.target.value);
                setPage(1);
              }}
              placeholder="按标题、简介或 ID 搜索"
            />
          </label>
          <label className="admin-filter-field admin-filter-select">
            状态筛选
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as 'all' | Game['status']);
                setPage(1);
              }}
            >
              <option value="all">全部状态</option>
              <option value="published">仅看已上架</option>
              <option value="draft">仅看草稿</option>
            </select>
          </label>
          <label className="admin-filter-field admin-filter-select">
            排序方式
            <select
              value={sortMode}
              onChange={(event) => {
                setSortMode(event.target.value as 'updated-desc' | 'sort-desc' | 'title-asc');
                setPage(1);
              }}
            >
              <option value="updated-desc">最近更新优先</option>
              <option value="sort-desc">排序值优先</option>
              <option value="title-asc">标题 A-Z</option>
            </select>
          </label>
        </div>

        <div className="admin-bulk-toolbar">
          <label className="admin-bulk-select">
            <input type="checkbox" checked={games.length > 0 && games.every((game) => selectedGameIds.includes(game.id))} onChange={() => toggleSelectCurrentPage()} />
            <span>本页全选</span>
          </label>
          <span className="muted">已选择 {selectedGameIds.length} 款游戏</span>
          <div className="admin-bulk-actions">
            <button type="button" onClick={() => void handleBulkAction('feature')} disabled={selectedGameIds.length === 0}>
              批量加入精选
            </button>
            <button type="button" onClick={() => void handleBulkAction('publish')} disabled={selectedGameIds.length === 0}>
              批量上架
            </button>
            <button type="button" onClick={() => void handleBulkAction('draft')} disabled={selectedGameIds.length === 0}>
              批量下架
            </button>
          </div>
        </div>

        <div className="pagination-bar admin-pagination-bar">
          <span className="muted">
            当前显示 {firstItem}-{lastItem} / {totalGames} 个游戏
          </span>
          <div className="pagination-controls">
            <label>
              每页
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                {pageSizeOptions.map((option) => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading}>
              上一页
            </button>
            <span className="muted">
              {page} / {totalPages}
            </span>
            <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loading}>
              下一页
            </button>
          </div>
        </div>

        <div className="game-list admin-game-list">
          {loading ? <p className="muted">正在加载后台游戏列表...</p> : null}
          {!loading && totalGames === 0 && !searchKeyword.trim() && statusFilter === 'all' ? <p className="muted">当前还没有游戏记录。</p> : null}
          {!loading && totalGames === 0 && (searchKeyword.trim() || statusFilter !== 'all') ? <p className="muted">当前筛选条件下没有匹配的游戏。</p> : null}
          {games.map((game) => (
            <article className="card game-row-card" key={game.id}>
              <label className="game-row-checkbox">
                <input type="checkbox" checked={selectedGameIds.includes(game.id)} onChange={() => toggleGameSelection(game.id)} />
              </label>
              <div className="game-row-media">
                {game.coverUrl ? <img className="game-cover" src={game.coverUrl} alt={game.title} /> : <div className="game-cover game-cover-placeholder">暂无封面</div>}
              </div>
              <div className="game-row-content">
                <div className="game-row-heading">
                  <h3>{game.title}</h3>
                  <div className="game-row-badges">
                    <span className={`game-row-badge ${game.status === 'published' ? 'is-published' : 'is-draft'}`}>
                      {game.status === 'published' ? '已上架' : '草稿'}
                    </span>
                    <span className={`cover-status-badge is-${game.coverCaptureStatus}`}>{getCoverCaptureStatusLabel(game.coverCaptureStatus)}</span>
                  </div>
                </div>
                <div className="game-row-description-card">
                  <p className="game-row-description">{game.description || '当前游戏暂无简介。'}</p>
                </div>
                <div className="game-row-meta">
                  <span className="muted">游戏 ID #{game.id}</span>
                  <span className="muted">平台 {getPlatformLabel(game.platform)}</span>
                  <span className="muted">排序值 {game.sortOrder}</span>
                  <span className="muted">封面评分 {formatCoverScore(game.coverCaptureScore)}</span>
                  <span className="muted">更新于 {new Date(game.updatedAt).toLocaleDateString('zh-CN')}</span>
                </div>
                {game.coverCaptureError ? <p className="admin-cover-error">最近失败：{game.coverCaptureError}</p> : null}
              </div>
              <div className="game-row-actions">
                <div className="card-actions game-row-buttons">
                  <button type="button" onClick={() => handleEditGame(game)}>
                    编辑
                  </button>
                  <button type="button" onClick={() => void handlePinGame(game)}>
                    加入精选
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
