
import {
    bindSocket,
    createRoom,
    joinRoom,
    joinPublicMatchmaking,
    getPlayerRoom,
    removeSocket,
    leaveRoom,
    getPublicRoomState,
    startGame,
    chooseWord,
    getRoom,
    startNextTurn,
    getWinner,
     requestRematch,
    startRematch,
} from "../game/roomManager.js";

const turnTimers = new Map();
const hostDisconnectTimers = new Map();
const pendingHostTransfers = new Set();

const registerSocketHandlers = (io) => {
    const transferHostIfPossible = (room, io) => {
    if (!room) return;

    const host = room.players.find(
        (player) => player.isHost
    );

    // Host is back, so no transfer is needed.
    if (!host || host.connected) {
        pendingHostTransfers.delete(room.roomCode);
        return;
    }

    const newHost = room.players.find(
        (player) => player.connected
    );

    // Nobody is connected yet. Retry when a player reconnects.
    if (!newHost) {
        pendingHostTransfers.add(room.roomCode);
        return;
    }

    host.isHost = false;
    newHost.isHost = true;

    pendingHostTransfers.delete(room.roomCode);

    io.to(room.roomCode).emit(
        "room:state",
        getPublicRoomState(room)
    );

    console.log("Host transferred to:", newHost.username);
};
    io.on("connection", (socket) => {
        const playerId = socket.handshake.auth?.playerId;

        if (typeof playerId !== "string" || playerId.length > 100) {
            socket.disconnect(true);
            return;
        }

        // Restore this player's previous room after a page refresh.
        const existingRoom = bindSocket(playerId, socket.id);

        // Cancel host disconnect timer if the player reconnects.
const reconnectTimer = hostDisconnectTimers.get(playerId);

if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    hostDisconnectTimers.delete(playerId);
}

if (
    existingRoom &&
    pendingHostTransfers.has(existingRoom.roomCode)
) {
    transferHostIfPossible(existingRoom, io);
}

        if (existingRoom) {
            socket.join(existingRoom.roomCode);

            io.to(existingRoom.roomCode).emit(
                "room:state",
                getPublicRoomState(existingRoom)
            );

            socket.emit(
                "room:reconnected",
                getPublicRoomState(existingRoom)
            );
        }

        console.log("Player connected:", socket.id);

        const sendError = (ack, error) => {
            const response = {
                success: false,
                message: error.message || "Something went wrong",
            };

            if (typeof ack === "function") {
                ack(response);
            } else {
                socket.emit("room:error", response);
            }
        };

        const sendRoomState = (room, ack) => {
            const state = getPublicRoomState(room);

            io.to(room.roomCode).emit("room:state", state);

            if (typeof ack === "function") {
                ack({
                    success: true,
                    data: state,
                });
            }
        };

        

        // Create a private or public room.
        socket.on("room:create", (payload = {}, ack) => {
            try {
                const room = createRoom({
                    playerId,
                    socketId: socket.id,
                    username: payload.username,
                    type: payload.type ?? "private",
                });

                socket.join(room.roomCode);

                sendRoomState(room, ack);
            } catch (error) {
                sendError(ack, error);
            }
        });

        // Join a room using its code.
        socket.on("room:join", (payload = {}, ack) => {
            try {
                const room = joinRoom({
                    playerId,
                    socketId: socket.id,
                    username: payload.username,
                    roomCode: payload.roomCode,
                });

                socket.join(room.roomCode);

                sendRoomState(room, ack);
            } catch (error) {
                sendError(ack, error);
            }
        });

        // Find an available public room.
        socket.on("matchmaking:join", (payload = {}, ack) => {
            try {
                const room = joinPublicMatchmaking({
                    playerId,
                    socketId: socket.id,
                    username: payload.username,
                });

                socket.join(room.roomCode);

                sendRoomState(room, ack);
            } catch (error) {
                sendError(ack, error);
            }
        });

        // Explicitly leave the room.
        socket.on("room:leave", (ack) => {
            try {
                const currentRoom = getPlayerRoom(playerId);

                if (!currentRoom) {
                    if (typeof ack === "function") {
                        ack({ success: true });
                    }
                    return;
                }

                const roomCode = currentRoom.roomCode;

                const result = leaveRoom(playerId);

                socket.leave(roomCode);

                if (result?.room) {
                    io.to(roomCode).emit(
                        "room:state",
                        getPublicRoomState(result.room)
                    );
                } else {
                    io.to(roomCode).emit("room:closed", {
                        roomCode,
                    });
                }

                if (typeof ack === "function") {
                    ack({ success: true });
                }
            } catch (error) {
                sendError(ack, error);
            }
        });

        
        // Player requests a rematch
        socket.on("rematch:request", (ack) => {
            try {
                const room = requestRematch(playerId);

                // Update every player's rematch lobby state
                io.to(room.roomCode).emit("rematch:state", {
                    roomCode: room.roomCode,
                    
                    players: room.players
                        .filter((player) =>
                            room.rematchPlayers.includes(player.playerId)
                        )
                        .map((player) => ({
                            playerId: player.playerId,
                            username: player.username,
                            isHost: player.isHost,
                        })),
                    readyCount: room.rematchPlayers.filter((id) =>
                        room.players.some(
                            (player) =>
                                player.playerId === id &&
                                player.connected
                        )
                    ).length,
                });

                if (typeof ack === "function") {
                    ack({ success: true });
                }
            } catch (error) {
                sendError(ack, error);
            }
        });

        // Host starts the rematch
        socket.on("rematch:start", (ack) => {
            try {
                const oldRoom = getPlayerRoom(playerId);

                if (!oldRoom) {
                    throw new Error("Room not found");
                }

                const roomCode = oldRoom.roomCode;

                const {
    room,
    drawer,
    choices,
    excludedPlayers,
} = startRematch(playerId);

                // Remove excluded players from the Socket.IO room
                for (const player of excludedPlayers) {
                    if (player.socketId) {
                        const playerSocket =
                            io.sockets.sockets.get(player.socketId);

                        playerSocket?.leave(roomCode);
                    }
                }

                // Cancel any leftover timer from the previous game
                const existingTimer = turnTimers.get(roomCode);

                if (existingTimer) {
                    clearTimeout(existingTimer);
                    turnTimers.delete(roomCode);
                }

                // Clear old drawing and update all remaining players
                io.to(roomCode).emit("drawing:clear");
                sendRoomState(room);

                // Notify clients that the rematch has started
                io.to(roomCode).emit("rematch:started");

                // Only the new drawer receives the word choices
                io.to(drawer.socketId).emit(
                    "game:word-choices",
                    choices
                );

                if (typeof ack === "function") {
                    ack({ success: true });
                }
            } catch (error) {
                sendError(ack, error);
            }
        });


        
    // Start game — only the host can start it
    socket.on("game:start", (payload = {}, ack) => {
        try {
            const { rounds } = payload;

const { room, drawer, choices } = startGame(
    playerId,
    rounds
);

            // Send public room state to everyone
            io.to(room.roomCode).emit(
                "room:state",
                getPublicRoomState(room)
            );

            // Send word choices ONLY to the drawer
            io.to(drawer.socketId).emit(
                "game:word-choices",
                choices
            );

            if (typeof ack === "function") {
                ack({ success: true });
            }
        } catch (error) {
            sendError(ack, error);
        }
    });

    // Drawer selects one of the offered words
   socket.on("game:choose-word", (payload, ack) => {
    try {
        const room = chooseWord({
            playerId,
            word: payload.word,
        });

        // Purana timer ho to clear karo
        const existingTimer = turnTimers.get(room.roomCode);

        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Sabhi players ko updated room state bhejo
        sendRoomState(room, ack);

        // Drawer ko selected word privately bhejo
        socket.emit("game:word-selected", {
            word: room.secretWord,
        });

         
        // Current turn ka end time save karo
        const expectedTurnEndsAt = room.turnEndsAt;

        // 60 seconds baad current turn end karo
        const timer = setTimeout(() => {
            const currentRoom = getRoom(room.roomCode);

            if (!currentRoom) {
                turnTimers.delete(room.roomCode);
                return;
            }

            // Check karo ki ye abhi bhi wahi active turn hai
            if (
                currentRoom.status !== "drawing" ||
                currentRoom.turnEndsAt !== expectedTurnEndsAt
            ) {
                turnTimers.delete(room.roomCode);
                return;
            }

            currentRoom.status = "round-ended";
            currentRoom.turnEndsAt = null;
            currentRoom.roundEndedAt = Date.now();

            io.to(room.roomCode).emit("game:time-up", {
                message: "Time is up!",
            });

            sendRoomState(currentRoom);

            // 3 seconds baad next turn start karo
            const nextTurnTimer = setTimeout(() => {
                try {
                    const {
                        room: nextRoom,
                        drawer: nextDrawer,
                        choices,
                    } = startNextTurn(room.roomCode);

                    console.log("NEXT TURN DEBUG:", {
    status: nextRoom.status,
    drawer: nextDrawer?.username,
    choices,
});

                    // Updated state sabhi players ko bhejo
                    sendRoomState(nextRoom);

                    // If all rounds are finished, announce the final winner
if (nextRoom.status === "finished") {
    const winner = getWinner(nextRoom);

    io.to(nextRoom.roomCode).emit("game:finished", {
        winner: winner
            ? {
                playerId: winner.playerId,
                username: winner.username,
                score: winner.score,
            }
            : null,

        leaderboard: [...nextRoom.players]
            .sort((a, b) => b.score - a.score)
            .map((player) => ({
                playerId: player.playerId,
                username: player.username,
                score: player.score,
            })),
    });

    return;
}

                    // Word choices sirf naye drawer ko bhejo
                    if (nextDrawer) {
                        io.to(nextDrawer.socketId).emit(
                            "game:word-choices",
                            choices
                        );
                    }
                } catch (error) {
                    console.error(
                        "Next turn start failed:",
                        error.message
                    );
                } finally {
                    turnTimers.delete(room.roomCode);
                }
            }, 3000);

            turnTimers.set(room.roomCode, nextTurnTimer);
        }, 60 * 1000);

        turnTimers.set(room.roomCode, timer);


    } catch (error) {
        sendError(ack, error);
    }
});

        
        // Real-time drawing events

        socket.on("drawing:start", (payload = {}) => {
            const room = getPlayerRoom(playerId);

            if (!room) return;

               // ADD THIS CHECK
    if (room.status !== "drawing" || room.currentDrawer !== playerId) {
        return;
    }

            const { x, y, color, brushSize } = payload;

            if (
                !Number.isFinite(x) ||
                !Number.isFinite(y) ||
                typeof color !== "string" ||
                !/^#[0-9a-fA-F]{6}$/.test(color) ||
                !Number.isFinite(brushSize) ||
                brushSize < 1 ||
                brushSize > 20
            ) {
                return;
            }

            socket.to(room.roomCode).emit("drawing:start", {
                playerId,
                x,
                y,
                color,
                brushSize,
            });
        });

        socket.on("drawing:move", (payload = {}) => {
            const room = getPlayerRoom(playerId);

            if (!room) return;

               // ADD THIS CHECK
    if (room.status !== "drawing" || room.currentDrawer !== playerId) {
        return;
    }

            const { x, y, color, brushSize } = payload;

            if (
                !Number.isFinite(x) ||
                !Number.isFinite(y) ||
                typeof color !== "string" ||
                !/^#[0-9a-fA-F]{6}$/.test(color) ||
                !Number.isFinite(brushSize) ||
                brushSize < 1 ||
                brushSize > 20
            ) {
                return;
            }

            socket.to(room.roomCode).emit("drawing:move", {
                playerId,
                x,
                y,
                color,
                brushSize,
            });
        });

        socket.on("drawing:clear", () => {
            const room = getPlayerRoom(playerId);

            if (!room) return;

               // ADD THIS CHECK
    if (room.status !== "drawing" || room.currentDrawer !== playerId) {
        return;
    }

            socket.to(room.roomCode).emit("drawing:clear", {
                playerId,
            });
        });

        socket.on("drawing:undo", () => {
    const room = getPlayerRoom(playerId);

    if (!room) return;

    // Only the current drawer can undo
    if (
        room.status !== "drawing" ||
        room.currentDrawer !== playerId
    ) {
        return;
    }

    socket.to(room.roomCode).emit("drawing:undo");
});


        // A disconnect is temporary; retain the player for refresh recovery.
        
socket.on("disconnect", (reason) => {
    const room = removeSocket(socket.id);

    if (room) {
        const disconnectedPlayer = room.players.find(
            (player) => player.socketId === socket.id
        );

        io.to(room.roomCode).emit(
            "room:state",
            getPublicRoomState(room)
        );

        // Start grace period only if the disconnected player is the host.
        if (disconnectedPlayer?.isHost) {
            const playerId = disconnectedPlayer.playerId;

            // Prevent duplicate timers for the same host.
            const existingTimer = hostDisconnectTimers.get(playerId);

            if (existingTimer) {
                clearTimeout(existingTimer);
            }

            const timer = setTimeout(() => {
                hostDisconnectTimers.delete(playerId);

                const currentRoom = getPlayerRoom(playerId);

                if (!currentRoom) return;

                const host = currentRoom.players.find(
                    (player) => player.playerId === playerId
                );

                // Host has reconnected or is no longer the host.
                if (!host || host.connected || !host.isHost) {
                    return;
                }

              transferHostIfPossible(currentRoom, io);
            }, 15000);

            hostDisconnectTimers.set(playerId, timer);
        }
    }

    console.log(
        "Player disconnected:",
        socket.id,
        "Reason:",
        reason
    );
});

        
socket.on("chat:guess", (payload, ack) => {
    try {
        const room = getPlayerRoom(playerId);

        if (!room) {
            throw new Error("Room not found");
        }

        if (
            room.status !== "drawing" &&
            room.status !== "round-ended"
        ) {
            throw new Error("Chat is not active");
        }

        const message = payload?.message?.trim();

        if (!message) {
            throw new Error("Message cannot be empty");
        }

        if (message.length > 100) {
            throw new Error("Message must be 100 characters or less");
        }

        const player = room.players.find(
            (p) => p.playerId === playerId
        );

        if (!player || !player.connected) {
            throw new Error("Player not found");
        }

       
const isCorrectGuess =
    room.status === "drawing" &&
    playerId !== room.currentDrawer &&
    !room.guessedPlayers.includes(playerId) &&
    message.toLowerCase() === room.secretWord.toLowerCase();

if (isCorrectGuess) {
    // Correct guess ka order record karo
    room.guessedPlayers.push(playerId);

    // Guess ke order ke according points
    const guessPoints = [10, 7, 5, 3];
    const guessOrder = room.guessedPlayers.length;
    const points = guessPoints[
        Math.min(guessOrder - 1, guessPoints.length - 1)
    ];

    // Guesser ko points do
    player.score += points;


    // Record the guesser's updated score
room.scoreHistory.push({
    playerId: player.playerId,
    score: player.score,
    timestamp: Date.now(),
});

    // Drawer ko har correct guess par 5 points
    const drawer = room.players.find(
        (p) => p.playerId === room.currentDrawer
    );

    if (drawer) {
        drawer.score += 5;

         // Record the drawer's updated score
    room.scoreHistory.push({
        playerId: drawer.playerId,
        score: drawer.score,
        timestamp: Date.now(),
    });
    }

    io.to(room.roomCode).emit("game:correct-guess", {
        playerId,
        username: player.username,
        points,
        message: `${player.username} guessed correctly and earned ${points} points!`,
    });

    // Sabhi players ko updated scores bhejo
    sendRoomState(room);
}

if (isCorrectGuess) {
    if (typeof ack === "function") {
        ack({ success: true, correct: true });
    }

    return;
}


        const chatMessage = {
            playerId,
            username: player.username,
            message,
            createdAt: Date.now(),
        };

        io.to(room.roomCode).emit("chat:message", chatMessage);

        if (typeof ack === "function") {
            ack({ success: true });
        }
    } catch (error) {
        sendError(ack, error);
    }
});

    });
};

export { registerSocketHandlers };
