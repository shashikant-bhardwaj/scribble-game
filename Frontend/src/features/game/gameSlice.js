
import { createSlice } from "@reduxjs/toolkit";

const initialState = {
    socketConnected: false,
    room: null,
    error: "",
};

const gameSlice = createSlice({
    name: "game",
    initialState,
    reducers: {
        setSocketConnected: (state, action) => {
            state.socketConnected = action.payload;
        },

        setRoom: (state, action) => {
            state.room = action.payload;
            state.error = "";
        },

        setError: (state, action) => {
            state.error = action.payload;
        },

        clearRoom: (state) => {
            state.room = null;
            state.error = "";
        },
    },
});

export const {
    setSocketConnected,
    setRoom,
    setError,
    clearRoom,
} = gameSlice.actions;

export default gameSlice.reducer;
