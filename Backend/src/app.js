import express, { urlencoded } from "express"
import dotenv from "dotenv"
import cors from "cors"
import cookieParser from "cookie-parser"

dotenv.config({
    path: "./.env"
})

const app = express();

app.use(
    cors({
        origin: "http://localhost:5173",
        credentials: true
    })
)
app.use(express.json());
app.use(urlencoded({extended:true}));
app.use(express.static("public"));
app.use(cookieParser());

export { app }