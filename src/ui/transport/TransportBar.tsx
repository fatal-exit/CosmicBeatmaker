import { useId } from "react";

export interface TransportBarProps {
  name: string;
  bpm: number;
  isPlaying: boolean;
  audioReady: boolean;
  audioError?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  saveState: string;
  onPlayPause: () => void | Promise<void>;
  onStop: () => void;
  onTempoBegin: () => void;
  onTempo: (bpm: number) => void;
  onTempoCommit: () => void;
  onRename: (name: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void | Promise<void>;
  onMenu: () => void;
}

export function TransportBar(props: TransportBarProps) {
  const tempoId = useId();
  return (
    <header className="topbar">
      <div className="project-identity">
        <span className="mini-star" aria-hidden="true" />
        <div>
          <p className="product-mark">Cosmic Beatmaker</p>
          <label className="sr-only" htmlFor="project-name">
            Project name
          </label>
          <input
            id="project-name"
            className="project-name-input"
            value={props.name}
            onChange={(event) => props.onRename(event.target.value)}
            aria-label="Project name"
          />
        </div>
      </div>
      <div className="transport" aria-label="Transport controls">
        <button
          type="button"
          className="play-button"
          onClick={() => void props.onPlayPause()}
          aria-label={
            props.isPlaying ? "Pause composition" : "Play composition"
          }
          aria-pressed={props.isPlaying}
        >
          <span aria-hidden="true">{props.isPlaying ? "Ⅱ" : "▶"}</span>
        </button>
        <button
          type="button"
          onClick={props.onStop}
          aria-label="Stop composition"
        >
          <span aria-hidden="true">■</span>
        </button>
        <div className="tempo-control">
          <label htmlFor={tempoId}>Tempo</label>
          <input
            id={tempoId}
            type="range"
            min="70"
            max="140"
            value={props.bpm}
            onPointerDown={props.onTempoBegin}
            onInput={(event) => {
              // Keyboard-driven ranges fire input only after their native
              // value moves. Starting the group here avoids a synchronous
              // keydown render resetting that value before the browser acts.
              props.onTempoBegin();
              props.onTempo(Number(event.currentTarget.value));
            }}
            onPointerUp={props.onTempoCommit}
            onPointerCancel={props.onTempoCommit}
            onKeyUp={props.onTempoCommit}
            onBlur={props.onTempoCommit}
          />
          <output htmlFor={tempoId}>{props.bpm}</output>
        </div>
        <button
          type="button"
          onClick={props.onUndo}
          disabled={!props.canUndo}
          aria-label="Undo"
        >
          <span aria-hidden="true">↶</span>
        </button>
        <button
          type="button"
          onClick={props.onRedo}
          disabled={!props.canRedo}
          aria-label="Redo"
        >
          <span aria-hidden="true">↷</span>
        </button>
        <button
          type="button"
          className="save-button"
          onClick={() => void props.onSave()}
        >
          {props.saveState === "saving" ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={props.onMenu}
          aria-label="Open project menu"
        >
          <span aria-hidden="true">•••</span>
        </button>
      </div>
      {!props.audioReady ? (
        <span className="audio-lock">
          {props.audioError
            ? "Audio unavailable — press Play to retry"
            : "Audio starts on first play"}
        </span>
      ) : null}
    </header>
  );
}
