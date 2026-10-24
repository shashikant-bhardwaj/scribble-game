import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import useSocket from "./hooks/useSocket.js";
import { clearRoom, setError, setRoom } from "./features/game/gameSlice.js";
import DrawingCanvas from "./components/DrawingCanvas.jsx";

const initialSettings = { rounds: 3, maxPlayers: 8, drawTime: 60, wordChoiceCount: 3, hintCount: 0 };

function Logo() {
  return <div className="flex items-center gap-3"><div className="logo-mark"><span /><span /><span /></div><span className="text-xl font-extrabold tracking-tight text-white">Scribble<span className="text-violet-400">Play</span></span></div>;
}

function StatusPill({ connected }) {
  return <div className="status-pill"><span className={`status-dot ${connected ? "online" : "offline"}`} />{connected ? "Connected" : "Connecting"}</div>;
}

function PlayerAvatar({ player, index = 0 }) {
  const colors = ["violet", "cyan", "rose", "amber", "emerald", "blue"];
  return <div className={`avatar avatar-${colors[index % colors.length]}`}>{player?.username?.slice(0, 1).toUpperCase() || "?"}</div>;
}

function Players({ room, compact = false }) {
  return <div className="space-y-2">{(room?.players || []).map((player, index) => <div className="player-row" key={player.playerId}><PlayerAvatar player={player} index={index} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{player.username}</p><p className="text-xs text-slate-500">{player.isHost ? "Host" : compact ? "Player" : `${player.score ?? 0} points`}</p></div><span className={`connection-label ${player.connected ? "text-emerald-400" : "text-slate-600"}`}>{player.connected ? "Online" : "Away"}</span></div>)}</div>;
}

function Settings({ values, setValue, isHost, disabled }) {
  const fields = [["maxPlayers", "Maximum players", [...Array(19)].map((_, i) => i + 2), "players"], ["rounds", "Rounds", [1,2,3,4,5,6,7,8,9,10], ""], ["drawTime", "Drawing time", [15,30,45,60,90,120,180,240], "seconds"], ["wordChoiceCount", "Word choices", [1,2,3,4,5], "choices"], ["hintCount", "Hints per turn", [0,1,2,3,4,5], "hints"]];
  return <div className="settings-grid">{fields.map(([key, label, options, suffix]) => <label className="field" key={key}><span>{label}</span><select value={values[key]} onChange={(e) => setValue(key, Number(e.target.value))} disabled={!isHost || disabled}>{options.map((option) => <option value={option} key={option}>{option} {suffix}</option>)}</select></label>)}</div>;
}

