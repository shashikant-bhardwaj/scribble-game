
import { configureStore } from "@reduxjs/toolkit";
import gameReducer from "../features/game/gameSlice.js";

export const store = configureStore({
    reducer: {
        game: gameReducer,
    },
});
