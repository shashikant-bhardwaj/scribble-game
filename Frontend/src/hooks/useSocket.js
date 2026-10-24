
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useDispatch } from "react-redux";
import {
  setSocketConnected,
  setRoom,
  setError,
  clearRoom,
} from "../features/game/gameSlice.js";

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

const getPlayerId = () => {
  let playerId = sessionStorage.getItem("scribblePlayerId");

  if (!playerId) {
    playerId = crypto.randomUUID();
    sessionStorage.setItem("scribblePlayerId", playerId);
  }

  return playerId;
};

export default function useSocket() {
  const dispatch = useDispatch();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const socketInstance = io(SERVER_URL, {
      auth: { playerId: getPlayerId() },
      reconnection: true,
    });

    setSocket(socketInstance);

    socketInstance.on("connect", () => {
      dispatch(setSocketConnected(true));
      dispatch(setError(""));
    });

    socketInstance.on("disconnect", () => {
      dispatch(setSocketConnected(false));
    });

    socketInstance.on("room:state", (room) => {
      dispatch(setRoom(room));
    });

    socketInstance.on("room:reconnected", (room) => {
      dispatch(setRoom(room));
    });

    socketInstance.on("room:error", (error) => {
      dispatch(setError(error?.message || "Something went wrong."));
    });

    socketInstance.on("room:closed", () => {
      dispatch(clearRoom());
      dispatch(setError("This room has been closed."));
    });

    return () => {
      socketInstance.removeAllListeners();
      socketInstance.disconnect();
    };
  }, [dispatch]);

  return socket;
}