export default function App() {
  const socket = useSocket();
  const dispatch = useDispatch();
  const { socketConnected, room, error } = useSelector((state) => state.game);
  const playerId = sessionStorage.getItem("scribblePlayerId");
  const isHost = room?.players?.some((player) => player.playerId === playerId && player.isHost);
  const isDrawer = room?.currentDrawer === playerId;
  const [username, setUsername] = useState(() => sessionStorage.getItem("scribbleUsername") || "");
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [wordChoices, setWordChoices] = useState([]);
  const [selectedWord, setSelectedWord] = useState("");
  const [timeLeft, setTimeLeft] = useState(60);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [finalResults, setFinalResults] = useState(null);
  const [rematchState, setRematchState] = useState({ players: [], readyCount: 0 });
  const [settings, setSettings] = useState(initialSettings);
  const [currentHint, setCurrentHint] = useState("");
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [totalHints, setTotalHints] = useState(0);

  useEffect(() => {
    if (!socket) return;
    const onChoices = (choices) => { setWordChoices(Array.isArray(choices) ? choices : []); setSelectedWord(""); };
    const onSelected = (data) => { setSelectedWord(data.word); setWordChoices([]); };
    const onHint = (data) => { setCurrentHint(data?.hint || ""); setHintsRevealed(data?.hintsRevealed || 0); setTotalHints(data?.hintCount ?? 0); };
    const onHintReset = (data) => { setCurrentHint(data?.hint || ""); setHintsRevealed(0); setTotalHints(data?.hintCount ?? 0); setSelectedWord(""); };
    const onChat = (message) => setChatMessages((prev) => [...prev, message]);
    const onCorrect = (data) => setChatMessages((prev) => [...prev, { playerId: data.playerId, username: data.username, message: `guessed correctly · +${data.points} points`, createdAt: Date.now(), correct: true }]);
    const onFinished = (data) => setFinalResults(data);
    const onRematchState = (data) => setRematchState({ players: data.players || [], readyCount: data.readyCount || 0 });
    const onRematchStarted = () => { setFinalResults(null); setRematchState({ players: [], readyCount: 0 }); setWordChoices([]); setSelectedWord(""); setChatMessages([]); setChatInput(""); setTimeLeft(60); };
    const onClosed = () => { dispatch(clearRoom()); setFinalResults(null); setRematchState({ players: [], readyCount: 0 }); setWordChoices([]); setChatMessages([]); setTimeLeft(60); };
    socket.on("game:word-choices", onChoices); socket.on("game:word-selected", onSelected); socket.on("game:hint", onHint); socket.on("game:hint-reset", onHintReset); socket.on("chat:message", onChat); socket.on("game:correct-guess", onCorrect); socket.on("game:finished", onFinished); socket.on("rematch:state", onRematchState); socket.on("rematch:started", onRematchStarted); socket.on("room:closed", onClosed);
    return () => { socket.off("game:word-choices", onChoices); socket.off("game:word-selected", onSelected); socket.off("game:hint", onHint); socket.off("game:hint-reset", onHintReset); socket.off("chat:message", onChat); socket.off("game:correct-guess", onCorrect); socket.off("game:finished", onFinished); socket.off("rematch:state", onRematchState); socket.off("rematch:started", onRematchStarted); socket.off("room:closed", onClosed); };
  }, [socket, dispatch]);

  useEffect(() => {
    if (room?.status !== "drawing" || !room?.turnEndsAt) { setTimeLeft(60); return undefined; }
    const update = () => setTimeLeft(Math.max(0, Math.ceil((room.turnEndsAt - Date.now()) / 1000)));
    update(); const id = setInterval(update, 250); return () => clearInterval(id);
  }, [room?.status, room?.turnEndsAt]);

  const updateSetting = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }));
  const runRoomAction = (eventName, payload = {}) => {
    if (!socket?.connected) return dispatch(setError("Server se connection nahi hai. Please wait."));
    if (!username.trim()) return dispatch(setError("Pehle apna username enter karo."));
    setLoading(true); dispatch(setError(""));
    socket.emit(eventName, { ...payload, username: username.trim() }, (response) => { setLoading(false); if (!response?.success) return dispatch(setError(response?.message || "Request failed. Please try again.")); sessionStorage.setItem("scribbleUsername", username.trim()); if (response.data) dispatch(setRoom(response.data)); });
  };
  const handleStartGame = () => { if (!socket?.connected) return dispatch(setError("Server se connection nahi hai.")); socket.emit("game:start", settings, (response) => { if (!response?.success) dispatch(setError(response?.message || "Game start nahi ho paya.")); }); };
  const chooseWord = (word) => socket?.emit("game:choose-word", { word }, (response) => { if (!response?.success) dispatch(setError(response?.message || "Word select nahi ho paya.")); });
  const leaveRoom = () => { setLoading(false); if (socket?.connected) socket.emit("room:leave", () => {}); dispatch(clearRoom()); setFinalResults(null); setWordChoices([]); setSelectedWord(""); setChatMessages([]); setRematchState({ players: [], readyCount: 0 }); };
  const copyRoomCode = async () => { try { await navigator.clipboard.writeText(room.roomCode); } catch { dispatch(setError("Room code copy nahi hua.")); } };
  const requestRematch = () => socket?.emit("rematch:request", (response) => { if (!response?.success) dispatch(setError(response?.message || "Play Again request failed.")); });
  const startRematch = () => socket?.emit("rematch:start", (response) => { if (!response?.success) dispatch(setError(response?.message || "Rematch start nahi ho paya.")); });
  const sendGuess = (event) => { event.preventDefault(); if (event.nativeEvent.isComposing || event.keyCode === 229) return; const message = chatInput.trim(); if (!message || !socket) return; socket.emit("chat:guess", { message }, (response) => { if (!response?.success) dispatch(setError(response?.message || "Message send nahi hua")); }); setChatInput(""); };
  const leaderboard = useMemo(() => [...(finalResults?.leaderboard || [])].sort((a, b) => b.score - a.score), [finalResults]);

  return <div className="app-shell"><header className="topbar"><Logo /><div className="topbar-actions"><StatusPill connected={socketConnected} />{room && <button className="ghost-button" onClick={leaveRoom}>Leave room</button>}</div></header>{error && <div className="alert" role="alert">{error}</div>}
    <main className="page-content">
      {!room && <section className="home-layout"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot" /> Multiplayer drawing game</div><h1>Make your mark.<br /><em>Make them guess.</em></h1><p className="hero-description">The fast, chaotic drawing game where every scribble tells a story. Gather your crew and let the fun unfold.</p><div className="hero-stats"><span><strong>2–20</strong> players</span><span><strong>∞</strong> bad drawings</span></div></div><section className="join-card"><div className="card-kicker">Start playing</div><h2>Ready to scribble?</h2><p className="card-copy">Choose a name to create a room or jump into a game already in progress.</p><label className="field"><span>Your display name</span><input value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) runRoomAction("matchmaking:join"); }} maxLength={20} placeholder="e.g. Doodle Dan" /></label><button className="primary-button w-full" onClick={() => runRoomAction("room:create", { type: "private" })} disabled={loading || !socketConnected}>{loading ? "Creating room..." : "Create a private room"}<span>→</span></button><div className="divider"><span>or join with a code</span></div><div className="join-row"><input value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) runRoomAction("room:join", { roomCode: roomCode.trim() }); }} placeholder="ROOM CODE" maxLength={6} /><button className="secondary-button" disabled={loading || !socketConnected || !roomCode.trim()} onClick={() => runRoomAction("room:join", { roomCode: roomCode.trim() })}>Join</button></div><button className="quick-match" onClick={() => runRoomAction("matchmaking:join")} disabled={loading || !socketConnected}><span className="pulse-icon" /> Find a quick match</button></section></section>}
      {room && finalResults && <section className="results-card"><div className="results-badge">Game complete</div><h1>That&apos;s a wrap.</h1><p className="muted">The final scoreboard is in.</p>{finalResults.winner && <div className="winner-callout"><div className="trophy">1</div><div><span className="muted text-xs uppercase tracking-widest">Winner</span><strong>{finalResults.winner.username}</strong></div><b>{finalResults.winner.score} pts</b></div>}<div className="leaderboard">{leaderboard.map((player, index) => <div className={`leader-row ${index === 0 ? "leader-first" : ""}`} key={player.playerId}><span className="rank">{String(index + 1).padStart(2, "0")}</span><PlayerAvatar player={player} index={index} /><span className="flex-1 font-semibold">{player.username}</span><b>{player.score} pts</b></div>)}</div><div className="results-actions"><button className="primary-button" onClick={requestRematch} disabled={!socketConnected}>Play again <span>→</span></button><span className="muted">{rematchState.readyCount} players ready</span>{isHost && <button className="secondary-button" onClick={startRematch} disabled={!socketConnected || rematchState.readyCount < 2}>Start rematch</button>}</div>{rematchState.players.length > 0 && <p className="ready-list">Ready: {rematchState.players.map((player) => player.username).join(", ")}</p>}</section>}
      {room && !finalResults && <section className="room-layout"><div className="room-main"><div className="room-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> {room.status === "waiting" ? "Private room" : `Round ${room.round} of ${room.maxRounds}`}</div><h1>{room.status === "waiting" ? "Waiting room" : "Game on"}</h1><p className="muted">{room.status === "waiting" ? "Invite your friends and get ready to draw." : isDrawer ? "You&apos;re drawing this turn." : "Guess the word before time runs out."}</p></div><div className="room-code"><span>Room code</span><button onClick={copyRoomCode}>{room.roomCode} <span>□</span></button></div></div>
        {room.status === "waiting" && <div className="lobby-grid"><div className="panel"><div className="panel-heading"><h2>Players <span className="count-badge">{room.players?.length || 0}/{room.maxPlayers}</span></h2><span className="muted text-xs">{room.players?.filter((p) => p.connected).length} online</span></div><Players room={room} /></div><div className="panel"><div className="panel-heading"><h2>Game settings</h2><span className="muted text-xs">{isHost ? "Host controls" : "Host selected"}</span></div><Settings values={settings} setValue={updateSetting} isHost={isHost} disabled={loading || !socketConnected} />{isHost ? <button className="primary-button mt-5 w-full" onClick={handleStartGame} disabled={loading || !socketConnected || room.players?.filter((p) => p.connected).length < 2}>Start game <span>→</span></button> : <div className="waiting-note"><span className="pulse-icon" /> Waiting for the host to start</div>}</div></div>}
        {(room.status === "choosing" || room.status === "drawing" || room.status === "round-ended") && <div className="game-layout"><div className="game-main">{room.status === "choosing" && <div className="turn-banner"><span className="spark">✦</span><div><strong>{isDrawer ? "Choose your secret word" : "The drawer is choosing"}</strong><p>{isDrawer ? "Pick the word you want to draw." : "Get your thinking cap on."}</p></div></div>}{room.status === "choosing" && isDrawer && wordChoices.length > 0 && <div className="word-options">{wordChoices.map((word, index) => <button key={word} onClick={() => chooseWord(word)}><span>0{index + 1}</span>{word}<b>→</b></button>)}</div>}{room.status !== "choosing" && <><div className={`timer-bar ${timeLeft < 10 ? "urgent" : ""}`}><div><span className="muted text-xs uppercase tracking-widest">{room.status === "round-ended" ? "Turn ended" : isDrawer ? "Your turn" : "Guess the word"}</span><strong>{room.status === "round-ended" ? "Time&apos;s up" : `${timeLeft}s`}</strong></div><div className="word-display">{isDrawer ? <><span className="muted">Your word</span><b>{selectedWord || "Loading..."}</b></> : <><span className="muted">Word hint · {hintsRevealed}/{totalHints || room.hintCount || 0}</span><b>{currentHint || "_ _ _ _ _"}</b></>}</div></div><DrawingCanvas socket={socket} isDrawer={isDrawer && room.status === "drawing"} /></>}</div><aside className="chat-panel"><div className="panel-heading"><h2>Live chat</h2><span className="live-label"><span className="status-dot online" /> Live</span></div><div className="chat-messages">{chatMessages.length === 0 && <p className="muted text-center text-sm">Guesses and announcements appear here.</p>}{chatMessages.map((message, index) => <div className={`chat-message ${message.correct ? "correct-message" : ""}`} key={`${message.createdAt}-${index}`}><span>{message.username}</span><p>{message.message}</p></div>)}</div>{!isDrawer && room.status === "drawing" ? <form className="chat-form" onSubmit={sendGuess}><input value={chatInput} onChange={(e) => setChatInput(e.target.value)} maxLength={100} placeholder="Type your guess..." /><button type="submit">Send</button></form> : <p className="drawer-note">You&apos;re drawing — keep your word secret.</p>}</aside></div>}
      </div><aside className="room-sidebar"><div className="panel"><div className="panel-heading"><h2>Scoreboard</h2><span className="muted text-xs">{room.players?.length} players</span></div><Players room={room} /></div></aside></section>}
    </main></div>;
}
