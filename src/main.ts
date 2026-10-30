import './ui/style.css';
import { Game } from './core/Game';
import { Ui } from './ui/Ui';
import { TouchControls } from './ui/TouchControls';

declare global {
  interface Window {
    /** 検証用: URL に ?debug を付けたときだけ公開する */
    __lyrion?: Game;
  }
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  const root = document.getElementById('ui-root');
  const fatal = document.getElementById('fatal');
  if (!canvas || !root || !fatal) throw new Error('必要な DOM 要素が見つかりません');

  const game = new Game();
  const ui = new Ui(root, game, fatal);
  const dispatch = (a: Parameters<typeof game.handlePlayAction>[0]) => {
    if (a === 'pause' || a === 'upgrades' || a === 'log' || a === 'operations') ui.handleAction(a);
    else game.handlePlayAction(a);
  };
  game.input.onAction = dispatch;

  try {
    await game.init(canvas);
  } catch (e) {
    console.error(e);
    ui.showFatal(e instanceof Error ? e.message : String(e));
    return;
  }
  new TouchControls(root, game, canvas, dispatch);
  if (new URLSearchParams(location.search).has('debug')) window.__lyrion = game;
}

boot();
